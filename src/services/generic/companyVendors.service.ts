import { Readable } from "stream";
import ExcelJS from "exceljs";
import { prisma } from "../../prisma/client";

export class CompanyVendorsService {
  async getCompanyVendorsByVendorId(vendorId: number) {
    if (!vendorId) {
      const error = new Error("vendor_id is required");
      (error as any).statusCode = 400;
      throw error;
    }

    return prisma.companyVendorsMaster.findMany({
      where: {
        vendor_id: vendorId,
        is_deleted: false,
        is_active: true,
        is_inventory_company_vendor: false,
      },
      orderBy: { created_at: "desc" },
      include: {
        vendor: {
          select: { vendor_name: true, vendor_code: true },
        },
      },
    });
  }

  async getCompanyVendorsByVendorIdForMaster(
    vendorId: number,
    isInventoryCompanyVendor?: boolean
  ) {
    if (!vendorId) {
      const error = new Error("vendor_id is required");
      (error as any).statusCode = 400;
      throw error;
    }

    const whereClause: any = {
      vendor_id: vendorId,
      is_deleted: false,
    };

    if (typeof isInventoryCompanyVendor === "boolean") {
      whereClause.is_inventory_company_vendor = isInventoryCompanyVendor;
    }

    return prisma.companyVendorsMaster.findMany({
      where: whereClause,
      orderBy: { created_at: "desc" },
      include: {
        vendor: {
          select: { vendor_name: true, vendor_code: true },
        },
      },
    });
  }

  async createCompanyVendor(vendorId: number, payload: any) {
    if (!vendorId) {
      const error = new Error("vendor_id is required");
      (error as any).statusCode = 400;
      throw error;
    }

    const {
      vendor_code,
      company_name,
      point_of_contact,
      contact_no,
      email,
      address,
      in_house,
      created_by,
      is_inventory_company_vendor,
    } = payload;

    if (!vendor_code) throw this.badRequest("vendor_code is mandatory");
    if (!company_name) throw this.badRequest("company_name is mandatory");

    // Check duplicate code per vendor
    const existingCode = await prisma.companyVendorsMaster.findFirst({
      where: { vendor_id: vendorId, vendor_code, is_deleted: false },
    });
    if (existingCode) {
      const error = new Error(`vendor_code "${vendor_code}" is already in use`);
      (error as any).statusCode = 409;
      throw error;
    }

    return prisma.companyVendorsMaster.create({
      data: {
        vendor_id: vendorId,
        vendor_code: vendor_code.trim(),
        company_name: company_name.trim(),
        vendor_name: company_name.trim(),
        point_of_contact: point_of_contact ? point_of_contact.trim() : "",
        contact_no: contact_no ? contact_no.trim() : "",
        email: email ? email.trim() : null,
        address: address ? address.trim() : null,
        in_house: in_house === true || in_house === "true",
        is_inventory_company_vendor:
          is_inventory_company_vendor === true || is_inventory_company_vendor === "true",
        created_by: created_by ? Number(created_by) : 1,
        updated_by: created_by ? Number(created_by) : 1,
      },
    });
  }

  async updateCompanyVendor(vendorId: number, companyVendorId: number, payload: any) {
    if (!vendorId || !companyVendorId) {
      const error = new Error("vendor_id and company_vendor_id are required");
      (error as any).statusCode = 400;
      throw error;
    }

    const existingVendor = await prisma.companyVendorsMaster.findFirst({
      where: { id: companyVendorId, vendor_id: vendorId, is_deleted: false },
    });

    if (!existingVendor) {
      const error = new Error("Company vendor not found");
      (error as any).statusCode = 404;
      throw error;
    }

    const {
      vendor_code,
      company_name,
      point_of_contact,
      contact_no,
      email,
      address,
      in_house,
      updated_by,
      is_inventory_company_vendor,
    } = payload;

    return prisma.companyVendorsMaster.update({
      where: { id: companyVendorId },
      data: {
        ...(vendor_code !== undefined && { vendor_code: vendor_code.trim() }),
        ...(company_name !== undefined && {
          company_name: company_name.trim(),
          vendor_name: company_name.trim(),
        }),
        ...(point_of_contact !== undefined && { point_of_contact: point_of_contact.trim() }),
        ...(contact_no !== undefined && { contact_no: contact_no.trim() }),
        ...(email !== undefined && { email: email ? email.trim() : null }),
        ...(address !== undefined && { address: address ? address.trim() : null }),
        ...(in_house !== undefined && {
          in_house: in_house === true || in_house === "true",
        }),
        ...(is_inventory_company_vendor !== undefined && {
          is_inventory_company_vendor:
            is_inventory_company_vendor === true || is_inventory_company_vendor === "true",
        }),
        updated_by: updated_by ? Number(updated_by) : existingVendor.updated_by,
        updated_at: new Date(),
      },
    });
  }

