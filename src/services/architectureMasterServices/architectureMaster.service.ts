import { prisma } from "../../prisma/client";

export class ArchitectureMasterService {
  /**
   * Create a new architecture master
   */
  async createArchitectureMaster(data: {
    vendorId: string | number;
    name: string;
    email: string;
    mobile: string;
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
      isdeletetd: false,
    };

    if (search) {
      whereCondition.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { mobile: { contains: search, mode: "insensitive" } },
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

    // Map `movile` back to `mobile` and `isdeletetd` to `is_deleted` for consistency in response if needed
    const formattedData = data.map((item) => ({
      ...item,
      mobile: item.mobile,
      is_active: item.isActive,
      created_at: item.createdAt,
      created_by: item.createdBy,
      is_deleted: item.isdeletetd,
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
        isdeletetd: false,
      },
    });
    
    if (data) {
      return {
        ...data,
        mobile: data.mobile,
        is_active: data.isActive,
        created_at: data.createdAt,
        created_by: data.createdBy,
        is_deleted: data.isdeletetd,
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
      is_active?: boolean;
    }
  ) {
    const updateData: any = {};
    if (data.vendorId !== undefined) updateData.vendorId = Number(data.vendorId);
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.mobile !== undefined) updateData.mobile = data.mobile;
    if (data.is_active !== undefined) updateData.isActive = data.is_active;

    const updatedData = await prisma.architechuremaster.update({
      where: { id: Number(id) },
      data: updateData,
    });

    return {
      ...updatedData,
      mobile: updatedData.mobile,
      is_active: updatedData.isActive,
      created_at: updatedData.createdAt,
      created_by: updatedData.createdBy,
      is_deleted: updatedData.isdeletetd,
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
        isdeletetd: true,
        deletedAt: new Date(),
      },
    });
    return {
      ...deletedData,
      mobile: deletedData.mobile,
      is_active: deletedData.isActive,
      created_at: deletedData.createdAt,
      created_by: deletedData.createdBy,
      is_deleted: deletedData.isdeletetd,
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
      is_active: updatedData.isActive,
      created_at: updatedData.createdAt,
      created_by: updatedData.createdBy,
      is_deleted: updatedData.isdeletetd,
      deleted_at: updatedData.deletedAt,
    };
  }
}
