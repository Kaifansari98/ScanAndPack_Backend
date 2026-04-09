import { generateSignedUrl } from "src/utils/wasabiClient";
import {
  MachineStatus,
  ScanType,
} from "../../../generated/prisma_client/client";
import { prisma } from "../../../src/prisma/client";
import logger from "../../../src/utils/logger";

export interface MachineData {
  machine_name: string;
  machine_code: string;
  machine_type_id: number;
  scan_type: ScanType;
  description: string;
  vendor_id: number;
  created_by: number;
  updated_by: number;
  factory_id?: number;
  sequence_no: number;
  target_per_hour: number;
  image_path: string;
}

export interface UpdateMachineData {
  machine_name?: string;
  machine_type_id: number;
  scan_type?: ScanType;
  machine_code: string;
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
  if (!data.machine_type_id) throw new Error("machine_type_id required");
  if (!data.vendor_id) throw new Error("vendor_id required");
  if (!data.created_by) throw new Error("created_by required");
  if (!data.updated_by) throw new Error("updated_by required");
  if (!data.sequence_no) throw new Error("sequence_no is required");
  if (!data.target_per_hour) throw new Error("target_per_hour is required");
  if (!data.image_path) throw new Error("image_path is required");
};

export class TrackTraceMasterService {

   static async assignUsersToMachineService({
    machine_id,
    vendor_id,
    user_ids,
    created_by,
  }: {
    machine_id: number;
    vendor_id: number;
    user_ids: number[];
    created_by: number;
  }) {
    return prisma.$transaction(async (tx) => {
      // 1️⃣ Validate Machine
      const machine = await tx.machineMaster.findFirst({
        where: {
          id: machine_id,
          vendor_id: vendor_id,
        },
      });

      if (!machine) {
        throw new Error("Machine not found for this vendor");
      }

      const existingMappings = await tx.userMachineMapping.findMany({
        where: { machine_id: machine_id },
        select: { user_id: true },
      });
      const existingUserIds = existingMappings.map((m) => m.user_id);

      const userIdsToAdd = user_ids.filter(
        (id) => !existingUserIds.includes(id),
      );
      const uesrIdsToRemove = existingUserIds.filter(
        (id) => !user_ids.includes(id),
      );

      // 3️⃣ Add new mappings for userIdsToAdd

      if (userIdsToAdd.length > 0) {
        await tx.userMachineMapping.createMany({
          data: userIdsToAdd.map((user_id) => ({
            machine_id,
            user_id: user_id,
            vendor_id,
            created_by,
            updated_by: created_by,
          })),
        });
      }

      // 2️⃣ Remove old mappings that are not in the new list

      if (uesrIdsToRemove.length) {
        await tx.userMachineMapping.deleteMany({
          where: {
            machine_id,
            user_id: { in: uesrIdsToRemove },
          },
        });
      }

      return {
        success: true,
        message: "Users assigned successfully",
      };
    });
  }

  static async getAssignedUsersService(machine_id: number) {
    const mappings = await prisma.userMachineMapping.findMany({
      where: {
        machine_id,
        status: "ACTIVE",
      },
      select: {
        user_id: true,
      },
    });

    const userIds = mappings.map((m) => m.user_id);

    return {
      users: userIds,
      count: userIds.length,
    };
  }

  static async createMachine(data: MachineData) {
    try {
      logger.info("Creating machine", { vendor_id: data.vendor_id });

      validateCreateMachine(data);

      /* ---------------- UNIQUE VALIDATION ---------------- */

      const existingMachine = await prisma.machineMaster.findFirst({
        where: {
          machine_code: data.machine_code,
        },
        select: { id: true },
      });

      if (existingMachine) {
        throw new Error(`Machine code '${data.machine_code}' already exists`);
      }

      /* ---------------- CREATE MACHINE ---------------- */

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

    const rawMachines = await prisma.machineMaster.findMany({
      where: {
        vendor_id,
        machineType: { isNot: null },
      },
      orderBy: { sequence_no: "asc" },
      include: {
        machineType: {
          select: { machine_type: true },
        },
      },
    });

    const machines = await Promise.all(
      rawMachines.map(async ({ machineType, ...machine }) => ({
        ...machine,
        image_path: machine.image_path ? await generateSignedUrl(machine.image_path) : null,
        machine_type: machineType?.machine_type ?? null,
      }))
    );

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

      /* -------- Check Machine Exists -------- */

      const existing = await prisma.machineMaster.findFirst({
        where: { id, vendor_id },
        select: { id: true },
      });

      if (!existing) {
        throw new Error("Machine not found for this vendor");
      }

      /* -------- UNIQUE MACHINE CODE VALIDATION -------- */
      // Only run if machine_code is being updated

      if (data.machine_code) {
        const duplicate = await prisma.machineMaster.findFirst({
          where: {
            machine_code: data.machine_code,
            NOT: { id: id }, // 👈 Ignore current machine
          },
          select: { id: true },
        });

        if (duplicate) {
          throw new Error(`Machine code '${data.machine_code}' already exists`);
        }
      }

      /* -------- UPDATE MACHINE -------- */

      const updated = await prisma.machineMaster.update({
        where: { id },
        data,
      });

      logger.info("Machine updated successfully", { id });

      return updated;
    } catch (error: any) {
      /* -------- HANDLE DB UNIQUE ERROR (Race Condition Safe) -------- */

      if (error.code === "P2002") {
        throw new Error("Machine code already exists");
      }

      logger.error("Error updating machine", error);
      throw error;
    }
  }
}

export const getMachineType = async () => {
  try {
    return await prisma.machineTypeMaster.findMany({
      orderBy: {
        machine_type: "asc",
      },
    });
  } catch (error) {
    return null;
  }
};


