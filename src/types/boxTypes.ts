// src/types/boxTypes.ts
import { BoxStatus } from '../prisma/generated';

export type CreateBoxInput = {
  project_id: number;
  project_details_id: number;
  vendor_id: number;
  client_id: number;
  box_name: string;
  box_status: BoxStatus;
  created_by: number;
};
