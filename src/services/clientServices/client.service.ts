import { prisma } from "../../prisma/client";
import { CreateClientInput, UpdateClientInput } from "../../types/client.types";
import { generateSignedUrl, uploadToWasabiClientBankDocument } from "../../utils/wasabiClient";

const attachSignedUrlsToBanks = async (bankAccounts: any[]) => {
  if (!bankAccounts || !Array.isArray(bankAccounts)) return [];
  return await Promise.all(
    bankAccounts.map(async (bank: any) => {
      let cancelled_cheque_url: string | null = null;
      if (bank.cancelled_cheque_path) {
        try {
          cancelled_cheque_url = await generateSignedUrl(bank.cancelled_cheque_path);
        } catch (e) {
          console.error("Failed to generate signed URL for bank cheque:", e);
        }
      }
      return {
        ...bank,
        cancelled_cheque_url,
      };
    })
  );
};

export const createClient = async (clientData: CreateClientInput, files?: any, userId?: number) => {
  const { bankAccounts, created_by, updated_by, ...restData } = clientData as any;

  if (bankAccounts && bankAccounts.length > 0) {
    const accList = bankAccounts.map((b: any) => b.account_no?.trim()).filter(Boolean);
    const duplicates = accList.filter((acc: string, idx: number) => accList.indexOf(acc) !== idx);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate account number "${duplicates[0]}" provided in request.`);
    }

    for (const bank of bankAccounts) {
      if (bank.account_no?.trim()) {
        const existing = await prisma.clientBankDetail.findFirst({
          where: {
            vendor_id: restData.vendor_id,
            account_no: bank.account_no.trim(),
          },
        });
        if (existing) {
          throw new Error(`Account number "${bank.account_no}" already exists.`);
        }
      }
    }
  }

  let processedBankAccounts: any[] = [];
  if (bankAccounts && bankAccounts.length > 0) {
    processedBankAccounts = await Promise.all(
      bankAccounts.map(async (bank: any, index: number) => {
        let key: string | null = bank.cancelled_cheque_path || null;
        let chequeName: string | null = bank.cancelled_cheque_name || null;

        let file: any = null;
        if (files) {
          if (Array.isArray(files)) {
            file = files.find(
              (f: any) =>
                f.fieldname === `cancelled_cheque_${index}` ||
                f.fieldname === `bankAccounts[${index}][cancelled_cheque_file]`
            );
          } else if (typeof files === "object") {
            file =
              files[`cancelled_cheque_${index}`]?.[0] ||
              files[`bankAccounts[${index}][cancelled_cheque_file]`]?.[0];
          }
        }

        if (file && file.buffer) {
          try {
            key = await uploadToWasabiClientBankDocument(
              file.buffer,
              restData.vendor_id,
              file.originalname,
              file.mimetype
            );
            chequeName = file.originalname;
          } catch (err) {
            console.error("Wasabi upload error for cheque:", err);
          }
        }

        const { id, cancelled_cheque_file, cancelled_cheque_url, ...bankRest } = bank;
        return {
          ...bankRest,
          cancelled_cheque_path: key,
          cancelled_cheque_name: chequeName,
          vendor_id: restData.vendor_id,
          created_by: userId || bank.created_by || null,
        };
      })
    );
  }

  const createdClient = await prisma.clientMaster.create({
    data: {
      ...restData,
      ...(processedBankAccounts.length > 0
        ? {
            bankAccounts: {
              create: processedBankAccounts,
            },
          }
        : {}),
    },
    include: { clientType: true, bankAccounts: true },
  });

  return {
    ...createdClient,
    bankAccounts: await attachSignedUrlsToBanks(createdClient.bankAccounts),
  };
};

export const getClientsList = async (
  vendor_id: number,
  page: number,
  limit: number,
  search?: string,
  activeOnly?: boolean
) => {
  const skip = (page - 1) * limit;

  const whereCondition: any = { vendor_id };

  if (activeOnly) {
    whereCondition.is_active = true;
  }

  if (search) {
    whereCondition.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { company_name: { contains: search, mode: "insensitive" } },
      { contact: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { clientCode: { contains: search, mode: "insensitive" } },
      { gst_number: { contains: search, mode: "insensitive" } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.clientMaster.findMany({
      where: whereCondition,
      include: { clientType: true, bankAccounts: true },
      skip,
      take: limit,
      orderBy: { created_at: "desc" },
    }),
    prisma.clientMaster.count({ where: whereCondition }),
  ]);

  const formattedData = await Promise.all(
    data.map(async (client) => ({
      ...client,
      bankAccounts: await attachSignedUrlsToBanks(client.bankAccounts),
    }))
  );

  return {
    data: formattedData,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
};

export const getClientById = async (vendor_id: number, id: number) => {
  const client = await prisma.clientMaster.findFirst({
    where: { id, vendor_id },
    include: { clientType: true, bankAccounts: true },
  });
  if (!client) return null;
  return {
    ...client,
    bankAccounts: await attachSignedUrlsToBanks(client.bankAccounts),
  };
};

export const updateClient = async (id: number, data: UpdateClientInput, files?: any, userId?: number) => {
  const { bankAccounts, created_by, updated_by, ...restData } = data as any;

  const existingClient = await prisma.clientMaster.findUnique({
    where: { id },
  });
  const vendor_id = existingClient?.vendor_id || 0;

  if (bankAccounts && bankAccounts.length > 0) {
    const accList = bankAccounts.map((b: any) => b.account_no?.trim()).filter(Boolean);
    const duplicates = accList.filter((acc: string, idx: number) => accList.indexOf(acc) !== idx);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate account number "${duplicates[0]}" provided in request.`);
    }

    for (const bank of bankAccounts) {
      if (bank.account_no?.trim()) {
        const existing = await prisma.clientBankDetail.findFirst({
          where: {
            vendor_id,
            account_no: bank.account_no.trim(),
            client_id: { not: id },
          },
        });
        if (existing) {
          throw new Error(`Account number "${bank.account_no}" is already registered to another client.`);
        }
      }
    }
  }

  return await prisma.$transaction(async (tx) => {
    await tx.clientMaster.update({
      where: { id },
      data: restData,
    });

    if (bankAccounts) {
      const existingBankRecords = await tx.clientBankDetail.findMany({
        where: { client_id: id },
        select: { id: true },
      });
      const validExistingIds = new Set(existingBankRecords.map((r) => r.id));

      const processedBankAccounts = await Promise.all(
        bankAccounts.map(async (b: any, index: number) => {
          let key: string | null = b.cancelled_cheque_path || null;
          let chequeName: string | null = b.cancelled_cheque_name || null;

          let file: any = null;
          if (files) {
            if (Array.isArray(files)) {
              file = files.find(
                (f: any) =>
                  f.fieldname === `cancelled_cheque_${index}` ||
                  f.fieldname === `bankAccounts[${index}][cancelled_cheque_file]`
              );
            } else if (typeof files === "object") {
              file =
                files[`cancelled_cheque_${index}`]?.[0] ||
                files[`bankAccounts[${index}][cancelled_cheque_file]`]?.[0];
            }
          }

          if (file && file.buffer) {
            try {
              key = await uploadToWasabiClientBankDocument(
                file.buffer,
                vendor_id,
                file.originalname,
                file.mimetype
              );
              chequeName = file.originalname;
            } catch (err) {
              console.error("Wasabi upload error for cheque:", err);
            }
          }

          return {
            ...b,
            cancelled_cheque_path: key,
            cancelled_cheque_name: chequeName,
          };
        })
      );

      const toUpdate = processedBankAccounts.filter((b: any) => b.id && validExistingIds.has(Number(b.id)));
      const toCreate = processedBankAccounts.filter((b: any) => !b.id || !validExistingIds.has(Number(b.id)));
      const idsToKeep = toUpdate.map((b: any) => Number(b.id));

      await tx.clientMaster.update({
        where: { id },
        data: {
          bankAccounts: {
            deleteMany: {
              id: { notIn: idsToKeep },
            },
            create: toCreate.map((b: any) => ({
              bank_name: b.bank_name,
              holder_name: b.holder_name,
              account_no: b.account_no,
              ifsc: b.ifsc,
              swift: b.swift,
              branch: b.branch,
              cancelled_cheque_path: b.cancelled_cheque_path,
              cancelled_cheque_name: b.cancelled_cheque_name,
              is_default: b.is_default,
              vendor_id,
              created_by: userId || b.created_by || null,
            })),
            update: toUpdate.map((b: any) => ({
              where: { id: Number(b.id) },
              data: {
                bank_name: b.bank_name,
                holder_name: b.holder_name,
                account_no: b.account_no,
                ifsc: b.ifsc,
                swift: b.swift,
                branch: b.branch,
                cancelled_cheque_path: b.cancelled_cheque_path,
                cancelled_cheque_name: b.cancelled_cheque_name,
                is_default: b.is_default,
                updated_by: userId || b.updated_by || null,
              },
            })),
          },
        },
      });
    }

    const updatedClient = await tx.clientMaster.findUnique({
      where: { id },
      include: { clientType: true, bankAccounts: true },
    });

    if (!updatedClient) return null;
    return {
      ...updatedClient,
      bankAccounts: await attachSignedUrlsToBanks(updatedClient.bankAccounts),
    };
  });
};
