// src/types/boxTypes.ts
import { BoxStatus } from '../prisma/generated';

export type CreateBoxInput = {
  project_id: number;
  project_details_id: number;
  vendor_id: number;
  lead_id: number;
  box_name: string;
  box_status: BoxStatus;
  created_by: number;
  box_info_values?: BoxInfoValueInput[];
};

export type BoxInfoValueInput = {
  field_id: number;
  field_value?: string | null;
};