import { prisma } from '../../prisma/client';
import { BoxStatus } from '@prisma/client';
import { CreateBoxInput } from '../../types/boxTypes';

export const createBox = async (data: CreateBoxInput) => {
  return await prisma.boxMaster.create({
    data,
  });
};

export const getAllBoxes = async () => {
  return await prisma.boxMaster.findMany({
    where: {
      is_deleted: false,
    },
    include: {
      project: true,
      vendor: true,
      details: true,
    },
  });
};

export const getBoxesByVendorAndProject = async (vendorId: number, projectId: number) => {
  return await prisma.boxMaster.findMany({
    where: {
      vendor_id: vendorId,
      project_id: projectId,
      is_deleted: false,
    },
    include: {
      details: true,
      _count: {
        select: {
          items: true,
        },
      },
    },
  });
};
