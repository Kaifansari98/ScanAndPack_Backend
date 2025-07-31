import { prisma } from '../../prisma/client';
import { ProjectMaster, ProjectDetails, ProjectItemsMaster } from '@prisma/client';
import { CreateProjectInput } from '../../types/project.types';

export const createProject = async (data: Omit<ProjectMaster, 'id' | 'created_at'>) => {
  return prisma.projectMaster.create({
    data,
  });
};

export const createProjectDetails = async (data: Omit<ProjectDetails, 'id'>) => {
  return prisma.projectDetails.create({
    data,
  });
};

export const createProjectItem = async (data: Omit<ProjectItemsMaster, 'id'>) => {
  // 1. Create the new item
  const newItem = await prisma.projectItemsMaster.create({ data });

  // 2. Recalculate total_items
  const totalQty = await prisma.projectItemsMaster.aggregate({
    _sum: { qty: true },
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
  });

  const total_items = totalQty._sum.qty || 0;

  // 3. Get current packed count from projectDetails
  const existingDetails = await prisma.projectDetails.findFirst({
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
  });

  const total_packed = existingDetails?.total_packed || 0;
  const total_unpacked = Math.max(total_items - total_packed, 0); // prevent negative

  // 4. Update ProjectDetails
  await prisma.projectDetails.updateMany({
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
    data: {
      total_items,
      total_unpacked,
    },
  });

  return newItem;
};

export const getAllProjects = () => {
    return prisma.projectMaster.findMany({
      include: {
        vendor: true,
        createdByUser: true,
        details: true,
        items: true,
      },
    });
  };
  
  export const getAllProjectDetails = () => {
    return prisma.projectDetails.findMany({
      include: {
        project: true,
        vendor: true,
      },
    });
  };
  
  export const getAllProjectItems = () => {
    return prisma.projectItemsMaster.findMany({
      include: {
        project: true,
        vendor: true,
        details: true,
      },
    });
  };
  
  export const getProjectById = (id: number) => {
    return prisma.projectMaster.findUnique({
      where: { id },
      include: {
        vendor: true,
        createdByUser: true,
        details: true,
        items: true,
      },
    });
  };
  
  export const getProjectDetailsById = (id: number) => {
    return prisma.projectDetails.findUnique({
      where: { id },
      include: {
        project: true,
        vendor: true,
      },
    });
  };
  
  export const getProjectItemById = (id: number) => {
    return prisma.projectItemsMaster.findUnique({
      where: { id },
      include: {
        project: true,
        vendor: true,
        details: true,
      },
    });
  };
  
  export const getProjectsByVendorIdService = async (vendorId: number) => {
    return prisma.projectMaster.findMany({
      where: {
        vendor_id: vendorId,
      },
      select: {
        id: true,
        project_name: true,
        vendor_id: true,
        client_id: true,
        created_by: true,
        project_status: true,
        created_at: true,
        createdByUser: {
          select: {
            id: true,
            vendor_id: true,
            user_name: true,
            user_type_id: true,
          },
        },
        details: {
          select: {
            id: true,
            project_id: true,
            vendor_id: true,
            client_id: true,
            total_items: true,
            total_packed: true,
            total_unpacked: true,
            start_date: true,
            estimated_completion_date: true,
            actual_completion_date: true,
          },
        },
      },
    });
  };

  export const getProjectItemByFields = async (params: {
    project_id: number;
    vendor_id: number;
    client_id: number;
    unique_id: string;
  }) => {
    return prisma.projectItemsMaster.findFirst({
      where: {
        project_id: params.project_id,
        vendor_id: params.vendor_id,
        client_id: params.client_id,
        unique_id: {
          equals: params.unique_id.trim(),
          mode: 'insensitive',
        },
      },
      include: {
        project: true,
        vendor: true,
        details: true,
      },
    });
  };
  
  export const getProjectItemCounts = async ({
    project_id,
    vendor_id,
    client_id,
  }: {
    project_id: number;
    vendor_id: number;
    client_id: number;
  }) => {
    // 1. Total qty from ProjectItemsMaster
    const totalQty = await prisma.projectItemsMaster.aggregate({
      _sum: { qty: true },
      where: {
        project_id,
        vendor_id,
        client_id,
      },
    });
  
    // 2. Total packed qty from ScanAndPackItem (SUM qty, not just COUNT)
    const packedQty = await prisma.scanAndPackItem.aggregate({
      _sum: { qty: true },
      where: {
        project_id,
        vendor_id,
        client_id,
        status: 'packed',
      },
    });
  
    const total_items = totalQty._sum.qty || 0;
    const total_packed = packedQty._sum.qty || 0;
    const total_unpacked = total_items - total_packed;
  
    // 3. Update ProjectDetails here (optional step)
    await prisma.projectDetails.updateMany({
      where: {
        project_id,
        vendor_id,
        client_id,
      },
      data: {
        total_items,
        total_packed,
        total_unpacked,
      },
    });
  
    return {
      total_items,
      total_packed,
      total_unpacked,
    };
  };