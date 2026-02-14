import { MachineStatus, ScanType } from "@prisma/client";
import { prisma } from "../../../src/prisma/client";
import logger from "../../../src/utils/logger";

export interface MachineData {
  machine_name: string;
  machine_code: string;
  machine_type: string;
  scan_type: ScanType;
  description?: string;
  vendor_id: number;
  created_by: number;
  updated_by: number;
  factory_id?: number;
  sequence_no?: number;
  target_per_hour?: number;
  image_path?: string;
}

export interface UpdateMachineData {
  machine_name?: string;
  machine_type?: string;
  scan_type?: ScanType;
  status?: MachineStatus;
  description?: string;
  factory_id?: number;
  sequence_no?: number;
  target_per_hour?: number;
  image_path?: string;
  updated_by: number;
}

export const validateCreateMachine = (data: any) => {
  if (!Object.values(MachineStatus).includes(data.status)) {
    throw new Error("Invalid machine status");
  }

  if (!Object.values(ScanType).includes(data.scan_type)) {
    throw new Error("Invalid scan type");
  }

  if (!data.machine_name) throw new Error("machine_name required");
  if (!data.machine_code) throw new Error("machine_code required");
  if (!data.vendor_id) throw new Error("vendor_id required");
  if (!data.created_by) throw new Error("created_by required");
  if (!data.updated_by) throw new Error("updated_by required");
};

export class TrackTraceMasterService {
  static async createMachine(data: MachineData) {
    try {
      logger.info("Creating machine", { vendor_id: data.vendor_id });

      validateCreateMachine(data);

      // sequence uniqueness check
      if (data.sequence_no !== undefined) {
        const exists = await prisma.machineMaster.findFirst({
          where: {
            sequence_no: data.sequence_no,
            vendor_id: data.vendor_id,
          },
          select: { id: true },
        });

        if (exists) {
          throw new Error("Sequence number already exists for this vendor");
        }
      }

      const machine = await prisma.machineMaster.create({
        data: {
          ...data,
          factory_id: data.factory_id ?? null,
        },
      });

      logger.info("Machine created successfully", {
        id: machine.id,
      });

      return machine;
    } catch (error) {
      logger.error("Error creating machine", error);
      throw error;
    }
  }

  static async getMachinesByVendor(vendor_id: number) {
    try {
      logger.info("Fetching machines for vendor", { vendor_id });
      const machines = await prisma.machineMaster.findMany({
        where: { vendor_id },
        orderBy: { sequence_no: "asc" },
      });

      return machines;
    } catch (error) {
      logger.error("Error fetching machines", error);
      throw error;
    }
  }

  static async updateMachine(
    id: number,
    vendor_id: number,
    data: UpdateMachineData,
  ) {
    try {
      logger.info("Updating machine", { id, vendor_id });

      const existing = await prisma.machineMaster.findFirst({
        where: { id, vendor_id },
        select: { id: true, sequence_no: true },
      });

      if (!existing) {
        throw new Error("Machine not found for this vendor");
      }

      // sequence uniqueness check
      if (data.sequence_no !== undefined) {
        const duplicate = await prisma.machineMaster.findFirst({
          where: {
            vendor_id,
            sequence_no: data.sequence_no,
            NOT: { id },
          },
          select: { id: true },
        });

        if (duplicate) {
          throw new Error("Sequence number already exists");
        }
      }

      const updated = await prisma.machineMaster.update({
        where: { id },
        data,
      });

      logger.info("Machine updated successfully", { id });

      return updated;
    } catch (error) {
      logger.error("Error updating machine", error);
      throw error;
    }
  }
}