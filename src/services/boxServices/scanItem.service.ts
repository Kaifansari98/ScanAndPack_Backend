import { prisma } from '../../prisma/client';
import { ItemStatus } from '@prisma/client';

export const createScanItem = async (data: {
  project_id: number;
  vendor_id: number;
  client_id: number;
  box_id: number;
  project_master_id: number;
  unique_id: string;
  qty: number;
  created_by: number;
  status: ItemStatus;
}) => {
  return await prisma.scanAndPackItem.create({
    data,
  });
};