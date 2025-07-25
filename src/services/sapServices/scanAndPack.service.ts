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
  
    // Step 1: Count existing scan entries for the same item
    const currentScanCount = await prisma.scanAndPackItem.count({
      where: {
        project_id,
        vendor_id,
        client_id,
        unique_id
      }
    });
  
    // Step 2: Compare with allowed qty
    if (currentScanCount >= item.qty) {
      throw new Error(`Scan limit exceeded for this item.`);
    }
  
    // Step 3: Proceed to insert
    const newItem = await prisma.scanAndPackItem.create({
      data: {
        project_id: item.project_id,
        vendor_id: item.vendor_id,
        client_id: item.client_id,
        box_id,
        project_details_id: item.project_details_id,
        unique_id: item.unique_id,
        qty: item.qty, // optional: can also store 1 if you prefer one entry per scan
        created_by,
        status
      }
    });
  
    return newItem;
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
  const existing = await prisma.scanAndPackItem.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Scan item not found');
  }

  const deleted = await prisma.scanAndPackItem.delete({
    where: { id },
  });

  return deleted;
};