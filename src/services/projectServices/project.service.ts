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
  