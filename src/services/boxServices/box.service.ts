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
      project: {
        include: {
          client: true,
        },
      },
    },
  });

  const items = await prisma.scanAndPackItem.findMany({
    where: {
      vendor_id: vendorId,
      project_id: projectId,
      client_id: clientId,
      box_id: boxId,
      is_deleted: false,
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
    client: box?.project?.client,
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
      include: {
        client: true,
      },
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
    client: project.client,
    boxes: enrichedBoxes,
  };
};

export const updateBoxStatus = async (
  boxId: number,
  newStatus: BoxStatus
) => {
  const box = await prisma.boxMaster.findFirst({
    where: {
      id: boxId,
      is_deleted: false,
    },
  });

  if (!box) {
    throw new Error('Box not found or is deleted');
  }

  return await prisma.boxMaster.update({
    where: { id: boxId },
    data: { box_status: newStatus },
  });
};

export const softDeleteBoxWithScanItems = async (
  boxId: number,
  deletedBy: number
) => {
  // Step 1: Check if box exists and is not deleted
  const box = await prisma.boxMaster.findFirst({
    where: { id: boxId, is_deleted: false },
  });

  if (!box) throw new Error('Box not found or already deleted');

  // Step 2: Soft delete all scan items linked to this box
  await prisma.scanAndPackItem.updateMany({
    where: {
      box_id: boxId,
      is_deleted: false,
    },
    data: {
      is_deleted: true,
    },
  });

  // Step 3: Get all ProjectDetails (rooms) for this project
  const allProjectDetails = await prisma.projectDetails.findMany({
    where: {
      project_id: box.project_id,
      vendor_id: box.vendor_id,
      client_id: box.client_id,
    },
  });

  if (!allProjectDetails || allProjectDetails.length === 0) {
    throw new Error('ProjectDetails not found');
  }

  // Step 4: Recalculate counts for each room and update them
  const updatedRooms = [];
  
  for (const projectDetail of allProjectDetails) {
    // Get packed count for this specific room
    const packedCountForRoom = await prisma.scanAndPackItem.count({
      where: {
        project_details_id: projectDetail.id,
        project_id: box.project_id,
        vendor_id: box.vendor_id,
        client_id: box.client_id,
        is_deleted: false,
      },
    });

    // Calculate totals for this room
    const total_items = projectDetail.total_items;
    const total_packed = packedCountForRoom;
    const total_unpacked = Math.max(total_items - total_packed, 0);

    // Update this room's counts
    await prisma.projectDetails.update({
      where: {
        id: projectDetail.id,
      },
      data: {
        total_packed,
        total_unpacked,
      },
    });

    updatedRooms.push({
      project_details_id: projectDetail.id,
      room_name: projectDetail.room_name,
      total_items,
      total_packed,
      total_unpacked,
    });
  }

  // Step 5: Soft delete the box
  const deletedBox = await prisma.boxMaster.update({
    where: { id: boxId },
    data: {
      is_deleted: true,
      deleted_by: deletedBy,
      deleted_at: new Date(),
    },
  });

  return {
    message: 'Box and scan items soft-deleted successfully',
    deletedBoxId: deletedBox.id,
    updatedProjectDetails: updatedRooms,
  };
};