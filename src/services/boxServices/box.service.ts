import { prisma } from '../../prisma/client';
import { BoxStatus } from '@prisma/client';
import { CreateBoxInput } from '../../types/boxTypes';

export const createBox = async (data: CreateBoxInput) => {
  const { vendor_id, project_id, client_id, box_name } = data;

  const existingBox = await prisma.boxMaster.findFirst({
    where: {
      vendor_id,
      project_id,
      client_id,
      box_name,
      is_deleted: false, // also respect soft delete
    },
  });

  if (existingBox) {
    throw new Error('Box already exists');
  }

  return prisma.boxMaster.create({
    data,
  });
};

export const updateBoxName = async (
  id: number,
  vendor_id: number,
  project_id: number,
  client_id: number,
  newBoxName: string
) => {
  // Check if box exists with these fields
  const existingBox = await prisma.boxMaster.findFirst({
    where: {
      id,
      vendor_id,
      project_id,
      client_id,
      is_deleted: false,
    },
  });

  if (!existingBox) {
    throw new Error('Box not found');
  }

  // Check if the new box_name already exists for this vendor/project/client
  const duplicate = await prisma.boxMaster.findFirst({
    where: {
      vendor_id,
      project_id,
      client_id,
      box_name: newBoxName,
      is_deleted: false,
      NOT: {
        id, // exclude the current box
      },
    },
  });

  if (duplicate) {
    throw new Error('Another box with the same name already exists');
  }

  // Proceed to update
  return prisma.boxMaster.update({
    where: { id },
    data: {
      box_name: newBoxName,
    },
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

export const getBoxDetailsWithItems = async (
  vendorId: number,
  projectId: number,
  clientId: number,
  boxId: number
) => {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendorId },
  });

  const box = await prisma.boxMaster.findFirst({
    where: {
      id: boxId,
      project_id: projectId,
    },
    include: {
      details: true,
      project: true,
    },
  });

  const items = await prisma.scanAndPackItem.findMany({
    where: {
      vendor_id: vendorId,
      project_id: projectId,
      client_id: clientId,
      box_id: boxId,
    },
    include: {
      user: true,
      details: true,
    },
  });

  // 🔥 Enrich each item with its ProjectItemsMaster record
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const projectItem = await prisma.projectItemsMaster.findFirst({
        where: {
          project_id: item.project_id,
          vendor_id: item.vendor_id,
          client_id: item.client_id,
          unique_id: item.unique_id,
        },
      });

      return {
        ...item,
        projectItem,
      };
    })
  );

  return {
    vendor,
    box,
    items: enrichedItems,
  };
};

export const getAllBoxesWithItemCountService = async (
  vendorId: number,
  projectId: number,
  clientId: number
) => {
  const [vendor, project] = await Promise.all([
    prisma.vendorMaster.findUnique({
      where: { id: vendorId },
    }),
    prisma.projectMaster.findUnique({
      where: { id: projectId },
    }),
  ]);

  if (!vendor || !project) {
    throw new Error('Vendor or Project not found');
  }

  const boxes = await prisma.boxMaster.findMany({
    where: {
      project_id: projectId,
      vendor_id: vendorId,
      client_id: clientId,
      is_deleted: false,
    },
  });

  const enrichedBoxes = await Promise.all(
    boxes.map(async (box) => {
      const items = await prisma.scanAndPackItem.findMany({
        where: {
          vendor_id: vendorId,
          project_id: projectId,
          client_id: clientId,
          box_id: box.id,
        },
      });

      return {
        box_id: box.id,
        box_name: box.box_name,
        total_items: items.length,
      };
    })
  );

  return {
    vendor,
    project,
    boxes: enrichedBoxes,
  };
};