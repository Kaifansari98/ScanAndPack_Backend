import { prisma } from "../../prisma/client";
import ExcelJS from "exceljs";
import { Readable } from "stream";

export class ArchitectureMasterService {
  /**
   * Create a new architecture master
   */
  async createArchitectureMaster(data: {
    vendorId: string | number;
    name: string;
    email: string;
    mobile: string;
    alt_mobile?: string;
    is_active?: boolean;
    created_by?: string | number;
  }) {
    const createdBy = data.created_by ? Number(data.created_by) : 1;
    return (prisma.architechuremaster as any).create({
      data: {
        vendorId: Number(data.vendorId),
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        alt_mobile: data.alt_mobile,
        isActive: data.is_active ?? true,
        createdBy,
      },
    });
  }

  /**
   * Get list of architecture masters with pagination
   */
  async getAllArchitectureMasters(page: number, limit: number, search?: string) {
    const skip = (page - 1) * limit;

    const whereCondition: any = {
      isDeleted: false,
    };

    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { mobile: { contains: search, mode: "insensitive" } },
        { alt_mobile: { contains: search, mode: "insensitive" } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.architechuremaster.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.architechuremaster.count({ where: whereCondition }),
    ]);

    // Map `movile` back to `mobile` and `isDeleted` to `is_deleted` for consistency in response if needed
    const formattedData = data.map((item) => ({
      ...item,
      mobile: item.mobile,
      alt_mobile: item.alt_mobile,
      is_active: item.isActive,
      created_at: item.createdAt,
      created_by: item.createdBy,
      is_deleted: item.isDeleted,
      deleted_at: item.deletedAt,
    }));

    return {
      data: formattedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get single architecture master by ID
   */
  async getArchitectureMasterById(id: string | number) {
    const data = await prisma.architechuremaster.findFirst({
      where: {
        id: Number(id),
        isDeleted: false,
      },
    });
    
    if (data) {
      return {
        ...data,
        mobile: data.mobile,
        alt_mobile: data.alt_mobile,
        is_active: data.isActive,
        created_at: data.createdAt,
        created_by: data.createdBy,
        is_deleted: data.isDeleted,
        deleted_at: data.deletedAt,
      };
    }
    return null;
  }

  /**
   * Update architecture master
   */
  async updateArchitectureMaster(
    id: string | number,
    data: {
      vendorId?: string | number;
      name?: string;
      email?: string;
      mobile?: string;
      alt_mobile?: string;
      is_active?: boolean;
    }
  ) {
    const updateData: any = {};
    if (data.vendorId !== undefined) updateData.vendorId = Number(data.vendorId);
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.mobile !== undefined) updateData.mobile = data.mobile;
    if (data.alt_mobile !== undefined) updateData.alt_mobile = data.alt_mobile;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;

    const updatedData = await prisma.architechuremaster.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return {
      ...updatedData,
      mobile: updatedData.mobile,
      alt_mobile: updatedData.alt_mobile,
      is_active: updatedData.isActive,
      created_at: updatedData.createdAt,
      created_by: updatedData.createdBy,
      is_deleted: updatedData.isDeleted,
      deleted_at: updatedData.deletedAt,
    };
  }

