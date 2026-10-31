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
    userId: number,
    isInventory: boolean = false
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

    if (isInventory) {
      return this.bulkUploadInventoryVendors(vendorId, fileBuffer, isCsv, userId);
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


  private async bulkUploadInventoryVendors(
    vendorId: number,
    fileBuffer: any,
    isCsv: boolean,
    userId: number
  ) {
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
    const hasVendorCode = allHeaderKeys.some((k) => k.includes("vendor code") || k.includes("company code") || k.includes("code"));
    const hasCompanyName = allHeaderKeys.some((k) => k.includes("company name") || k.includes("company"));

    if (!hasVendorCode || !hasCompanyName) {
      throw this.badRequest(
        "Required columns are missing in sheet. Expected: Company Code, Company Name, Vendor Type, Primary Contact Person, Mobile No, Email, Payment Term, GST No, PAN No, Address Line 1, State, City, Pincode, Contact Department, Contact Designation, Bank Account Holder Name, Bank Account Number, Bank IFSC Code, Bank Branch Name"
      );
    }

    const [existingVendors, vendorTypes, paymentTerms, states, cities] = await Promise.all([
      prisma.companyVendorsMaster.findMany({
        where: { vendor_id: vendorId, is_deleted: false },
        select: { vendor_code: true, gst_no: true, pan_no: true },
      }),
      prisma.vendorTypeMaster.findMany({
        where: { is_deleted: false },
        select: { id: true, vendor_type_name: true },
      }),
      prisma.paymentTermMaster.findMany({
        where: { vendor_id: vendorId, is_active: true },
        select: { id: true, term_name: true },
      }),
      prisma.stateMaster.findMany({
        select: { id: true, name: true },
      }),
      prisma.cityMaster.findMany({
        select: { id: true, name: true, state_id: true },
      }),
    ]);

    const existingCodeSet = new Set(existingVendors.map((v) => v.vendor_code.trim().toLowerCase()));
    const existingGstSet = new Set(existingVendors.filter((v) => v.gst_no).map((v) => v.gst_no!.trim().toUpperCase()));
    const existingPanSet = new Set(existingVendors.filter((v) => v.pan_no).map((v) => v.pan_no!.trim().toUpperCase()));

    const seenSheetCodes = new Set<string>();
    const seenSheetGst = new Set<string>();
    const seenSheetPan = new Set<string>();
    const errors: string[] = [];
    let insertedCount = 0;

    let rowNum = 1;
    for (const row of rows) {
      rowNum++;
      const vendorCode = findValue(row, ["vendor code", "company code", "code"]).trim();
      const companyName = findValue(row, ["company name", "company"]).trim();
      const vendorDisplayName = findValue(row, ["vendor display name", "display name", "vendor name"]).trim();
      const rawVendorTypes = findValue(row, ["vendor type", "vendor_type", "type"]).trim();
      const pointOfContact = findValue(row, ["primary contact person", "point of contact", "contact person", "poc"]).trim();
      const rawContact = findValue(row, ["mobile no", "mobile", "contact no", "contact number", "phone"]).trim();
      const email = findValue(row, ["email", "email address", "mail"]).trim();
      const altMobile = findValue(row, ["alternate mobile no", "alternate mobile", "alt mobile"]).trim();
      const altEmail = findValue(row, ["alternate email", "alt email"]).trim();
      const rawPaymentTerm = findValue(row, ["payment term", "payment_term"]).trim();
      const gstNo = findValue(row, ["gst no", "gst", "gstin"]).trim().toUpperCase();
      const panNo = findValue(row, ["pan no", "pan"]).trim().toUpperCase();
      const rawInHouse = findValue(row, ["in house", "inhouse"]).trim().toLowerCase();
      const rawStatus = findValue(row, ["status"]).trim().toLowerCase();

      // Address
      const addressLine1 = findValue(row, ["address line 1", "address_line_1", "address 1", "address"]).trim();
      const addressLine2 = findValue(row, ["address line 2", "address_line_2", "address 2"]).trim();
      const rawState = findValue(row, ["state"]).trim();
      const rawCity = findValue(row, ["city"]).trim();
      const pincode = findValue(row, ["pincode", "pin code", "pin"]).trim();
      const landmark = findValue(row, ["landmark"]).trim();

      // Contact Person details
      const department = findValue(row, ["contact department", "department"]).trim();
      const designation = findValue(row, ["contact designation", "designation"]).trim();

      // Bank Details
      const bankHolder = findValue(row, ["bank account holder name", "account holder name", "account holder", "holder name"]).trim();
      const bankAccount = findValue(row, ["bank account number", "account number", "account no"]).trim();
      const bankIfsc = findValue(row, ["bank ifsc code", "ifsc code", "ifsc"]).trim().toUpperCase();
      const bankBranch = findValue(row, ["bank branch name", "branch name", "branch"]).trim();
      const bankSwift = findValue(row, ["bank swift code", "swift code", "swift"]).trim().toUpperCase();

      // 1. Mandatory Validations
      if (!vendorCode) {
        errors.push(`Row ${rowNum}: Company Code is required`);
        continue;
      }
      if (!companyName) {
        errors.push(`Row ${rowNum}: Company Name is required`);
        continue;
      }
      if (!pointOfContact) {
        errors.push(`Row ${rowNum}: Primary Contact Person is required`);
        continue;
      }

      const cleanContact = rawContact.replace(/\D/g, "");
      const normalizedContact =
        cleanContact.length === 12 && cleanContact.startsWith("91")
          ? cleanContact.slice(2)
          : cleanContact;
      if (!normalizedContact || normalizedContact.length < 10) {
        errors.push(`Row ${rowNum}: Valid 10-digit Mobile No is required (got: "${rawContact}")`);
        continue;
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Row ${rowNum}: Valid Email is required (got: "${email}")`);
        continue;
      }

      if (!rawVendorTypes) {
        errors.push(`Row ${rowNum}: Vendor Type is required`);
        continue;
      }

      if (!rawPaymentTerm) {
        errors.push(`Row ${rowNum}: Payment Term is required`);
        continue;
      }

      const gstRegex = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/;
      if (!gstNo || !gstRegex.test(gstNo)) {
        errors.push(`Row ${rowNum}: Valid 15-character GSTIN is required (got: "${gstNo}")`);
        continue;
      }

      const panRegex = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
      if (!panNo || !panRegex.test(panNo)) {
        errors.push(`Row ${rowNum}: Valid 10-character PAN No is required (got: "${panNo}")`);
        continue;
      }

      if (!addressLine1) {
        errors.push(`Row ${rowNum}: Address Line 1 is required`);
        continue;
      }
      if (!rawState) {
        errors.push(`Row ${rowNum}: State is required`);
        continue;
      }
      if (!rawCity) {
        errors.push(`Row ${rowNum}: City is required`);
        continue;
      }
      if (!pincode || !/^\d{6}$/.test(pincode)) {
        errors.push(`Row ${rowNum}: Valid 6-digit Pincode is required (got: "${pincode}")`);
        continue;
      }

      if (!department) {
        errors.push(`Row ${rowNum}: Contact Department is required`);
        continue;
      }
      if (!designation) {
        errors.push(`Row ${rowNum}: Contact Designation is required`);
        continue;
      }

      if (!bankHolder) {
        errors.push(`Row ${rowNum}: Bank Account Holder Name is required`);
        continue;
      }
      if (!bankAccount || !/^\d{9,18}$/.test(bankAccount)) {
        errors.push(`Row ${rowNum}: Valid Bank Account Number (9-18 digits) is required (got: "${bankAccount}")`);
        continue;
      }
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!bankIfsc || !ifscRegex.test(bankIfsc)) {
        errors.push(`Row ${rowNum}: Valid IFSC Code (e.g. SBIN0001234) is required (got: "${bankIfsc}")`);
        continue;
      }
      if (!bankBranch) {
        errors.push(`Row ${rowNum}: Bank Branch Name is required`);
        continue;
      }

      // 2. Duplicates Validation
      const lowerCode = vendorCode.toLowerCase();
      if (seenSheetCodes.has(lowerCode)) {
        errors.push(`Row ${rowNum}: Duplicate Company Code "${vendorCode}" in sheet`);
        continue;
      }
      seenSheetCodes.add(lowerCode);
      if (existingCodeSet.has(lowerCode)) {
        errors.push(`Row ${rowNum}: Company Code "${vendorCode}" already exists in database`);
        continue;
      }

      if (seenSheetGst.has(gstNo)) {
        errors.push(`Row ${rowNum}: Duplicate GST No "${gstNo}" in sheet`);
        continue;
      }
      seenSheetGst.add(gstNo);
      if (existingGstSet.has(gstNo)) {
        errors.push(`Row ${rowNum}: GST No "${gstNo}" already exists in database`);
        continue;
      }

      if (seenSheetPan.has(panNo)) {
        errors.push(`Row ${rowNum}: Duplicate PAN No "${panNo}" in sheet`);
        continue;
      }
      seenSheetPan.add(panNo);
      if (existingPanSet.has(panNo)) {
        errors.push(`Row ${rowNum}: PAN No "${panNo}" already exists in database`);
        continue;
      }

      // 3. Foreign Key Resolution
      const matchedState = states.find(
        (s) => s.name.toLowerCase() === rawState.toLowerCase() || String(s.id) === rawState
      );
      if (!matchedState) {
        errors.push(`Row ${rowNum}: State "${rawState}" not found in database`);
        continue;
      }

      const matchedPaymentTerm = paymentTerms.find(
        (p) => p.term_name.toLowerCase() === rawPaymentTerm.toLowerCase() || String(p.id) === rawPaymentTerm
      );

      const typeNames = rawVendorTypes.split(",").map((t) => t.trim().toLowerCase());
      const matchedTypeIds: number[] = [];
      for (const tn of typeNames) {
        const found = vendorTypes.find((vt) => vt.vendor_type_name.toLowerCase() === tn || String(vt.id) === tn);
        if (found) matchedTypeIds.push(found.id);
      }
      if (matchedTypeIds.length === 0) {
        if (vendorTypes.length > 0) {
          matchedTypeIds.push(vendorTypes[0].id);
        } else {
          errors.push(`Row ${rowNum}: Vendor Type "${rawVendorTypes}" not found`);
          continue;
        }
      }

      const inHouse = rawInHouse === "yes" || rawInHouse === "true" || rawInHouse === "1";
      const isActive = rawStatus ? !(rawStatus === "inactive" || rawStatus === "false" || rawStatus === "0") : true;

      // 4. Database Transaction Insert
      try {
        await prisma.$transaction(async (tx) => {
          let cityId: number;
          const foundCity = cities.find(
            (c) =>
              c.state_id === matchedState.id &&
              (c.name.toLowerCase() === rawCity.toLowerCase() || String(c.id) === rawCity)
          );
          if (foundCity) {
            cityId = foundCity.id;
          } else {
            const newCity = await tx.cityMaster.create({
              data: {
                name: rawCity,
                state_id: matchedState.id,
              },
            });
            cityId = newCity.id;
          }

          // Create CompanyVendorsMaster
          const vendorRecord = await tx.companyVendorsMaster.create({
            data: {
              vendor_id: vendorId,
              vendor_code: vendorCode,
              company_name: companyName,
              vendor_name: vendorDisplayName || companyName,
              point_of_contact: pointOfContact,
              contact_no: normalizedContact,
              email: email,
              alternate_mobile_no: altMobile || null,
              alternate_email: altEmail || null,
              address: addressLine1,
              gst_no: gstNo,
              pan_no: panNo,
              in_house: inHouse,
              is_active: isActive,
              is_inventory_company_vendor: true,
              default_payment_term_id: matchedPaymentTerm ? matchedPaymentTerm.id : null,
              state_id: matchedState.id,
              created_by: userId,
              updated_by: userId,
            },
          });

          const companyVendorId = vendorRecord.id;

          // Map Vendor Types
          for (const vtId of matchedTypeIds) {
            await tx.companyVendorTypeMapping.create({
              data: {
                company_vendor_id: companyVendorId,
                vendor_type_id: vtId,
                created_by: userId,
                updated_by: userId,
              },
            });
          }

          // Create Address
          await tx.companyVendorAddress.create({
            data: {
              company_vendor_id: companyVendorId,
              address_line_1: addressLine1,
              address_line_2: addressLine2 || null,
              landmark: landmark || null,
              pincode: pincode,
              state_id: matchedState.id,
              city_id: cityId,
              is_primary: true,
              created_by: userId,
              updated_by: userId,
            },
          });

          // Create Contact Person
          const contactPerson = await tx.companyVendorContactPerson.create({
            data: {
              company_vendor_id: companyVendorId,
              name: pointOfContact,
              phone: normalizedContact,
              email: email,
              department: department,
              designation: designation,
              is_primary: true,
              created_by: userId,
              updated_by: userId,
            },
          });

          // Link primaryContact
          await tx.companyVendorsMaster.update({
            where: { id: companyVendorId },
            data: { primary_contact_id: contactPerson.id },
          });

          // Create Bank Account
          await tx.companyVendorBankAccount.create({
            data: {
              company_vendor_id: companyVendorId,
              holder_name: bankHolder,
              account_no: bankAccount,
              ifsc: bankIfsc,
              branch: bankBranch,
              swift: bankSwift || null,
              is_default: true,
              created_by: userId,
              updated_by: userId,
            },
          });
        });

        insertedCount++;
        existingCodeSet.add(lowerCode);
        existingGstSet.add(gstNo);
        existingPanSet.add(panNo);
      } catch (insertErr: any) {
        errors.push(`Row ${rowNum}: Failed to save record - ${insertErr.message}`);
      }
    }

    return {
      totalRows: rows.length,
      successCount: insertedCount,
      failedCount: rows.length - insertedCount,
      errors,
    };
  }

}
