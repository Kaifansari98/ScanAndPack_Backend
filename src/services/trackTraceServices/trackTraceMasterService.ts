import { generateSignedUrl } from "../../../src/utils/wasabiClient";
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
      logger.info("Creating machine", {
        vendor_id: data.vendor_id,
      });

      validateCreateMachine(data);

      const machineCode =
        data.machine_code.trim();

      const machineStatus =
        MachineStatus.ACTIVE;

      /* ---------------- UNIQUE VALIDATION ---------------- */

      const existingMachine =
        await prisma.machineMaster.findFirst({
          where: {
            vendor_id: data.vendor_id,
            machine_code: machineCode,
            status: machineStatus,
          },

          select: {
            id: true,
          },
        });

      if (existingMachine) {
        throw new Error(
          `Machine code '${machineCode}' already exists for this vendor with status '${machineStatus}'`
        );
      }

      /* ---------------- CREATE MACHINE ---------------- */

      const machine =
        await prisma.machineMaster.create({
          data: {
            ...data,

            machine_code:
              machineCode,

            status:
              machineStatus,

            factory_id:
              data.factory_id ??
              null,
          },
        });

      logger.info(
        "Machine created successfully",
        {
          id: machine.id,
          vendor_id: machine.vendor_id,
          machine_code: machine.machine_code,
          status: machine.status,
        }
      );

      return machine;
    } catch (error) {
      throw new Error(
        `A machine with the same code, vendor and status already exists`
      );
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
    data: UpdateMachineData
  ) {
    try {
      logger.info("Updating machine", {
        id,
        vendor_id,
      });

      /* -------- CHECK MACHINE EXISTS -------- */

      const existing =
        await prisma.machineMaster.findFirst({
          where: {
            id,
            vendor_id,
          },

          select: {
            id: true,
            machine_code: true,
            status: true,
          },
        });

      if (!existing) {
        throw new Error(
          "Machine not found for this vendor"
        );
      }

      /*
       * Use the updated value when supplied;
       * otherwise retain the existing value.
       */
      const machineCode =
        data.machine_code !== undefined
          ? data.machine_code.trim()
          : existing.machine_code;

      const machineStatus =
        data.status !== undefined
          ? data.status
          : existing.status;

      /* -------- UNIQUE COMBINATION VALIDATION -------- */

      const duplicate =
        await prisma.machineMaster.findFirst({
          where: {
            vendor_id,
            machine_code:
              machineCode,
            status:
              machineStatus,

            NOT: {
              id,
            },
          },

          select: {
            id: true,
          },
        });

      if (duplicate) {
        throw new Error(
          `Machine code '${machineCode}' already exists for this vendor with status '${machineStatus}'`
        );
      }

      /* -------- UPDATE MACHINE -------- */

      const updated =
        await prisma.machineMaster.update({
          where: {
            id,
          },

          data: {
            ...data,

            // Prevent changing the machine's vendor
            vendor_id,

            machine_code:
              machineCode,

            status:
              machineStatus,

            ...(data.factory_id !== undefined
              ? {
                factory_id:
                  data.factory_id ??
                  null,
              }
              : {}),
          },
        });

      logger.info(
        "Machine updated successfully",
        {
          id: updated.id,
          vendor_id:
            updated.vendor_id,
          machine_code:
            updated.machine_code,
          status:
            updated.status,
        }
      );

      return updated;
    } catch (error) {
      /* -------- HANDLE DATABASE RACE CONDITION -------- */

      throw new Error(
        "A machine with the same code, vendor and status already exists"
      );



      throw error;
    }
  }
}

export const getMachineType = async (vendor_id?: number) => {
  try {
    let whereCondition: any = {
      active: "YES",
    };

    if (vendor_id) {
      const vendor = await prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
        select: {
          is_scanpack_enabled: true,
          is_tracktrace_enabled: true,
        },
      });

      if (vendor) {
        const { is_scanpack_enabled, is_tracktrace_enabled } = vendor;

        if (is_scanpack_enabled && is_tracktrace_enabled) {
          // If both are enabled, show all active machine types
        } else if (is_scanpack_enabled) {
          // If only scanpack enabled, show machine types where is_scanandpack is true
          whereCondition.is_scanandpack = true;
        } else if (is_tracktrace_enabled) {
          // If only tracktrace enabled, show machine types where is_trackandtrace is true
          whereCondition.is_trackandtrace = true;
        }
      }
    }

    return await prisma.machineTypeMaster.findMany({
      where: whereCondition,
      orderBy: {
        machine_type: "asc",
      },
    });
  } catch (error) {
    logger.error("Error fetching machine types", error);
    return null;
  }
};


