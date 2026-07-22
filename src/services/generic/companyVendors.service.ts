import { prisma } from "../../prisma/client";

export class CompanyVendorsService {
  async getCompanyVendorsByVendorId(vendorId: number) {
    if (!vendorId) {
      const error = new Error("vendor_id is required");
      (error as any).statusCode = 400;
      throw error;
    }

    return prisma.companyVendorsMaster.findMany({
      where: { vendor_id: vendorId, is_deleted: false, status_id: 1 },
      orderBy: { created_at: "desc" },
      include: {
        vendor: {
          select: { vendor_name: true, vendor_code: true },
        },
      },
    });
  }

  async getCompanyVendorsByVendorIdForMaster(vendorId: number) {
    if (!vendorId) {
      const error = new Error("vendor_id is required");
      (error as any).statusCode = 400;
      throw error;
    }

    return prisma.companyVendorsMaster.findMany({
      where: { vendor_id: vendorId, is_deleted: false },
      orderBy: { created_at: "desc" },
      include: {
        vendor: {
          select: { vendor_name: true, vendor_code: true },
        },
        status: true,
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
        status_id: isDeleted ? 2 : 1, // 2 = Inactive, 1 = Active
        is_deleted: false, // Ensure not soft-deleted
        updated_by: updatedBy,
        updated_at: new Date(),
      },
    });
  }
}
