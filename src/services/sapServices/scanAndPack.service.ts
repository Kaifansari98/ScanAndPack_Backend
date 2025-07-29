import {prisma} from '../../prisma/client';
import { ItemStatus } from '@prisma/client'; // assuming status enum is defined there

interface ScanPackPayload {
  project_id: number;
  vendor_id: number;
  client_id: number;
  unique_id: string;
  box_id: number;
  created_by: number;
  status: ItemStatus;
}

export const getProjectItemAndInsertScanPack = async (payload: ScanPackPayload) => {
  const { project_id, vendor_id, client_id, unique_id, box_id, created_by, status } = payload;

  // Step 1: Get the item
  const item = await prisma.projectItemsMaster.findFirst({
    where: {
      project_id,
      vendor_id,
      client_id,
      unique_id
    },
    include: {
      project: true,
      vendor: true,
      details: true
    }
  });

  if (!item) throw new Error('Item not found');

  // Step 2: Check how many times this item has already been scanned
  const currentScanCount = await prisma.scanAndPackItem.count({
    where: {
      project_id,
      vendor_id,
      client_id,
      unique_id,
      is_deleted: false,
    }
  });

  if (currentScanCount >= item.qty) {
    throw new Error(`Scan limit exceeded for this item.`);
  }

  // Step 3: Insert scan
  const newScan = await prisma.scanAndPackItem.create({
    data: {
      project_id: item.project_id,
      vendor_id: item.vendor_id,
      client_id: item.client_id,
      box_id,
      project_details_id: item.project_details_id,
      unique_id: item.unique_id,
      qty: 1, 
      created_by,
      status
    }
  });

  // Step 4: Recalculate packed & unpacked totals
  const packedCount = await prisma.scanAndPackItem.count({
    where: {
      project_id,
      vendor_id,
      client_id,
      is_deleted: false,
    }
  });

  const projectDetails = await prisma.projectDetails.findFirst({
    where: {
      project_id,
      vendor_id,
      client_id
    }
  });

  const total_items = projectDetails?.total_items || 0;
  const total_packed = packedCount;
  const total_unpacked = Math.max(total_items - total_packed, 0);

  // Step 5: Update projectDetails
  await prisma.projectDetails.updateMany({
    where: {
      project_id,
      vendor_id,
      client_id
    },
    data: {
      total_packed,
      total_unpacked
    }
  });

  return newScan;
};

export const getScanItemsByFields = async ({
  project_id,
  vendor_id,
  client_id,
  box_id,
}: {
  project_id: number;
  vendor_id: number;
  client_id: number;
  box_id: number;
}) => {
  const scanItems = await prisma.scanAndPackItem.findMany({
    where: {
      project_id,
      vendor_id,
      client_id,
      box_id,
      is_deleted: false,
    },
    orderBy: {
      created_date: 'desc',
    },
  });

  const enrichedItems = await Promise.all(
    scanItems.map(async (item) => {
      const projectItems = await prisma.projectItemsMaster.findMany({
        where: {
          project_id: item.project_id,
          vendor_id: item.vendor_id,
          client_id: item.client_id,
          unique_id: item.unique_id,
        },
      });

      return {
        id: item.id, // Include ScanAndPackItem.id
        unique_id: item.unique_id,
        project_id: item.project_id,
        vendor_id: item.vendor_id,
        client_id: item.client_id,
        box_id: item.box_id,
        status: item.status,
        created_by: item.created_by,
        created_date: item.created_date,
        qty: item.qty,
        project_item_details: projectItems.length === 1 ? projectItems[0] : projectItems,
      };      
    })
  );

  return enrichedItems;
};  

export const deleteScanAndPackItemById = async (id: number) => {
  // Step 1: Find the scan item
  const existing = await prisma.scanAndPackItem.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Scan item not found');
  }

  // Step 2: Delete the scan item
  await prisma.scanAndPackItem.delete({
    where: { id },
  });

  // Step 3: Recalculate total_packed and total_unpacked
  const { project_id, vendor_id, client_id } = existing;

  const packedCount = await prisma.scanAndPackItem.count({
    where: {
      project_id,
      vendor_id,
      client_id,
      is_deleted: false, 
    },
  });

  const projectDetails = await prisma.projectDetails.findFirst({
    where: {
      project_id,
      vendor_id,
      client_id,
    },
  });

  if (!projectDetails) {
    throw new Error('Related projectDetails not found');
  }

  const total_items = projectDetails.total_items || 0;
  const total_packed = packedCount;
  const total_unpacked = Math.max(total_items - total_packed, 0);

  // Step 4: Update the projectDetails table
  await prisma.projectDetails.updateMany({
    where: {
      project_id,
      vendor_id,
      client_id,
    },
    data: {
      total_packed,
      total_unpacked,
    },
  });

  return { deletedId: id, total_packed, total_unpacked };
};