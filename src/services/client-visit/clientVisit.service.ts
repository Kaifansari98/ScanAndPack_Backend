import Joi from "joi";
import fs from "node:fs/promises";
import {
  ClientVisitDocumentRole,
  ClientVisitType,
  Prisma,
} from "../../prisma/generated";
import { prisma } from "../../prisma/client";
import { createLeadLog } from "../../utils/leadDetailedLog";
import {
  generateSignedUrl,
  uploadToWasabiInitialSiteMeasurementFile,
} from "../../utils/wasabiClient";

const CLIENT_VISIT_DOCUMENT_TAG = "CLIENT_VISIT_DOCUMENT";

const createClientVisitSchema = Joi.object({
  lead_id: Joi.number().integer().positive().required(),
  visit_type: Joi.string()
    .valid(ClientVisitType.physical_visit, ClientVisitType.follow_up_call)
    .required(),
  date: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).required(),
  meeting_type_id: Joi.number().integer().positive().required(),
  remark: Joi.string().trim().required(),
  location: Joi.string().trim().allow("", null).optional(),
  expense_incurred: Joi.number().min(0).allow(null).optional(),
  created_by: Joi.number().integer().positive().required(),
  documents: Joi.array().optional(),
  payment_proof_documents: Joi.array().optional(),
});

type UploadedVisitFile = {
  originalName: string;
  sysName: string;
  role: ClientVisitDocumentRole;
};

export interface CreateClientVisitInput {
  lead_id: number;
  visit_type: ClientVisitType;
  date: string | Date;
  meeting_type_id: number;
  remark: string;
  location?: string | null;
  expense_incurred?: number | null;
  created_by: number;
  documents?: Express.Multer.File[];
  payment_proof_documents?: Express.Multer.File[];
}

const getClientVisitDocumentTypeId = async (
  tx: Prisma.TransactionClient,
  vendorId: number,
  stage: string | null,
) => {
  const existingDocType = await tx.documentTypeMaster.findFirst({
    where: {
      vendor_id: vendorId,
      tag: CLIENT_VISIT_DOCUMENT_TAG,
    },
    select: { id: true },
  });

  if (existingDocType) {
    return existingDocType.id;
  }

  const createdDocType = await tx.documentTypeMaster.create({
    data: {
      vendor_id: vendorId,
      tag: CLIENT_VISIT_DOCUMENT_TAG,
      type: "Client Visit Document",
      doc_title: "Client Visit Documents",
      stage: stage ?? null,
    },
    select: { id: true },
  });

  return createdDocType.id;
};

const uploadClientVisitFiles = async (
  files: Express.Multer.File[],
  vendorId: number,
  leadId: number,
  folder: string,
  role: ClientVisitDocumentRole,
) => {
  const uploadedFiles: UploadedVisitFile[] = [];

  for (const file of files) {
    const sysName = await uploadToWasabiInitialSiteMeasurementFile(
      file.path,
      vendorId,
      leadId,
      file.originalname,
      file.mimetype,
      folder,
    );

    uploadedFiles.push({
      originalName: file.originalname,
      sysName,
      role,
    });

    await fs.unlink(file.path).catch(() => undefined);
  }

  return uploadedFiles;
};

