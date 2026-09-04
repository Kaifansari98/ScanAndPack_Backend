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
}
