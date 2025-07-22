import { prisma } from '../../prisma/client';
import { BoxStatus } from '@prisma/client';

export const createBox = async (data: {
  project_id: number;
  vendor_id: number;
  client_id: number;
  box_name: string;
  box_status: BoxStatus;
}) => {
  return await prisma.boxMaster.create({
    data,
  });
};
