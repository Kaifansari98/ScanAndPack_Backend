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
        created_by: Number(created_by),
        updated_by: Number(created_by),
      },
    });

    return newVendor;
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
}
