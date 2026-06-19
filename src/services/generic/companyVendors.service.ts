import { prisma } from "../../prisma/client";

export class CompanyVendorsService {
  async createCompanyVendor(vendorId: number, payload: any) {
    const {
      vendor_code,
      company_name,
      point_of_contact,
      contact_no,
      email,
      address,
      created_by,
      in_house,
    } = payload;

    // 🧾 Validation
    const missingFields: string[] = [];

    if (!vendorId) missingFields.push("vendor_id");
    if (!vendor_code) missingFields.push("vendor_code");
    if (!company_name) missingFields.push("company_name");
    if (!point_of_contact) missingFields.push("point_of_contact");
    if (!contact_no) missingFields.push("contact_no");
    if (!created_by) missingFields.push("created_by");

    if (missingFields.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missingFields.join(", ")}`
      );
      (error as any).statusCode = 400;
      throw error;
    }

    // 🔍 Duplicate check
    const existing = await prisma.companyVendorsMaster.findFirst({
      where: {
        vendor_id: vendorId,
        vendor_code: vendor_code,
      },
    });

    if (existing) {
      const error = new Error(
        "Vendor with this vendor_code already exists for this vendor."
      );
      (error as any).statusCode = 409;
      throw error;
    }

    // ✅ Create new company vendor
    const newVendor = await prisma.companyVendorsMaster.create({
      data: {
        vendor_id: vendorId,
        vendor_code,
        company_name,
        point_of_contact,
        contact_no,
        email,
        address,
        in_house: in_house !== undefined ? (in_house === true || in_house === "true") : false,
        created_by: Number(created_by),
        updated_by: Number(created_by),
      },
    });

    return newVendor;
  }

  async createCompanyVendorsBulk(vendorId: number, payload: any) {
    if (!vendorId) {
      const error = new Error("vendor_id is required");
      (error as any).statusCode = 400;
      throw error;
    }

    const entries = Array.isArray(payload) ? payload : [payload];

    if (entries.length === 0) {
      const error = new Error("At least one company vendor is required");
      (error as any).statusCode = 400;
      throw error;
    }

    const missingFields: string[] = [];
    const vendorCodes: string[] = [];

    entries.forEach((item, index) => {
      if (!item?.vendor_code) missingFields.push(`index ${index}: vendor_code`);
      if (!item?.company_name)
        missingFields.push(`index ${index}: company_name`);
      if (!item?.point_of_contact)
        missingFields.push(`index ${index}: point_of_contact`);
      if (!item?.contact_no) missingFields.push(`index ${index}: contact_no`);
      if (!item?.created_by) missingFields.push(`index ${index}: created_by`);

      if (item?.vendor_code) vendorCodes.push(item.vendor_code);
    });

    if (missingFields.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missingFields.join(", ")}`
      );
      (error as any).statusCode = 400;
      throw error;
    }

    const seen = new Set<string>();
    const duplicateCodes = vendorCodes.filter((code) => {
      if (seen.has(code)) return true;
      seen.add(code);
      return false;
    });

    if (duplicateCodes.length > 0) {
      const error = new Error(
        `Duplicate vendor_code in request: ${[
          ...new Set(duplicateCodes),
        ].join(", ")}`
      );
      (error as any).statusCode = 409;
      throw error;
    }

    const existing = await prisma.companyVendorsMaster.findMany({
      where: {
        vendor_id: vendorId,
        vendor_code: { in: vendorCodes },
      },
      select: { vendor_code: true },
    });

    if (existing.length > 0) {
      const existingCodes = existing.map((item) => item.vendor_code);
      const error = new Error(
        `Vendor with vendor_code already exists for this vendor: ${existingCodes.join(
          ", "
        )}`
      );
      (error as any).statusCode = 409;
      throw error;
    }

    const dataToInsert = entries.map((item) => ({
      vendor_id: vendorId,
      vendor_code: item.vendor_code,
      company_name: item.company_name,
      point_of_contact: item.point_of_contact,
      contact_no: item.contact_no,
      email: item.email ?? null,
      address: item.address ?? null,
      in_house: item.in_house !== undefined ? (item.in_house === true || item.in_house === "true") : false,
      created_by: Number(item.created_by),
      updated_by: Number(item.created_by),
    }));

    const result = await prisma.companyVendorsMaster.createMany({
      data: dataToInsert,
    });

    return {
      insertedCount: result.count,
      records: dataToInsert,
    };
  }

  async getCompanyVendorsByVendorId(vendorId: number) {
    if (!vendorId) {
      const error = new Error("vendor_id is required");
      (error as any).statusCode = 400;
      throw error;
    }

    const vendors = await prisma.companyVendorsMaster.findMany({
      where: { vendor_id: vendorId, is_deleted: false },
      orderBy: { created_at: "desc" },
      include: {
        vendor: {
          select: { vendor_name: true, vendor_code: true },
        },
      },
    });

    if (!vendors || vendors.length === 0) {
      const error = new Error("No company vendors found for this vendor_id");
      (error as any).statusCode = 404;
      throw error;
    }

    return vendors;
  }

  async getCompanyVendorsByVendorIdForMaster(vendorId: number) {
    if (!vendorId) {
      const error = new Error("vendor_id is required");
      (error as any).statusCode = 400;
      throw error;
    }

    return prisma.companyVendorsMaster.findMany({
      where: { vendor_id: vendorId },
      orderBy: { created_at: "desc" },
      include: {
        vendor: {
          select: { vendor_name: true, vendor_code: true },
        },
      },
    });
  }

  async updateCompanyVendor(
    vendorId: number,
    companyVendorId: number,
    payload: any
  ) {
    const {
      vendor_code,
      company_name,
      point_of_contact,
      contact_no,
      email,
      address,
      updated_by,
      in_house,
    } = payload;

    // 🧾 Validation
    const missingFields: string[] = [];
    if (!vendorId) missingFields.push("vendor_id");
    if (!companyVendorId) missingFields.push("company_vendor_id");
    if (!updated_by) missingFields.push("updated_by");

    if (missingFields.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missingFields.join(", ")}`
      );
      (error as any).statusCode = 400;
      throw error;
    }

    // 🔍 Check if record exists
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

    // ✅ Update record
    const updatedVendor = await prisma.companyVendorsMaster.update({
      where: { id: companyVendorId },
      data: {
        vendor_code: vendor_code ?? existingVendor.vendor_code,
        company_name: company_name ?? existingVendor.company_name,
        point_of_contact: point_of_contact ?? existingVendor.point_of_contact,
        contact_no: contact_no ?? existingVendor.contact_no,
        email: email ?? existingVendor.email,
        address: address ?? existingVendor.address,
        in_house: in_house !== undefined ? (in_house === true || in_house === "true") : existingVendor.in_house,
        updated_by: Number(updated_by),
        updated_at: new Date(),
      },
    });

    return updatedVendor;
  }

  async softDeleteCompanyVendor(
    vendorId: number,
    companyVendorId: number,
    deletedBy: number
  ) {
    // 🧾 Validation
    const missingFields: string[] = [];
    if (!vendorId) missingFields.push("vendor_id");
    if (!companyVendorId) missingFields.push("company_vendor_id");
    if (!deletedBy) missingFields.push("deleted_by");

    if (missingFields.length > 0) {
      const error = new Error(
        `Missing required field(s): ${missingFields.join(", ")}`
      );
      (error as any).statusCode = 400;
      throw error;
    }

    // 🔍 Check if record exists
    const existingVendor = await prisma.companyVendorsMaster.findFirst({
      where: {
        id: companyVendorId,
        vendor_id: vendorId,
        is_deleted: false,
      },
    });

    if (!existingVendor) {
      const error = new Error("Company vendor not found or already deleted");
      (error as any).statusCode = 404;
      throw error;
    }

    // ✅ Soft delete
    const deletedVendor = await prisma.companyVendorsMaster.update({
      where: { id: companyVendorId },
      data: {
        is_deleted: true,
        deleted_by: deletedBy,
        deleted_at: new Date(),
      },
    });

    return deletedVendor;
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
        is_deleted: isDeleted,
        deleted_by: isDeleted ? updatedBy : null,
        deleted_at: isDeleted ? new Date() : null,
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    });
  }
}
