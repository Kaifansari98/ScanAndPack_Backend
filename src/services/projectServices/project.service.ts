import { prisma } from '../../prisma/client';
import { ProjectMaster, ProjectDetails, ProjectItemsMaster } from '@prisma/client';

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
  return prisma.projectItemsMaster.create({
    data,
  });
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
  