export class ClientVisitService {
  public async getClientVisits(leadId: number) {
    const lead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        vendor_id: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    const visits = await prisma.leadClientVisit.findMany({
      where: {
        lead_id: leadId,
        vendor_id: lead.vendor_id,
      },
      select: {
        id: true,
        visit_type: true,
        date: true,
        location: true,
        remark: true,
        expense_incurred: true,
        created_at: true,
        meetingType: {
          select: {
            id: true,
            type: true,
          },
        },
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
        clientVisitDocuments: {
          select: {
            id: true,
            document_role: true,
            created_at: true,
            document: {
              select: {
                id: true,
                doc_og_name: true,
                doc_sys_name: true,
                created_at: true,
              },
            },
          },
          orderBy: {
            created_at: "asc",
          },
        },
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return Promise.all(
      visits.map(async (visit) => {
        const documents = await Promise.all(
          visit.clientVisitDocuments.map(async (mapping) => ({
            id: mapping.document.id,
            role: mapping.document_role,
            original_name: mapping.document.doc_og_name,
            signedUrl: await generateSignedUrl(
              mapping.document.doc_sys_name,
              3600,
              "inline",
            ),
            created_at: mapping.document.created_at,
          })),
        );

        return {
          id: visit.id,
          visit_type: visit.visit_type,
          date: visit.date,
          location: visit.location,
          remark: visit.remark,
          expense_incurred: visit.expense_incurred,
          created_at: visit.created_at,
          meeting_type: visit.meetingType,
          created_by: visit.createdBy,
          documents,
          supporting_documents: documents.filter(
            (document) =>
              document.role === ClientVisitDocumentRole.supporting_document,
          ),
          payment_proof_documents: documents.filter(
            (document) => document.role === ClientVisitDocumentRole.payment_proof,
          ),
        };
      }),
    );
  }

  public async createClientVisit(input: CreateClientVisitInput) {
    const { error, value } = createClientVisitSchema.validate(input);
    if (error) {
      throw new Error(
        `Validation failed: ${error.details.map((detail) => detail.message).join(", ")}`,
      );
    }

    if (value.visit_type === ClientVisitType.physical_visit) {
      if (!value.location?.trim()) {
        throw new Error("location is required for a physical visit");
      }

      if (value.expense_incurred == null) {
        throw new Error("expense_incurred is required for a physical visit");
      }

      if ((input.payment_proof_documents ?? []).length === 0) {
        throw new Error(
          "At least one payment proof document is required for a physical visit",
        );
      }
    }

    if (value.visit_type === ClientVisitType.follow_up_call) {
      if ((input.payment_proof_documents ?? []).length > 0) {
        throw new Error(
          "payment proof documents are only allowed for physical visits",
        );
      }
    }

    const lead = await prisma.leadMaster.findUnique({
      where: { id: value.lead_id },
      select: {
        id: true,
        vendor_id: true,
        account_id: true,
        status_id: true,
        firstname: true,
        lastname: true,
      },
    });

    if (!lead) {
      throw new Error(`Lead ${value.lead_id} not found`);
    }

    if (!lead.account_id) {
      throw new Error("Lead account is missing");
    }

    const accountId = lead.account_id;

    const meetingType = await prisma.meetingTypeMaster.findFirst({
      where: {
        id: value.meeting_type_id,
        vendor_id: lead.vendor_id,
      },
      select: {
        id: true,
        type: true,
      },
    });

    if (!meetingType) {
      throw new Error("Invalid meeting_type_id for this lead's vendor");
    }

    const currentStage = await prisma.statusTypeMaster.findUnique({
      where: { id: lead.status_id ?? 0 },
      select: { type: true },
    });

    const supportingDocuments = await uploadClientVisitFiles(
      input.documents ?? [],
      lead.vendor_id,
      lead.id,
      "client_visits/supporting_documents",
      ClientVisitDocumentRole.supporting_document,
    );

    const paymentProofDocuments = await uploadClientVisitFiles(
      input.payment_proof_documents ?? [],
      lead.vendor_id,
      lead.id,
      "client_visits/payment_proof_documents",
      ClientVisitDocumentRole.payment_proof,
    );

    const uploadedFiles = [...supportingDocuments, ...paymentProofDocuments];

    return prisma.$transaction(async (tx) => {
      const documentTypeId = await getClientVisitDocumentTypeId(
        tx,
        lead.vendor_id,
        currentStage?.type ?? null,
      );

      const visit = await tx.leadClientVisit.create({
        data: {
          lead_id: lead.id,
          account_id: accountId,
          vendor_id: lead.vendor_id,
          meeting_type_id: meetingType.id,
          visit_type: value.visit_type,
          date: new Date(value.date),
          location:
            value.visit_type === ClientVisitType.physical_visit
              ? value.location?.trim() || null
              : null,
          remark: value.remark.trim(),
          expense_incurred:
            value.visit_type === ClientVisitType.physical_visit
              ? Number(value.expense_incurred)
              : null,
          created_by: value.created_by,
        },
      });

      const createdDocuments: Array<{ id: number; role: ClientVisitDocumentRole }> =
        [];

      for (const file of uploadedFiles) {
        const document = await tx.leadDocuments.create({
          data: {
            doc_og_name: file.originalName,
            doc_sys_name: file.sysName,
            created_by: value.created_by,
            doc_type_id: documentTypeId,
            account_id: accountId,
            lead_id: lead.id,
            vendor_id: lead.vendor_id,
          },
          select: { id: true },
        });

        createdDocuments.push({ id: document.id, role: file.role });

        await tx.leadClientVisitDocumentMapping.create({
          data: {
            vendor_id: lead.vendor_id,
            lead_id: lead.id,
            account_id: accountId,
            client_visit_id: visit.id,
            document_id: document.id,
            document_role: file.role,
            created_by: value.created_by,
          },
        });
      }

      const formattedDate = new Date(value.date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

      const actionMessage =
        value.visit_type === ClientVisitType.physical_visit
          ? `Physical visit added for ${formattedDate}. Meeting Type: ${meetingType.type}. Location: ${value.location?.trim()}. Remark: ${value.remark.trim()}`
          : `Follow up call added for ${formattedDate}. Meeting Type: ${meetingType.type}. Remark: ${value.remark.trim()}`;

      const detailedLog = await createLeadLog(tx, {
        vendor_id: lead.vendor_id,
        lead_id: lead.id,
        account_id: accountId,
        action: actionMessage,
        action_type: "CREATE",
        created_by: value.created_by,
        created_at: new Date(),
      });

      if (createdDocuments.length > 0) {
        await tx.leadDocumentLogs.createMany({
          data: createdDocuments.map((document) => ({
            vendor_id: lead.vendor_id,
            lead_id: lead.id,
            account_id: accountId,
            doc_id: document.id,
            lead_logs_id: detailedLog.id,
            created_by: value.created_by,
            created_at: new Date(),
          })),
        });
      }

      return {
        visit,
        documents: {
          supporting_documents: createdDocuments
            .filter((document) => document.role === ClientVisitDocumentRole.supporting_document)
            .map((document) => document.id),
          payment_proof_documents: createdDocuments
            .filter((document) => document.role === ClientVisitDocumentRole.payment_proof)
            .map((document) => document.id),
        },
      };
    });
  }
}