  async toggleCompanyVendorStatus(
    vendorId: number,
    companyVendorId: number,
    updatedBy: number,
    isDeleted: boolean
  ) {
    const missingFields: string[] = [];
    if (!vendorId) missingFields.push("vendor_id");
    if (!companyVendorId) missingFields.push("company_vendor_id");
    if (!updatedBy) missingFields.push("updated_by");

    if (missingFields.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missingFields.join(", ")}`
      );
      (error as any).statusCode = 400;
      throw error;
    }

    const existingVendor = await prisma.companyVendorsMaster.findFirst({
      where: {
        id: companyVendorId,
        vendor_id: vendorId,
      },
    });

    if (!existingVendor) {
      const error = new Error("Company vendor not found for this vendor_id");
      (error as any).statusCode = 404;
      throw error;
    }

    return prisma.companyVendorsMaster.update({
      where: { id: companyVendorId },
      data: {
        is_active: !isDeleted,
        is_deleted: false, // Ensure not soft-deleted
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    });
  }

  private badRequest(message: string) {
    const error = new Error(message);
    (error as any).statusCode = 400;
    return error;
  }

  async bulkUploadCompanyVendors(
    vendorId: number,
    fileBuffer: any,
    isCsv: boolean,
    userId: number
  ) {
    if (!vendorId) {
      throw this.badRequest("vendor_id is required");
    }

    // Verify user is Super Admin
    const user = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });
    const userRole = (user?.user_type?.user_type || "").toLowerCase().trim();
    const isSuperAdmin =
      userRole === "super-admin" ||
      userRole === "superadmin" ||
      userRole === "super admin" ||
      userRole === "super_admin";

    if (!isSuperAdmin) {
      const error = new Error("Access denied. Only Super Admin can perform bulk upload.");
      (error as any).statusCode = 403;
      throw error;
    }

    const workbook = new ExcelJS.Workbook();
    if (isCsv) {
      const stream = Readable.from(fileBuffer);
      await workbook.csv.read(stream);
    } else {
      await workbook.xlsx.load(fileBuffer);
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw this.badRequest("No sheets found in the file");
    }

    const headers: string[] = [];
    const rows: Record<string, string>[] = [];

    const getCellValue = (val: any): string => {
      if (val === null || val === undefined) return "";
      if (typeof val === "object") {
        if ("richText" in val && Array.isArray(val.richText)) {
          return val.richText.map((t: any) => t.text).join("");
        }
        if ("text" in val) {
          return String(val.text ?? "");
        }
        if ("result" in val) {
          return String(val.result ?? "");
        }
        if ("formula" in val) {
          return String(val.result ?? val.formula ?? "");
        }
      }
      return String(val).trim();
    };

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const raw = getCellValue(cell.value);
          const clean = raw.replace(/\*/g, "").toLowerCase().replace(/[\s_-]+/g, " ").trim();
          headers[colNumber] = clean;
        });
      } else {
        const rowData: Record<string, string> = {};
        let hasAnyData = false;
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const key = headers[colNumber];
          if (key) {
            const val = getCellValue(cell.value);
            if (val) hasAnyData = true;
            rowData[key] = val;
          }
        });
        if (hasAnyData) {
          rows.push(rowData);
        }
      }
    });

    if (rows.length === 0) {
      throw this.badRequest("Uploaded sheet contains no data rows");
    }

    const findValue = (row: Record<string, string>, aliases: string[]) => {
      const keys = Object.keys(row);
      for (const alias of aliases) {
        const foundKey = keys.find((k) => k === alias || k.includes(alias));
        if (foundKey && row[foundKey] !== undefined) {
          return row[foundKey];
        }
      }
      return "";
    };

    const allHeaderKeys = headers.filter(Boolean);
    const hasVendorCodeHeader = allHeaderKeys.some((k) => k.includes("vendor code") || k.includes("code"));
    const hasCompanyNameHeader = allHeaderKeys.some((k) => k.includes("company") || k.includes("vendor name"));

    if (!hasVendorCodeHeader || !hasCompanyNameHeader) {
      throw this.badRequest(
        "Required columns are missing in sheet. Expected at minimum: 'Vendor Code', 'Company Name', 'Point of Contact', 'Contact No'"
      );
    }

    const existingVendors = await prisma.companyVendorsMaster.findMany({
      where: { vendor_id: vendorId, is_deleted: false },
      select: { vendor_code: true, company_name: true },
    });
    const existingCodeSet = new Set(existingVendors.map((v) => v.vendor_code.trim().toLowerCase()));

    const seenSheetCodes = new Set<string>();
    const validRowsToInsert: any[] = [];
    const errors: string[] = [];

    let rowNum = 1;
    for (const row of rows) {
      rowNum++;
      const rawCode = findValue(row, ["vendor code", "vendor_code", "company code", "code"]);
      const rawCompany = findValue(row, ["company name", "company_name", "company", "vendor name"]);
      const rawPoc = findValue(row, ["point of contact", "point_of_contact", "contact person", "poc"]);
      const rawContact = findValue(row, ["contact no", "contact_no", "contact number", "mobile", "phone", "contact"]);
      const rawInHouse = findValue(row, ["in house", "in_house", "inhouse"]);
      const rawEmail = findValue(row, ["email", "email address", "mail"]);
      const rawAddress = findValue(row, ["address", "site address", "location"]);

      const vendorCode = rawCode ? String(rawCode).trim() : "";
      const companyName = rawCompany ? String(rawCompany).trim() : "";
      const pointOfContact = rawPoc ? String(rawPoc).trim() : "";
      const contactNo = rawContact ? String(rawContact).trim() : "";
      const email = rawEmail ? String(rawEmail).trim() : "";
      const address = rawAddress ? String(rawAddress).trim() : "";

      if (!vendorCode) {
        errors.push(`Row ${rowNum}: Vendor Code is required`);
        continue;
      }

      if (!companyName) {
        errors.push(`Row ${rowNum}: Company Name is required`);
        continue;
      }

      if (!pointOfContact) {
        errors.push(`Row ${rowNum}: Point of Contact is required`);
        continue;
      }

      const cleanContact = contactNo.replace(/\D/g, "");
      const normalizedContact =
        cleanContact.length === 12 && cleanContact.startsWith("91")
          ? cleanContact.slice(2)
          : cleanContact;

      if (!normalizedContact || normalizedContact.length < 10) {
        errors.push(`Row ${rowNum}: Valid 10-digit Contact No is required (got: "${contactNo}")`);
        continue;
      }

      const inHouseStr = String(rawInHouse || "").toLowerCase().trim();
      const inHouse = inHouseStr === "yes" || inHouseStr === "true" || inHouseStr === "1";

      const lowerCode = vendorCode.toLowerCase();
      if (seenSheetCodes.has(lowerCode)) {
        errors.push(`Row ${rowNum}: Duplicate Vendor Code "${vendorCode}" found in uploaded sheet`);
        continue;
      }
      seenSheetCodes.add(lowerCode);

      if (existingCodeSet.has(lowerCode)) {
        errors.push(`Row ${rowNum}: Vendor Code "${vendorCode}" already exists in database`);
        continue;
      }

      validRowsToInsert.push({
        vendor_id: vendorId,
        vendor_code: vendorCode,
        company_name: companyName,
        vendor_name: companyName,
        point_of_contact: pointOfContact,
        contact_no: normalizedContact,
        email: email || null,
        address: address || null,
        in_house: inHouse,
        is_inventory_company_vendor: false,
        is_active: true,
        is_deleted: false,
        created_by: userId,
        updated_by: userId,
      });
    }

    let insertedCount = 0;
    if (validRowsToInsert.length > 0) {
      const result = await prisma.companyVendorsMaster.createMany({
        data: validRowsToInsert,
      });
      insertedCount = result.count;
    }

    return {
      totalRows: rows.length,
      successCount: insertedCount,
      failedCount: rows.length - insertedCount,
      errors,
    };
  }

}