  /**
   * Soft delete architecture master
   */
  async deleteArchitectureMaster(id: string | number, deletedBy?: string | number) {
    const deletedData = await prisma.architechuremaster.update({
      where: { id: Number(id) },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
    return {
      ...deletedData,
      mobile: deletedData.mobile,
      alt_mobile: deletedData.alt_mobile,
      is_active: deletedData.isActive,
      created_at: deletedData.createdAt,
      created_by: deletedData.createdBy,
      is_deleted: deletedData.isDeleted,
      deleted_at: deletedData.deletedAt,
    };
  }
  /**
   * Update architecture master status (active/inactive)
   */
  async updateArchitectureMasterStatus(id: string | number, is_active: boolean) {
    const updatedData = await prisma.architechuremaster.update({
      where: { id: Number(id) },
      data: {
        isActive: is_active,
      },
    });

    return {
      ...updatedData,
      mobile: updatedData.mobile,
      alt_mobile: updatedData.alt_mobile,
      is_active: updatedData.isActive,
      created_at: updatedData.createdAt,
      created_by: updatedData.createdBy,
      is_deleted: updatedData.isDeleted,
      deleted_at: updatedData.deletedAt,
    };
  }

  /**
   * Get simple list of active architects for dropdowns
   */
  async getArchitectsList(vendorId: string | number) {
    const data = await prisma.architechuremaster.findMany({
      where: {
        vendorId: Number(vendorId),
        isDeleted: false,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        mobile: true,
        alt_mobile: true,
      },
      orderBy: {
        name: "asc",
      },
    });
    return data;
  }

  /**
   * Bulk upload architecture masters from XLSX or CSV file buffer
   */
  async bulkUploadArchitects(
    fileBuffer: any,
    isCsv: boolean,
    vendorId: number,
    createdBy: number
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
      throw new Error("No sheets found in the file");
    }

    const headers: string[] = [];
    const rows: any[] = [];

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
      return String(val);
    };

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          const val = cell.value;
          const headerText = getCellValue(val);
          headers.push(headerText.trim().toLowerCase());
        });
      } else {
        const rowData: any = {};
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const val = cell.value;
          const cellValue = getCellValue(val);
          const headerName = headers[colNumber - 1];
          if (headerName) {
            rowData[headerName] = cellValue.trim();
          }
        });
        rows.push(rowData);
      }
    });

    console.log("=== bulkUploadArchitects DBG ===");
    console.log("Parsed headers:", headers);
    console.log("Parsed rows:", JSON.stringify(rows));

    // Verify required headers exist
    const hasNameHeader = headers.some(k => k.includes("name"));
    const hasEmailHeader = headers.some(k => k.includes("email"));
    const hasMobileHeader = headers.some(k => k.includes("mobile") || (k.includes("contact") && !k.includes("alt")));

    const missingHeaders = [];
    if (!hasNameHeader) missingHeaders.push("name");
    if (!hasEmailHeader) missingHeaders.push("email");
    if (!hasMobileHeader) missingHeaders.push("contact");

    if (missingHeaders.length > 0) {
      throw new Error(`Required columns are missing in the sheet: ${missingHeaders.join(", ")}`);
    }

    const createdArchitects = [];
    const skippedRows: Array<{ row: Record<string, string>; reason: string }> = [];
    const errors: string[] = [];
    const validatedRows: any[] = [];
    let rowIndex = 1;

    for (const row of rows) {
      rowIndex++;
      const nameKey = Object.keys(row).find(k => k.includes("name"));
      const emailKey = Object.keys(row).find(k => k.includes("email"));
      const mobileKey = Object.keys(row).find(k => k.includes("mobile") || (k.includes("contact") && !k.includes("alt")));
      const altMobileKey = Object.keys(row).find(
        k => k.includes("alt") || k.includes("alternate")
      );

      const rawName = nameKey ? row[nameKey] : "";
      const rawEmail = emailKey ? row[emailKey] : "";
      const rawMobile = mobileKey ? row[mobileKey] : "";
      const rawAltMobile = altMobileKey ? row[altMobileKey] : null;

      const name = rawName ? String(rawName).trim() : "";
      const email = rawEmail ? String(rawEmail).trim() : "";
      const mobile = rawMobile ? String(rawMobile).trim() : "";
      const alt_mobile = rawAltMobile ? String(rawAltMobile).trim() : "";

      // 1. Name validation
      if (!name) {
        errors.push(`Row ${rowIndex}: Name is required`);
      } else if (/^\d+$/.test(name)) {
        errors.push(`Row ${rowIndex}: Name cannot be only numbers (${name})`);
      }

      // 2. Email validation
      if (!email) {
        errors.push(`Row ${rowIndex}: Email is required`);
      } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          errors.push(`Row ${rowIndex}: Invalid Email format (${email})`);
        }
      }

      // 3. Contact/Mobile validation
      if (!mobile) {
        errors.push(`Row ${rowIndex}: Contact number is required`);
      } else {
        const cleanMobile = mobile.replace(/[\s+()-]/g, "");
        if (!/^\d{10,12}$/.test(cleanMobile)) {
          errors.push(`Row ${rowIndex}: Contact number must be a valid 10 to 12 digit number (${mobile})`);
        }
      }

      // 4. Alt Contact validation (Optional)
      let cleanAltMobile = null;
      if (alt_mobile && alt_mobile !== "") {
        const altClean = alt_mobile.replace(/[\s+()-]/g, "");
        if (!/^\d{10,12}$/.test(altClean)) {
          errors.push(`Row ${rowIndex}: Alternate contact number must be a valid 10 to 12 digit number (${alt_mobile})`);
        } else {
          cleanAltMobile = altClean;
        }
      }

      if (errors.length === 0) {
        const cleanMobile = mobile.replace(/[\s+()-]/g, "");
        const finalMobile = cleanMobile.length > 10 && cleanMobile.startsWith("91") ? cleanMobile.slice(2) : cleanMobile;
        const finalAltMobile = cleanAltMobile ? (cleanAltMobile.length > 10 && cleanAltMobile.startsWith("91") ? cleanAltMobile.slice(2) : cleanAltMobile) : null;

        validatedRows.push({
          name,
          email,
          mobile: finalMobile,
          alt_mobile: finalAltMobile,
        });
      }
    }

    console.log("Validation errors:", errors);
    console.log("Validated rows:", validatedRows);

    if (errors.length > 0) {
      throw new Error(errors.join(" | "));
    }

    const uploadEmails = validatedRows
      .map((row) => row.email?.trim().toLowerCase())
      .filter(Boolean);
    const uploadMobiles = validatedRows
      .map((row) => row.mobile?.trim())
      .filter(Boolean);

    const existingArchitects = await prisma.architechuremaster.findMany({
      where: {
        OR: [
          uploadEmails.length > 0
            ? { email: { in: uploadEmails } }
            : undefined,
          uploadMobiles.length > 0
            ? { mobile: { in: uploadMobiles } }
            : undefined,
        ].filter(Boolean) as any[],
      },
      select: {
        email: true,
        mobile: true,
      },
    });

    const existingEmails = new Set(
      existingArchitects
        .map((row) => row.email?.trim().toLowerCase())
        .filter(Boolean),
    );
    const existingMobiles = new Set(
      existingArchitects
        .map((row) => row.mobile?.trim())
        .filter(Boolean),
    );
    const seenEmails = new Set<string>();
    const seenMobiles = new Set<string>();

    for (const dataRow of validatedRows) {
      const normalizedEmail = dataRow.email.trim().toLowerCase();
      const normalizedMobile = dataRow.mobile.trim();

      if (existingEmails.has(normalizedEmail)) {
        skippedRows.push({
          row: dataRow,
          reason: `Architect with email ${dataRow.email} already exists`,
        });
        continue;
      }

      if (existingMobiles.has(normalizedMobile)) {
        skippedRows.push({
          row: dataRow,
          reason: `Architect with contact ${dataRow.mobile} already exists`,
        });
        continue;
      }

      if (seenEmails.has(normalizedEmail)) {
        skippedRows.push({
          row: dataRow,
          reason: `Duplicate email ${dataRow.email} found in uploaded file`,
        });
        continue;
      }

      if (seenMobiles.has(normalizedMobile)) {
        skippedRows.push({
          row: dataRow,
          reason: `Duplicate contact ${dataRow.mobile} found in uploaded file`,
        });
        continue;
      }

      try {
        const newArch = await (prisma.architechuremaster as any).create({
          data: {
            vendorId,
            name: dataRow.name,
            email: dataRow.email,
            mobile: dataRow.mobile,
            alt_mobile: dataRow.alt_mobile,
            isActive: true,
            createdBy,
          },
        });
        createdArchitects.push(newArch);
        seenEmails.add(normalizedEmail);
        seenMobiles.add(normalizedMobile);
      } catch (err: any) {
        if (err?.code === "P2002") {
          skippedRows.push({
            row: dataRow,
            reason: "Duplicate architect data already exists",
          });
          continue;
        }
        throw new Error(`Failed to save architect data: ${err.message}`);
      }
    }

    return {
      successCount: createdArchitects.length,
      skippedCount: skippedRows.length,
      skippedRows,
    };
  }
}
