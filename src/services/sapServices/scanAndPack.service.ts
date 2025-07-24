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

  const newItem = await prisma.scanAndPackItem.create({
    data: {
      project_id: item.project_id,
      vendor_id: item.vendor_id,
      client_id: item.client_id,
      box_id,
      project_details_id: item.project_details_id,
      unique_id: item.unique_id,
      qty: item.qty,
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
          ...item,
          project_item_details: projectItems.length === 1 ? projectItems[0] : projectItems,
        };
      })
    );
  
    return enrichedItems;
  };  