import { validationResponse } from "../../../src/utils/validationResponse";
import axios from "axios";
import { prisma, Prisma } from "../../prisma/client";

import { PackingType } from "../../prisma/generated";
import {
  CutListSavePayload,
  MarkDefectPayload,
  QRParam,
  TrackTraceDashboardPayload,
} from "../../../src/types/track-trace";
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import { getVendorSettingValue } from "../vendor.service";
import {
  generateSignedUrl,
  uploadToWasabiCompletionPhotos,
  uploadToWasabiDefectedItems,
} from "../../../src/utils/wasabiClient";

interface TrackTracePayload {
  project_id: number;
  vendor_id: number;
  machine_id: number;
  unique_code: string;
  created_by: number;
  box_id?: number;
}

//qty wise logic

type ApiResponse = ReturnType<typeof validationResponse>;

export const updateScannedItem_old = async (
  payload: TrackTracePayload,
  is_check: boolean = false,
  files: Express.Multer.File[] = [],
): Promise<ApiResponse> => {
  try {
    const {
      project_id,
      vendor_id,
      machine_id,
      unique_code,
      created_by,
      box_id,
    } = payload;

    const projectFilter = project_id
      ? {
          project_id,
        }
      : {};

    /*
    |--------------------------------------------------------------------------
    | STEP 0:
    | Validate selected box
    |--------------------------------------------------------------------------
    */

    if (box_id) {
      const box = await prisma.boxMaster.findFirst({
        where: {
          id: box_id,

          vendor_id,

          ...projectFilter,

          is_deleted: false,
        },

        select: {
          id: true,
        },
      });

      if (!box) {
        return validationResponse(
          0,
          "Invalid box_id: box not found for this project",
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 1:
    | Check barcode mapping for selected machine
    |--------------------------------------------------------------------------
    */

    const mappingExists = await prisma.cutListMachineMapping.findFirst({
      where: {
        machine_id,

        vendor_id,

        ...projectFilter,

        cut_list: {
          unique_code: {
            equals: unique_code,

            mode: "insensitive",
          },
        },
      },

      select: {
        id: true,
      },
    });

    if (!mappingExists) {
      return validationResponse(
        0,

        project_id
          ? "Item not found for this machine in the selected project"
          : "Machine mapping not found",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 2:
    | Fetch pending rows for barcode
    |--------------------------------------------------------------------------
    */

    const pendingMappings = await prisma.cutListMachineMapping.findMany({
      where: {
        machine_id,

        vendor_id,

        ...projectFilter,

        expected_in: true,

        actual_in_at: null,

        cut_list: {
          unique_code: {
            equals: unique_code,

            mode: "insensitive",
          },
        },
      },

      orderBy: [
        {
          cut_list_id: "asc",
        },

        {
          id: "asc",
        },
      ],

      select: {
        id: true,

        sequence_no: true,

        cut_list_id: true,

        project_id: true,

        actual_in_at: true,

        machine_id: true,

        machine: {
          select: {
            id: true,

            machine_name: true,
          },
        },

        cut_list: {
          select: {
            unique_code: true,

            description: true,

            item_name: true,

            group_name: true,
          },
        },

        project: {
          select: {
            track_trace_status: true,

            project_name: true,

            packing_type: true,
          },
        },
      },
    });

    if (pendingMappings.length === 0) {
      return validationResponse(0, "Already Scanned");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 3:
    | Find one eligible mapping row
    |--------------------------------------------------------------------------
    */

    let eligibleMapping: (typeof pendingMappings)[number] | null = null;

    for (const item of pendingMappings) {
      const itemProjectFilter = item.project_id
        ? {
            project_id: item.project_id,
          }
        : {};

      /*
      |--------------------------------------------------------------------------
      | Previous non-PASS mappings
      |--------------------------------------------------------------------------
      */

      const previousNonPassMappings =
        await prisma.cutListMachineMapping.findMany({
          where: {
            cut_list_id: item.cut_list_id,

            vendor_id,

            ...itemProjectFilter,

            expected_in: true,

            sequence_no: {
              lt: item.sequence_no,
            },

            machine: {
              scan_type: {
                not: "PASS",
              },
            },
          },

          select: {
            id: true,

            machine_id: true,

            sequence_no: true,

            actual_in_at: true,
          },
        });

      /*
      |--------------------------------------------------------------------------
      | First actual scan machine
      |--------------------------------------------------------------------------
      */

      if (previousNonPassMappings.length === 0) {
        eligibleMapping = item;

        break;
      }

      /*
      |--------------------------------------------------------------------------
      | Calculate scanned quantity for previous machines
      |--------------------------------------------------------------------------
      */

      const previousMachineScanMap = new Map<
        string,
        {
          scannedQty: number;

          totalQty: number;
        }
      >();

      for (const previousItem of previousNonPassMappings) {
        const key = `${previousItem.sequence_no}_${previousItem.machine_id}`;

        if (!previousMachineScanMap.has(key)) {
          previousMachineScanMap.set(
            key,

            {
              scannedQty: 0,

              totalQty: 0,
            },
          );
        }

        const currentData = previousMachineScanMap.get(key)!;

        currentData.totalQty += 1;

        if (previousItem.actual_in_at) {
          currentData.scannedQty += 1;
        }

        previousMachineScanMap.set(key, currentData);
      }

      const previousScannedQtyList = Array.from(
        previousMachineScanMap.values(),
      ).map((data) => data.scannedQty);

      const allowedQtyForCurrentMachine = Math.min(...previousScannedQtyList);

      /*
      |--------------------------------------------------------------------------
      | Count scanned quantity on current machine
      |--------------------------------------------------------------------------
      */

      const currentMachineScannedQty = await prisma.cutListMachineMapping.count(
        {
          where: {
            cut_list_id: item.cut_list_id,

            vendor_id,

            ...itemProjectFilter,

            machine_id,

            sequence_no: item.sequence_no,

            expected_in: true,

            actual_in_at: {
              not: null,
            },
          },
        },
      );

      console.log({
        cut_list_id: item.cut_list_id,

        machine_id,

        sequence_no: item.sequence_no,

        allowedQtyForCurrentMachine,

        currentMachineScannedQty,
      });

      if (currentMachineScannedQty < allowedQtyForCurrentMachine) {
        eligibleMapping = item;

        break;
      }
    }

    if (!eligibleMapping) {
      return validationResponse(0, "Scan on other machine first");
    }

    const { id, sequence_no, cut_list_id } = eligibleMapping;

    /*
    |--------------------------------------------------------------------------
    | STEP 4:
    | Status check mode
    |--------------------------------------------------------------------------
    */

    if (is_check) {
      const value = await getVendorSettingValue(
        vendor_id,

        "SHOW_STATUS_ON_SCAN",
      );

      if (value === "1") {
        const mappedItem = eligibleMapping;

        let activeDefect: any = null;

        if (mappedItem.cut_list_id) {
          activeDefect = await prisma.defectedItem.findFirst({
            where: {
              cut_list_id: mappedItem.cut_list_id,

              defect_status: {
                not: "Completed",
              },
            },

            orderBy: {
              created_at: "desc",
            },

            select: {
              id: true,

              defect_id: true,

              remark: true,

              action: true,

              rework_machine_id: true,

              defect_status: true,

              created_at: true,

              defect: {
                select: {
                  id: true,

                  defect_name: true,
                },
              },

              images: {
                select: {
                  id: true,

                  doc_og_name: true,

                  doc_sys_name: true,

                  created_at: true,
                },
              },
            },
          });
        }

        if (activeDefect && activeDefect.images.length > 0) {
          const imagesWithUrls = await Promise.all(
            activeDefect.images.map(async (image: any) => ({
              ...image,

              signed_url: await generateSignedUrl(image.doc_sys_name),
            })),
          );

          activeDefect = {
            ...activeDefect,

            images: imagesWithUrls,
          };
        }

        return validationResponse(
          1,

          "",

          {
            mappedItem,

            activeDefect,

            countdown_timer: 3,
          },
        );
      }

      return await updateScannedItem(
        payload,

        false,

        files,
      );
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 5:
    | Validate groupwise packing before updating anything
    |--------------------------------------------------------------------------
    */

    if (box_id) {
      /*
      |--------------------------------------------------------------------------
      | Fetch project packing type
      |--------------------------------------------------------------------------
      */

      const currentProject = await prisma.projectMaster.findFirst({
        where: {
          id: eligibleMapping.project_id,

          vendor_id,
        },

        select: {
          id: true,

          packing_type: true,
        },
      });

      if (!currentProject) {
        return validationResponse(0, "Project not found");
      }

      /*
      |--------------------------------------------------------------------------
      | Validate only GROUPWISE projects
      |--------------------------------------------------------------------------
      */

      if (currentProject.packing_type === PackingType.GROUPWISE) {
        /*
        |--------------------------------------------------------------------------
        | Get incoming item's group
        |--------------------------------------------------------------------------
        */

        const incomingItem = await prisma.cutList.findFirst({
          where: {
            id: cut_list_id,

            vendor_id,

            project_id: eligibleMapping.project_id,
          },

          select: {
            id: true,

            item_name: true,

            group_name: true,
          },
        });

        if (!incomingItem) {
          return validationResponse(0, "Cutlist item not found");
        }

        const incomingGroupName = incomingItem.group_name?.trim();

        const incomingGroup = incomingGroupName?.toLowerCase();

        /*
        |--------------------------------------------------------------------------
        | Group is mandatory in GROUPWISE mode
        |--------------------------------------------------------------------------
        */

        if (!incomingGroup) {
          return validationResponse(
            0,

            `Group is not configured for item "${incomingItem.item_name}"`,
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Get first already packed item from selected box
        |--------------------------------------------------------------------------
        |
        | First packed item establishes the group of the box.
        |--------------------------------------------------------------------------
        */

        const existingBoxItem = await prisma.cutListMachineMapping.findFirst({
          where: {
            box_id,

            vendor_id,

            project_id: eligibleMapping.project_id,

            actual_in_at: {
              not: null,
            },
          },

          orderBy: [
            {
              actual_in_at: "asc",
            },

            {
              id: "asc",
            },
          ],

          select: {
            id: true,

            cut_list: {
              select: {
                id: true,

                item_name: true,

                group_name: true,
              },
            },
          },
        });

        /*
        |--------------------------------------------------------------------------
        | Validate existing box group
        |--------------------------------------------------------------------------
        */

        if (existingBoxItem?.cut_list) {
          const existingGroupName = existingBoxItem.cut_list.group_name?.trim();

          const existingGroup = existingGroupName?.toLowerCase();

          /*
          |--------------------------------------------------------------------------
          | Existing item has no group
          |--------------------------------------------------------------------------
          */

          if (!existingGroup) {
            return validationResponse(
              0,

              `Existing item "${existingBoxItem.cut_list.item_name}" in this box does not have a group configured`,
            );
          }

          /*
          |--------------------------------------------------------------------------
          | Different group is not allowed
          |--------------------------------------------------------------------------
          */

          if (existingGroup !== incomingGroup) {
            return validationResponse(
              0,

              `This box belongs to group "${existingGroupName}". Item from group "${incomingGroupName}" cannot be packed in this box.`,
            );
          }
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 6:
    | Find previous pending PASS machine rows
    |--------------------------------------------------------------------------
    */

    const previousPassMappings = await prisma.cutListMachineMapping.findMany({
      where: {
        cut_list_id,

        vendor_id,

        ...(eligibleMapping.project_id
          ? {
              project_id: eligibleMapping.project_id,
            }
          : {}),

        sequence_no: {
          lt: sequence_no,
        },

        actual_in_at: null,

        machine: {
          scan_type: "PASS",
        },
      },

      orderBy: [
        {
          sequence_no: "asc",
        },

        {
          id: "asc",
        },
      ],

      select: {
        id: true,

        sequence_no: true,

        machine_id: true,
      },
    });

    /*
    |--------------------------------------------------------------------------
    | Pick only one pending row per PASS machine
    |--------------------------------------------------------------------------
    */

    const passMappingIdsToUpdate: number[] = [];

    const passMachineKeySet = new Set<string>();

    for (const passMapping of previousPassMappings) {
      const key = `${passMapping.sequence_no}_${passMapping.machine_id}`;

      if (!passMachineKeySet.has(key)) {
        passMachineKeySet.add(key);

        passMappingIdsToUpdate.push(passMapping.id);
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 7:
    | Update PASS mappings and current mapping atomically
    |--------------------------------------------------------------------------
    */

    const scanUpdate = await prisma.$transaction(async (tx) => {
      /*
          |--------------------------------------------------------------------------
          | Auto-pass pending PASS rows
          |--------------------------------------------------------------------------
          */

      if (passMappingIdsToUpdate.length > 0) {
        await tx.cutListMachineMapping.updateMany({
          where: {
            id: {
              in: passMappingIdsToUpdate,
            },

            actual_in_at: null,
          },

          data: {
            actual_in_at: new Date(),

            in_operator: created_by,
          },
        });
      }

      /*
          |--------------------------------------------------------------------------
          | Scan current machine row
          |--------------------------------------------------------------------------
          */

      return await tx.cutListMachineMapping.updateMany({
        where: {
          id,

          actual_in_at: null,
        },

        data: {
          actual_in_at: new Date(),

          in_operator: created_by,

          ...(box_id
            ? {
                box_id,
              }
            : {}),
        },
      });
    });

    if (scanUpdate.count === 0) {
      return validationResponse(0, "Already Scanned");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 8:
    | Complete pending defect
    |--------------------------------------------------------------------------
    */

    if (cut_list_id) {
      const pendingDefect = await prisma.defectedItem.findFirst({
        where: {
          cut_list_id,

          defect_status: {
            not: "Completed",
          },
        },
      });

      if (pendingDefect) {
        await prisma.defectedItem.update({
          where: {
            id: pendingDefect.id,
          },

          data: {
            defect_status: "Completed",

            defect_completed_by: created_by,

            defect_completed_at: new Date(),
          },
        });

        /*
        |--------------------------------------------------------------------------
        | Upload defect completion photos
        |--------------------------------------------------------------------------
        */

        if (files.length > 0) {
          const uploadedPhotos = await uploadToWasabiCompletionPhotos(
            files,

            vendor_id,

            id,
          );

          await prisma.defectCompletionPhoto.createMany({
            data: uploadedPhotos.map((photo) => ({
              cut_list_machine_mapping_id: id,

              cut_list_id,

              vendor_id,

              defected_item_id: pendingDefect.id,

              doc_og_name: photo.originalName,

              doc_sys_name: photo.systemName,

              created_by,
            })),
          });

          console.log(
            `Saved ${uploadedPhotos.length} completion photos for defect ${pendingDefect.id}`,
          );
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 9:
    | Update project Track & Trace status
    |--------------------------------------------------------------------------
    */

    await updateProjectStatus(
      eligibleMapping.project_id,

      eligibleMapping.project.track_trace_status,
    );
    return validationResponse(1, "Scan done");
  } catch (error: unknown) {
    console.error("updateScannedItem error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Something went wrong";

    return validationResponse(0, errorMessage);
  }
};

export const updateScannedItem = async (
  payload: TrackTracePayload,
  is_check: boolean = false,
  files: Express.Multer.File[] = [],
): Promise<ApiResponse> => {
  try {
    const {
      project_id,
      vendor_id,
      machine_id,
      unique_code,
      created_by,
      box_id,
    } = payload;

    const projectFilter = project_id ? { project_id } : {};
    //const normalizedUniqueCode = unique_code.trim();
    const normalizedUniqueCode = unique_code.trim().toUpperCase();
    const barcodeRelationFilter = {
      unique_code: {
        equals: normalizedUniqueCode,
      },
    };

    /* Run independent initial lookups concurrently. */
    const selectedBoxPromise = box_id
      ? prisma.boxMaster.findFirst({
          where: {
            id: box_id,
            vendor_id,
            ...projectFilter,
            is_deleted: false,
          },
          select: {
            id: true,
            project_id: true,
          },
        })
      : Promise.resolve(null);

    const pendingMappingsPromise = prisma.cutListMachineMapping.findMany({
      where: {
        machine_id,
        vendor_id,
        ...projectFilter,
        expected_in: true,
        actual_in_at: null,
        cut_list: barcodeRelationFilter,
      },
      orderBy: [{ cut_list_id: "asc" }, { id: "asc" }],
      select: {
        id: true,
        sequence_no: true,
        cut_list_id: true,
        project_id: true,
        actual_in_at: true,
        machine_id: true,
        machine: {
          select: {
            id: true,
            machine_name: true,
          },
        },
        cut_list: {
          select: {
            unique_code: true,
            description: true,
            item_name: true,
            group_name: true,
          },
        },
        project: {
          select: {
            track_trace_status: true,
            project_name: true,
            packing_type: true,
            isDeleted: true,
          },
        },
      },
    });

    const showStatusSettingPromise = is_check
      ? getVendorSettingValue(vendor_id, "SHOW_STATUS_ON_SCAN")
      : Promise.resolve(null);

    const [selectedBox, pendingMappings, showStatusSetting] = await Promise.all(
      [selectedBoxPromise, pendingMappingsPromise, showStatusSettingPromise],
    );

    if (box_id && !selectedBox) {
      return validationResponse(
        0,
        "Invalid box_id: box not found for this project",
      );
    }

    if (pendingMappings.length > 0 && pendingMappings[0].project?.isDeleted) {
      return validationResponse(0, "Project is deleted or deactivated");
    }

    /*
     * Only run the broader existence query on a failure path. A successful
     * scan needs only the pending barcode query above.
     */
    if (pendingMappings.length === 0) {
      const mappingExists = await prisma.cutListMachineMapping.findFirst({
        where: {
          machine_id,
          vendor_id,
          ...projectFilter,
          cut_list: barcodeRelationFilter,
        },
        select: {
          id: true,
          project: {
            select: {
              isDeleted: true,
              project_name: true,
            },
          },
        },
      });

      if (!mappingExists) {
        return validationResponse(
          0,
          project_id
            ? "Item not found for this machine in the selected project"
            : "Machine mapping not found",
        );
      }

      if (mappingExists.project?.isDeleted) {
        return validationResponse(0, "Project is deleted or deactivated");
      }

      return validationResponse(0, "Already Scanned");
    }

    /*
     * Build one flow range for every candidate cut-list/project pair. This
     * replaces the old findMany + count calls inside pendingMappings.map().
     */
    const candidateRangeMap = new Map<
      string,
      {
        projectId: number;
        cutListId: number;
        maximumSequence: number;
      }
    >();

    for (const mapping of pendingMappings) {
      const key = `${mapping.project_id}:${mapping.cut_list_id}`;
      const existingRange = candidateRangeMap.get(key);

      if (
        !existingRange ||
        mapping.sequence_no > existingRange.maximumSequence
      ) {
        candidateRangeMap.set(key, {
          projectId: mapping.project_id,
          cutListId: mapping.cut_list_id,
          maximumSequence: mapping.sequence_no,
        });
      }
    }

    const candidateRanges = Array.from(candidateRangeMap.values());

    const flowMappings = await prisma.cutListMachineMapping.findMany({
      where: {
        vendor_id,
        expected_in: true,
        OR: candidateRanges.map((range) => ({
          project_id: range.projectId,
          cut_list_id: range.cutListId,
          sequence_no: {
            lte: range.maximumSequence,
          },
        })),
      },
      select: {
        project_id: true,
        cut_list_id: true,
        machine_id: true,
        sequence_no: true,
        actual_in_at: true,
        machine: {
          select: {
            scan_type: true,
          },
        },
      },
    });

    const flowMappingsByItem = new Map<string, typeof flowMappings>();

    for (const mapping of flowMappings) {
      const key = `${mapping.project_id}:${mapping.cut_list_id}`;
      const groupedMappings = flowMappingsByItem.get(key);

      if (groupedMappings) {
        groupedMappings.push(mapping);
      } else {
        flowMappingsByItem.set(key, [mapping]);
      }
    }

    /* Cache calculations shared by quantity rows of the same sequence. */
    const eligibilityCache = new Map<string, boolean>();
    let eligibleMapping: (typeof pendingMappings)[number] | null = null;

    for (const item of pendingMappings) {
      const itemKey = `${item.project_id}:${item.cut_list_id}`;
      const eligibilityKey = `${itemKey}:${item.sequence_no}`;
      let isEligible = eligibilityCache.get(eligibilityKey);

      if (isEligible === undefined) {
        const itemFlowMappings = flowMappingsByItem.get(itemKey) ?? [];
        const previousMachineScannedQuantity = new Map<string, number>();

        for (const flowMapping of itemFlowMappings) {
          if (
            flowMapping.sequence_no >= item.sequence_no ||
            flowMapping.machine.scan_type === "PASS"
          ) {
            continue;
          }

          const previousMachineKey = `${flowMapping.sequence_no}:${flowMapping.machine_id}`;

          if (!previousMachineScannedQuantity.has(previousMachineKey)) {
            previousMachineScannedQuantity.set(previousMachineKey, 0);
          }

          if (flowMapping.actual_in_at) {
            previousMachineScannedQuantity.set(
              previousMachineKey,
              previousMachineScannedQuantity.get(previousMachineKey)! + 1,
            );
          }
        }

        if (previousMachineScannedQuantity.size === 0) {
          // No previous non-PASS machine: this is the first actual scanner.
          isEligible = true;
        } else {
          const allowedQuantity = Math.min(
            ...previousMachineScannedQuantity.values(),
          );

          let currentMachineScannedQuantity = 0;

          for (const flowMapping of itemFlowMappings) {
            if (
              flowMapping.machine_id === machine_id &&
              flowMapping.sequence_no === item.sequence_no &&
              flowMapping.actual_in_at !== null
            ) {
              currentMachineScannedQuantity += 1;
            }
          }

          isEligible = currentMachineScannedQuantity < allowedQuantity;
        }

        eligibilityCache.set(eligibilityKey, isEligible);
      }

      if (isEligible) {
        eligibleMapping = item;
        break;
      }
    }

    if (!eligibleMapping) {
      return validationResponse(0, "Scan on other machine first");
    }

    const { id, sequence_no, cut_list_id } = eligibleMapping;

    // Also protect cross-project packing when project_id was not supplied.
    if (
      box_id &&
      selectedBox &&
      selectedBox.project_id !== eligibleMapping.project_id
    ) {
      return validationResponse(
        0,
        "Invalid box_id: box does not belong to the scanned item's project",
      );
    }

    /*
     * When status display is disabled, continue below. Do not recursively call
     * updateScannedItem because that repeats every lookup and validation.
     */
    if (is_check && showStatusSetting === "1") {
      let activeDefect: any = await prisma.defectedItem.findFirst({
        where: {
          cut_list_id,
          defect_status: {
            not: "Completed",
          },
        },
        orderBy: {
          created_at: "desc",
        },
        select: {
          id: true,
          defect_id: true,
          remark: true,
          action: true,
          rework_machine_id: true,
          defect_status: true,
          created_at: true,
          defect: {
            select: {
              id: true,
              defect_name: true,
            },
          },
          images: {
            select: {
              id: true,
              doc_og_name: true,
              doc_sys_name: true,
              created_at: true,
            },
          },
        },
      });

      if (activeDefect?.images?.length > 0) {
        activeDefect = {
          ...activeDefect,
          images: await Promise.all(
            activeDefect.images.map(async (image: any) => ({
              ...image,
              signed_url: await generateSignedUrl(image.doc_sys_name),
            })),
          ),
        };
      }

      return validationResponse(1, "", {
        mappedItem: eligibleMapping,
        activeDefect,
        countdown_timer: 3,
      });
    }

    const isGroupwisePacking =
      Boolean(box_id) &&
      eligibleMapping.project.packing_type === PackingType.GROUPWISE;

    /* Run independent pre-update lookups concurrently. */
    const existingBoxItemPromise = isGroupwisePacking
      ? prisma.cutListMachineMapping.findFirst({
          where: {
            box_id: box_id!,
            vendor_id,
            project_id: eligibleMapping.project_id,
            actual_in_at: {
              not: null,
            },
          },
          orderBy: [{ actual_in_at: "asc" }, { id: "asc" }],
          select: {
            id: true,
            cut_list: {
              select: {
                id: true,
                item_name: true,
                group_name: true,
              },
            },
          },
        })
      : Promise.resolve(null);

    const previousPassMappingsPromise = prisma.cutListMachineMapping.findMany({
      where: {
        cut_list_id,
        vendor_id,
        project_id: eligibleMapping.project_id,
        sequence_no: {
          lt: sequence_no,
        },
        actual_in_at: null,
        machine: {
          scan_type: "PASS",
        },
      },
      orderBy: [{ sequence_no: "asc" }, { id: "asc" }],
      select: {
        id: true,
        sequence_no: true,
        machine_id: true,
      },
    });

    const pendingDefectPromise = prisma.defectedItem.findFirst({
      where: {
        cut_list_id,
        defect_status: {
          not: "Completed",
        },
      },
      orderBy: {
        created_at: "desc",
      },
      select: {
        id: true,
      },
    });

    const [existingBoxItem, previousPassMappings, pendingDefect] =
      await Promise.all([
        existingBoxItemPromise,
        previousPassMappingsPromise,
        pendingDefectPromise,
      ]);

    if (isGroupwisePacking) {
      const incomingItem = eligibleMapping.cut_list;
      const incomingGroupName = incomingItem.group_name?.trim();
      const incomingGroup = incomingGroupName?.toLowerCase();

      if (!incomingGroup) {
        return validationResponse(
          0,
          `Group is not configured for item "${incomingItem.item_name}"`,
        );
      }

      if (existingBoxItem?.cut_list) {
        const existingGroupName = existingBoxItem.cut_list.group_name?.trim();
        const existingGroup = existingGroupName?.toLowerCase();

        if (!existingGroup) {
          return validationResponse(
            0,
            `Existing item "${existingBoxItem.cut_list.item_name}" in this box does not have a group configured`,
          );
        }

        if (existingGroup !== incomingGroup) {
          return validationResponse(
            0,
            `This box belongs to group "${existingGroupName}". Item from group "${incomingGroupName}" cannot be packed in this box.`,
          );
        }
      }
    }

    /* Pick one pending PASS row for each sequence/machine combination. */
    const passMappingIdsToUpdate: number[] = [];
    const passMachineKeySet = new Set<string>();

    for (const passMapping of previousPassMappings) {
      const key = `${passMapping.sequence_no}:${passMapping.machine_id}`;

      if (!passMachineKeySet.has(key)) {
        passMachineKeySet.add(key);
        passMappingIdsToUpdate.push(passMapping.id);
      }
    }

    const scanTime = new Date();

    /* Update the current row and PASS rows atomically. */
    const scanUpdate = await prisma.$transaction(async (tx) => {
      const currentMappingUpdate = await tx.cutListMachineMapping.updateMany({
        where: {
          id,
          actual_in_at: null,
        },
        data: {
          actual_in_at: scanTime,
          in_operator: created_by,
          ...(box_id ? { box_id } : {}),
        },
      });

      // Another request already scanned the row. Do not update PASS rows.
      if (currentMappingUpdate.count === 0) {
        return currentMappingUpdate;
      }

      if (passMappingIdsToUpdate.length > 0) {
        await tx.cutListMachineMapping.updateMany({
          where: {
            id: {
              in: passMappingIdsToUpdate,
            },
            actual_in_at: null,
          },
          data: {
            actual_in_at: scanTime,
            in_operator: created_by,
          },
        });
      }

      return currentMappingUpdate;
    });

    if (scanUpdate.count === 0) {
      return validationResponse(0, "Already Scanned");
    }

    /* Run independent post-scan work concurrently. */
    const completeDefect = async () => {
      if (!pendingDefect) return;

      await prisma.defectedItem.update({
        where: {
          id: pendingDefect.id,
        },
        data: {
          defect_status: "Completed",
          defect_completed_by: created_by,
          defect_completed_at: scanTime,
        },
      });

      if (files.length === 0) return;

      const uploadedPhotos = await uploadToWasabiCompletionPhotos(
        files,
        vendor_id,
        id,
      );

      if (uploadedPhotos.length === 0) return;

      await prisma.defectCompletionPhoto.createMany({
        data: uploadedPhotos.map((photo) => ({
          cut_list_machine_mapping_id: id,
          cut_list_id,
          vendor_id,
          defected_item_id: pendingDefect.id,
          doc_og_name: photo.originalName,
          doc_sys_name: photo.systemName,
          created_by,
        })),
      });
    };

    await Promise.all([
      completeDefect(),
      updateProjectStatus(
        eligibleMapping.project_id,
        eligibleMapping.project.track_trace_status,
      ),
    ]);

    return validationResponse(1, "Scan done");
  } catch (error: unknown) {
    console.error("updateScannedItem error:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Something went wrong";

    return validationResponse(0, errorMessage);
  }
};

export const check_defect = async (payload: TrackTracePayload) => {
  console.log(payload);
  try {
    const { project_id, vendor_id, machine_id, unique_code, created_by } =
      payload;

    const projectFilter = project_id ? { project_id } : {};

    const mappedItem = await prisma.cutListMachineMapping.findFirst({
      where: {
        machine_id: machine_id,
        vendor_id: vendor_id,
        ...projectFilter,
        cut_list: {
          unique_code: unique_code,
        },
      },
      select: {
        id: true,
        sequence_no: true,
        cut_list_id: true,
        project_id: true,
        actual_in_at: true,
        machine_id: true,
        machine: {
          select: {
            id: true,
            machine_name: true,
          },
        },
        cut_list: {
          select: {
            unique_code: true,
            description: true,
            item_name: true,
          },
        },
        project: {
          select: {
            track_trace_status: true,
            project_name: true,
            isDeleted: true,
          },
        },
      },
    });

    console.log("mappedItem", mappedItem);
    if (!mappedItem) {
      return validationResponse(
        0,
        project_id
          ? "Item not found for this machine in the selected project"
          : "Item not found for this machine",
      );
    }

    if (mappedItem.project?.isDeleted) {
      return validationResponse(0, "Project is deleted or deactivated");
    }

    return validationResponse(1, "", mappedItem);
  } catch (error) {
    console.log("Error in api", error);
    return validationResponse(0, "Something went wrong");
  }
};

export const updateProjectStatus = async (
  project_id: number,
  current_status: string,
) => {
  try {
    const projectId = Number(project_id);

    if (current_status === "Not Started") {
      return await prisma.projectMaster.update({                
        where: {
          id: projectId,
        },
        data: {
          track_trace_status: "Started",
          track_started_at: new Date(),
        },
      });
    }

    if (current_status === "Started") {
      const pendingCount = await getPendingCutListMachineMappings(projectId);

      if (pendingCount === 0) {
        return await prisma.projectMaster.update({
          where: {
            id: projectId,
          },
          data: {
            track_trace_status: "Completed",
            track_completed_at: new Date(),
          },
        });
      }

      return await prisma.projectMaster.findUnique({
        where: {
          id: projectId,
        },
      });
    }
  } catch (error) {
    console.error("Error updating project:", error);
    throw error;
  }
};

export const getPendingCutListMachineMappings = async (project_id: number) => {
  try {
    const projectId = Number(project_id);

    const count = await prisma.cutListMachineMapping.count({
      where: {
        project_id: projectId,
        actual_in_at: null,
      },
    });

    return count;
  } catch (error) {
    console.error("Error fetching pending machine mappings:", error);
    throw error;
  }
};

export const getKPIS = async (payload: TrackTraceDashboardPayload) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const tomorrow = new Date(todayStart);
  tomorrow.setDate(todayStart.getDate() + 1);

  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  const baseWhere: any = {
    vendor_id: payload.vendor_id,
    actual_in_at: {
      gte: todayStart,
      lte: tomorrow,
    },
    project: {
      isDeleted: false,
    },
  };

  console.log("payload.project_id", payload.project_id);
  if (payload.project_id) {
    baseWhere.project_id = Number(payload.project_id);
  }

  if (payload.machine_id) {
    baseWhere.machine_id = Number(payload.machine_id);
  }

  if (payload.created_by) {
    baseWhere.operator = Number(payload.created_by);
  }

  const itemsToday = await prisma.cutListMachineMapping.count({
    where: baseWhere,
  });

  // where: {
  //             vendor_id: payload.vendor_id,
  //             actual_in_at: {
  //                 gte: todayStart,
  //                 lte: tomorrow,
  //             },
  //         },
  const processedItemsToday = await prisma.cutListMachineMapping.findMany({
    where: baseWhere,
    select: {
      cut_list: {
        select: {
          length: true,
          width: true,
        },
      },
    },
  });

  const totalSqft =
    Math.round(
      processedItemsToday.reduce((sum, item) => {
        const length = Number(item.cut_list?.length ?? 0);
        const width = Number(item.cut_list?.width ?? 0);
        return sum + (length * width) / 92903;
      }, 0) * 100,
    ) / 100;

  const baseWhereYesterday: any = {
    vendor_id: payload.vendor_id,
    actual_in_at: {
      gte: yesterdayStart,
      lte: todayStart,
    },
  };

  console.log("payload.project_id", payload.project_id);
  if (payload.project_id) {
    baseWhereYesterday.project_id = Number(payload.project_id);
  }

  if (payload.machine_id) {
    baseWhereYesterday.machine_id = Number(payload.machine_id);
  }

  if (payload.created_by) {
    baseWhereYesterday.operator = Number(payload.created_by);
  }

  const processedItemsYesterday = await prisma.cutListMachineMapping.findMany({
    where: baseWhereYesterday,
    select: {
      cut_list: {
        select: {
          length: true,
          width: true,
        },
      },
    },
  });

  const yesterdaySqft =
    Math.round(
      processedItemsYesterday.reduce((sum, item) => {
        const length = Number(item.cut_list?.length ?? 0);
        const width = Number(item.cut_list?.width ?? 0);
        return sum + (length * width) / 92903;
      }, 0) * 100,
    ) / 100;

  const sqftChange =
    yesterdaySqft > 0
      ? Math.round(((totalSqft - yesterdaySqft) / yesterdaySqft) * 100)
      : 0;

  const sqftTrend = totalSqft >= yesterdaySqft ? "up" : "down";

  const sqftSubtitle = `${sqftTrend === "up" ? "↑" : "↓"} ${Math.abs(
    totalSqft - yesterdaySqft,
  ).toFixed(2)} sqft`;

  const itemsYesterday = await prisma.cutListMachineMapping.count({
    where: baseWhereYesterday,
  });

  const itemsChange =
    itemsYesterday > 0
      ? Math.round(((itemsToday - itemsYesterday) / itemsYesterday) * 100)
      : 0;

  const totalMachines = await prisma.machineMaster.count({
    where: {
      vendor_id: payload.vendor_id, // or just vendor_id if variable name matches
    },
  });
  const activeMachines = await prisma.machineMaster.count({
    where: {
      status: "ACTIVE",
      vendor_id: payload.vendor_id,
    },
  });

  const machineUtilization =
    totalMachines > 0 ? Math.round((activeMachines / totalMachines) * 100) : 0;

  const totalOperators = await prisma.userMaster.count({
    where: {
      status: "active",
      vendor_id: payload.vendor_id,
    },
  });

  const activeOperatorGroups = await prisma.userMachineMapping.groupBy({
    by: ["user_id"],
    where: {
      status: "ACTIVE",
      vendor_id: payload.vendor_id,
    },
  });

  const activeOperatorMappings = activeOperatorGroups.length;

  const operatorAvailability =
    totalOperators > 0
      ? Math.round((activeOperatorMappings / totalOperators) * 100)
      : 0;

  return {
    totalItemsProcessed: {
      value: itemsToday,
      change: `${itemsChange >= 0 ? "+" : ""}${itemsChange}% vs yesterday`,
      subtitle: `${itemsChange >= 0 ? "↑" : "↓"} ${Math.abs(itemsToday - itemsYesterday)}`,
      trend: itemsChange >= 0 ? "up" : "down",
      sqft: {
        value: totalSqft,
        change: `${sqftChange >= 0 ? "+" : ""}${sqftChange}% vs yesterday`,
        subtitle: sqftSubtitle,
        trend: sqftTrend,
      },
    },
    activeMachines: {
      value: `${activeMachines}/${totalMachines}`,
      change: `${machineUtilization}% utilization`,
      subtitle: `${totalMachines - activeMachines} idle`,
      trend: "neutral",
    },
    activeOperators: {
      value: `${activeOperatorMappings}/${totalOperators}`,
      change: `${operatorAvailability}% availability`,
      subtitle: `${totalOperators - activeOperatorMappings} available`,
      trend: "neutral",
    },
  };
};

export const getRealTimeItemTracking = async (
  payload: TrackTraceDashboardPayload,
) => {
  // const searchParams = request.nextUrl.searchParams;
  const project = payload.project_id;
  const machine = payload.machine_id;
  const operator = payload.created_by;
  const vendor_id = payload.vendor_id;

  const baseWhere: any = {
    vendor_id: vendor_id,
    actual_in_at: {
      not: null,
    },
    project: {
      isDeleted: false,
    },
  };

  console.log("payload.project_id", payload.project_id);
  if (payload.project_id) {
    baseWhere.project_id = Number(payload.project_id);
  }

  if (payload.machine_id) {
    baseWhere.machine_id = Number(payload.machine_id);
  }

  if (payload.created_by) {
    baseWhere.operator = Number(payload.created_by);
  }

  const result = await prisma.cutListMachineMapping.findMany({
    where: baseWhere,
    select: {
      id: true,
      actual_in_at: true,
      sequence_no: true,

      cut_list: {
        select: {
          item_name: true,
          material_details: true,
          description: true,
        },
      },

      machine: {
        select: {
          machine_name: true,
          image_path: true,
        },
      },

      operator: {
        select: {
          user_name: true,
        },
      },

      project: {
        select: {
          project_name: true,
        },
      },

      lead: {
        select: {
          lead_code: true,
        },
      },
    },
    orderBy: {
      actual_in_at: "desc",
    },
    take: 10,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formattedResult = result.map((item) => {
    const date = new Date(item.actual_in_at ?? new Date());
    const isToday = date >= today;

    const formattedDate = isToday
      ? date.toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        })
      : date.toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "2-digit",
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        });

    return {
      ...item,
      actual_in_at_formatted: formattedDate,
    };
  });

  console.log("********************************************");
  console.log(formattedResult);
  return formattedResult;
};

export const getMachineStatus1 = async (
  payload: TrackTraceDashboardPayload,
) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const machines = await prisma.machineMaster.findMany({
      include: {
        userMachineMappings: {
          where: {
            status: "ACTIVE",
          },
          include: {
            user: {
              select: {
                user_name: true,
                id: true,
              },
            },
          },
          take: 1,
        },
      },
      orderBy: {
        machine_name: "asc",
      },
    });

    // Calculate utilization for each machine
    const machinesWithUtilization = await Promise.all(
      machines.map(async (machine) => {
        // Get all scans for this machine today, ordered by time
        const todayScans = await prisma.cutListMachineMapping.findMany({
          where: {
            machine_id: machine.id,
            actual_in_at: {
              gte: todayStart,
            },
          },
          orderBy: {
            actual_in_at: "asc",
          },
          select: {
            id: true,
            actual_in_at: true,
            cut_list_id: true,
          },
        });

        // Calculate active time by pairing IN and OUT scans
        let totalActiveSeconds = 0;
        const itemSessions = new Map<string, Date>(); // cutListId -> last IN time

        for (const scan of todayScans) {
          const timestamp = scan.actual_in_at;
          if (timestamp != null) {
            itemSessions.set(String(scan.cut_list_id), timestamp);
          }
        }

        // Add time for items currently in process (IN but not OUT yet)
        const now = new Date();
        itemSessions.forEach((startTime) => {
          const duration = (now.getTime() - startTime.getTime()) / 1000;
          totalActiveSeconds += duration;
        });

        // Calculate utilization
        const workingSeconds = 8 * 60 * 60; // 8 hours
        const utilization =
          machine.status === "MAINTENANCE" || machine.status === "INACTIVE"
            ? 0
            : Math.min(
                Math.round((totalActiveSeconds / workingSeconds) * 100),
                100,
              );

        // Check if currently processing (has items with IN scan but no matching OUT)
        const currentlyProcessing = itemSessions.size > 0;

        // Count completed items today (items that have both IN and OUT scans)
        const completedItems = await prisma.cutListMachineMapping.groupBy({
          by: ["cut_list_id"],
          where: {
            machine_id: machine.id,
            actual_in_at: {
              gte: todayStart,
            },
          },
        });

        const operator = machine.userMachineMappings[0]?.user
          ? `${machine.userMachineMappings[0].user.user_name}`
          : undefined;

        return {
          id: machine.id,
          name: machine.machine_name,
          status:
            currentlyProcessing && machine.status === "ACTIVE"
              ? "ACTIVE"
              : machine.status === "ACTIVE"
                ? "IDLE"
                : machine.status,
          operator,
          utilization,
          itemsProcessedToday: completedItems.length,
        };
      }),
    );

    machinesWithUtilization.sort((a, b) => b.utilization - a.utilization);
    return machinesWithUtilization;
  } catch (error) {
    console.error("Error fetching machines:", error);
  }
};

export const getHourlyProduction1 = async (
  payload: TrackTraceDashboardPayload,
) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const hours = [];
    const labels = [];
    const data = [];

    for (let hour = 8; hour <= 20; hour++) {
      const hourStart = new Date(todayStart);
      hourStart.setHours(hour, 0, 0, 0);

      const hourEnd = new Date(todayStart);
      hourEnd.setHours(hour + 1, 0, 0, 0);

      const count = await prisma.cutListMachineMapping.count({
        where: {
          actual_in_at: {
            gte: hourStart,
            lt: hourEnd,
            not: null,
          },
        },
      });

      const hourLabel =
        hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;

      labels.push(hourLabel);
      data.push(count);
    }

    // Target is 60 items per hour
    const target = new Array(labels.length).fill(60);

    return {
      labels,
      datasets: [
        {
          label: "Items Processed",
          data,
          borderColor: "#111827",
          backgroundColor: "rgba(17, 24, 39, 0.1)",
        },
        {
          label: "Target",
          data: target,
          borderColor: "#9CA3AF",
          backgroundColor: "transparent",
        },
      ],
    };
  } catch (error) {
    console.error("Error fetching hourly production:", error);
  }
};

export const getHourlyProduction = async (
  payload: TrackTraceDashboardPayload,
) => {
  try {
    const timeZone = "Asia/Kolkata";

    // Today's date in vendor timezone
    const todayStr = new Date().toLocaleDateString("en-CA", { timeZone }); // "2025-04-08"

    // Get vendor's UTC offset in ms
    // e.g. Asia/Kolkata = +5:30 = +19800000ms
    const offsetMs = (() => {
      const utcDate = new Date(`${todayStr}T12:00:00Z`);
      const localStr = utcDate
        .toLocaleString("en-CA", { timeZone, hour12: false })
        .replace(",", "");
      const localDate = new Date(localStr + "Z");
      return localDate.getTime() - utcDate.getTime();
    })();

    const labels: string[] = [];
    const data: number[] = [];

    for (let hour = 8; hour <= 20; hour++) {
      // Build hour boundaries as if in vendor timezone, then shift to UTC
      const hourStartUTC = new Date(
        new Date(
          `${todayStr}T${String(hour).padStart(2, "0")}:00:00Z`,
        ).getTime() - offsetMs,
      );
      const hourEndUTC = new Date(
        new Date(
          `${todayStr}T${String(hour + 1).padStart(2, "0")}:00:00Z`,
        ).getTime() - offsetMs,
      );

      const baseWhere: any = {
        vendor_id: payload.vendor_id,
        actual_in_at: {
          gte: hourStartUTC,
          lt: hourEndUTC,
          not: null,
        },
      };

      if (payload.project_id) baseWhere.project_id = Number(payload.project_id);
      if (payload.machine_id) baseWhere.machine_id = Number(payload.machine_id);
      if (payload.created_by) baseWhere.operator = Number(payload.created_by);

      const scans = await prisma.cutListMachineMapping.findMany({
        where: baseWhere,
        include: {
          cut_list: {
            select: {
              length: true,
              width: true,
            },
          },
        },
      });

      let sqftThisHour = 0;
      for (const scan of scans) {
        if (!scan.cut_list) continue;
        sqftThisHour +=
          (Number(scan.cut_list.length) * Number(scan.cut_list.width)) / 92903;
      }

      const hourLabel =
        hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;

      labels.push(hourLabel);
      data.push(Math.round(sqftThisHour * 100) / 100);
    }

    const targetSqftPerHour = 500;
    const target = new Array(labels.length).fill(targetSqftPerHour);

    return {
      labels,
      datasets: [
        {
          label: "SQFT Processed",
          data,
          borderColor: "#111827",
          backgroundColor: "rgba(17, 24, 39, 0.1)",
        },
        {
          label: "Target SQFT",
          data: target,
          borderColor: "#9CA3AF",
          backgroundColor: "transparent",
          borderDash: [6, 6],
        },
      ],
    };
  } catch (error) {
    console.error("Error fetching hourly production:", error);
    throw error;
  }
};

export const getMachineUtilization1 = async (
  payload: TrackTraceDashboardPayload,
) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    // Get all machines
    const machines = await prisma.machineMaster.findMany({
      select: {
        id: true,
        machine_name: true,
        status: true,
      },
    });

    // Group machines by type (extracted from name)
    const machineTypes = new Map<string, { total: number; active: number }>();

    for (const machine of machines) {
      // Extract type from name (e.g., "CNC Router #1" -> "CNC Router")
      const typeMatch = machine.machine_name.match(/^(.*?)\s*#?\d*$/);
      const type = typeMatch ? typeMatch[1].trim() : machine.machine_name;

      if (!machineTypes.has(type)) {
        machineTypes.set(type, { total: 0, active: 0 });
      }

      const stats = machineTypes.get(type)!;

      // Get all scans for this machine today
      const scans = await prisma.cutListMachineMapping.findMany({
        where: {
          machine_id: machine.id,
          actual_in_at: {
            gte: todayStart,
          },
        },
        orderBy: {
          actual_in_at: "asc",
        },
        select: {
          cut_list_id: true,
          actual_in_at: true,
          actual_out_at: true,
          created_at: true,
        },
      });

      // Calculate active time by pairing IN and OUT scans
      const itemSessions = new Map<string, Date>();
      let activeSeconds = 0;

      for (const scan of scans) {
        // Use actual_in_at if available, otherwise created_at
        const timestamp = scan.actual_in_at || scan.created_at;

        itemSessions.set(String(scan.cut_list_id), timestamp);
      }

      // Add time for items currently in process (IN but not OUT yet)
      const now = new Date();
      itemSessions.forEach((startTime) => {
        const duration = (now.getTime() - startTime.getTime()) / 1000;
        activeSeconds += duration;
      });

      // Calculate utilization
      const workingSeconds = 8 * 60 * 60; // 8 hours
      const utilization =
        machine.status === "MAINTENANCE" || machine.status === "INACTIVE"
          ? 0
          : Math.min(Math.round((activeSeconds / workingSeconds) * 100), 100);

      stats.total += utilization;
      stats.active += 1;
    }

    // Calculate average utilization per type
    const labels: string[] = [];
    const data: number[] = [];
    const colors: string[] = [];

    const colorPalette = [
      "#111827",
      "#1F2937",
      "#374151",
      "#4B5563",
      "#6B7280",
      "#9CA3AF",
    ];

    let colorIndex = 0;
    machineTypes.forEach((stats, type) => {
      labels.push(type);
      const avgUtilization =
        stats.active > 0 ? Math.round(stats.total / stats.active) : 0;
      data.push(avgUtilization);
      colors.push(colorPalette[colorIndex % colorPalette.length]);
      colorIndex++;
    });

    return {
      labels,
      datasets: [
        {
          label: "Utilization %",
          data,
          backgroundColor: colors,
        },
      ],
    };
  } catch (error) {
    console.error("Error fetching machine utilization:", error);
    throw new Error("Failed to fetch machine utilization data");
  }
};

export const getMachineUtilization = async (
  payload: TrackTraceDashboardPayload,
) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const now = new Date();

    // configurable benchmark (important)
    const WORKING_SECONDS = 8 * 60 * 60;
    const EXPECTED_SQFT_PER_MACHINE = 500; // tune per factory

    const baseWhere: any = {
      vendor_id: payload.vendor_id,
    };

    // if (payload.project_id) {
    //     baseWhere.project_id = Number(payload.project_id);
    // }

    if (payload.machine_id) {
      baseWhere.id = Number(payload.machine_id);
    }

    // if (payload.created_by) {
    //     baseWhere.operator = Number(payload.created_by);
    // }

    const machines = await prisma.machineMaster.findMany({
      where: baseWhere,
      select: {
        id: true,
        machine_name: true,
        status: true,
      },
    });

    console.log("=============");
    console.log(machines);

    const machineTypes = new Map<
      string,
      { weightedSeconds: number; count: number }
    >();

    for (const machine of machines) {
      const typeMatch = machine.machine_name.match(/^(.*?)\s*#?\d*$/);
      const type = typeMatch ? typeMatch[1].trim() : machine.machine_name;

      if (!machineTypes.has(type)) {
        machineTypes.set(type, { weightedSeconds: 0, count: 0 });
      }

      if (machine.status !== "ACTIVE") continue;

      const scans = await prisma.cutListMachineMapping.findMany({
        where: {
          machine_id: machine.id,
          actual_in_at: { gte: todayStart },
        },
        orderBy: { actual_in_at: "asc" },
        include: {
          cut_list: {
            select: {
              length: true,
              width: true,
            },
          },
        },
      });

      //   console.log(scans);

      let weightedActiveSeconds = 0;

      for (let i = 0; i < scans.length; i++) {
        const current = scans[i];
        const next = scans[i + 1];

        if (!current.actual_in_at || !current.cut_list) continue;

        const start = current.actual_in_at;
        const end = next?.actual_in_at ?? now;

        const durationSeconds = (end.getTime() - start.getTime()) / 1000;

        const sqft =
          (Number(current.cut_list.length) * Number(current.cut_list.width)) /
          92903;

        weightedActiveSeconds += durationSeconds * sqft;
        // console.log(weightedActiveSeconds);
      }

      const stats = machineTypes.get(type)!;
      stats.weightedSeconds += weightedActiveSeconds;
      stats.count += 1;
    }

    const labels: string[] = [];
    const data: number[] = [];
    const colors: string[] = [];

    const colorPalette = [
      "#111827",
      "#1F2937",
      "#374151",
      "#4B5563",
      "#6B7280",
      "#9CA3AF",
    ];

    let colorIndex = 0;

    machineTypes.forEach((stats, type) => {
      const maxWeightedSeconds =
        WORKING_SECONDS * EXPECTED_SQFT_PER_MACHINE * stats.count;

      const utilization =
        maxWeightedSeconds > 0
          ? Math.min(
              Math.round((stats.weightedSeconds / maxWeightedSeconds) * 100),
              100,
            )
          : 0;

      labels.push(type);
      data.push(utilization);
      colors.push(colorPalette[colorIndex % colorPalette.length]);
      colorIndex++;
    });

    // console.log(data)

    return {
      labels,
      datasets: [
        {
          label: "SQFT Weighted Utilization %",
          data,
          backgroundColor: colors,
        },
      ],
    };
  } catch (error) {
    console.error("Error fetching machine utilization:", error);
    throw new Error("Failed to fetch machine utilization data");
  }
};

export const getMachineStatus = async (payload: TrackTraceDashboardPayload) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const now = new Date();

    const baseWhere: any = {
      vendor_id: payload.vendor_id,
      status: "ACTIVE",
    };

    // if (payload.project_id) {
    //     baseWhere.project_id = Number(payload.project_id);
    // }

    // const machineWhere: any = {
    //     payload.machine_id;
    // };

    if (payload.machine_id) {
      baseWhere.id = Number(payload.machine_id);
    }

    if (payload.created_by) {
      baseWhere.operator = Number(payload.created_by);
    }

    const baseWhereMachine: any = {
      vendor_id: payload.vendor_id,
      status: "ACTIVE",
    };

    if (payload.machine_id) {
      baseWhereMachine.id = Number(payload.machine_id);
    }

    console.log("baseWhere", baseWhere);
    const machines = await prisma.machineMaster.findMany({
      where: baseWhereMachine,
      include: {
        userMachineMappings: {
          where: baseWhere,
          include: {
            user: { select: { user_name: true, id: true } },
          },
          take: 1,
        },
      },
      orderBy: { machine_name: "asc" },
    });

    // if (payload.project_id) {
    //     baseWhere.project_id = Number(payload.project_id);
    // }

    // const machineWhere: any = {
    //     payload.machine_id;
    // };

    if (payload.machine_id) {
      baseWhere.id = Number(payload.machine_id);
    }

    if (payload.created_by) {
      baseWhere.operator = Number(payload.created_by);
    }

    const machinesWithMetrics = await Promise.all(
      machines.map(async (machine) => {
        const baseWhereMatrics: any = {
          vendor_id: payload.vendor_id,
          machine_id: machine.id,
          actual_in_at: { gte: todayStart },
        };

        if (payload.project_id) {
          baseWhereMatrics.project_id = Number(payload.project_id);
        }

        if (payload.machine_id) {
          baseWhereMatrics.id = Number(payload.machine_id);
        }

        if (payload.created_by) {
          baseWhereMatrics.operator = Number(payload.created_by);
        }

        const scans = await prisma.cutListMachineMapping.findMany({
          where: baseWhereMatrics,
          orderBy: { actual_in_at: "asc" },
          include: {
            cut_list: {
              select: {
                id: true,
                length: true,
                width: true,
              },
            },
          },
        });

        let totalActiveSeconds = 0;
        let sqftProcessedToday = 0;
        let sqftInProcess = 0;

        for (let i = 0; i < scans.length; i++) {
          const current = scans[i];
          const next = scans[i + 1];

          if (!current.actual_in_at || !current.cut_list) continue;

          const start = current.actual_in_at;
          const end = next?.actual_in_at ?? now;

          const durationSeconds = (end.getTime() - start.getTime()) / 1000;

          totalActiveSeconds += durationSeconds;

          const sqft =
            (Number(current.cut_list.length) * Number(current.cut_list.width)) /
            92903;

          if (next) {
            sqftProcessedToday += sqft;
          } else {
            sqftInProcess += sqft;
          }
        }

        const workingSeconds = 8 * 60 * 60;

        const utilization =
          machine.status !== "ACTIVE"
            ? 0
            : Math.min(
                Math.round((totalActiveSeconds / workingSeconds) * 100),
                100,
              );

        const operator = machine.userMachineMappings[0]?.user?.user_name;

        return {
          id: machine.id,
          name: machine.machine_name,
          status:
            sqftInProcess > 0 && machine.status === "ACTIVE"
              ? "ACTIVE"
              : machine.status === "ACTIVE"
                ? "IDLE"
                : machine.status,
          operator,
          utilization,
          sqftProcessedToday: Math.round(sqftProcessedToday * 100) / 100,
          sqftInProcess: Math.round(sqftInProcess * 100) / 100,
        };
      }),
    );

    return machinesWithMetrics.sort((a, b) => b.utilization - a.utilization);
  } catch (error) {
    console.error("Error fetching machines:", error);
    throw error;
  }
};

export const getTopPerformer = async (payload: TrackTraceDashboardPayload) => {
  try {
    // Get today's start
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const baseWhere: any = {
      status: "ACTIVE",
      vendor_id: payload.vendor_id,
    };

    // if (payload.project_id) {
    //     baseWhere.project_id = Number(payload.project_id);
    // }

    if (payload.machine_id) {
      baseWhere.machine_id = Number(payload.machine_id);
    }

    // if (payload.created_by) {
    //     baseWhere.operator = Number(payload.created_by);
    // }

    // Get all active user-machine mappings
    const userMappings = await prisma.userMachineMapping.findMany({
      where: baseWhere,
      include: {
        user: {
          select: {
            id: true,
            user_name: true,
          },
        },
        machine: {
          select: {
            id: true,
            machine_name: true,
          },
        },
      },
    });

    const operatorPerformance = await Promise.all(
      userMappings.map(async (mapping) => {
        // Get all items scanned on this machine today
        const scannedItems = await prisma.cutListMachineMapping.findMany({
          where: {
            machine_id: mapping.machine_id,
            actual_in_at: {
              gte: todayStart,
              not: null,
            },
          },
          orderBy: {
            actual_in_at: "asc",
          },
          select: {
            cut_list_id: true,
            actual_in_at: true,
          },
        });

        const itemsProcessed = scannedItems.length;

        // Calculate average time between scans (throughput rate)
        let totalGapSeconds = 0;
        for (let i = 1; i < scannedItems.length; i++) {
          const gap =
            (scannedItems[i].actual_in_at!.getTime() -
              scannedItems[i - 1].actual_in_at!.getTime()) /
            1000;
          totalGapSeconds += gap;
        }

        const avgTimeSeconds =
          scannedItems.length > 1
            ? totalGapSeconds / (scannedItems.length - 1)
            : 0;
        const avgTimeMinutes = Math.round((avgTimeSeconds / 60) * 10) / 10;

        // Calculate efficiency based on throughput
        // Target: 1 item every 10 minutes (6 items per hour)
        const targetTimeSeconds = 10 * 60;
        const efficiency =
          avgTimeSeconds > 0
            ? Math.min(
                Math.round((targetTimeSeconds / avgTimeSeconds) * 100),
                100,
              )
            : 0;

        return {
          id: mapping.user_id,
          name: `${mapping.user.user_name}`,
          machine: mapping.machine.machine_name,
          itemsProcessed,
          avgTime: itemsProcessed > 1 ? `${avgTimeMinutes}m` : "-",
          efficiency: itemsProcessed > 1 ? efficiency : 0,
        };
      }),
    );

    const sortedOperators = operatorPerformance
      .filter((op) => op.itemsProcessed > 0)
      .sort((a, b) => b.itemsProcessed - a.itemsProcessed)
      .slice(0, 10);

    return sortedOperators;
  } catch (error) {
    console.error("Error fetching operator performance:", error);
  }
};

export const getProjectProgress = async (
  payload: TrackTraceDashboardPayload,
) => {
  try {
    const result = await prisma.$queryRaw<
      {
        item_name: string;
        lead_code: string;
        project_name: string;
        processed: number;
        pending: number;
        sqft_processed: number;
        sqft_pending: number;
      }[]
    >`
SELECT
    cl.item_name,
    lm.lead_code,
    pm.project_name,
    COUNT(clmm.id) FILTER (WHERE clmm.actual_in_at IS NOT NULL)::INT AS processed,
    COUNT(clmm.id) FILTER (WHERE clmm.actual_in_at IS NULL)::INT     AS pending,
    (
      SUM(cl.length * cl.width) 
      FILTER (WHERE clmm.actual_in_at IS NOT NULL) 
      / 92903
    )::INT AS sqft_processed,
	(
      SUM(cl.length * cl.width) 
      FILTER (WHERE clmm.actual_in_at IS NULL) 
      / 92903
    )::INT AS sqft_pending
FROM public."CutList" cl
INNER JOIN public."CutListMachineMapping" clmm ON clmm.cut_list_id = cl.id
INNER JOIN public."ProjectMaster" pm ON clmm.project_id = pm.id
INNER JOIN public."LeadMaster" lm ON clmm.lead_id = lm.id
WHERE clmm.vendor_id = ${payload.vendor_id} AND pm."isDeleted" = false
GROUP BY
    cl.item_name,
    lm.lead_code,
    pm.project_name
`;

    const enrichedResult = result.map((item) => {
      const total = item.pending + item.processed;
      const progress =
        total > 0 ? Math.round((item.processed / total) * 100) : 0;

      const total_sqft = item.sqft_pending + item.sqft_processed;
      const progress_sqft =
        total > 0 ? Math.round((item.sqft_processed / total_sqft) * 100) : 0;

      return {
        ...item,
        total,
        progress, // percentage
        progress_sqft,
      };
    });

    return enrichedResult;
  } catch (error) {
    console.error("Error fetching projects:", error);
  }
};

export const getBottleNeck = async (payload: TrackTraceDashboardPayload) => {
  try {
    const machines = await prisma.machineMaster.findMany({
      where: {
        status: {
          in: ["ACTIVE"],
        },
        vendor_id: payload.vendor_id,
      },
      include: {
        userMachineMappings: {
          where: {
            status: "ACTIVE",
            vendor_id: payload.vendor_id,
          },
          include: {
            user: {
              select: {
                user_name: true,
              },
            },
          },
          take: 1,
        },
        cutListMachineMapping: {
          where: {
            actual_in_at: null, // Items not yet completed (queued items)
          },
          include: {
            cut_list: true,
          },
        },
      },
    });

    const bottlenecks = await Promise.all(
      machines.map(async (machine) => {
        // Queue count = items not yet completed
        const queueCount = machine.cutListMachineMapping.length;

        // Get recent scans to calculate average processing rate
        const recentScans = await prisma.cutListMachineMapping.findMany({
          where: {
            machine_id: machine.id,
            actual_in_at: {
              not: null,
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
          orderBy: {
            actual_in_at: "asc",
          },
          select: {
            actual_in_at: true,
          },
          take: 20,
        });

        let avgWaitMinutes = 10; // Default: 10 minutes per item

        // Calculate average time between scans (processing rate)
        if (recentScans.length > 1) {
          let totalGapSeconds = 0;
          for (let i = 1; i < recentScans.length; i++) {
            const gap =
              (recentScans[i].actual_in_at!.getTime() -
                recentScans[i - 1].actual_in_at!.getTime()) /
              1000;
            totalGapSeconds += gap;
          }
          avgWaitMinutes = Math.round(
            totalGapSeconds / (recentScans.length - 1) / 60,
          );
        }

        const avgWait =
          avgWaitMinutes >= 60
            ? `${Math.round(avgWaitMinutes / 60)}h ${avgWaitMinutes % 60}m`
            : `${avgWaitMinutes}m`;

        // Estimate total wait time for queue
        const estimatedWaitMinutes = avgWaitMinutes * queueCount;

        // Determine severity based on queue size and estimated wait
        let severity: "high" | "medium" | "low";
        let percentage: number;

        if (queueCount > 20 || estimatedWaitMinutes > 120) {
          severity = "high";
          percentage = Math.min(
            100,
            Math.round((estimatedWaitMinutes / 180) * 100),
          );
        } else if (queueCount > 10 || estimatedWaitMinutes > 60) {
          severity = "medium";
          percentage = Math.round((estimatedWaitMinutes / 120) * 100);
        } else {
          severity = "low";
          percentage = Math.round((estimatedWaitMinutes / 60) * 100);
        }

        const operator = machine.userMachineMappings[0]?.user
          ? `${machine.userMachineMappings[0].user.user_name}`
          : undefined;

        return {
          machine: machine.machine_name,
          operator,
          queueCount,
          avgWait,
          severity,
          percentage: Math.min(percentage, 100),
        };
      }),
    );

    // Sort by severity (high first) and queue count
    const sortedBottlenecks = bottlenecks
      .sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
          return severityOrder[b.severity] - severityOrder[a.severity];
        }
        return b.queueCount - a.queueCount;
      })
      .slice(0, 5);

    return sortedBottlenecks;
  } catch (error) {
    console.error("Error fetching bottlenecks:", error);
    throw new Error("Failed to fetch bottleneck data");
  }
};

export const getAllProjectsByVendorId = (vendor_id: number) => {
  return prisma.projectMaster.findMany({
    where: {
      vendor_id: vendor_id,
      isDeleted: false,
    },
    orderBy: {
      project_name: "asc", // or 'desc'
    },
  });
};

export const getAllMachinesByVendorId = (vendor_id: number) => {
  return prisma.machineMaster.findMany({
    where: {
      vendor_id: vendor_id,
    },
    orderBy: {
      machine_name: "asc", // or 'desc'
    },
  });
};

export const getAllUsersByVendorId = (vendor_id: number) => {
  return prisma.userMaster.findMany({
    where: {
      vendor_id: vendor_id,
    },
    orderBy: {
      user_name: "asc", // or 'desc'
    },
  });
};

// export const getTrackTraceMatrix = async (
//     vendor_id: number,
//     project_id: number
// ) => {
//     const mappings = await prisma.cutListMachineMapping.findMany({
//         where: {
//             vendor_id,
//             project_id,
//         },
//         select: {
//             actual_in_at: true,
//             machine: {
//                 select: {
//                     machine_name: true,
//                 },
//             },
//             cut_list: {
//                 select: {
//                     id: true,
//                     description: true,
//                     sqmtr: true,
//                     sqft: true,
//                     length: true,
//                     width: true,
//                     thickness: true,
//                     grains: true,
//                     material_details: true,
//                     item_name: true,
//                     project_name: true,
//                     qty: true,
//                     unique_code: true,
//                 },
//             },
//         },
//     });

//     const MACHINE_COLUMNS = [
//         "ELF",
//         "ELB",
//         "ESL",
//         "ESR",
//         "Sanding",
//         "Pressing",
//         "Cutting",
//         "Edge Bend",
//         "Cnc Drilling",
//         "CNC router",
//         "solid wood",
//         "Carpentry",
//         "Assembly",
//         "Coating",
//         "Packing",
//         "Dispatch",
//     ];

//     const resultMap = new Map();

//     mappings.forEach((row) => {
//         const cut = row.cut_list;
//         const machineName = row.machine.machine_name;

//         if (!resultMap.has(cut.id)) {
//             const baseRow: any = {
//                 DESCRIPTION: cut.description,
//                 sqmtr: cut.sqmtr,
//                 sqft: cut.sqft,
//                 LENGTH: cut.length,
//                 WIDTH: cut.width,
//                 THICKNESS: cut.thickness,
//                 GRAINS: cut.grains,
//                 MATERIAL_DETAILS: cut.material_details,
//                 ITEM_NAME: cut.item_name,
//                 PROJECT_NAME: cut.project_name,
//                 qty: cut.qty,
//                 unique_code: cut.unique_code,
//                 cutlistid: cut.id,
//             };

//             // Initialize all machines as NA
//             MACHINE_COLUMNS.forEach((m) => {
//                 baseRow[m] = "NA";
//             });

//             resultMap.set(cut.id, baseRow);
//         }

//         // If mapping exists → override NA
//         if (MACHINE_COLUMNS.includes(machineName)) {
//             resultMap.get(cut.id)[machineName] =
//                 row.actual_in_at ?? null; // null means exists but not started
//         }
//     });

//     return Array.from(resultMap.values());
// };

export const getCutListMachine = async (
  vendorId: number,
  unique_project_id: string,
) => {
  const projectMaster = await prisma.projectMaster.findFirst({
    where: {
      unique_project_id: unique_project_id,
    },
    select: {
      id: true,
      project_name: true,
      project_status: true,
      track_trace_status: true,
    },
  });

  const projectId = projectMaster?.id;

  // Step 1: Get all machines for this vendor (regardless of cutlist assignments)
  const allMachines = await prisma.machineMaster.findMany({
    where: {
      vendor_id: vendorId, // Assuming MachineMaster has vendor_id
    },
    select: {
      id: true,
      machine_code: true,
      machine_type_id: true,
    },
    orderBy: {
      sequence_no: "asc",
    },
  });

  const machineColumns = allMachines.map((m) => m.machine_code);

  // Step 2: Fetch all cutlists with relations
  const cutLists = await prisma.cutList.findMany({
    where: {
      vendor_id: vendorId,
      project_id: projectId,
    },
    include: {
      cutListMachineMapping: {
        include: {
          machine: {
            select: {
              id: true,
              machine_code: true,
            },
          },
        },
      },
    },
  });

  // Step 3: Transform to flat structure
  //   const result = cutLists.map(cutList => {
  //     const row = { ...cutList } as any;
  //     delete row.cutListMachineMapping; // Remove nested data

  //     // Initialize all machine columns with 'No'
  //     machineColumns.forEach(machineName => {
  //       row[machineName] = 'No';
  //     });

  //     // Mark machines that are assigned to this cutlist
  //     cutList.cutListMachineMapping.forEach(mapping => {
  //       row[mapping.machine.machine_name] = 'Yes';
  //     });

  //     return row;
  //   });

  const result = cutLists.map((cutList) => {
    const row: any = { ...cutList };
    delete row.cutListMachineMapping;

    // Initialize using real machine IDs
    allMachines.forEach((machine) => {
      row[machine.machine_code] = {
        assigned: false,
        machineId: machine.id,
        machine_type_id: machine.machine_type_id,
      };
    });

    // Mark assigned machines
    cutList.cutListMachineMapping.forEach((mapping) => {
      row[mapping.machine.machine_code] = {
        assigned: true,
        machineId: mapping.machine.id,
      };
    });

    return row;
  });

  // Count scanned items for this project in cutListMachineMapping
  let scannedMappingCount = 0;
  if (projectId) {
    scannedMappingCount = await prisma.cutListMachineMapping.count({
      where: {
        project_id: Number(projectId),
        OR: [
          { actual_in_at: { not: null } },
          { actual_out_at: { not: null } },
          { status: { notIn: ["Pending", "pending", ""] } },
        ],
      },
    });
  }
  const isProjectStarted = scannedMappingCount > 0;

  return {
    data: result,
    machineColumns: machineColumns,
    project: projectMaster
      ? {
          ...projectMaster,
          is_started: isProjectStarted,
          scanned_mapping_count: scannedMappingCount,
        }
      : null,
    is_project_started: isProjectStarted,
    scanned_mapping_count: scannedMappingCount,
  };
};

export const assignMachine = async (payload: CutListSavePayload) => {
  try {
    console.log("payload.project_id", payload.project_id);
    const projectMaster = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id: payload.project_id,
      },
      select: {
        id: true,
        project_status: true,
        track_trace_status: true,
      },
    });

    console.log("projectMaster", projectMaster);

    const projectId = projectMaster?.id;

    if (!projectId) {
      return validationResponse(0, "Project not found");
    }

    // Check if project has already started (at least 1 item scanned in cutListMachineMapping)
    const scannedMappingCount = await prisma.cutListMachineMapping.count({
      where: {
        project_id: Number(projectId),
        OR: [
          { actual_in_at: { not: null } },
          { actual_out_at: { not: null } },
          { status: { notIn: ["Pending", "pending", ""] } },
        ],
      },
    });

    const isStarted = scannedMappingCount > 0;

    const role = (payload.user_role || "").trim().toLowerCase();
    const isSuperAdmin =
      role === "super-admin" ||
      role === "superadmin" ||
      role === "super admin" ||
      role === "super_admin";

    if (isStarted && !isSuperAdmin) {
      return validationResponse(
        0,
        "Project Started: You cannot assign. Only Super Admin can do this."
      );
    }

    const cutListIdArray = payload.cutListIds
      .split(",")
      .map((id) => Number(id.trim()))
      .filter((id) => !isNaN(id));

    return await prisma.$transaction(async (tx) => {
      if (!payload.assigned) {
        await tx.cutListMachineMapping.deleteMany({
          where: {
            cut_list_id: { in: cutListIdArray },
            machine_id: payload.machine_id,
            project_id: Number(projectId),
          },
        });

        return validationResponse(1, "Machine unmapped");
      }

      // ✅ Fetch cutList rows to get qty and lead_id per cut_list_id
      const cutListRows = await tx.cutList.findMany({
        where: {
          id: { in: cutListIdArray },
        },
        select: {
          id: true,
          qty: true,
          lead_id: true,
        },
      });

      console.log(cutListRows);

      // ✅ Find which cut_list_ids already have mapping for this machine
      const existing = await tx.cutListMachineMapping.findMany({
        where: {
          cut_list_id: { in: cutListIdArray },
          machine_id: payload.machine_id,
          project_id: Number(projectId),
        },
        select: { cut_list_id: true },
      });

      const existingIds = new Set(existing.map((e) => e.cut_list_id));

      // ✅ Only process cut_list_ids that don't already have a mapping
      const newCutListRows = cutListRows.filter(
        (row) => !existingIds.has(row.id),
      );

      if (newCutListRows.length === 0) {
        return validationResponse(1, "Machine mapped successfully");
      }

      const machine = await tx.machineMaster.findFirst({
        where: {
          id: payload.machine_id,
        },
      });

      const sequence = machine?.sequence_no;
      if (sequence == null) {
        return validationResponse(0, "Machine sequence not set");
      }

      // ✅ Build mapping rows — one entry per qty unit per cut_list_id
      const mappingData: {
        cut_list_id: number;
        machine_id: number;
        project_id: number;
        vendor_id: number;
        lead_id: number | null;
        sequence_no: number;
        status: string;
        created_by: number;
        expected_in: boolean;
      }[] = [];

      for (const cutListRow of newCutListRows) {
        const qty = Number(cutListRow.qty) || 1;
        const lead_id = Number(cutListRow.lead_id) || null;

        for (let i = 0; i < qty; i++) {
          mappingData.push({
            cut_list_id: cutListRow.id,
            machine_id: payload.machine_id,
            project_id: projectId,
            vendor_id: payload.vendor_id,
            lead_id: lead_id,
            sequence_no: sequence,
            status: "Pending",
            created_by: Number(payload.created_by),
            expected_in: true,
          });
        }
      }

      await tx.cutListMachineMapping.createMany({
        data: mappingData,
      });

      return validationResponse(1, "Machine mapped successfully");
    });
  } catch (error) {
    console.log(error);
    return validationResponse(0, "Something went wrong");
  }
};

export const createQR = async (payload: QRParam) => {
  try {
    const projectId = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id: payload.projectId,
      },
      select: {
        id: true,
      },
    });

    // console.log(payload.cutListIds)
    if (projectId) {
      let cutListIds: number[] | undefined;
      if (payload.cutListIds) {
        cutListIds = payload.cutListIds
          .split(",")
          .map((id) => Number(id.trim()))
          .filter((id) => !isNaN(id));
      }

      console.log("cutListIds", cutListIds);

      const cutLists = await prisma.cutListMachineMapping.findMany({
        where: {
          vendor_id: Number(payload.vendorId),
          project_id: Number(projectId.id),
          ...(cutListIds && cutListIds.length > 0
            ? { cut_list_id: { in: cutListIds } }
            : {}),
        },
        distinct: ["cut_list_id"],
        select: {
          id: true, // clmm.id
          cut_list: {
            select: {
              unique_code: true,
              description: true,
            },
          },
        },
      });

      console.log("cutLists", cutLists);
      if (cutLists.length > 0) {
        return cutLists;
      } else {
        return null;
      }

      // const cutLists = await prisma.cutListMachineMapping.findMany({
      //     where: {
      //         vendor_id: Number(payload.vendorId),
      //         project_id: Number(projectId.id),
      //         ...(cutListIds && cutListIds.length > 0
      //             ? { id: { in: cutListIds } }
      //             : {}),
      //     },
      //     include: {
      //         cut_list: true,
      //     },
      //     select: {
      //         id: true,
      //         unique_code: true,
      //         description: true,
      //     },
      // });
    }
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw error;
  }
};

export const downloadCutListExcel = async (
  vendorId: number,
  unique_project_id: string,
  baseUrl: string,
) => {
  // Get the data using the existing function

  const { data, machineColumns } = await getCutListMachine(
    vendorId,
    unique_project_id,
  );

  //   return data;

  // Transform data for Excel
  const excelData = data.map((row) => {
    const excelRow: any = {
      Description: row.description,
      Length: row.length ? Number(row.length) : 0, // ✅ Convert to number
      Width: row.width ? Number(row.width) : 0, // ✅ Convert to number
      Thickness: row.thickness ? Number(row.thickness) : 0,
      Qty: row.qty,
      "Material Details": row.material_details,
      "Item Name": row.item_name,
      "Unique Code": row.unique_code,
      "Unique Code 2": row.unique_code_2,
      ELF: row.elf || "",
      ELB: row.elb || "",
      ESL: row.esl || "",
      ESR: row.esr || "",
    };

    // Add machine columns (1 or 0)
    machineColumns.forEach((machineName) => {
      const machineData = row[machineName];
      excelRow[machineName] = machineData?.assigned ? 1 : 0;
    });

    return excelRow;
  });

  //   return excelData;

  // Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Cut List");

  // Set columns from keys of first row
  const headers = excelData.length > 0 ? Object.keys(excelData[0]) : [];
  const fixedWidths: number[] = [
    30, 12, 12, 12, 8, 35, 30, 20, 20, 15, 15, 15, 15,
  ];
  worksheet.columns = headers.map((header, i) => ({
    header,
    key: header,
    width: i < fixedWidths.length ? fixedWidths[i] : 15,
  }));

  // Add rows
  excelData.forEach((row) => worksheet.addRow(row));

  // ✅ Define the directory path
  // const publicDir = process.cwd();
  const publicDir = path.join(process.cwd(), "public");

  const excelDir = path.join(publicDir, "assets", "track-trace", "excel");

  // ✅ Create directory if it doesn't exist
  if (!fs.existsSync(excelDir)) {
    fs.mkdirSync(excelDir, { recursive: true });
  }

  // ✅ Generate unique filename
  const timestamp = Date.now();
  const filename = `cutlist-${unique_project_id}-${timestamp}.xlsx`;
  const filePath = path.join(excelDir, filename);

  // ✅ Write the Excel file to disk
  await workbook.xlsx.writeFile(filePath);

  // ✅ Return filename; API will build a served URL
  return filename;
};

export const getVendorLead = async (vendorId: number, search?: string) => {
  const leads = await prisma.leadMaster.findMany({
    where: {
      vendor_id: vendorId,
      ...(search?.trim()
        ? {
            OR: [
              { lead_code: { contains: search, mode: "insensitive" } },
              { firstname: { contains: search, mode: "insensitive" } },
              { lastname: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      lead_code: true,
      firstname: true,
      lastname: true,
    },
    orderBy: {
      lead_code: "asc",
    },
    take: 20, // limit results for search dropdown
  });

  return leads;
};

export const linkLeadToProject = async (
  vendorId: number,
  leadId: number,
  projectId: number,
) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Update lead_id on ProjectMaster
    await tx.projectMaster.update({
      where: { id: projectId },
      data: { lead_id: leadId },
    });

    // 2. Update lead_id on all CutList rows for this project
    await tx.cutList.updateMany({
      where: { project_id: projectId },
      data: { lead_id: leadId },
    });

    // 3. Update lead_id on all CutListMachineMapping rows for this project
    await tx.cutListMachineMapping.updateMany({
      where: { project_id: projectId },
      data: { lead_id: leadId },
    });

    return validationResponse(1, "Lead Updated Successfully");
  });
};

export const get_defect = async (vendorId: number) => {
  const defects = await prisma.defectMaster.findMany({
    where: {
      OR: [{ vendor_id: null }, { vendor_id: vendorId }],
    },
    select: {
      id: true,
      defect_name: true,
    },
    orderBy: {
      defect_name: "asc",
    },
  });
  return {
    data: defects,
  };
};

export const mark_Defect_old = async (payload: MarkDefectPayload) => {
  console.log(
    "payload.cut_list_machine_mapping_id",
    payload.cut_list_machine_mapping_id,
  );
  return await prisma.$transaction(async (tx) => {
    const cut_list_id = payload.cut_list_id;

    const mapping = await tx.cutListMachineMapping.findFirst({
      where: {
        cut_list_id: cut_list_id,
        actual_in_at: {
          not: null,
        },
      },
      select: {
        id: true,
        machine_id: true,
        actual_in_at: true,
        in_operator: true,
      },
      orderBy: {
        actual_in_at: "desc",
      },
    });

    // let previous_scanned_by: number | null = null;
    // let previous_scanned_at: Date | null = null;
    // let previous_scanned_machine_id: number | null = null;
    // let previous_scanned_id: number | null = null;

    // if (mapping) {
    //     previous_scanned_by = mapping.in_operator;
    //     previous_scanned_at = mapping.actual_in_at;
    //     previous_scanned_machine_id = mapping.machine_id;
    //     //previous_scanned_id = mapping.id
    // }

    await tx.defectedItem.create({
      data: {
        vendor_id: payload.vendor_id,
        project_id: payload.project_id,
        cut_list_machine_mapping_id: payload.cut_list_machine_mapping_id,
        machine_id: payload.machine_id,
        defect_id: payload.defect_id > 0 ? payload.defect_id : null,
        remark: payload.defect_name,
        created_by: payload.created_by,
        cut_list_id: payload.cut_list_id,
      },
    });

    //console.log("previous_scanned_id", previous_scanned_id);

    // if (previous_scanned_id) {
    //     await tx.cutListMachineMapping.update({
    //         where: {
    //             id: previous_scanned_id,
    //         },
    //         data: {
    //             actual_in_at: null,
    //             in_operator: null,
    //         },
    //     });
    // }

    await tx.cutListMachineMapping.updateMany({
      where: {
        cut_list_id: payload.cut_list_id,
      },
      data: {
        actual_in_at: null,
        in_operator: null,
      },
    });

    return validationResponse(1, "Defect Marked Successfully");
  });
};

export const mark_Defect = async (
  payload: MarkDefectPayload,
  files: Express.Multer.File[],
  vendorId: number,
) => {
  return await prisma.$transaction(async (tx) => {
    const project = await tx.projectMaster.findUnique({
      where: { id: payload.project_id },
      select: { isDeleted: true, project_name: true },
    });

    if (!project || project.isDeleted) {
      return validationResponse(0, "Project is deleted or deactivated");
    }

    const existingDefect = await tx.defectedItem.findFirst({
      where: {
        cut_list_id: payload.cut_list_id,
        defect_status: { not: "Completed" },
      },
      orderBy: { created_at: "desc" },
    });

    if (existingDefect) {
      return validationResponse(
        0,
        "Item is already marked as defected and has not been completed yet",
      );
    }

    const defectedItem = await tx.defectedItem.create({
      data: {
        vendor_id: payload.vendor_id,
        project_id: payload.project_id,
        cut_list_machine_mapping_id: payload.cut_list_machine_mapping_id,
        machine_id: payload.machine_id,
        defect_id: payload.defect_id > 0 ? payload.defect_id : null,
        remark: payload.defect_name,
        created_by: payload.created_by,
        cut_list_id: payload.cut_list_id,
        action: payload.action,
        rework_machine_id: payload.rework_machine_id,
      },
    });

    // upload to wasabi now that we have defectedItem.id
    const uploadedImages = await uploadToWasabiDefectedItems(
      files,
      vendorId,
      defectedItem.id,
    );

    if (uploadedImages.length > 0) {
      await tx.defectedItemImage.createMany({
        data: uploadedImages.map((img) => ({
          defected_item_id: defectedItem.id,
          doc_og_name: img.originalName,
          doc_sys_name: img.systemName,
        })),
      });
    }

    console.log("payload.action:", payload.action);
    console.log("payload.rework_machine_id:", payload.rework_machine_id);

    if (payload.action == "replace") {
      await tx.cutListMachineMapping.updateMany({
        where: { cut_list_id: payload.cut_list_id },
        data: { actual_in_at: null, in_operator: null },
      });
    } else if (payload.action == "rework" && payload.rework_machine_id) {
      console.log("Triggered");
      await tx.cutListMachineMapping.updateMany({
        where: {
          cut_list_id: payload.cut_list_id,
          machine_id: payload.rework_machine_id,
        },
        data: { actual_in_at: null, in_operator: null },
      });
    }

    /*else if (payload.action === "rework" && payload.rework_machine_id) {

      // get sequence_no of the rework machine
      const reworkMachine = await tx.machineMaster.findFirst({
        where: { id: payload.rework_machine_id },
        select: { sequence_no: true },
      });

      if (reworkMachine?.sequence_no !== null && reworkMachine?.sequence_no !== undefined) {

        // get all machine IDs with sequence_no >= rework machine (includes rework machine itself)
        const machinesFromRework = await tx.machineMaster.findMany({
          where: {
            vendor_id: payload.vendor_id,
            sequence_no: { gte: reworkMachine.sequence_no },
          },
          select: { id: true },
        });

        const machineIds = machinesFromRework.map(m => m.id);

        if (machineIds.length > 0) {
          await tx.cutListMachineMapping.updateMany({
            where: {
              cut_list_id: payload.cut_list_id,
              machine_id: { in: machineIds },
            },
            data: { actual_in_at: null, in_operator: null },
          });
        }
      }
    }*/

    return validationResponse(1, "Defect Marked Successfully");
  });
};

export const getScanStatsDashboard = async (
  vendor_id: number,
  user_id: number,
) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const total_items_scanned_today = await prisma.cutListMachineMapping.count({
      where: {
        vendor_id,
        in_operator: user_id,
        actual_in_at: {
          gte: startOfToday,
        },
      },
    });

    const total_items_pending_to_scan =
      await prisma.cutListMachineMapping.count({
        where: {
          vendor_id,
          actual_in_at: null,
          machine: {
            userMachineMappings: {
              some: {
                user_id,
              },
            },
          },
        },
      });

    return validationResponse(1, "Scan stats fetched", {
      total_items_scanned_today,
      total_items_pending_to_scan,
    });
  } catch (error) {
    console.error(error);
    return validationResponse(0, "Failed to fetch stats");
  }
};
export const getReworkMachines = async (
  vendor_id: number,
  machine_id: number,
) => {
  const currentMachine = await prisma.machineMaster.findFirst({
    where: { id: machine_id, vendor_id },
    select: { sequence_no: true },
  });

  console.log(currentMachine);

  if (!currentMachine || currentMachine.sequence_no === null) return [];

  const machines = await prisma.machineMaster.findMany({
    where: {
      vendor_id,
      sequence_no: { lte: currentMachine.sequence_no },
      status: "ACTIVE",
    },
    select: {
      id: true,
      machine_name: true,
      sequence_no: true,
    },
    orderBy: { sequence_no: "asc" },
  });

  return machines;
};

// service: getUserModules
export const getUserModules = async (vendor_id: number, user_id: number) => {
  try {
    const [vendor, mappings] = await Promise.all([
      prisma.vendorMaster.findUnique({
        where: {
          id: vendor_id,
        },
        select: {
          id: true,
          is_tracktrace_enabled: true,
          is_scanpack_enabled: true,
        },
      }),

      prisma.userMachineMapping.findMany({
        where: {
          user_id,
          vendor_id,
          status: "ACTIVE",
        },
        select: {
          machine: {
            select: {
              machine_type_id: true,
            },
          },
        },
      }),
    ]);

    if (!vendor) {
      return validationResponse(0, "Vendor not found");
    }

    const typeIds = [
      ...new Set(
        mappings
          .map((m) => m.machine?.machine_type_id)
          .filter((id): id is number => id !== null && id !== undefined),
      ),
    ];

    const modules = {
      track_and_trace: false,
      quality_check: false,
      scan_and_pack: false,
    };

    for (const typeId of typeIds) {
      if (typeId === 17 && vendor.is_scanpack_enabled === true) {
        modules.quality_check = true;
      } else if (typeId === 18 && vendor.is_scanpack_enabled === true) {
        modules.scan_and_pack = true;
      } else if (vendor.is_tracktrace_enabled === true) {
        modules.track_and_trace = true;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Vendor-level module override
    |--------------------------------------------------------------------------
    */

    // if (vendor.is_tracktrace_enabled === true) {
    //   modules.track_and_trace = true;
    // }

    // if (vendor.is_scanpack_enabled === true) {
    //   modules.quality_check = true;
    //   modules.scan_and_pack = true;
    // }

    return validationResponse(1, "", {
      modules,
    });
  } catch (error) {
    console.log("Error in getUserModules", error);
    return validationResponse(0, "Something went wrong");
  }
};

export interface GetQualityProjectsOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}

export const getQualityCheckProjects = async (
  vendor_id: number,
  options: GetQualityProjectsOptions = {},
) => {
  try {
    const { page, limit, search, status } = options;
    const isPaginated =
      page !== undefined ||
      limit !== undefined ||
      search !== undefined ||
      status !== undefined;

    const currentPage = Math.max(1, page || 1);
    const currentLimit = Math.max(1, limit || 10);
    const skip = (currentPage - 1) * currentLimit;

    const whereCondition: any = {
      vendor_id,
      isDeleted: false,
      NOT: [
        { project_status: { equals: "Deactivated", mode: "insensitive" } },
        { project_status: { equals: "Deleted", mode: "insensitive" } },
        { project_status: { equals: "Deactive", mode: "insensitive" } },
        { project_status: { equals: "Inactive", mode: "insensitive" } },
      ],
    };

    if (search) {
      whereCondition.OR = [
        { project_name: { contains: search, mode: "insensitive" } },
        { lead: { lead_code: { contains: search, mode: "insensitive" } } },
      ];
    }

    if (status && status.toLowerCase() !== "all") {
      whereCondition.AND = [
        {
          OR: [
            { track_trace_status: { equals: status, mode: "insensitive" } },
            { project_status: { equals: status, mode: "insensitive" } },
          ],
        },
      ];
    }

    // Get the quality check machine for this vendor
    const qualityMachine = await prisma.machineMaster.findFirst({
      where: {
        vendor_id,
        machine_type_id: 17,
        status: "ACTIVE",
      },
      select: {
        id: true,
        sequence_no: true,
        machine_name: true,
      },
    });

    if (!qualityMachine) {
      return validationResponse(1, "", {
        projects: [],
        pagination: isPaginated
          ? { page: currentPage, limit: currentLimit, total: 0, totalPages: 0 }
          : undefined,
      });
    }

    const qualityMachineId = qualityMachine.id;

    /**
     * Total count & Paginated projects for this vendor.
     */
    const [totalProjects, projects] = await Promise.all([
      prisma.projectMaster.count({
        where: whereCondition,
      }),
      prisma.projectMaster.findMany({
        where: whereCondition,
        select: {
          id: true,
          project_name: true,
          project_status: true,
          track_trace_status: true,
          created_at: true,
        },
        orderBy: {
          id: "desc",
        },
        ...(isPaginated ? { skip, take: currentLimit } : {}),
      }),
    ]);

    const projectsWithCount = await Promise.all(
      projects.map(async (project) => {
        /**
         * Total items mapped to quality machine.
         */
        const total_quality_count = await prisma.cutListMachineMapping.count({
          where: {
            project_id: project.id,
            vendor_id,
            machine_id: qualityMachineId,
            expected_in: true,
          },
        });

        /**
         * Already scanned/completed on quality machine.
         */
        const completed_count = await prisma.cutListMachineMapping.count({
          where: {
            project_id: project.id,
            vendor_id,
            machine_id: qualityMachineId,
            expected_in: true,
            actual_in_at: {
              not: null,
            },
          },
        });

        /**
         * Raw pending rows on quality machine.
         * This is not the final pending_count.
         * This only tells how many rows are still not scanned in QC.
         */
        const raw_quality_pending_count =
          await prisma.cutListMachineMapping.count({
            where: {
              project_id: project.id,
              vendor_id,
              machine_id: qualityMachineId,
              expected_in: true,
              actual_in_at: null,
            },
          });

        /**
         * Get all pending QC rows.
         */
        const pendingQualityMappings =
          await prisma.cutListMachineMapping.findMany({
            where: {
              project_id: project.id,
              vendor_id,
              machine_id: qualityMachineId,
              expected_in: true,
              actual_in_at: null,
            },
            select: {
              id: true,
              cut_list_id: true,
              sequence_no: true,
            },
            orderBy: [
              {
                cut_list_id: "asc",
              },
              {
                id: "asc",
              },
            ],
          });

        /**
         * Group pending QC rows by cut_list_id + sequence_no.
         *
         * Important:
         * If 5 qty have same cut_list_id, we should calculate count once,
         * not 5 times.
         */
        const qualityGroupMap = new Map<
          string,
          {
            cut_list_id: number;
            sequence_no: number;
            pendingRowsInQuality: number;
          }
        >();

        for (const item of pendingQualityMappings) {
          const key = `${item.cut_list_id}_${item.sequence_no}`;

          if (!qualityGroupMap.has(key)) {
            qualityGroupMap.set(key, {
              cut_list_id: item.cut_list_id,
              sequence_no: item.sequence_no,
              pendingRowsInQuality: 0,
            });
          }

          const group = qualityGroupMap.get(key)!;
          group.pendingRowsInQuality += 1;
          qualityGroupMap.set(key, group);
        }

        let pending_count = 0;

        /**
         * Final pending_count logic:
         *
         * For every cut_list_id:
         * 1. Check how many qty are completed on previous non-PASS machines.
         * 2. Check how many qty are already scanned in quality machine.
         * 3. pending_count = allowed qty - already quality scanned qty.
         */
        for (const group of qualityGroupMap.values()) {
          const previousNonPassMappings =
            await prisma.cutListMachineMapping.findMany({
              where: {
                project_id: project.id,
                vendor_id,
                cut_list_id: group.cut_list_id,
                expected_in: true,
                sequence_no: {
                  lt: group.sequence_no,
                },
                machine: {
                  scan_type: {
                    not: "PASS",
                  },
                },
              },
              select: {
                id: true,
                machine_id: true,
                sequence_no: true,
                actual_in_at: true,
              },
            });

          /**
           * If quality machine is the first real machine,
           * then all pending QC rows are allowed.
           */
          if (previousNonPassMappings.length === 0) {
            pending_count += group.pendingRowsInQuality;
            continue;
          }

          /**
           * Group previous machine rows by machine + sequence.
           *
           * Example:
           * cut_list_id = 4290
           *
           * Previous Machine:
           * total rows = 5
           * scanned rows = 3
           *
           * Then QC can show pending_count = 3.
           */
          const previousMachineScanMap = new Map<
            string,
            {
              scannedQty: number;
              totalQty: number;
            }
          >();

          for (const previousItem of previousNonPassMappings) {
            const key = `${previousItem.sequence_no}_${previousItem.machine_id}`;

            if (!previousMachineScanMap.has(key)) {
              previousMachineScanMap.set(key, {
                scannedQty: 0,
                totalQty: 0,
              });
            }

            const currentData = previousMachineScanMap.get(key)!;

            currentData.totalQty += 1;

            if (previousItem.actual_in_at) {
              currentData.scannedQty += 1;
            }

            previousMachineScanMap.set(key, currentData);
          }

          /**
           * Minimum scanned qty from all previous machines.
           *
           * If previous machines are:
           * Machine 1 scanned = 5
           * Machine 2 scanned = 3
           *
           * Quality can allow only 3.
           */
          const previousScannedQtyList = Array.from(
            previousMachineScanMap.values(),
          ).map((data) => data.scannedQty);

          const allowedQtyForQualityMachine = Math.min(
            ...previousScannedQtyList,
          );

          /**
           * Count already scanned qty on quality machine for same cut_list_id.
           */
          const qualityScannedQty = await prisma.cutListMachineMapping.count({
            where: {
              project_id: project.id,
              vendor_id,
              cut_list_id: group.cut_list_id,
              machine_id: qualityMachineId,
              sequence_no: group.sequence_no,
              expected_in: true,
              actual_in_at: {
                not: null,
              },
            },
          });

          /**
           * Available qty for QC.
           *
           * Example:
           * Previous machine scanned = 3
           * QC already scanned = 1
           *
           * pending_count = 2
           */
          const availableQtyForQuality =
            allowedQtyForQualityMachine - qualityScannedQty;

          /**
           * Do not count more than actual pending rows in QC.
           */
          const finalPendingQtyForThisItem = Math.min(
            Math.max(availableQtyForQuality, 0),
            group.pendingRowsInQuality,
          );

          pending_count += finalPendingQtyForThisItem;
        }

        return {
          ...project,

          qualityMachineId,
          qualityMachineName: qualityMachine.machine_name,

          total_quality_count,

          /**
           * This is now the real pending count based on previous machine completed qty.
           */
          pending_count,

          completed_count,

          /**
           * Optional raw count for debugging/frontend if needed.
           */
          raw_quality_pending_count,

          is_quality_pending: pending_count > 0,
          is_ready_for_quality: pending_count > 0,
        };
      }),
    );

    return validationResponse(1, "", {
      projects: projectsWithCount,
      pagination: isPaginated
        ? {
            page: currentPage,
            limit: currentLimit,
            total: totalProjects,
            totalPages: Math.ceil(totalProjects / currentLimit),
          }
        : undefined,
    });
  } catch (error) {
    console.log("Error in getQualityCheckProjects", error);
    return validationResponse(0, "Something went wrong");
  }
};

// ─── Helper: sum qty of cut_lists by their ids ────────────────────────────────
async function sumQty(cutListIds: number[]): Promise<number> {
  if (cutListIds.length === 0) return 0;
  const result = await prisma.cutList.aggregate({
    where: { id: { in: cutListIds } },
    _sum: { qty: true },
  });
  return result._sum.qty ?? 0;
}

// ─── Helper: sum qty of cut_list rows from CutListMachineMapping ──────────────
// Each mapping row corresponds to one panel instance.
// We use the cut_list.qty indirectly — one mapping row per panel is already
// how the data is structured (qty=4 on CutList → 4 mapping rows per machine).
// So COUNT of mapping rows = total panels correctly.

export const getTraceTraceDashboard_old = async (vendor_id: number) => {
  try {
    // ── 1. Fetch all projects for this vendor ──────────────────────────────
    const projects = await prisma.projectMaster.findMany({
      where: { vendor_id },
      select: {
        id: true,
        project_name: true,
        project_status: true,
        track_trace_status: true,
        created_at: true,
      },
      orderBy: { created_at: "desc" },
    });

    // ── 2. Fetch all non-PASS machines ordered by sequence ─────────────────
    const machines = await prisma.machineMaster.findMany({
      where: {
        vendor_id,
        status: "ACTIVE",
        scan_type: { not: "PASS" },
      },
      select: {
        id: true,
        machine_name: true,
        sequence_no: true,
        machine_type_id: true,
      },
      orderBy: { sequence_no: "asc" },
    });

    // ── 3. For each project, compute per-machine counts ────────────────────
    const buildProjectStatus = async (project: (typeof projects)[0]) => {
      // Pre-compute scanned count per machine for this project (used for waterfall)
      const scannedPerMachine: Map<number, number> = new Map();
      for (const machine of machines) {
        const count = await prisma.cutListMachineMapping.count({
          where: {
            project_id: project.id,
            vendor_id,
            machine_id: machine.id,
            expected_in: true,
            actual_in_at: { not: null },
          },
        });
        scannedPerMachine.set(machine.id, count);
      }

      const machineStatuses = await Promise.all(
        machines.map(async (machine, index) => {
          // Check if this machine is assigned to this project at all
          const assigned = await prisma.cutListMachineMapping.count({
            where: {
              project_id: project.id,
              vendor_id,
              machine_id: machine.id,
              expected_in: true,
            },
          });

          if (assigned === 0) return null;

          const scanned = scannedPerMachine.get(machine.id) ?? 0;

          // ── Waterfall total ──────────────────────────────────────────────
          // total = rows at this machine where this cut_list's LAST assigned
          // machine before this one has been scanned (actual_in_at != null).
          // This correctly handles cut_lists that skip intermediate machines.
          let total: number;

          const isQCStation =
            machine.machine_type_id === 17 || machine.machine_type_id === 18;

          if (index === 0) {
            // First machine: total = all assigned rows
            total = assigned;
          } else if (isQCStation) {
            // QC Station:
            // Part A — cut_lists that DO have a prior machine assignment:
            //   eligible if their last assigned machine before QC is scanned
            // Part B — cut_lists with NO prior machine assignment (QC-only):
            //   always eligible (count all their QC rows)

            // Find cut_list_ids that have at least one row at seq < QC seq
            const cutListsWithPrior =
              await prisma.cutListMachineMapping.findMany({
                where: {
                  project_id: project.id,
                  vendor_id,
                  sequence_no: { lt: machine.sequence_no ?? 0 },
                  expected_in: true,
                },
                select: { cut_list_id: true },
                distinct: ["cut_list_id"],
              });
            const cutListIdsWithPrior = cutListsWithPrior.map(
              (r) => r.cut_list_id,
            );

            // Part A: rows at QC where cut_list HAS prior machines
            // eligible = the immediately previous assigned machine for that cut_list is scanned
            // We count QC rows where the cut_list's max-seq prior row has actual_in_at != null
            const partARows = await prisma.cutListMachineMapping.findMany({
              where: {
                project_id: project.id,
                vendor_id,
                machine_id: machine.id,
                expected_in: true,
                cut_list_id:
                  cutListIdsWithPrior.length > 0
                    ? { in: cutListIdsWithPrior }
                    : { in: [-1] }, // empty set
              },
              select: { cut_list_id: true, id: true },
            });

            // For each Part A row, check if the last prior machine is scanned
            let partAEligible = 0;
            for (const row of partARows) {
              // Find the highest sequence_no prior machine row for this cut_list
              const lastPriorRow = await prisma.cutListMachineMapping.findFirst(
                {
                  where: {
                    project_id: project.id,
                    vendor_id,
                    cut_list_id: row.cut_list_id,
                    sequence_no: { lt: machine.sequence_no ?? 0 },
                    expected_in: true,
                  },
                  orderBy: { sequence_no: "desc" },
                  select: { actual_in_at: true },
                },
              );
              if (lastPriorRow?.actual_in_at !== null) {
                partAEligible++;
              }
            }

            // Part B: QC-only rows (no prior machine at all) — always eligible
            const partBCount = await prisma.cutListMachineMapping.count({
              where: {
                project_id: project.id,
                vendor_id,
                machine_id: machine.id,
                expected_in: true,
                ...(cutListIdsWithPrior.length > 0
                  ? { cut_list_id: { notIn: cutListIdsWithPrior } }
                  : { cut_list_id: { notIn: [-1] } }), // empty set — nothing qualifies as prior-less if no prior exists at all
              },
            });

            total = partAEligible + partBCount;
          } else {
            // Normal machines: count rows at this machine where
            // the last assigned machine before this one (for that cut_list) is scanned
            const thisMachineRows = await prisma.cutListMachineMapping.findMany(
              {
                where: {
                  project_id: project.id,
                  vendor_id,
                  machine_id: machine.id,
                  expected_in: true,
                },
                select: { cut_list_id: true },
              },
            );

            let eligible = 0;
            for (const row of thisMachineRows) {
              // Find the last machine assigned to this cut_list before current seq
              const lastPriorRow = await prisma.cutListMachineMapping.findFirst(
                {
                  where: {
                    project_id: project.id,
                    vendor_id,
                    cut_list_id: row.cut_list_id,
                    sequence_no: { lt: machine.sequence_no ?? 0 },
                    expected_in: true,
                  },
                  orderBy: { sequence_no: "desc" },
                  select: { actual_in_at: true },
                },
              );

              if (!lastPriorRow) {
                // No prior machine for this cut_list — not eligible yet
                // (shouldn't happen for non-first machines in normal flow)
                continue;
              }

              if (lastPriorRow.actual_in_at !== null) {
                eligible++;
              }
            }

            total = eligible;
          }

          const pending = Math.max(0, total - scanned);

          return {
            machine_id: machine.id,
            machine_name: machine.machine_name,
            sequence_no: machine.sequence_no ?? 0,
            total,
            scanned,
            pending,
            all_scanned: total > 0 && scanned >= total,
          };
        }),
      );

      // ── Panels: total and fully scanned ───────────────────────────────────
      const firstMachine = machines[0];
      const lastMachine = machines[machines.length - 1];

      const total_panels = firstMachine
        ? await prisma.cutListMachineMapping.count({
            where: {
              project_id: project.id,
              vendor_id,
              machine_id: firstMachine.id,
              expected_in: true,
            },
          })
        : 0;

      const panels_scanned = lastMachine
        ? (scannedPerMachine.get(lastMachine.id) ?? 0)
        : 0;

      return {
        project_id: project.id,
        project_name: project.project_name,
        project_status: project.project_status,
        track_trace_status: project.track_trace_status,
        created_at: project.created_at.toISOString(),
        panels_scanned,
        total_panels,
        machines: machineStatuses.filter(Boolean),
      };
    };

    const allStatuses = await Promise.all(projects.map(buildProjectStatus));

    // ── 4. Split into active vs archived ───────────────────────────────────
    const activeStatuses = ["Initiated", "Started"];
    const active = allStatuses.filter((p) =>
      activeStatuses.includes(p.project_status),
    );
    const archived = allStatuses.filter(
      (p) => !activeStatuses.includes(p.project_status),
    );

    return validationResponse(1, "", {
      active,
      archived,
      active_count: active.length,
      archived_count: archived.length,
    });
  } catch (error) {
    console.error("Error in getTraceTraceDashboard", error);
    return validationResponse(0, "Something went wrong");
  }
};

export const getTraceTraceDashboard = async (vendor_id: number) => {
  try {
    // ── 1. Fetch projects and machines in parallel ─────────────────────────
    const [projects, machines] = await Promise.all([
      prisma.projectMaster.findMany({
        where: {
          vendor_id,
          isDeleted: false,
          NOT: [
            { project_status: { equals: "Deactivated", mode: "insensitive" } },
            { project_status: { equals: "Deleted", mode: "insensitive" } },
            { project_status: { equals: "Deactive", mode: "insensitive" } },
            { project_status: { equals: "Inactive", mode: "insensitive" } },
          ],
        },
        select: {
          id: true,
          project_name: true,
          project_status: true,
          track_trace_status: true,
          created_at: true,
        },
        orderBy: { created_at: "desc" },
      }),

      prisma.machineMaster.findMany({
        where: {
          vendor_id,
          status: "ACTIVE",
          scan_type: { not: "PASS" },
        },
        select: {
          id: true,
          machine_name: true,
          sequence_no: true,
          machine_type_id: true,
        },
        orderBy: { sequence_no: "asc" },
      }),
    ]);

    const projectIds = projects.map((p) => p.id);

    if (projectIds.length === 0) {
      return validationResponse(1, "", {
        active: [],
        archived: [],
        active_count: 0,
        archived_count: 0,
      });
    }

    // ── 2. Fetch all mappings ONCE ─────────────────────────────────────────
    const mappings = machines.length
      ? await prisma.cutListMachineMapping.findMany({
          where: {
            vendor_id,
            project_id: { in: projectIds },
            expected_in: true,
          },
          select: {
            id: true,
            project_id: true,
            machine_id: true,
            cut_list_id: true,
            sequence_no: true,
            actual_in_at: true,
          },
        })
      : [];

    type Mapping = (typeof mappings)[number];

    type MachineStatus = {
      machine_id: number;
      machine_name: string;
      sequence_no: number;
      total: number;
      scanned: number;
      pending: number;
      all_scanned: boolean;
    };

    const projectMachineKey = (projectId: number, machineId: number) =>
      `${projectId}:${machineId}`;

    const projectCutListKey = (
      projectId: number,
      cutListId: Mapping["cut_list_id"],
    ) => `${projectId}:${String(cutListId)}`;

    const pushToMap = <T>(map: Map<string, T[]>, key: string, value: T) => {
      const existing = map.get(key);
      if (existing) {
        existing.push(value);
      } else {
        map.set(key, [value]);
      }
    };

    // ── 3. Group mappings in memory ────────────────────────────────────────
    const rowsByProjectMachine = new Map<string, Mapping[]>();
    const rowsByProjectCutList = new Map<string, Mapping[]>();
    const assignedCountByProjectMachine = new Map<string, number>();
    const scannedCountByProjectMachine = new Map<string, number>();

    for (const row of mappings) {
      const pmKey = projectMachineKey(row.project_id, row.machine_id);
      const pcKey = projectCutListKey(row.project_id, row.cut_list_id);

      pushToMap(rowsByProjectMachine, pmKey, row);
      pushToMap(rowsByProjectCutList, pcKey, row);

      assignedCountByProjectMachine.set(
        pmKey,
        (assignedCountByProjectMachine.get(pmKey) ?? 0) + 1,
      );

      if (row.actual_in_at !== null) {
        scannedCountByProjectMachine.set(
          pmKey,
          (scannedCountByProjectMachine.get(pmKey) ?? 0) + 1,
        );
      }
    }

    // Sort each cut_list flow by sequence number once
    for (const rows of rowsByProjectCutList.values()) {
      rows.sort((a, b) => (a.sequence_no ?? 0) - (b.sequence_no ?? 0));
    }

    const getLastPriorRow = (
      projectId: number,
      cutListId: Mapping["cut_list_id"],
      currentSequenceNo: number,
    ) => {
      const rows = rowsByProjectCutList.get(
        projectCutListKey(projectId, cutListId),
      );

      if (!rows || rows.length === 0) return null;

      // Rows are already sorted ASC, so scan from end
      for (let i = rows.length - 1; i >= 0; i--) {
        const rowSequenceNo = rows[i].sequence_no ?? 0;

        if (rowSequenceNo < currentSequenceNo) {
          return rows[i];
        }
      }

      return null;
    };

    // ── 4. Build dashboard without DB calls inside loops ───────────────────
    const buildProjectStatus = (project: (typeof projects)[number]) => {
      const machineStatuses: MachineStatus[] = machines
        .map((machine, index): MachineStatus | null => {
          const pmKey = projectMachineKey(project.id, machine.id);

          const rowsAtMachine = rowsByProjectMachine.get(pmKey) ?? [];
          const assigned = rowsAtMachine.length;

          if (assigned === 0) return null;

          const scanned = scannedCountByProjectMachine.get(pmKey) ?? 0;

          const machineSequenceNo = machine.sequence_no ?? 0;
          const isQCStation =
            machine.machine_type_id === 17 || machine.machine_type_id === 18;

          let total = 0;

          if (index === 0) {
            // First machine: all assigned rows are eligible
            total = assigned;
          } else {
            let eligible = 0;

            for (const row of rowsAtMachine) {
              const lastPriorRow = getLastPriorRow(
                project.id,
                row.cut_list_id,
                machineSequenceNo,
              );

              if (isQCStation) {
                // QC rule:
                // 1. If prior machine exists, previous machine must be scanned
                // 2. If no prior machine exists, QC-only item is eligible
                if (!lastPriorRow || lastPriorRow.actual_in_at !== null) {
                  eligible++;
                }
              } else {
                // Normal machine rule:
                // Previous assigned machine must exist and be scanned
                if (lastPriorRow?.actual_in_at !== null) {
                  eligible++;
                }
              }
            }

            total = eligible;
          }

          const pending = Math.max(0, total - scanned);

          return {
            machine_id: machine.id,
            machine_name: machine.machine_name,
            sequence_no: machine.sequence_no ?? 0,
            total,
            scanned,
            pending,
            all_scanned: total > 0 && scanned >= total,
          };
        })
        .filter((status): status is MachineStatus => status !== null);

      const firstMachine = machines[0];
      const lastMachine = machines[machines.length - 1];

      const total_panels = firstMachine
        ? (assignedCountByProjectMachine.get(
            projectMachineKey(project.id, firstMachine.id),
          ) ?? 0)
        : 0;

      const panels_scanned = lastMachine
        ? (scannedCountByProjectMachine.get(
            projectMachineKey(project.id, lastMachine.id),
          ) ?? 0)
        : 0;

      return {
        project_id: project.id,
        project_name: project.project_name,
        project_status: project.project_status,
        track_trace_status: project.track_trace_status,
        created_at: project.created_at.toISOString(),
        panels_scanned,
        total_panels,
        machines: machineStatuses,
      };
    };

    const allStatuses = projects.map(buildProjectStatus);

    // ── 5. Split active and archived ───────────────────────────────────────
    const activeStatuses = new Set(["Initiated", "Started"]);

    const active = allStatuses.filter((p) =>
      activeStatuses.has(p.project_status ?? ""),
    );

    const archived = allStatuses.filter(
      (p) => !activeStatuses.has(p.project_status ?? ""),
    );

    return validationResponse(1, "", {
      active,
      archived,
      active_count: active.length,
      archived_count: archived.length,
    });
  } catch (error) {
    console.error("Error in getTraceTraceDashboard", error);
    return validationResponse(0, "Something went wrong");
  }
};

export const getProjectCategories = async (vendor_id: number) => {
  try {
    const categories = await prisma.projectCategoriesMaster.findMany({
      where: { vendor_id },
      orderBy: { category_name: "asc" },
      select: {
        id: true,
        category_name: true,
        parent_id: true,
        parent: {
          select: { id: true, category_name: true },
        },
        status: true,
        prefix: true,
        namingStructure: {
          select: {
            id: true,
            delimiter: true,
            fields_json: true,
          },
        },
        created_at: true,
        include_in_packing: true,
        scan_pack_validate: true,
        use_in_assembled_packing: true,
        projectCategoriesMasterVendorMapping: {
          select: {
            id: true,
            project_categories_type_master_id: true,
            projectCategoriesTypeMaster: {
              select: { id: true, module_name: true },
            },
          },
        },
      },
    });

    return validationResponse(1, "", { categories });
  } catch (error) {
    console.error("Error in getProjectCategories", error);
    return validationResponse(0, "Something went wrong");
  }
};

// ─── Get all type masters ─────────────────────────────────────────────────────
export const getProjectCategoryTypes = async () => {
  try {
    const types = await prisma.projectCategoriesTypeMaster.findMany({
      orderBy: { module_name: "asc" },
      select: { id: true, module_name: true },
    });

    return validationResponse(1, "", { types });
  } catch (error) {
    console.error("Error in getProjectCategoryTypes", error);
    return validationResponse(0, "Something went wrong");
  }
};

// ─── Create category + assign type mappings ───────────────────────────────────
export const createProjectCategory = async (
  vendor_id: number,
  category_name: string,
  type_ids: number[],
  created_by: number,
  parent_id?: number | null,
  include_in_packing: boolean = false,
  scan_pack_validate: boolean = false,
  use_in_assembled_packing: boolean = false,
  prefix?: string | null,
  naming_structure?: { delimiter?: string; fields: string[] } | null,
) => {
  try {
    const finalScanPackValidate = Boolean(scan_pack_validate);
    const finalIncludeInPacking = finalScanPackValidate
      ? true
      : Boolean(include_in_packing);

    const result = await prisma.$transaction(async (tx) => {
      const category = await tx.projectCategoriesMaster.create({
        data: {
          category_name,
          prefix: prefix ? prefix.trim().toUpperCase() : null,
          vendor_id,
          status: "Yes",
          parent_id: parent_id ? Number(parent_id) : null,
          created_by,
          updated_by: created_by,
          include_in_packing: finalIncludeInPacking,
          scan_pack_validate: finalScanPackValidate,
          use_in_assembled_packing: Boolean(use_in_assembled_packing),
        },
      });

      if (type_ids.length > 0) {
        await tx.projectCategoriesMasterVendorMapping.createMany({
          data: type_ids.map((type_id) => ({
            project_categories_master_id: category.id,
            project_categories_type_master_id: type_id,
            vendor_id,
            created_by,
            updated_by: created_by,
          })),
        });
      }

      if (naming_structure && Array.isArray(naming_structure.fields)) {
        await tx.categoryNamingStructure.upsert({
          where: { category_id: category.id },
          create: {
            vendor_id,
            category_id: category.id,
            delimiter: naming_structure.delimiter || "_",
            fields_json: naming_structure.fields,
          },
          update: {
            delimiter: naming_structure.delimiter || "_",
            fields_json: naming_structure.fields,
          },
        });
      }

      return category;
    });

    return validationResponse(1, "Category created successfully", {
      id: result.id,
    });
  } catch (error) {
    console.error("Error in createProjectCategory", error);
    return validationResponse(0, "Something went wrong");
  }
};

// ─── Update category name, status, and type mappings ─────────────────────────
export const updateProjectCategory = async (
  id: number,
  vendor_id: number,
  category_name: string,
  status: "Yes" | "No",
  type_ids: number[],
  updated_by: number,
  parent_id?: number | null,
  include_in_packing?: boolean,
  scan_pack_validate?: boolean,
  use_in_assembled_packing?: boolean,
  prefix?: string | null,
  naming_structure?: { delimiter?: string; fields: string[] } | null,
) => {
  try {
    await prisma.$transaction(async (tx) => {
      const updateData: any = {
        category_name,
        status,
        parent_id: parent_id ? Number(parent_id) : null,
        updated_by,
      };

      if (prefix !== undefined) {
        updateData.prefix = prefix ? prefix.trim().toUpperCase() : null;
      }
      if (include_in_packing !== undefined) {
        updateData.include_in_packing = Boolean(include_in_packing);
      }
      if (scan_pack_validate !== undefined) {
        updateData.scan_pack_validate = Boolean(scan_pack_validate);
      }
      // Rule: If scan_pack_validate is true, include_in_packing MUST be true
      if (updateData.scan_pack_validate === true) {
        updateData.include_in_packing = true;
      }
      if (use_in_assembled_packing !== undefined) {
        updateData.use_in_assembled_packing = Boolean(use_in_assembled_packing);
      }

      await tx.projectCategoriesMaster.update({
        where: { id },
        data: updateData,
      });

      // Delete existing mappings and re-insert (clean replace)
      await tx.projectCategoriesMasterVendorMapping.deleteMany({
        where: { project_categories_master_id: id },
      });

      if (type_ids.length > 0) {
        await tx.projectCategoriesMasterVendorMapping.createMany({
          data: type_ids.map((type_id) => ({
            project_categories_master_id: id,
            project_categories_type_master_id: type_id,
            vendor_id,
            created_by: updated_by,
            updated_by,
          })),
        });
      }

      if (naming_structure && Array.isArray(naming_structure.fields)) {
        await tx.categoryNamingStructure.upsert({
          where: { category_id: id },
          create: {
            vendor_id,
            category_id: id,
            delimiter: naming_structure.delimiter || "_",
            fields_json: naming_structure.fields,
          },
          update: {
            delimiter: naming_structure.delimiter || "_",
            fields_json: naming_structure.fields,
          },
        });
      }
    });

    return validationResponse(1, "Category updated successfully");
  } catch (error) {
    console.error("Error in updateProjectCategory", error);
    return validationResponse(0, "Something went wrong");
  }
};

// ─── Toggle status ────────────────────────────────────────────────────────────
export const toggleProjectCategoryStatus = async (
  id: number,
  status: "Yes" | "No",
) => {
  try {
    await prisma.projectCategoriesMaster.update({
      where: { id },
      data: { status },
    });

    return validationResponse(
      1,
      `Category ${status === "Yes" ? "activated" : "deactivated"} successfully`,
    );
  } catch (error) {
    console.error("Error in toggleProjectCategoryStatus", error);
    return validationResponse(0, "Something went wrong");
  }
};

// ─── Brand Master Services ───────────────────────────────────────────────────
export const getBrandMasters = async (vendor_id: number) => {
  try {
    const brands = await prisma.brandMaster.findMany({
      where: { vendor_id },
      orderBy: { brand_name: "asc" },
    });
    return validationResponse(1, "Brands fetched", { brands });
  } catch (error) {
    console.error("Error in getBrandMasters", error);
    return validationResponse(0, "Failed to fetch brands");
  }
};

export const createBrandMaster = async (
  vendor_id: number,
  brand_name: string,
  brand_short_name?: string | null,
  logo?: string | null,
  created_by?: number | null,
) => {
  try {
    const brand = await prisma.brandMaster.create({
      data: {
        vendor_id,
        brand_name: brand_name.trim(),
        brand_short_name: brand_short_name?.trim() || null,
        logo: logo?.trim() || null,
        is_active: true,
        active: "Yes",
        created_by,
        updated_by: created_by,
      },
    });
    return validationResponse(1, "Brand created successfully", brand);
  } catch (error) {
    console.error("Error in createBrandMaster", error);
    return validationResponse(0, "Failed to create brand");
  }
};

export const updateBrandMaster = async (
  id: number,
  vendor_id: number,
  brand_name: string,
  brand_short_name?: string | null,
  logo?: string | null,
  is_active?: boolean,
  updated_by?: number | null,
) => {
  try {
    const brand = await prisma.brandMaster.update({
      where: { id },
      data: {
        brand_name: brand_name.trim(),
        brand_short_name: brand_short_name?.trim() || null,
        logo: logo?.trim() || null,
        is_active: is_active ?? true,
        active: (is_active ?? true) ? "Yes" : "No",
        updated_by,
      },
    });
    return validationResponse(1, "Brand updated successfully", brand);
  } catch (error) {
    console.error("Error in updateBrandMaster", error);
    return validationResponse(0, "Failed to update brand");
  }
};

export const toggleBrandMasterStatus = async (
  id: number,
  is_active: boolean,
) => {
  try {
    await prisma.brandMaster.update({
      where: { id },
      data: {
        is_active,
        active: is_active ? "Yes" : "No",
      },
    });
    return validationResponse(
      1,
      `Brand ${is_active ? "activated" : "deactivated"} successfully`,
    );
  } catch (error) {
    console.error("Error in toggleBrandMasterStatus", error);
    return validationResponse(0, "Failed to toggle brand status");
  }
};

export const deleteBrandMaster = async (id: number, vendor_id: number) => {
  try {
    await prisma.brandMaster.delete({
      where: { id },
    });
    return validationResponse(1, "Brand deleted successfully");
  } catch (error) {
    console.error("Error in deleteBrandMaster", error);
    return validationResponse(0, "Failed to delete brand");
  }
};

// ─── Grade Master Services ────────────────────────────────────────────────────
export const getGradeMasters = async (vendor_id: number) => {
  try {
    const grades = await prisma.gradeMaster.findMany({
      where: { vendor_id },
      orderBy: { grade_name: "asc" },
    });
    return validationResponse(1, "Grades fetched", { grades });
  } catch (error) {
    console.error("Error in getGradeMasters", error);
    return validationResponse(0, "Failed to fetch grades");
  }
};

export const createGradeMaster = async (
  vendor_id: number,
  grade_name: string,
  created_by?: number | null,
) => {
  try {
    const grade = await prisma.gradeMaster.create({
      data: {
        vendor_id,
        grade_name: grade_name.trim(),
        is_active: true,
        created_by,
        updated_by: created_by,
      },
    });
    return validationResponse(1, "Grade created successfully", grade);
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Grade name already exists");
    console.error("Error in createGradeMaster", error);
    return validationResponse(0, "Failed to create grade");
  }
};

export const updateGradeMaster = async (
  id: number,
  grade_name: string,
  updated_by?: number | null,
) => {
  try {
    const grade = await prisma.gradeMaster.update({
      where: { id },
      data: { grade_name: grade_name.trim(), updated_by },
    });
    return validationResponse(1, "Grade updated successfully", grade);
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Grade name already exists");
    console.error("Error in updateGradeMaster", error);
    return validationResponse(0, "Failed to update grade");
  }
};

export const toggleGradeMasterStatus = async (
  id: number,
  is_active: boolean,
) => {
  try {
    await prisma.gradeMaster.update({ where: { id }, data: { is_active } });
    return validationResponse(
      1,
      `Grade ${is_active ? "activated" : "deactivated"} successfully`,
    );
  } catch (error) {
    console.error("Error in toggleGradeMasterStatus", error);
    return validationResponse(0, "Failed to toggle grade status");
  }
};

export const deleteGradeMaster = async (id: number) => {
  try {
    await prisma.gradeMaster.delete({ where: { id } });
    return validationResponse(1, "Grade deleted successfully");
  } catch (error) {
    console.error("Error in deleteGradeMaster", error);
    return validationResponse(0, "Failed to delete grade");
  }
};

// ─── Finish Master Services ───────────────────────────────────────────────────
export const getFinishMasters = async (vendor_id: number) => {
  try {
    const finishes = await prisma.finishMaster.findMany({
      where: { vendor_id },
      orderBy: { finish_name: "asc" },
    });
    return validationResponse(1, "Finishes fetched", { finishes });
  } catch (error) {
    console.error("Error in getFinishMasters", error);
    return validationResponse(0, "Failed to fetch finishes");
  }
};

export const createFinishMaster = async (
  vendor_id: number,
  finish_name: string,
  created_by?: number | null,
) => {
  try {
    const finish = await prisma.finishMaster.create({
      data: {
        vendor_id,
        finish_name: finish_name.trim(),
        is_active: true,
        created_by,
        updated_by: created_by,
      },
    });
    return validationResponse(1, "Finish created successfully", finish);
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Finish name already exists");
    console.error("Error in createFinishMaster", error);
    return validationResponse(0, "Failed to create finish");
  }
};

export const updateFinishMaster = async (
  id: number,
  finish_name: string,
  updated_by?: number | null,
) => {
  try {
    const finish = await prisma.finishMaster.update({
      where: { id },
      data: { finish_name: finish_name.trim(), updated_by },
    });
    return validationResponse(1, "Finish updated successfully", finish);
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Finish name already exists");
    console.error("Error in updateFinishMaster", error);
    return validationResponse(0, "Failed to update finish");
  }
};

export const toggleFinishMasterStatus = async (
  id: number,
  is_active: boolean,
) => {
  try {
    await prisma.finishMaster.update({ where: { id }, data: { is_active } });
    return validationResponse(
      1,
      `Finish ${is_active ? "activated" : "deactivated"} successfully`,
    );
  } catch (error) {
    console.error("Error in toggleFinishMasterStatus", error);
    return validationResponse(0, "Failed to toggle finish status");
  }
};

export const deleteFinishMaster = async (id: number) => {
  try {
    await prisma.finishMaster.delete({ where: { id } });
    return validationResponse(1, "Finish deleted successfully");
  } catch (error) {
    console.error("Error in deleteFinishMaster", error);
    return validationResponse(0, "Failed to delete finish");
  }
};

// ─── Type Master Services ─────────────────────────────────────────────────────
export const getTypeMasters = async (vendor_id: number) => {
  try {
    const types = await prisma.typeMaster.findMany({
      where: { vendor_id },
      orderBy: { type_name: "asc" },
    });
    return validationResponse(1, "Types fetched", { types });
  } catch (error) {
    console.error("Error in getTypeMasters", error);
    return validationResponse(0, "Failed to fetch types");
  }
};

export const createTypeMaster = async (
  vendor_id: number,
  type_name: string,
  created_by?: number | null,
) => {
  try {
    const type = await prisma.typeMaster.create({
      data: {
        vendor_id,
        type_name: type_name.trim(),
        is_active: true,
        created_by,
        updated_by: created_by,
      },
    });
    return validationResponse(1, "Type created successfully", type);
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Type name already exists");
    console.error("Error in createTypeMaster", error);
    return validationResponse(0, "Failed to create type");
  }
};

export const updateTypeMaster = async (
  id: number,
  type_name: string,
  updated_by?: number | null,
) => {
  try {
    const type = await prisma.typeMaster.update({
      where: { id },
      data: { type_name: type_name.trim(), updated_by },
    });
    return validationResponse(1, "Type updated successfully", type);
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Type name already exists");
    console.error("Error in updateTypeMaster", error);
    return validationResponse(0, "Failed to update type");
  }
};

export const toggleTypeMasterStatus = async (
  id: number,
  is_active: boolean,
) => {
  try {
    await prisma.typeMaster.update({ where: { id }, data: { is_active } });
    return validationResponse(
      1,
      `Type ${is_active ? "activated" : "deactivated"} successfully`,
    );
  } catch (error) {
    console.error("Error in toggleTypeMasterStatus", error);
    return validationResponse(0, "Failed to toggle type status");
  }
};

export const deleteTypeMaster = async (id: number) => {
  try {
    await prisma.typeMaster.delete({ where: { id } });
    return validationResponse(1, "Type deleted successfully");
  } catch (error) {
    console.error("Error in deleteTypeMaster", error);
    return validationResponse(0, "Failed to delete type");
  }
};

// ─── Core Product Master Services ──────────────────────────────────────────────
export const getCoreProductMasters = async (vendor_id: number) => {
  try {
    const coreProducts = await prisma.coreProductMaster.findMany({
      where: { vendor_id },
      orderBy: { core_product_name: "asc" },
    });
    return validationResponse(1, "Core Products fetched", { coreProducts });
  } catch (error) {
    console.error("Error in getCoreProductMasters", error);
    return validationResponse(0, "Failed to fetch core products");
  }
};

export const createCoreProductMaster = async (
  vendor_id: number,
  core_product_name: string,
  created_by?: number | null,
) => {
  try {
    const coreProduct = await prisma.coreProductMaster.create({
      data: {
        vendor_id,
        core_product_name: core_product_name.trim(),
        is_active: true,
        created_by,
        updated_by: created_by,
      },
    });
    return validationResponse(
      1,
      "Core Product created successfully",
      coreProduct,
    );
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Core Product name already exists");
    console.error("Error in createCoreProductMaster", error);
    return validationResponse(0, "Failed to create core product");
  }
};

export const updateCoreProductMaster = async (
  id: number,
  core_product_name: string,
  updated_by?: number | null,
) => {
  try {
    const coreProduct = await prisma.coreProductMaster.update({
      where: { id },
      data: { core_product_name: core_product_name.trim(), updated_by },
    });
    return validationResponse(
      1,
      "Core Product updated successfully",
      coreProduct,
    );
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Core Product name already exists");
    console.error("Error in updateCoreProductMaster", error);
    return validationResponse(0, "Failed to update core product");
  }
};

export const toggleCoreProductMasterStatus = async (
  id: number,
  is_active: boolean,
) => {
  try {
    await prisma.coreProductMaster.update({
      where: { id },
      data: { is_active },
    });
    return validationResponse(
      1,
      `Core Product ${is_active ? "activated" : "deactivated"} successfully`,
    );
  } catch (error) {
    console.error("Error in toggleCoreProductMasterStatus", error);
    return validationResponse(0, "Failed to toggle core product status");
  }
};

export const deleteCoreProductMaster = async (id: number) => {
  try {
    await prisma.coreProductMaster.delete({ where: { id } });
    return validationResponse(1, "Core Product deleted successfully");
  } catch (error) {
    console.error("Error in deleteCoreProductMaster", error);
    return validationResponse(0, "Failed to delete core product");
  }
};

export const unsetBoxFromMappingService = async (
  mapping_id: number,
  project_id: number,
  vendor_id: number,
) => {
  try {
    // ── 1. Find the mapping row scoped to project + vendor ───────────────────
    const mapping = await prisma.cutListMachineMapping.findFirst({
      where: {
        id: mapping_id,
        project_id,
        vendor_id,
      },
      select: {
        id: true,
        box_id: true,
      },
    });

    if (!mapping) return validationResponse(0, "Mapping not found");
    if (!mapping.box_id)
      return validationResponse(0, "Item is not assigned to any box");

    // ── 2. Get project_details_id from the box ───────────────────────────────
    const box = await prisma.boxMaster.findFirst({
      where: {
        id: mapping.box_id,
        project_id,
        vendor_id,
        is_deleted: false,
      },
      select: { project_details_id: true },
    });

    if (!box) return validationResponse(0, "Box not found");

    // ── 3 & 4. Atomic transaction: unset box + update ProjectDetails ─────────
    await prisma.$transaction([
      prisma.cutListMachineMapping.update({
        where: { id: mapping_id },
        data: {
          box_id: null,
          actual_in_at: null,
          in_operator: null,
        },
      }),
      prisma.projectDetails.update({
        where: { id: box.project_details_id },
        data: {
          total_packed: { decrement: 1 },
          total_unpacked: { increment: 1 },
        },
      }),
    ]);

    return validationResponse(1, "Item removed from box successfully", {
      mapping_id,
      project_details_id: box.project_details_id,
    });
  } catch (error) {
    console.error("Error in unsetBoxFromMappingService:", error);
    return validationResponse(0, "Failed to remove item from box");
  }
};

export const markBoxFactoryOutService = async (
  box_id: number,
  project_id: number,
  vendor_id: number,
  user_id: number,
) => {
  try {
    const box = await prisma.boxMaster.findFirst({
      where: { id: box_id, project_id, vendor_id, is_deleted: false },
      select: { id: true, box_status: true, factory_out_at: true },
    });

    if (!box) return validationResponse(0, "Box not found");
    if (box.box_status !== "packed")
      return validationResponse(
        0,
        "Only packed boxes can be marked as factory out",
      );
    if (box.factory_out_at)
      return validationResponse(0, "Box already marked as factory out");

    const updated = await prisma.boxMaster.update({
      where: { id: box_id },
      data: {
        factory_out_at: new Date(),
        factory_out_by: user_id,
      },
      select: {
        id: true,
        box_name: true,
        factory_out_at: true,
        factory_out_by: true,
      },
    });

    return validationResponse(
      1,
      "Box marked as factory out successfully",
      updated,
    );
  } catch (error) {
    console.error("Error in markBoxFactoryOutService:", error);
    return validationResponse(0, "Failed to mark factory out");
  }
};

// ── Mark site_in_at on a box ──────────────────────────────────────────────────
export const markBoxSiteInService = async (
  box_id: number,
  project_id: number,
  vendor_id: number,
  user_id: number,
) => {
  try {
    const box = await prisma.boxMaster.findFirst({
      where: { id: box_id, project_id, vendor_id, is_deleted: false },
      select: {
        id: true,
        box_status: true,
        factory_out_at: true,
        site_in_at: true,
      },
    });

    if (!box) return validationResponse(0, "Box not found");
    if (box.box_status !== "packed")
      return validationResponse(
        0,
        "Only packed boxes can be marked as site in",
      );
    if (!box.factory_out_at)
      return validationResponse(
        0,
        "Box has not been marked as factory out yet",
      );
    if (box.site_in_at)
      return validationResponse(0, "Box already marked as site in");

    const updated = await prisma.boxMaster.update({
      where: { id: box_id },
      data: {
        site_in_at: new Date(),
        site_in_by: user_id,
      },
      select: { id: true, box_name: true, site_in_at: true, site_in_by: true },
    });

    return validationResponse(1, "Box marked as site in successfully", updated);
  } catch (error) {
    console.error("Error in markBoxSiteInService:", error);
    return validationResponse(0, "Failed to mark site in");
  }
};

const CADBID_API_URL = process.env.CADBID_URL + "/api/category/get-ct";
const CADBID_PLATFORM_ID = 1;

export const syncCategoriesFromExternalService = async (vendor_id: number) => {
  try {
    // ── 1. Check ExternalPlatformToken for this vendor ───────────────────────
    const tokenRecord = await prisma.externalPlatformToken.findFirst({
      where: {
        vendor_id,
        external_platform_id: CADBID_PLATFORM_ID,
        active: "Yes",
      },
      select: { id: true, token: true },
    });

    console.log("tokenRecord.token:", tokenRecord?.token);
    if (!tokenRecord) {
      return validationResponse(
        0,
        "No active token found for this vendor. Please connect your CadBid account first.",
      );
    }

    // ── 2. Call CadBid API ───────────────────────────────────────────────────
    let externalCategories: { nItemCategoryId: number; sName: string }[] = [];

    try {
      const response = await axios.get(CADBID_API_URL, {
        headers: {
          Authorization: `Bearer ${tokenRecord.token}`,
        },
        timeout: 15000,
      });

      // externalCategories = Array.isArray(response.data.categories) ? response.data : [];
      externalCategories = Array.isArray(response.data?.categories)
        ? response.data.categories
        : [];

      console.log("externalCategories count:", externalCategories.length);
    } catch (apiErr: any) {
      console.error(
        "CadBid API error:",
        apiErr?.response?.data ?? apiErr.message,
      );
      return validationResponse(
        0,
        "Failed to fetch categories from CadBid. Please check your token.",
      );
    }

    if (externalCategories.length === 0) {
      return validationResponse(0, "No categories returned from CadBid");
    }

    // ── 3. Upsert into ProjectCategoriesMaster ───────────────────────────────
    // Upsert key: external_category_id + vendor_id
    // ProjectCategoriesMaster has no unique constraint on those two fields,
    // so we do a manual find-then-create-or-update.

    let created = 0;
    let updated = 0;

    for (const cat of externalCategories) {
      const { nItemCategoryId, sName } = cat;
      if (!nItemCategoryId || !sName) continue;

      const existing = await prisma.projectCategoriesMaster.findFirst({
        where: {
          external_category_id: nItemCategoryId,
          vendor_id,
        },
        select: { id: true, category_name: true },
      });

      if (existing) {
        // Update name if changed
        if (existing.category_name !== sName) {
          await prisma.projectCategoriesMaster.update({
            where: { id: existing.id },
            data: { category_name: sName },
          });
          updated++;
        }
      } else {
        await prisma.projectCategoriesMaster.create({
          data: {
            vendor_id,
            category_name: sName,
            external_category_id: nItemCategoryId,
            status: "Yes",
          },
        });
        created++;
      }
    }

    return validationResponse(
      1,
      `Sync complete. ${created} created, ${updated} updated.`,
      {
        total: externalCategories.length,
        created,
        updated,
        skipped: externalCategories.length - created - updated,
      },
    );
  } catch (error) {
    console.error("Error in syncCategoriesFromExternalService:", error);
    return validationResponse(0, "Sync failed");
  }
};

// ── Check if vendor has an active token ──────────────────────────────────────
export const checkExternalTokenService = async (vendor_id: number) => {
  try {
    const token = await prisma.externalPlatformToken.findFirst({
      where: {
        vendor_id,
        external_platform_id: CADBID_PLATFORM_ID,
        active: "Yes",
      },
      select: { id: true, name: true, email: true, created_at: true },
    });

    return validationResponse(1, "Token status fetched", {
      has_token: !!token,
      token,
    });
  } catch (error) {
    console.error("Error in checkExternalTokenService:", error);
    return validationResponse(0, "Failed to check token");
  }
};

export const getProjectDetailService_old = async (
  vendor_id: number,
  unique_project_id: string,
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | Resolve unique_project_id → project_id
    |--------------------------------------------------------------------------
    */

    const projectLookup = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id,
        vendor_id,
      },

      select: {
        id: true,
      },
    });

    if (!projectLookup) {
      return validationResponse(0, "Project not found");
    }

    const project_id = projectLookup.id;

    /*
    |--------------------------------------------------------------------------
    | 1. Project + lead info
    |--------------------------------------------------------------------------
    */

    const project = await prisma.projectMaster.findFirst({
      where: {
        id: project_id,
        vendor_id,
      },

      select: {
        id: true,
        project_name: true,
        project_status: true,
        track_trace_status: true,
        lead_id: true,

        details: {
          select: {
            id: true,
            total_items: true,
            total_packed: true,
            total_unpacked: true,
            estimated_completion_date: true,
            start_date: true,
            room_name: true,
          },

          take: 1,
        },
      },
    });

    if (!project) {
      return validationResponse(0, "Project not found");
    }

    /*
    |--------------------------------------------------------------------------
    | Lead info
    |--------------------------------------------------------------------------
    */

    let lead: {
      firstname: string;
      contact_no: string;
      email: string | null;
      site_address: string | null;
    } | null = null;

    if (project.lead_id) {
      lead = await prisma.leadMaster.findUnique({
        where: {
          id: project.lead_id,
        },

        select: {
          firstname: true,
          contact_no: true,
          email: true,
          site_address: true,
        },
      });
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Boxes with dynamic BoxInfoFieldValue
    |--------------------------------------------------------------------------
    */

    const boxes = await prisma.boxMaster.findMany({
      where: {
        project_id,
        vendor_id,
        is_deleted: false,
      },

      select: {
        id: true,
        box_name: true,
        box_status: true,
        factory_out_at: true,
        factory_out_by: true,
        site_in_at: true,
        site_in_by: true,

        box_info_values: {
          select: {
            id: true,
            field_id: true,
            field_value: true,

            field: {
              select: {
                id: true,
                field_label: true,
                field_key: true,
                field_type: true,
                is_required: true,
                sort_order: true,
                active: true,
              },
            },
          },
        },
      },

      orderBy: {
        id: "asc",
      },
    });

    /*
    |--------------------------------------------------------------------------
    | Box item counts
    |--------------------------------------------------------------------------
    */

    const boxIds = boxes.map((box) => box.id);

    const boxItemStats =
      boxIds.length > 0
        ? await prisma.cutListMachineMapping.groupBy({
            by: ["box_id"],
            where: {
              box_id: {
                in: boxIds,
              },
              project_id,
              vendor_id,
              expected_in: true,
            },
            _count: {
              id: true,
            },
            _sum: {
              weight: true,
            },
          })
        : [];

    const boxMappingsForWeight =
      boxIds.length > 0
        ? await prisma.cutListMachineMapping.findMany({
            where: {
              box_id: { in: boxIds },
              project_id,
              vendor_id,
              expected_in: true,
            },
            select: {
              box_id: true,
              qty: true,
              weight: true,
              cut_list: {
                select: {
                  qty: true,
                  weight: true,
                  length: true,
                  width: true,
                  thickness: true,
                },
              },
            },
          })
        : [];

    const boxItemCountMap = new Map<number, number>();
    const boxWeightMap = new Map<number, number>();

    for (const stat of boxItemStats) {
      if (!stat.box_id) {
        continue;
      }
      boxItemCountMap.set(Number(stat.box_id), Number(stat._count.id || 0));
    }

    for (const mapping of boxMappingsForWeight) {
      if (!mapping.box_id) continue;
      const bId = Number(mapping.box_id);

      const qty = Number(mapping.qty ?? 1);
      const mappedWeight = Number(mapping.weight || 0);
      const cutListTotalWeight = Number(mapping.cut_list?.weight || 0);
      const cutListTotalQty = Number(mapping.cut_list?.qty || 1);

      let itemWeight = mappedWeight > 0 ? mappedWeight : 0;
      if (itemWeight === 0 && cutListTotalWeight > 0) {
        itemWeight = (cutListTotalWeight / cutListTotalQty) * qty;
      }

      if (itemWeight === 0 && mapping.cut_list) {
        const l = Number(mapping.cut_list.length || 0);
        const w = Number(mapping.cut_list.width || 0);
        const t = Number(mapping.cut_list.thickness || 0);
        if (l > 0 && w > 0 && t > 0) {
          itemWeight = l * w * t * 0.00000075 * qty;
        }
      }

      const currentWeight = boxWeightMap.get(bId) || 0;
      boxWeightMap.set(bId, currentWeight + itemWeight);
    }

    const boxNameMap = new Map(boxes.map((box) => [box.id, box.box_name]));

    /*
    |--------------------------------------------------------------------------
    | Operator name lookup for Factory Out / Site In
    |--------------------------------------------------------------------------
    */

    const operatorIds = [
      ...new Set([
        ...boxes.map((box) => box.factory_out_by).filter(Boolean),

        ...boxes.map((box) => box.site_in_by).filter(Boolean),
      ]),
    ] as number[];

    const operators =
      operatorIds.length > 0
        ? await prisma.userMaster.findMany({
            where: {
              id: {
                in: operatorIds,
              },
            },

            select: {
              id: true,
              user_name: true,
            },
          })
        : [];

    const operatorMap = new Map(
      operators.map((user) => [user.id, user.user_name]),
    );

    /*
    |--------------------------------------------------------------------------
    | 3. Machines
    |--------------------------------------------------------------------------
    */

    const distinctMachines = await prisma.cutListMachineMapping.findMany({
      where: {
        project_id,
        vendor_id,
        expected_in: true,
      },

      distinct: ["machine_id"],

      select: {
        machine_id: true,
        sequence_no: true,

        machine: {
          select: {
            id: true,
            machine_name: true,
            sequence_no: true,

            machineType: {
              select: {
                machine_type: true,
              },
            },
          },
        },
      },
    });

    const machineStats = await Promise.all(
      distinctMachines.map(async (machineRow) => {
        const [total, scanned] = await Promise.all([
          prisma.cutListMachineMapping.count({
            where: {
              project_id,
              vendor_id,
              machine_id: machineRow.machine_id,
              expected_in: true,
            },
          }),

          prisma.cutListMachineMapping.count({
            where: {
              project_id,
              vendor_id,
              machine_id: machineRow.machine_id,
              expected_in: true,
              actual_in_at: {
                not: null,
              },
            },
          }),
        ]);

        return {
          machine_id: machineRow.machine_id,

          machine_name: machineRow.machine.machine_name,

          machine_type: machineRow.machine.machineType?.machine_type ?? null,

          sequence_no:
            machineRow.sequence_no ?? machineRow.machine.sequence_no ?? 0,

          total,

          scanned,

          pending: total - scanned,

          pct: total > 0 ? Math.round((scanned / total) * 100) : 0,
        };
      }),
    );

    /*
    |--------------------------------------------------------------------------
    | 4. Cut list — one row per panel unit
    |--------------------------------------------------------------------------
    */

    const allMappings = await prisma.cutListMachineMapping.findMany({
      where: {
        project_id,
        vendor_id,
        expected_in: true,
      },

      select: {
        id: true,
        cut_list_id: true,
        machine_id: true,
        sequence_no: true,
        actual_in_at: true,
        box_id: true,
        in_operator: true,
        weight: true,

        machine: {
          select: {
            id: true,
            machine_name: true,
          },
        },

        cut_list: {
          select: {
            id: true,
            item_name: true,
            unique_code: true,
            description: true,
            qty: true,
            category_name: true,
            group_name: true,
            length: true,
            width: true,
            thickness: true,
            weight: true,
          },
        },
      },

      orderBy: [
        {
          cut_list_id: "asc",
        },
        {
          machine_id: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

    /*
    |--------------------------------------------------------------------------
    | Operator lookup for cut list scan operators
    |--------------------------------------------------------------------------
    */

    const allInOperatorIds = [
      ...new Set(
        allMappings.map((mapping) => mapping.in_operator).filter(Boolean),
      ),
    ] as number[];

    const allOperators =
      allInOperatorIds.length > 0
        ? await prisma.userMaster.findMany({
            where: {
              id: {
                in: allInOperatorIds,
              },
            },

            select: {
              id: true,
              user_name: true,
            },
          })
        : [];

    const allOperatorMap = new Map(
      allOperators.map((user) => [user.id, user.user_name]),
    );

    /*
    |--------------------------------------------------------------------------
    | Group cut list mappings by item
    |--------------------------------------------------------------------------
    */

    const cutlistByItem = new Map<number, typeof allMappings>();

    for (const mapping of allMappings) {
      if (!cutlistByItem.has(mapping.cut_list_id)) {
        cutlistByItem.set(mapping.cut_list_id, []);
      }

      cutlistByItem.get(mapping.cut_list_id)!.push(mapping);
    }

    /*
    |--------------------------------------------------------------------------
    | Build unit rows
    |--------------------------------------------------------------------------
    */

    const unitRows: {
      row_number: number;
      cut_list_id: number;
      item_name: string;
      unique_code: string | null;
      description: string;
      qty: number;
      unit_index: number;
      category: string | null;
      group: string | null;
      length: any;
      width: any;
      thickness: any;
      weight: number;
      package_box_id: number | null;
      package_box_name: string | null;
      machines: {
        mapping_id: number;
        machine_id: number;
        machine_name: string;
        sequence_no: number;
        box_id: number | null;
        weight: number;
        scanned: boolean;
        scanned_at: Date | null;
        scanned_by: string | null;
      }[];
    }[] = [];

    let rowNumber = 1;

    for (const [cut_list_id, rows] of cutlistByItem) {
      const cutList = rows[0].cut_list;

      const byMachine = new Map<number, typeof rows>();

      for (const row of rows) {
        if (!byMachine.has(row.machine_id)) {
          byMachine.set(row.machine_id, []);
        }

        byMachine.get(row.machine_id)!.push(row);
      }

      const unitCount = Math.max(
        ...[...byMachine.values()].map((machineRows) => machineRows.length),
      );

      for (let unitIndex = 0; unitIndex < unitCount; unitIndex++) {
        const machineColumns = [];

        for (const [, machineRows] of byMachine) {
          const row = machineRows[unitIndex];

          if (!row) {
            continue;
          }

          machineColumns.push({
            mapping_id: row.id,

            machine_id: row.machine_id,

            machine_name: row.machine.machine_name,

            sequence_no: row.sequence_no,

            box_id: row.box_id,

            weight: Number(row.weight || 0),

            scanned: row.actual_in_at !== null,

            scanned_at: row.actual_in_at,

            scanned_by: row.in_operator
              ? (allOperatorMap.get(row.in_operator) ?? null)
              : null,
          });
        }

        const packageBoxId =
          machineColumns.find((machineColumn) => machineColumn.box_id)
            ?.box_id ?? null;

        const packageBoxName = packageBoxId
          ? (boxNameMap.get(packageBoxId) ?? null)
          : null;

        const mappedWeight =
          machineColumns.find(
            (machineColumn) => Number(machineColumn.weight || 0) > 0,
          )?.weight ?? 0;

        const fallbackWeight =
          Number(cutList.weight || 0) > 0 && Number(cutList.qty || 0) > 0
            ? Number(cutList.weight || 0) / Number(cutList.qty || 1)
            : 0;

        const unitWeight = Number(
          Number(mappedWeight || fallbackWeight || 0).toFixed(4),
        );

        unitRows.push({
          row_number: rowNumber++,

          cut_list_id,

          item_name: cutList.item_name,

          unique_code: cutList.unique_code,

          description: cutList.description,

          qty: cutList.qty,

          unit_index: unitIndex + 1,

          category: cutList.category_name,

          group: cutList.group_name,

          length: cutList.length,

          width: cutList.width,

          thickness: cutList.thickness,

          weight: unitWeight,

          package_box_id: packageBoxId,

          package_box_name: packageBoxName,

          machines: machineColumns,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 5. Stats
    |--------------------------------------------------------------------------
    */

    const totalPanels = unitRows.length;

    const uniqueItems = cutlistByItem.size;

    const sortedMachineStats = machineStats.sort((a, b) => {
      return Number(a.sequence_no || 0) - Number(b.sequence_no || 0);
    });

    const totalBoxWeight = Array.from(boxWeightMap.values()).reduce(
      (total, weight) => total + Number(weight || 0),
      0,
    );

    /*
    |--------------------------------------------------------------------------
    | Format boxes with box_info_values
    |--------------------------------------------------------------------------
    */

    const formattedBoxes = boxes.map((box) => {
      const boxInfoValues = box.box_info_values
        .filter((item) => item.field && item.field.active)
        .sort(
          (a, b) =>
            Number(a.field.sort_order || 0) - Number(b.field.sort_order || 0),
        )
        .map((item) => ({
          id: item.id,

          field_id: item.field_id,

          field_label: item.field.field_label,

          field_key: item.field.field_key,

          field_type: item.field.field_type,

          is_required: item.field.is_required,

          sort_order: item.field.sort_order,

          field_value: item.field_value || "",
        }));

      return {
        id: box.id,

        box_name: box.box_name,

        box_status: box.box_status,

        items_count: boxItemCountMap.get(box.id) || 0,

        total_weight: Number((boxWeightMap.get(box.id) || 0).toFixed(4)),

        factory_out_at: box.factory_out_at,

        factory_out_by: box.factory_out_by
          ? (operatorMap.get(box.factory_out_by) ?? null)
          : null,

        site_in_at: box.site_in_at,

        site_in_by: box.site_in_by
          ? (operatorMap.get(box.site_in_by) ?? null)
          : null,

        box_info_values: boxInfoValues,
      };
    });

    /*
    |--------------------------------------------------------------------------
    | Final response
    |--------------------------------------------------------------------------
    */

    return validationResponse(1, "Project detail fetched", {
      project: {
        id: project.id,

        project_name: project.project_name,

        project_status: project.project_status,

        track_trace_status: project.track_trace_status,

        lead_id: project.lead_id,

        lead: lead
          ? {
              lead_name: lead.firstname,

              lead_phone: lead.contact_no,

              lead_email: lead.email,

              lead_address: lead.site_address,
            }
          : null,

        details: project.details[0] ?? null,
      },

      stats: {
        total_panels: totalPanels,

        total_items: uniqueItems,

        total_boxes: boxes.length,

        packed_boxes: boxes.filter((box) => box.box_status === "packed").length,

        unpacked_boxes: boxes.filter((box) => box.box_status === "unpacked")
          .length,

        total_weight: Number(totalBoxWeight.toFixed(4)),
      },

      machines: sortedMachineStats,

      boxes: formattedBoxes,

      cutlist: unitRows,
    });
  } catch (error) {
    console.error("getProjectDetailService error:", error);

    return validationResponse(0, "Failed to fetch project detail");
  }
};

export interface GetProjectDetailOptions {
  search?: string;
  group?: string;
  category?: string;
  machine_id?: string;
  box_id?: string;
  box_status?: string;
  page?: number | string;
  limit?: number | string;
}

export const getProjectDetailService = async (
  vendor_id: number,
  unique_project_id: string,
  options: GetProjectDetailOptions = {}
) => {
  try {
    const { search, group, category, machine_id, box_id, box_status } = options;
    /*
    |--------------------------------------------------------------------------
    | Resolve unique_project_id → project_id
    |--------------------------------------------------------------------------
    */

    const projectLookup = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id,
        vendor_id,
      },
      select: {
        id: true,
      },
    });

    if (!projectLookup) {
      return validationResponse(0, "Project not found");
    }

    const project_id = projectLookup.id;

    /*
    |--------------------------------------------------------------------------
    | 1. Project + lead info
    |--------------------------------------------------------------------------
    */

    const project = await prisma.projectMaster.findFirst({
      where: {
        id: project_id,
        vendor_id,
      },
      select: {
        id: true,
        project_name: true,
        project_status: true,
        track_trace_status: true,
        lead_id: true,

        details: {
          select: {
            id: true,
            total_items: true,
            total_packed: true,
            total_unpacked: true,
            estimated_completion_date: true,
            start_date: true,
            room_name: true,
          },
          take: 1,
        },
      },
    });

    if (!project) {
      return validationResponse(0, "Project not found");
    }

    /*
    |--------------------------------------------------------------------------
    | Lead info
    |--------------------------------------------------------------------------
    */

    let lead: {
      firstname: string;
      contact_no: string;
      email: string | null;
      site_address: string | null;
    } | null = null;

    if (project.lead_id) {
      lead = await prisma.leadMaster.findUnique({
        where: {
          id: project.lead_id,
        },
        select: {
          firstname: true,
          contact_no: true,
          email: true,
          site_address: true,
        },
      });
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Packaging machine + manual CutList items
    |--------------------------------------------------------------------------
    |
    | Manual packing:
    | include_in_packing = true
    | scan_pack_validate = false
    |
    | These CutList rows may have NO CutListMachineMapping until user manually
    | adds quantity into a box. Therefore CutList.qty is the source of truth
    | for total quantity.
    |--------------------------------------------------------------------------
    */

    const [packagingMachine, manualCutListItems] = await Promise.all([
      prisma.machineMaster.findFirst({
        where: {
          vendor_id,
          machine_type_id: 18,
        },
        select: {
          id: true,
          machine_name: true,
          sequence_no: true,
          machineType: {
            select: {
              machine_type: true,
            },
          },
        },
        orderBy: {
          id: "asc",
        },
      }),

      prisma.cutList.findMany({
        where: {
          project_id,
          vendor_id,
          include_in_packing: true,
          scan_pack_validate: false,
          status: "Active",
        },
        select: {
          id: true,
          project_id: true,
          item_name: true,
          unique_code: true,
          description: true,
          qty: true,
          category_name: true,
          group_name: true,
          length: true,
          width: true,
          thickness: true,
          weight: true,
        },
        orderBy: {
          id: "asc",
        },
      }),
    ]);

    const manualCutListIds = new Set<number>(
      manualCutListItems.map((item) => item.id),
    );

    const manualCutListQtyMap = new Map<number, number>(
      manualCutListItems.map((item) => [
        item.id,
        Math.max(0, Number(item.qty || 0)),
      ]),
    );

    /*
    |--------------------------------------------------------------------------
    | 3. Boxes with dynamic BoxInfoFieldValue (filtered by options)
    |--------------------------------------------------------------------------
    */

    let filteredBoxIds: number[] | null = null;

    if (
      (group && group !== "all") ||
      (category && category !== "all") ||
      (machine_id && machine_id !== "all")
    ) {
      const cutListWhere: any = {
        project_id,
        vendor_id,
      };

      if (group && group !== "all") {
        cutListWhere.group_name = { equals: group, mode: "insensitive" };
      }
      if (category && category !== "all") {
        cutListWhere.category_name = { equals: category, mode: "insensitive" };
      }

      if (machine_id && machine_id !== "all") {
        const parsedMachineId = Number(machine_id);
        if (!isNaN(parsedMachineId)) {
          cutListWhere.cutListMachineMapping = {
            some: {
              machine_id: parsedMachineId,
            },
          };
        }
      }

      const matchingCutLists = await prisma.cutList.findMany({
        where: cutListWhere,
        select: { id: true, unique_code: true },
      });

      const matchingCutListIds = matchingCutLists.map((c) => c.id);
      const matchingUniqueCodes = matchingCutLists
        .map((c) => c.unique_code)
        .filter((code): code is string => Boolean(code));

      if (matchingCutListIds.length === 0) {
        filteredBoxIds = [];
      } else {
        const [matchingBoxMappings, matchingScanItems] = await Promise.all([
          prisma.cutListMachineMapping.findMany({
            where: {
              project_id,
              vendor_id,
              cut_list_id: { in: matchingCutListIds },
              box_id: { not: null },
            },
            select: { box_id: true },
            distinct: ["box_id"],
          }),
          matchingUniqueCodes.length > 0
            ? prisma.scanAndPackItem.findMany({
                where: {
                  project_id,
                  vendor_id,
                  unique_id: { in: matchingUniqueCodes },
                  is_deleted: false,
                },
                select: { box_id: true },
                distinct: ["box_id"],
              })
            : Promise.resolve([]),
        ]);

        const boxIdSet = new Set<number>();
        matchingBoxMappings.forEach((m) => {
          if (m.box_id) boxIdSet.add(m.box_id);
        });
        matchingScanItems.forEach((s) => {
          if (s.box_id) boxIdSet.add(s.box_id);
        });

        filteredBoxIds = Array.from(boxIdSet);
      }
    }

    const whereBox: any = {
      project_id,
      vendor_id,
      is_deleted: false,
    };

    if (filteredBoxIds !== null) {
      whereBox.id = { in: filteredBoxIds };
    }

    if (box_id && box_id !== "all") {
      const parsedBoxId = Number(box_id);
      if (!isNaN(parsedBoxId)) {
        whereBox.id = parsedBoxId;
      }
    }

    if (box_status && box_status !== "all") {
      if (box_status === "packed") {
        whereBox.box_status = "packed";
      } else if (box_status === "unpacked") {
        whereBox.box_status = { not: "packed" };
      } else if (box_status === "factory_out") {
        whereBox.factory_out_at = { not: null };
      } else if (box_status === "site_in") {
        whereBox.site_in_at = { not: null };
      }
    }

    if (search) {
      whereBox.AND = [
        {
          OR: [
            { box_name: { contains: search, mode: "insensitive" } },
            { box_status: { contains: search, mode: "insensitive" } },
            {
              box_info_values: {
                some: {
                  field_value: { contains: search, mode: "insensitive" },
                },
              },
            },
          ],
        },
      ];
    }

    const boxes = await prisma.boxMaster.findMany({
      where: whereBox,
      select: {
        id: true,
        box_name: true,
        box_status: true,
        factory_out_at: true,
        factory_out_by: true,
        site_in_at: true,
        site_in_by: true,

        box_info_values: {
          select: {
            id: true,
            field_id: true,
            field_value: true,

            field: {
              select: {
                id: true,
                field_label: true,
                field_key: true,
                field_type: true,
                is_required: true,
                sort_order: true,
                active: true,
              },
            },
          },
        },
      },
      orderBy: {
        id: "asc",
      },
    });

    /*
    |--------------------------------------------------------------------------
    | Box item count + weight
    |--------------------------------------------------------------------------
    |
    | Old:
    |   COUNT(mapping rows)
    |
    | New:
    |   SUM(mapping.qty)
    |
    | Normal scanned row => qty = 1
    | Manual row         => qty can be > 1
    |
    | Mapping weight is per-item weight, therefore total box weight is:
    |   mapping.weight * mapping.qty
    |--------------------------------------------------------------------------
    */

    const boxIds = boxes.map((box) => box.id);

    const boxPackingRows =
      packagingMachine && boxIds.length > 0
        ? await prisma.cutListMachineMapping.findMany({
            where: {
              box_id: {
                in: boxIds,
              },
              project_id,
              vendor_id,
              machine_id: packagingMachine.id,
              expected_in: true,
              actual_in_at: {
                not: null,
              },
            },
            select: {
              box_id: true,
              qty: true,
              weight: true,

              /*
              |--------------------------------------------------------------------------
              | Site receipt fields
              |--------------------------------------------------------------------------
              |
              | Normal scan-packed row:
              |   site_in_at != null => full mapping.qty is received.
              |
              | Manual packed row:
              |   received_qty stores actual physical quantity received.
              |--------------------------------------------------------------------------
              */
              site_in_at: true,
              received_qty: true,
              row_created_source: true,
            },
          })
        : [];

    const boxItemCountMap = new Map<number, number>();

    const boxWeightMap = new Map<number, number>();

    /*
    |--------------------------------------------------------------------------
    | Site receipt maps
    |--------------------------------------------------------------------------
    */

    const boxReceivedQtyMap = new Map<number, number>();

    const boxScannedPackedQtyMap = new Map<number, number>();

    const boxScannedReceivedQtyMap = new Map<number, number>();

    const boxManualPackedQtyMap = new Map<number, number>();

    const boxManualReceivedQtyMap = new Map<number, number>();

    for (const row of boxPackingRows) {
      if (!row.box_id) {
        continue;
      }

      const boxId = Number(row.box_id);

      const rowQty = Math.max(0, Number(row.qty ?? 1));

      const perItemWeight = Number(row.weight || 0);

      const isManual =
        String(row.row_created_source ?? "")
          .trim()
          .toLowerCase() === "manual";

      /*
      |--------------------------------------------------------------------------
      | Normal/scanned item receipt
      |--------------------------------------------------------------------------
      |
      | Existing scanner flow marks site_in_at on the mapping row.
      | One normal row is normally qty=1, but using rowQty keeps it qty-safe.
      |--------------------------------------------------------------------------
      */

      const scannedReceivedQty = !isManual && row.site_in_at ? rowQty : 0;

      /*
      |--------------------------------------------------------------------------
      | Manual item receipt
      |--------------------------------------------------------------------------
      |
      | received_qty is nullable:
      |
      | null => not verified yet
      | 0    => explicitly verified as zero received
      | N    => actual received qty
      |
      | Clamp it to row.qty so bad historical data cannot over-count.
      |--------------------------------------------------------------------------
      */

      const manualReceivedQty = isManual
        ? Math.min(rowQty, Math.max(0, Number(row.received_qty ?? 0)))
        : 0;

      const rowReceivedQty = scannedReceivedQty + manualReceivedQty;

      boxItemCountMap.set(boxId, (boxItemCountMap.get(boxId) ?? 0) + rowQty);

      boxWeightMap.set(
        boxId,
        (boxWeightMap.get(boxId) ?? 0) + perItemWeight * rowQty,
      );

      boxReceivedQtyMap.set(
        boxId,
        (boxReceivedQtyMap.get(boxId) ?? 0) + rowReceivedQty,
      );

      if (isManual) {
        boxManualPackedQtyMap.set(
          boxId,
          (boxManualPackedQtyMap.get(boxId) ?? 0) + rowQty,
        );

        boxManualReceivedQtyMap.set(
          boxId,
          (boxManualReceivedQtyMap.get(boxId) ?? 0) + manualReceivedQty,
        );
      } else {
        boxScannedPackedQtyMap.set(
          boxId,
          (boxScannedPackedQtyMap.get(boxId) ?? 0) + rowQty,
        );

        boxScannedReceivedQtyMap.set(
          boxId,
          (boxScannedReceivedQtyMap.get(boxId) ?? 0) + scannedReceivedQty,
        );
      }
    }

    const boxNameMap = new Map(boxes.map((box) => [box.id, box.box_name]));

    /*
    |--------------------------------------------------------------------------
    | Operator name lookup for Factory Out / Site In
    |--------------------------------------------------------------------------
    */

    const operatorIds = [
      ...new Set([
        ...boxes.map((box) => box.factory_out_by).filter(Boolean),

        ...boxes.map((box) => box.site_in_by).filter(Boolean),
      ]),
    ] as number[];

    const operators =
      operatorIds.length > 0
        ? await prisma.userMaster.findMany({
            where: {
              id: {
                in: operatorIds,
              },
            },
            select: {
              id: true,
              user_name: true,
            },
          })
        : [];

    const operatorMap = new Map(
      operators.map((user) => [user.id, user.user_name]),
    );

    /*
    |--------------------------------------------------------------------------
    | 4. Machines
    |--------------------------------------------------------------------------
    */

    const distinctMachines = await prisma.cutListMachineMapping.findMany({
      where: {
        project_id,
        vendor_id,
        expected_in: true,
      },
      distinct: ["machine_id"],
      select: {
        machine_id: true,
        sequence_no: true,

        machine: {
          select: {
            id: true,
            machine_name: true,
            sequence_no: true,

            machineType: {
              select: {
                machine_type: true,
              },
            },
          },
        },
      },
    });

    /*
    |--------------------------------------------------------------------------
    | Normalize machine list
    |--------------------------------------------------------------------------
    |
    | If project contains only manual packing items there may not be any
    | machine-18 mapping yet. Still include Packaging machine so progress can
    | show total / packed / pending correctly.
    |--------------------------------------------------------------------------
    */

    const normalizedMachines = distinctMachines.map((row) => ({
      machine_id: row.machine_id,
      machine_name: row.machine.machine_name,
      machine_type: row.machine.machineType?.machine_type ?? null,
      sequence_no: row.sequence_no ?? row.machine.sequence_no ?? 0,
    }));

    if (
      packagingMachine &&
      manualCutListItems.length > 0 &&
      !normalizedMachines.some(
        (machine) => Number(machine.machine_id) === Number(packagingMachine.id),
      )
    ) {
      normalizedMachines.push({
        machine_id: packagingMachine.id,
        machine_name: packagingMachine.machine_name,
        machine_type: packagingMachine.machineType?.machine_type ?? null,
        sequence_no: packagingMachine.sequence_no ?? 0,
      });
    }

    /*
    |--------------------------------------------------------------------------
    | Machine stats using SUM(qty)
    |--------------------------------------------------------------------------
    */

    const machineStats = await Promise.all(
      normalizedMachines.map(async (machineRow) => {
        const mappingRows = await prisma.cutListMachineMapping.findMany({
          where: {
            project_id,
            vendor_id,
            machine_id: machineRow.machine_id,
            expected_in: true,
          },
          select: {
            cut_list_id: true,
            qty: true,
            box_id: true,
            actual_in_at: true,
            row_created_source: true,
          },
        });

        const isPackagingMachine =
          packagingMachine &&
          Number(machineRow.machine_id) === Number(packagingMachine.id);

        let total = 0;
        let scanned = 0;

        if (isPackagingMachine) {
          /*
          |--------------------------------------------------------------------------
          | Normal scan-pack rows
          |--------------------------------------------------------------------------
          */

          const normalRows = mappingRows.filter(
            (row) => !manualCutListIds.has(row.cut_list_id),
          );

          total += normalRows.reduce(
            (sum, row) => sum + Math.max(0, Number(row.qty ?? 1)),
            0,
          );

          scanned += normalRows.reduce((sum, row) => {
            if (!row.actual_in_at) {
              return sum;
            }

            return sum + Math.max(0, Number(row.qty ?? 1));
          }, 0);

          /*
          |--------------------------------------------------------------------------
          | Manual packing totals
          |--------------------------------------------------------------------------
          |
          | total   => CutList.qty
          | scanned => SUM(manual mapping qty), capped by CutList.qty
          |--------------------------------------------------------------------------
          */

          for (const manualItem of manualCutListItems) {
            const itemTotal = Math.max(0, Number(manualItem.qty || 0));

            total += itemTotal;

            const itemPacked = mappingRows
              .filter(
                (row) =>
                  row.cut_list_id === manualItem.id &&
                  row.row_created_source?.trim().toLowerCase() === "manual" &&
                  row.box_id !== null &&
                  row.actual_in_at !== null,
              )
              .reduce((sum, row) => sum + Math.max(0, Number(row.qty ?? 0)), 0);

            scanned += Math.min(itemPacked, itemTotal);
          }
        } else {
          /*
          |--------------------------------------------------------------------------
          | Other machines
          |--------------------------------------------------------------------------
          |
          | Existing rows are normally qty=1, but SUM(qty) makes this compatible
          | with quantity-based mappings too.
          |--------------------------------------------------------------------------
          */

          total = mappingRows.reduce(
            (sum, row) => sum + Math.max(0, Number(row.qty ?? 1)),
            0,
          );

          scanned = mappingRows.reduce((sum, row) => {
            if (!row.actual_in_at) {
              return sum;
            }

            return sum + Math.max(0, Number(row.qty ?? 1));
          }, 0);
        }

        scanned = Math.min(scanned, total);

        const pending = Math.max(total - scanned, 0);

        return {
          machine_id: machineRow.machine_id,

          machine_name: machineRow.machine_name,

          machine_type: machineRow.machine_type,

          sequence_no: machineRow.sequence_no,

          total,

          scanned,

          pending,

          pct: total > 0 ? Math.round((scanned / total) * 100) : 0,
        };
      }),
    );

    /*
    |--------------------------------------------------------------------------
    | 5. Fetch all mappings for cut list display
    |--------------------------------------------------------------------------
    */

    const allMappings = await prisma.cutListMachineMapping.findMany({
      where: {
        project_id,
        vendor_id,
        expected_in: true,
      },
      select: {
        id: true,
        cut_list_id: true,
        machine_id: true,
        sequence_no: true,
        actual_in_at: true,
        box_id: true,
        in_operator: true,
        weight: true,
        qty: true,
        row_created_source: true,

        machine: {
          select: {
            id: true,
            machine_name: true,
          },
        },

        cut_list: {
          select: {
            id: true,
            item_name: true,
            unique_code: true,
            description: true,
            qty: true,
            category_name: true,
            group_name: true,
            length: true,
            width: true,
            thickness: true,
            weight: true,
          },
        },
      },
      orderBy: [
        {
          cut_list_id: "asc",
        },
        {
          machine_id: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

    /*
    |--------------------------------------------------------------------------
    | Operator lookup for cut list scan operators
    |--------------------------------------------------------------------------
    */

    const allInOperatorIds = [
      ...new Set(
        allMappings.map((mapping) => mapping.in_operator).filter(Boolean),
      ),
    ] as number[];

    const allOperators =
      allInOperatorIds.length > 0
        ? await prisma.userMaster.findMany({
            where: {
              id: {
                in: allInOperatorIds,
              },
            },
            select: {
              id: true,
              user_name: true,
            },
          })
        : [];

    const allOperatorMap = new Map(
      allOperators.map((user) => [user.id, user.user_name]),
    );

    /*
    |--------------------------------------------------------------------------
    | Unit row response type
    |--------------------------------------------------------------------------
    */

    type MachineColumn = {
      mapping_id: number;
      machine_id: number;
      machine_name: string;
      sequence_no: number;
      box_id: number | null;
      weight: number;
      qty: number;
      row_created_source: string | null;
      scanned: boolean;
      scanned_at: Date | null;
      scanned_by: string | null;
    };

    const unitRows: {
      row_number: number;
      cut_list_id: number;
      item_name: string;
      unique_code: string | null;
      description: string;
      qty: number;
      total_qty: number;
      unit_index: number;
      category: string | null;
      group: string | null;
      length: any;
      width: any;
      thickness: any;
      weight: number;
      package_box_id: number | null;
      package_box_name: string | null;
      machines: MachineColumn[];
    }[] = [];

    let rowNumber = 1;

    /*
    |--------------------------------------------------------------------------
    | Helper — expand a mapping row by mapping.qty
    |--------------------------------------------------------------------------
    |
    | Normal:
    |   qty = 1 => one virtual unit
    |
    | Quantity-based row:
    |   qty = 3 => three virtual units
    |--------------------------------------------------------------------------
    */

    const expandRowsByQty = <T extends { qty: number }>(rows: T[]): T[] => {
      const expanded: T[] = [];

      for (const row of rows) {
        const rowQty = Math.max(1, Number(row.qty ?? 1));

        for (let i = 0; i < rowQty; i++) {
          expanded.push(row);
        }
      }

      return expanded;
    };

    /*
    |--------------------------------------------------------------------------
    | 6. NORMAL / SCANNED CutList rows
    |--------------------------------------------------------------------------
    |
    | Manual CutList IDs are excluded here and handled separately below.
    |--------------------------------------------------------------------------
    */

    const normalMappings = allMappings.filter(
      (mapping) => !manualCutListIds.has(mapping.cut_list_id),
    );

    const normalCutlistByItem = new Map<number, typeof normalMappings>();

    for (const mapping of normalMappings) {
      if (!normalCutlistByItem.has(mapping.cut_list_id)) {
        normalCutlistByItem.set(mapping.cut_list_id, []);
      }

      normalCutlistByItem.get(mapping.cut_list_id)!.push(mapping);
    }

    for (const [cut_list_id, rows] of normalCutlistByItem) {
      const cutList = rows[0].cut_list;

      const byMachine = new Map<number, typeof rows>();

      for (const row of rows) {
        if (!byMachine.has(row.machine_id)) {
          byMachine.set(row.machine_id, []);
        }

        byMachine.get(row.machine_id)!.push(row);
      }

      /*
      |--------------------------------------------------------------------------
      | Expand each machine by qty before pairing units
      |--------------------------------------------------------------------------
      */

      const expandedByMachine = new Map<number, typeof rows>();

      for (const [machineId, machineRows] of byMachine) {
        expandedByMachine.set(machineId, expandRowsByQty(machineRows));
      }

      const unitCount = Math.max(
        0,
        ...[...expandedByMachine.values()].map(
          (machineRows) => machineRows.length,
        ),
      );

      for (let unitIndex = 0; unitIndex < unitCount; unitIndex++) {
        const machineColumns: MachineColumn[] = [];

        for (const [, machineRows] of expandedByMachine) {
          const row = machineRows[unitIndex];

          if (!row) {
            continue;
          }

          machineColumns.push({
            mapping_id: row.id,

            machine_id: row.machine_id,

            machine_name: row.machine.machine_name,

            sequence_no: row.sequence_no,

            box_id: row.box_id,

            weight: Number(row.weight || 0),

            qty: 1,

            row_created_source: row.row_created_source,

            scanned: row.actual_in_at !== null,

            scanned_at: row.actual_in_at,

            scanned_by: row.in_operator
              ? (allOperatorMap.get(row.in_operator) ?? null)
              : null,
          });
        }

        const packageBoxId =
          machineColumns.find((machineColumn) => machineColumn.box_id)
            ?.box_id ?? null;

        const packageBoxName = packageBoxId
          ? (boxNameMap.get(packageBoxId) ?? null)
          : null;

        const mappedWeight =
          machineColumns.find(
            (machineColumn) => Number(machineColumn.weight || 0) > 0,
          )?.weight ?? 0;

        const fallbackWeight =
          Number(cutList.weight || 0) > 0 && Number(cutList.qty || 0) > 0
            ? Number(cutList.weight || 0) / Number(cutList.qty || 1)
            : 0;

        const unitWeight = Number(
          Number(mappedWeight || fallbackWeight || 0).toFixed(4),
        );

        unitRows.push({
          row_number: rowNumber++,

          cut_list_id,

          item_name: cutList.item_name,

          unique_code: cutList.unique_code,

          description: cutList.description,

          qty: 1,

          total_qty: Number(cutList.qty || 0),

          unit_index: unitIndex + 1,

          category: cutList.category_name,

          group: cutList.group_name,

          length: cutList.length,

          width: cutList.width,

          thickness: cutList.thickness,

          weight: unitWeight,

          package_box_id: packageBoxId,

          package_box_name: packageBoxName,

          machines: machineColumns,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 7. MANUAL packing CutList rows
    |--------------------------------------------------------------------------
    |
    | Total virtual units come from CutList.qty.
    |
    | Example:
    |   CutList.qty = 10
    |   Box 1 mapping qty = 3
    |   Box 2 mapping qty = 2
    |
    | Result:
    |   10 unit rows
    |   first 3 assigned to Box 1
    |   next 2 assigned to Box 2
    |   remaining 5 pending
    |--------------------------------------------------------------------------
    */

    const allMappingsByCutList = new Map<number, typeof allMappings>();

    for (const mapping of allMappings) {
      if (!allMappingsByCutList.has(mapping.cut_list_id)) {
        allMappingsByCutList.set(mapping.cut_list_id, []);
      }

      allMappingsByCutList.get(mapping.cut_list_id)!.push(mapping);
    }

    for (const cutList of manualCutListItems) {
      const totalQty = Math.max(0, Number(cutList.qty || 0));

      if (totalQty <= 0) {
        continue;
      }

      const itemMappings = allMappingsByCutList.get(cutList.id) ?? [];

      /*
      |--------------------------------------------------------------------------
      | Existing non-packaging machine rows, if any
      |--------------------------------------------------------------------------
      */

      const nonPackagingRows = itemMappings.filter(
        (row) =>
          !packagingMachine ||
          Number(row.machine_id) !== Number(packagingMachine.id),
      );

      const nonPackagingByMachine = new Map<number, typeof nonPackagingRows>();

      for (const row of nonPackagingRows) {
        if (!nonPackagingByMachine.has(row.machine_id)) {
          nonPackagingByMachine.set(row.machine_id, []);
        }

        nonPackagingByMachine.get(row.machine_id)!.push(row);
      }

      const expandedNonPackagingByMachine = new Map<
        number,
        typeof nonPackagingRows
      >();

      for (const [machineId, machineRows] of nonPackagingByMachine) {
        expandedNonPackagingByMachine.set(
          machineId,
          expandRowsByQty(machineRows),
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Expand MANUAL machine-18 rows by qty
      |--------------------------------------------------------------------------
      */

      const manualPackagingRows = itemMappings
        .filter(
          (row) =>
            packagingMachine &&
            Number(row.machine_id) === Number(packagingMachine.id) &&
            row.row_created_source?.trim().toLowerCase() === "manual",
        )
        .sort((a, b) => a.id - b.id);

      const expandedManualPackagingRows = expandRowsByQty(
        manualPackagingRows,
      ).slice(0, totalQty);

      const fallbackWeight =
        Number(cutList.weight || 0) > 0 && totalQty > 0
          ? Number(cutList.weight || 0) / totalQty
          : 0;

      for (let unitIndex = 0; unitIndex < totalQty; unitIndex++) {
        const machineColumns: MachineColumn[] = [];

        /*
        |--------------------------------------------------------------------------
        | Existing prior/non-packaging machines
        |--------------------------------------------------------------------------
        */

        for (const [, machineRows] of expandedNonPackagingByMachine) {
          const row = machineRows[unitIndex];

          if (!row) {
            continue;
          }

          machineColumns.push({
            mapping_id: row.id,

            machine_id: row.machine_id,

            machine_name: row.machine.machine_name,

            sequence_no: row.sequence_no,

            box_id: row.box_id,

            weight: Number(row.weight || 0),

            qty: 1,

            row_created_source: row.row_created_source,

            scanned: row.actual_in_at !== null,

            scanned_at: row.actual_in_at,

            scanned_by: row.in_operator
              ? (allOperatorMap.get(row.in_operator) ?? null)
              : null,
          });
        }

        /*
        |--------------------------------------------------------------------------
        | Manual packaging machine virtual unit
        |--------------------------------------------------------------------------
        */

        const manualPackagingRow = expandedManualPackagingRows[unitIndex];

        if (packagingMachine) {
          if (manualPackagingRow) {
            machineColumns.push({
              mapping_id: manualPackagingRow.id,

              machine_id: packagingMachine.id,

              machine_name: packagingMachine.machine_name,

              sequence_no: packagingMachine.sequence_no ?? 0,

              box_id: manualPackagingRow.box_id,

              weight: Number(manualPackagingRow.weight || fallbackWeight || 0),

              qty: 1,

              row_created_source: manualPackagingRow.row_created_source,

              scanned: manualPackagingRow.actual_in_at !== null,

              scanned_at: manualPackagingRow.actual_in_at,

              scanned_by: manualPackagingRow.in_operator
                ? (allOperatorMap.get(manualPackagingRow.in_operator) ?? null)
                : null,
            });
          } else {
            /*
            |--------------------------------------------------------------------------
            | Synthetic pending row for UI only
            |--------------------------------------------------------------------------
            |
            | mapping_id = 0 means no DB mapping exists yet.
            |--------------------------------------------------------------------------
            */

            machineColumns.push({
              mapping_id: 0,

              machine_id: packagingMachine.id,

              machine_name: packagingMachine.machine_name,

              sequence_no: packagingMachine.sequence_no ?? 0,

              box_id: null,

              weight: Number(fallbackWeight.toFixed(4)),

              qty: 1,

              row_created_source: "Manual",

              scanned: false,

              scanned_at: null,

              scanned_by: null,
            });
          }
        }

        const packageBoxId = manualPackagingRow?.box_id ?? null;

        const packageBoxName = packageBoxId
          ? (boxNameMap.get(packageBoxId) ?? null)
          : null;

        const mappedWeight = manualPackagingRow
          ? Number(manualPackagingRow.weight || 0)
          : 0;

        const unitWeight = Number(
          Number(mappedWeight || fallbackWeight || 0).toFixed(4),
        );

        unitRows.push({
          row_number: rowNumber++,

          cut_list_id: cutList.id,

          item_name: cutList.item_name,

          unique_code: cutList.unique_code,

          description: cutList.description,

          qty: 1,

          total_qty: totalQty,

          unit_index: unitIndex + 1,

          category: cutList.category_name,

          group: cutList.group_name,

          length: cutList.length,

          width: cutList.width,

          thickness: cutList.thickness,

          weight: unitWeight,

          package_box_id: packageBoxId,

          package_box_name: packageBoxName,

          machines: machineColumns,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 8. Stats
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    |
    | unitRows represents PHYSICAL quantity.
    |
    | Normal scanned item:
    |   one mapping qty = 1 -> one virtual unit row
    |
    | Manual item:
    |   CutList.qty = 10 -> ten virtual unit rows
    |   regardless of whether machine-18 mappings exist for all 10 units yet.
    |
    | Therefore unitRows is the safest common source for total / packed /
    | pending quantity statistics in this service.
    |--------------------------------------------------------------------------
    */

    const totalPanels = unitRows.length;

    const uniqueCutListIds = new Set<number>([
      ...normalCutlistByItem.keys(),
      ...manualCutListItems.map((item) => item.id),
    ]);

    const uniqueItems = uniqueCutListIds.size;

    const sortedMachineStats = machineStats.sort(
      (a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0),
    );

    const totalBoxWeight = Array.from(boxWeightMap.values()).reduce(
      (total, weight) => total + Number(weight || 0),
      0,
    );

    /*
    |--------------------------------------------------------------------------
    | 8.1 Packing quantity summary
    |--------------------------------------------------------------------------
    */

    const totalQty = unitRows.reduce(
      (total, row) => total + Math.max(0, Number(row.qty || 1)),
      0,
    );

    const totalPackedQty = unitRows.reduce((total, row) => {
      if (row.package_box_id === null) {
        return total;
      }

      return total + Math.max(0, Number(row.qty || 1));
    }, 0);

    const totalPendingQty = Math.max(totalQty - totalPackedQty, 0);

    const packingProgressPct =
      totalQty > 0
        ? Math.min(100, Math.round((totalPackedQty / totalQty) * 100))
        : 0;

    /*
    |--------------------------------------------------------------------------
    | 8.2 Manual vs scanned packing
    |--------------------------------------------------------------------------
    |
    | A CutList item is treated as manual packing when it belongs to the
    | include_in_packing=true + scan_pack_validate=false flow.
    |--------------------------------------------------------------------------
    */

    const manualPackedQty = unitRows.reduce((total, row) => {
      if (
        row.package_box_id === null ||
        !manualCutListIds.has(row.cut_list_id)
      ) {
        return total;
      }

      return total + Math.max(0, Number(row.qty || 1));
    }, 0);

    const scannedPackedQty = Math.max(totalPackedQty - manualPackedQty, 0);

    const manualPackingPct =
      totalPackedQty > 0
        ? Math.round((manualPackedQty / totalPackedQty) * 100)
        : 0;

    const scannedPackingPct =
      totalPackedQty > 0
        ? Math.round((scannedPackedQty / totalPackedQty) * 100)
        : 0;

    /*
    |--------------------------------------------------------------------------
    | 8.3 Site item receipt / verification statistics
    |--------------------------------------------------------------------------
    |
    | Two different site receipt mechanisms exist:
    |
    | 1. Normal scanned packing
    |    Mapping.site_in_at != null means the mapping qty was received.
    |
    | 2. Manual packing
    |    Mapping.received_qty is the actual physical quantity received.
    |
    | This section combines both flows without treating one manual mapping
    | row as one physical item.
    |--------------------------------------------------------------------------
    */

    const scannedReceivedQty = Array.from(
      boxScannedReceivedQtyMap.values(),
    ).reduce((total, qty) => total + Math.max(0, Number(qty || 0)), 0);

    const manualReceivedQty = Array.from(
      boxManualReceivedQtyMap.values(),
    ).reduce((total, qty) => total + Math.max(0, Number(qty || 0)), 0);

    const totalReceivedQty = Math.min(
      totalPackedQty,
      scannedReceivedQty + manualReceivedQty,
    );

    /*
    |--------------------------------------------------------------------------
    | End-to-end receipt pending
    |--------------------------------------------------------------------------
    |
    | Includes:
    | - packed items whose box has not reached site yet
    | - items at site but not yet verified/received
    |--------------------------------------------------------------------------
    */

    const totalPendingReceiptQty = Math.max(
      totalPackedQty - totalReceivedQty,
      0,
    );

    const itemReceiptProgressPct =
      totalPackedQty > 0
        ? Math.min(100, Math.round((totalReceivedQty / totalPackedQty) * 100))
        : 0;

    const scannedPendingReceiptQty = Math.max(
      scannedPackedQty - scannedReceivedQty,
      0,
    );

    const manualPendingReceiptQty = Math.max(
      manualPackedQty - manualReceivedQty,
      0,
    );

    const scannedReceiptProgressPct =
      scannedPackedQty > 0
        ? Math.min(
            100,
            Math.round((scannedReceivedQty / scannedPackedQty) * 100),
          )
        : 0;

    const manualReceiptProgressPct =
      manualPackedQty > 0
        ? Math.min(100, Math.round((manualReceivedQty / manualPackedQty) * 100))
        : 0;

    /*
    |--------------------------------------------------------------------------
    | Quantity currently eligible for site verification
    |--------------------------------------------------------------------------
    |
    | Only boxes with BoxMaster.site_in_at are considered "at site".
    |--------------------------------------------------------------------------
    */

    const siteInBoxIds = new Set<number>(
      boxes.filter((box) => box.site_in_at !== null).map((box) => box.id),
    );

    const siteInQty = Array.from(siteInBoxIds).reduce(
      (total, boxId) =>
        total + Math.max(0, Number(boxItemCountMap.get(boxId) ?? 0)),
      0,
    );

    const siteInReceivedQty = Array.from(siteInBoxIds).reduce(
      (total, boxId) =>
        total + Math.max(0, Number(boxReceivedQtyMap.get(boxId) ?? 0)),
      0,
    );

    const siteInPendingVerificationQty = Math.max(
      siteInQty - siteInReceivedQty,
      0,
    );

    const siteItemVerificationPct =
      siteInQty > 0
        ? Math.min(100, Math.round((siteInReceivedQty / siteInQty) * 100))
        : 0;

    const notAtSiteQty = Math.max(totalPackedQty - siteInQty, 0);

    /*
    |--------------------------------------------------------------------------
    | Box-level physical receipt status
    |--------------------------------------------------------------------------
    */

    let fullyReceivedBoxes = 0;
    let partiallyReceivedBoxes = 0;
    let notReceivedBoxes = 0;

    for (const box of boxes) {
      const boxQty = Math.max(0, Number(boxItemCountMap.get(box.id) ?? 0));

      if (boxQty <= 0) {
        continue;
      }

      const receivedQty = Math.min(
        boxQty,
        Math.max(0, Number(boxReceivedQtyMap.get(box.id) ?? 0)),
      );

      if (receivedQty >= boxQty) {
        fullyReceivedBoxes++;
      } else if (receivedQty > 0) {
        partiallyReceivedBoxes++;
      } else {
        notReceivedBoxes++;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 8.4 Product packing status
    |--------------------------------------------------------------------------
    |
    | Fully Packed      -> packed qty >= total qty
    | Partially Packed  -> packed qty > 0 and < total qty
    | Not Started       -> packed qty = 0
    |--------------------------------------------------------------------------
    */

    const productPackingMap = new Map<
      number,
      {
        total_qty: number;
        packed_qty: number;
      }
    >();

    for (const row of unitRows) {
      if (!productPackingMap.has(row.cut_list_id)) {
        productPackingMap.set(row.cut_list_id, {
          total_qty: 0,
          packed_qty: 0,
        });
      }

      const productStats = productPackingMap.get(row.cut_list_id)!;

      const rowQty = Math.max(0, Number(row.qty || 1));

      productStats.total_qty += rowQty;

      if (row.package_box_id !== null) {
        productStats.packed_qty += rowQty;
      }
    }

    let fullyPackedProducts = 0;
    let partiallyPackedProducts = 0;
    let notStartedProducts = 0;

    for (const productStats of productPackingMap.values()) {
      if (
        productStats.total_qty > 0 &&
        productStats.packed_qty >= productStats.total_qty
      ) {
        fullyPackedProducts++;
      } else if (productStats.packed_qty > 0) {
        partiallyPackedProducts++;
      } else {
        notStartedProducts++;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 8.5 Box statistics
    |--------------------------------------------------------------------------
    */

    const boxesWithItems = boxes.filter(
      (box) => Number(boxItemCountMap.get(box.id) || 0) > 0,
    ).length;

    const emptyBoxes = Math.max(boxes.length - boxesWithItems, 0);

    const packedBoxes = boxes.filter(
      (box) =>
        String(box.box_status || "")
          .trim()
          .toLowerCase() === "packed",
    ).length;

    const unpackedBoxes = boxes.filter(
      (box) =>
        String(box.box_status || "")
          .trim()
          .toLowerCase() === "unpacked",
    ).length;

    const averageBoxWeight =
      boxesWithItems > 0
        ? Number((totalBoxWeight / boxesWithItems).toFixed(4))
        : 0;

    const averageQtyPerBox =
      boxesWithItems > 0
        ? Number((totalPackedQty / boxesWithItems).toFixed(2))
        : 0;

    /*
    |--------------------------------------------------------------------------
    | 8.6 Dispatch / site statistics
    |--------------------------------------------------------------------------
    */

    const factoryOutBoxes = boxes.filter(
      (box) => box.factory_out_at !== null,
    ).length;

    const siteReceivedBoxes = boxes.filter(
      (box) => box.site_in_at !== null,
    ).length;

    const dispatchProgressPct =
      boxes.length > 0
        ? Math.min(100, Math.round((factoryOutBoxes / boxes.length) * 100))
        : 0;

    const siteReceiptProgressPct =
      boxes.length > 0
        ? Math.min(100, Math.round((siteReceivedBoxes / boxes.length) * 100))
        : 0;

    /*
    |--------------------------------------------------------------------------
    | 8.7 Packaging + overall machine progress
    |--------------------------------------------------------------------------
    */

    const packagingMachineStats = packagingMachine
      ? sortedMachineStats.find(
          (machine) =>
            Number(machine.machine_id) === Number(packagingMachine.id),
        )
      : undefined;

    const pendingAtPackaging = Math.max(
      0,
      Number(packagingMachineStats?.pending || 0),
    );

    const totalMachineQty = sortedMachineStats.reduce(
      (total, machine) => total + Math.max(0, Number(machine.total || 0)),
      0,
    );

    const totalMachineScannedQty = sortedMachineStats.reduce(
      (total, machine) => total + Math.max(0, Number(machine.scanned || 0)),
      0,
    );

    const machineCompletionPct =
      totalMachineQty > 0
        ? Math.min(
            100,
            Math.round((totalMachineScannedQty / totalMachineQty) * 100),
          )
        : 0;

    /*
    |--------------------------------------------------------------------------
    | 9. Format boxes with box_info_values
    |--------------------------------------------------------------------------
    */

    const formattedBoxes = boxes.map((box) => {
      const boxInfoValues = box.box_info_values
        .filter((item) => item.field && item.field.active)
        .sort(
          (a, b) =>
            Number(a.field.sort_order || 0) - Number(b.field.sort_order || 0),
        )
        .map((item) => ({
          id: item.id,

          field_id: item.field_id,

          field_label: item.field.field_label,

          field_key: item.field.field_key,

          field_type: item.field.field_type,

          is_required: item.field.is_required,

          sort_order: item.field.sort_order,

          field_value: item.field_value || "",
        }));

      return {
        id: box.id,

        box_name: box.box_name,

        box_status: box.box_status,

        /*
          |--------------------------------------------------------------------------
          | Actual physical quantity in box
          |--------------------------------------------------------------------------
          */
        items_count: boxItemCountMap.get(box.id) || 0,

        total_weight: Number((boxWeightMap.get(box.id) || 0).toFixed(4)),

        /*
          |--------------------------------------------------------------------------
          | Site item receipt quantities
          |--------------------------------------------------------------------------
          */

        received_qty: Math.min(
          Number(boxItemCountMap.get(box.id) || 0),
          Number(boxReceivedQtyMap.get(box.id) || 0),
        ),

        pending_received_qty: Math.max(
          Number(boxItemCountMap.get(box.id) || 0) -
            Number(boxReceivedQtyMap.get(box.id) || 0),
          0,
        ),

        receipt_progress_pct:
          Number(boxItemCountMap.get(box.id) || 0) > 0
            ? Math.min(
                100,
                Math.round(
                  (Number(boxReceivedQtyMap.get(box.id) || 0) /
                    Number(boxItemCountMap.get(box.id) || 1)) *
                    100,
                ),
              )
            : 0,

        scanned_packed_qty: Number(boxScannedPackedQtyMap.get(box.id) || 0),

        scanned_received_qty: Number(boxScannedReceivedQtyMap.get(box.id) || 0),

        manual_packed_qty: Number(boxManualPackedQtyMap.get(box.id) || 0),

        manual_received_qty: Number(boxManualReceivedQtyMap.get(box.id) || 0),

        factory_out_at: box.factory_out_at,

        factory_out_by: box.factory_out_by
          ? (operatorMap.get(box.factory_out_by) ?? null)
          : null,

        site_in_at: box.site_in_at,

        site_in_by: box.site_in_by
          ? (operatorMap.get(box.site_in_by) ?? null)
          : null,

        box_info_values: boxInfoValues,
      };
    });


    const [allGroupsRes, allCategoriesRes] = await Promise.all([
      prisma.cutList.findMany({
        where: { project_id, vendor_id, status: "Active", group_name: { not: null } },
        select: { group_name: true },
        distinct: ["group_name"],
      }),
      prisma.cutList.findMany({
        where: { project_id, vendor_id, status: "Active", category_name: { not: null } },
        select: { category_name: true },
        distinct: ["category_name"],
      }),
    ]);

    const filterOptions = {
      groups: allGroupsRes.map((r) => r.group_name!).filter(Boolean).sort(),
      categories: allCategoriesRes.map((r) => r.category_name!).filter(Boolean).sort(),
      machines: sortedMachineStats.map((m) => ({ id: m.machine_id, name: m.machine_name })),
    };

    const totalBoxesCount = formattedBoxes.length;
    const currentPage = Math.max(1, Number(options.page || 1));
    const currentLimit = Math.max(1, Number(options.limit || 10));
    const totalPages = Math.ceil(totalBoxesCount / currentLimit) || 1;

    const startIndex = (currentPage - 1) * currentLimit;
    const paginatedBoxes = formattedBoxes.slice(startIndex, startIndex + currentLimit);

    const boxesPagination = {
      total: totalBoxesCount,
      page: currentPage,
      limit: currentLimit,
      total_pages: totalPages,
      has_previous: currentPage > 1,
      has_next: currentPage < totalPages,
      from: totalBoxesCount > 0 ? startIndex + 1 : 0,
      to: Math.min(startIndex + currentLimit, totalBoxesCount),
    };

    return validationResponse(1, "Project detail fetched", {
      project: {
        id: project.id,
        project_name: project.project_name,
        project_status: project.project_status,
        track_trace_status: project.track_trace_status,
        lead_id: project.lead_id,
        lead: lead
          ? {
              lead_name: lead.firstname,
              lead_phone: lead.contact_no,
              lead_email: lead.email,
              lead_address: lead.site_address,
            }
          : null,
        details: project.details[0] ?? null,
      },
      stats: {
        product_types: uniqueItems,
        total_items: uniqueItems,
        total_panels: totalPanels,
        total_qty: totalQty,
        total_packed_qty: totalPackedQty,
        total_pending_qty: totalPendingQty,
        packing_progress_pct: packingProgressPct,
        manual_packed_qty: manualPackedQty,
        scanned_packed_qty: scannedPackedQty,
        manual_packing_pct: manualPackingPct,
        scanned_packing_pct: scannedPackingPct,
        pending_at_packaging: pendingAtPackaging,
        total_received_qty: totalReceivedQty,
        scanned_received_qty: scannedReceivedQty,
        manual_received_qty: manualReceivedQty,
        total_pending_receipt_qty: totalPendingReceiptQty,
        scanned_pending_receipt_qty: scannedPendingReceiptQty,
        manual_pending_receipt_qty: manualPendingReceiptQty,
        item_receipt_progress_pct: itemReceiptProgressPct,
        scanned_receipt_progress_pct: scannedReceiptProgressPct,
        manual_receipt_progress_pct: manualReceiptProgressPct,
        site_in_qty: siteInQty,
        site_in_received_qty: siteInReceivedQty,
        site_in_pending_verification_qty: siteInPendingVerificationQty,
        site_item_verification_pct: siteItemVerificationPct,
        not_at_site_qty: notAtSiteQty,
        fully_received_boxes: fullyReceivedBoxes,
        partially_received_boxes: partiallyReceivedBoxes,
        not_received_boxes: notReceivedBoxes,
        fully_packed_products: fullyPackedProducts,
        partially_packed_products: partiallyPackedProducts,
        not_started_products: notStartedProducts,
        total_boxes: boxes.length,
        boxes_with_items: boxesWithItems,
        empty_boxes: emptyBoxes,
        packed_boxes: packedBoxes,
        unpacked_boxes: unpackedBoxes,
        total_weight: Number(totalBoxWeight.toFixed(4)),
        total_packed_weight: Number(totalBoxWeight.toFixed(4)),
        average_box_weight: averageBoxWeight,
        average_qty_per_box: averageQtyPerBox,
        factory_out_boxes: factoryOutBoxes,
        site_received_boxes: siteReceivedBoxes,
        dispatch_progress_pct: dispatchProgressPct,
        site_receipt_progress_pct: siteReceiptProgressPct,
        machine_completion_pct: machineCompletionPct,
        machine_total_qty: totalMachineQty,
        machine_scanned_qty: totalMachineScannedQty,
      },
      machines: sortedMachineStats,
      boxes: paginatedBoxes,
      boxes_pagination: boxesPagination,
      cutlist: unitRows,
      filterOptions,
    });
  } catch (error) {
    console.error("getProjectDetailService error:", error);

    return validationResponse(0, "Failed to fetch project detail");
  }
};

// ─── GET box items ────────────────────────────────────────────────────────────

export const getBoxItemsService_old = async (
  vendor_id: number,
  unique_project_id: string,
  box_id: number,
) => {
  try {
    const projectLookup = await prisma.projectMaster.findFirst({
      where: { unique_project_id, vendor_id },
      select: { id: true },
    });
    if (!projectLookup) return validationResponse(0, "Project not found");
    const project_id = projectLookup.id;

    const box = await prisma.boxMaster.findFirst({
      where: { id: box_id, project_id, vendor_id, is_deleted: false },
      select: {
        id: true,
        box_name: true,
        box_status: true,
        factory_out_at: true,
        site_in_at: true,
      },
    });

    if (!box) return validationResponse(0, "Box not found");

    const mappings = await prisma.cutListMachineMapping.findMany({
      where: { box_id, project_id, vendor_id, expected_in: true },
      select: {
        id: true,
        machine_id: true,
        actual_in_at: true,
        site_in_at: true,
        weight: true,
        in_operator: true,
        site_in_by: true,
        machine: { select: { machine_name: true } },
        cut_list: {
          select: {
            id: true,
            item_name: true,
            unique_code: true,
            qty: true,
            category_name: true,
            group_name: true,
            length: true,
            width: true,
            thickness: true,
            weight: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const boxTotalWeight = mappings.reduce(
      (total, mapping) => total + Number(mapping.weight || 0),
      0,
    );

    const opIds = [
      ...new Set([
        ...mappings.map((m) => m.in_operator).filter(Boolean),
        ...mappings.map((m) => m.site_in_by).filter(Boolean),
      ]),
    ] as number[];

    const ops =
      opIds.length > 0
        ? await prisma.userMaster.findMany({
            where: { id: { in: opIds } },
            select: { id: true, user_name: true },
          })
        : [];
    const opMap = new Map(ops.map((u) => [u.id, u.user_name]));

    return validationResponse(1, "Box items fetched", {
      box: {
        ...box,
        total_weight: Number(boxTotalWeight.toFixed(4)),
      },
      items: mappings.map((m) => ({
        id: m.id,
        machine: { machine_name: m.machine.machine_name },
        actual_in_at: m.actual_in_at,
        site_in_at: m.site_in_at,
        weight: Number(m.weight || 0),
        scanned_by: m.in_operator ? (opMap.get(m.in_operator) ?? null) : null,
        site_in_by: m.site_in_by ? (opMap.get(m.site_in_by) ?? null) : null,
        inOperator: m.in_operator
          ? {
              id: m.in_operator,
              name: opMap.get(m.in_operator) ?? "",
            }
          : null,
        siteInByUser: m.site_in_by
          ? {
              id: m.site_in_by,
              name: opMap.get(m.site_in_by) ?? "",
            }
          : null,
        cut_list: m.cut_list,
      })),
    });
  } catch (error) {
    console.error("getBoxItemsService error:", error);
    return validationResponse(0, "Failed to fetch box items");
  }
};

/*
|--------------------------------------------------------------------------
| Existing Box Items Service
|--------------------------------------------------------------------------
|
| Keep this endpoint for the Box Items dialog.
|
| The nested `cut_list` object below is item metadata for each box mapping.
| It is NOT the full project Cut List dataset, so it stays here.
|--------------------------------------------------------------------------
*/

export const getBoxItemsService = async (
  vendor_id: number,
  unique_project_id: string,
  box_id: number,
) => {
  try {
    const projectLookup = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id,
        vendor_id,
      },
      select: {
        id: true,
      },
    });

    if (!projectLookup) {
      return validationResponse(0, "Project not found");
    }

    const project_id = projectLookup.id;

    const box = await prisma.boxMaster.findFirst({
      where: {
        id: box_id,
        project_id,
        vendor_id,
        is_deleted: false,
      },
      select: {
        id: true,
        box_name: true,
        box_status: true,
        factory_out_at: true,
        site_in_at: true,
      },
    });

    if (!box) {
      return validationResponse(0, "Box not found");
    }

    const mappings = await prisma.cutListMachineMapping.findMany({
      where: {
        box_id,
        project_id,
        vendor_id,
        expected_in: true,
      },

      select: {
        id: true,
        machine_id: true,
        actual_in_at: true,
        site_in_at: true,
        in_operator: true,
        site_in_by: true,

        qty: true,
        weight: true,
        row_created_source: true,

        machine: {
          select: {
            machine_name: true,
          },
        },

        cut_list: {
          select: {
            id: true,
            item_name: true,
            unique_code: true,
            qty: true,
            category_name: true,
            group_name: true,
            length: true,
            width: true,
            thickness: true,
            weight: true,
          },
        },
      },

      orderBy: {
        id: "asc",
      },
    });

    const opIds = [
      ...new Set([
        ...mappings.map((mapping) => mapping.in_operator).filter(Boolean),

        ...mappings.map((mapping) => mapping.site_in_by).filter(Boolean),
      ]),
    ] as number[];

    const ops =
      opIds.length > 0
        ? await prisma.userMaster.findMany({
            where: {
              id: {
                in: opIds,
              },
            },
            select: {
              id: true,
              user_name: true,
            },
          })
        : [];

    const opMap = new Map(ops.map((user) => [user.id, user.user_name]));

    const items = mappings.map((mapping) => {
      const qty = Number(mapping.qty ?? 1);
      const mappedWeight = Number(mapping.weight || 0);
      const cutListTotalWeight = Number(mapping.cut_list?.weight || 0);
      const cutListTotalQty = Number(mapping.cut_list?.qty || 1);

      let itemWeight = mappedWeight > 0 ? mappedWeight : 0;
      if (itemWeight === 0 && cutListTotalWeight > 0) {
        itemWeight = (cutListTotalWeight / cutListTotalQty) * qty;
      }

      if (itemWeight === 0 && mapping.cut_list) {
        const l = Number(mapping.cut_list.length || 0);
        const w = Number(mapping.cut_list.width || 0);
        const t = Number(mapping.cut_list.thickness || 0);
        if (l > 0 && w > 0 && t > 0) {
          itemWeight = l * w * t * 0.00000075 * qty;
        }
      }

      return {
        id: mapping.id,

        machine: {
          machine_name: mapping.machine.machine_name,
        },

        actual_in_at: mapping.actual_in_at,

        site_in_at: mapping.site_in_at,

        qty,

        weight: Number(itemWeight.toFixed(2)),

        row_created_source: mapping.row_created_source,

        scanned_by: mapping.in_operator
          ? (opMap.get(mapping.in_operator) ?? null)
          : null,

        site_in_by: mapping.site_in_by
          ? (opMap.get(mapping.site_in_by) ?? null)
          : null,

        inOperator: mapping.in_operator
          ? {
              id: mapping.in_operator,

              name: opMap.get(mapping.in_operator) ?? "",
            }
          : null,

        siteInByUser: mapping.site_in_by
          ? {
              id: mapping.site_in_by,

              name: opMap.get(mapping.site_in_by) ?? "",
            }
          : null,

        cut_list: mapping.cut_list,
      };
    });

    const totalBoxWeight = items.reduce(
      (sum, item) => sum + Number(item.weight || 0),
      0,
    );

    return validationResponse(1, "Box items fetched", {
      box: {
        ...box,
        total_weight: Number(totalBoxWeight.toFixed(2)),
      },

      items,
    });
  } catch (error) {
    console.error("getBoxItemsService error:", error);

    return validationResponse(0, "Failed to fetch box items");
  }
};

/*
|--------------------------------------------------------------------------
| Project Cut List - Server-side pagination + filters
|--------------------------------------------------------------------------
|
| Paste this into your existing trackTrace.service.ts.
|
| Assumes these already exist in that service file:
|
|   import { prisma } from "../../prisma/client";
|   import { validationResponse } from "../../utils/validationResponse";
|
| The service returns PHYSICAL / VIRTUAL UNIT rows, exactly like your
| existing project-detail Cut List table:
|
|   - Normal scanned mapping qty=1 -> one row
|   - Manual CutList.qty=10        -> ten virtual unit rows
|   - Manual machine-18 qty=3      -> first three virtual rows are packed
|   - Remaining manual quantity    -> synthetic Pending packaging rows
|
|--------------------------------------------------------------------------
*/

export type ProjectCutListMachineStatus = "all" | "done" | "pending";

export type ProjectCutListPackingStatus = "all" | "packed" | "pending";

export type ProjectCutListPackingMethod = "all" | "manual" | "scanned";

export type ProjectCutListSortBy =
  | "row_number"
  | "item_name"
  | "unique_code"
  | "group"
  | "category"
  | "weight"
  | "box";

export type ProjectCutListSortOrder = "asc" | "desc";

export interface ProjectCutListFilters {
  page?: number;
  limit?: number;

  search?: string;

  group?: string;
  category?: string;

  machine_id?: number | null;
  machine_status?: ProjectCutListMachineStatus;

  packing_status?: ProjectCutListPackingStatus;
  packing_method?: ProjectCutListPackingMethod;

  box_id?: number | null;

  min_weight?: number | null;
  max_weight?: number | null;

  sort_by?: ProjectCutListSortBy;
  sort_order?: ProjectCutListSortOrder;
}

type CutListMachineColumn = {
  mapping_id: number;
  machine_id: number;
  machine_name: string;
  sequence_no: number;
  box_id: number | null;
  weight: number;
  qty: number;
  row_created_source: string | null;
  scanned: boolean;
  scanned_at: Date | null;
  scanned_by: string | null;
};

type ProjectCutListUnitRow = {
  id: number;
  row_number: number;

  cut_list_id: number;

  item_name: string;
  unique_code: string | null;
  unique_code_2: string | null;
  description: string;

  qty: number;
  total_qty: number;
  unit_index: number;

  category: string | null;
  group: string | null;

  material_details: string | null;
  procurement: string | null;

  length: any;
  width: any;
  thickness: any;

  weight: number;

  packing_method: "Manual" | "Scanned";

  package_box_id: number | null;
  package_box_name: string | null;

  machines: CutListMachineColumn[];
};

const normalizeText = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

const normalizePageNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};

const normalizeNullableNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

/*
|--------------------------------------------------------------------------
| IMPORTANT
|--------------------------------------------------------------------------
|
| Because your schema allows one manual CutListMachineMapping row to hold
| qty > 1, "physical rows" do not exist directly in the database.
|
| Example:
|
|   CutList.qty = 10
|   Manual mapping row qty = 3
|
| The UI needs 10 unit rows:
|
|   1-3  = packed
|   4-10 = pending
|
| Therefore pagination is performed on the SERVER after virtual unit
| expansion. The frontend receives only the requested page.
|
|--------------------------------------------------------------------------
*/

export const getProjectCutListPaginatedService = async (
  vendor_id: number,
  unique_project_id: string,
  filters: ProjectCutListFilters = {},
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | STEP 1 - Validate
    |--------------------------------------------------------------------------
    */

    if (!vendor_id || !unique_project_id) {
      return validationResponse(0, "vendor_id and project_id are required");
    }

    const page = normalizePageNumber(filters.page, 1);

    /*
    |--------------------------------------------------------------------------
    | Limit protection
    |--------------------------------------------------------------------------
    |
    | Keeps someone from requesting 50,000 rows in one request.
    |--------------------------------------------------------------------------
    */

    const requestedLimit = normalizePageNumber(filters.limit, 25);

    const limit = Math.min(Math.max(requestedLimit, 10), 100);

    const search = String(filters.search ?? "").trim();

    const selectedGroup = String(filters.group ?? "all").trim();

    const selectedCategory = String(filters.category ?? "all").trim();

    const machineId = normalizeNullableNumber(filters.machine_id);

    const machineStatus: ProjectCutListMachineStatus =
      filters.machine_status ?? "all";

    const packingStatus: ProjectCutListPackingStatus =
      filters.packing_status ?? "all";

    const packingMethod: ProjectCutListPackingMethod =
      filters.packing_method ?? "all";

    const boxId = normalizeNullableNumber(filters.box_id);

    const minWeight = normalizeNullableNumber(filters.min_weight);

    const maxWeight = normalizeNullableNumber(filters.max_weight);

    const sortBy: ProjectCutListSortBy = filters.sort_by ?? "row_number";

    const sortOrder: ProjectCutListSortOrder =
      filters.sort_order === "desc" ? "desc" : "asc";

    /*
    |--------------------------------------------------------------------------
    | STEP 2 - Resolve unique project id
    |--------------------------------------------------------------------------
    */

    const project = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id,
        vendor_id,
      },

      select: {
        id: true,
        project_name: true,
        unique_project_id: true,
      },
    });

    if (!project) {
      return validationResponse(0, "Project not found");
    }

    const project_id = project.id;

    /*
    |--------------------------------------------------------------------------
    | STEP 3 - Packaging machine + boxes
    |--------------------------------------------------------------------------
    */

    const [packagingMachine, boxes] = await Promise.all([
      prisma.machineMaster.findFirst({
        where: {
          vendor_id,
          machine_type_id: 18,
        },

        select: {
          id: true,
          machine_name: true,
          sequence_no: true,
        },

        orderBy: {
          id: "asc",
        },
      }),

      prisma.boxMaster.findMany({
        where: {
          vendor_id,
          project_id,
          is_deleted: false,
        },

        select: {
          id: true,
          box_name: true,

          // Used by Cut List receipt status.
          site_in_at: true,
        },

        orderBy: {
          id: "asc",
        },
      }),
    ]);

    const boxNameMap = new Map<number, string>(
      boxes.map((box) => [box.id, box.box_name]),
    );

    const boxSiteInMap = new Map<number, Date | null>(
      boxes.map((box) => [box.id, box.site_in_at]),
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 4 - Fetch CutList master rows
    |--------------------------------------------------------------------------
    |
    | We intentionally keep SEARCH at the unit-row layer because search also
    | supports Packing Box name. Group/category/method are safe to pre-filter
    | at the CutList level.
    |--------------------------------------------------------------------------
    */

    const allProjectCutLists = await prisma.cutList.findMany({
      where: {
        project_id,
        vendor_id,

        status: {
          in: ["Active", "active"],
        },
      },

      select: {
        id: true,
        project_id: true,
        vendor_id: true,

        item_name: true,
        unique_code: true,
        unique_code_2: true,
        description: true,

        material_details: true,
        procurement: true,

        qty: true,

        category_name: true,
        group_name: true,

        length: true,
        width: true,
        thickness: true,

        weight: true,

        include_in_packing: true,
        scan_pack_validate: true,
      },

      orderBy: {
        id: "asc",
      },
    });

    /*
    |--------------------------------------------------------------------------
    | Filter options must not disappear when another filter is selected.
    |--------------------------------------------------------------------------
    */

    const groupOptions = Array.from(
      new Set(
        allProjectCutLists
          .map((item) => item.group_name?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const categoryOptions = Array.from(
      new Set(
        allProjectCutLists
          .map((item) => item.category_name?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b));

    /*
    |--------------------------------------------------------------------------
    | Pre-filter CutList rows
    |--------------------------------------------------------------------------
    */

    const candidateCutLists = allProjectCutLists.filter((item) => {
      const isManual =
        item.include_in_packing === true && item.scan_pack_validate === false;

      if (
        selectedGroup &&
        normalizeText(selectedGroup) !== "all" &&
        normalizeText(item.group_name) !== normalizeText(selectedGroup)
      ) {
        return false;
      }

      if (
        selectedCategory &&
        normalizeText(selectedCategory) !== "all" &&
        normalizeText(item.category_name) !== normalizeText(selectedCategory)
      ) {
        return false;
      }

      if (packingMethod === "manual" && !isManual) {
        return false;
      }

      if (packingMethod === "scanned" && isManual) {
        return false;
      }

      return true;
    });

    const candidateCutListIds = candidateCutLists.map((item) => item.id);

    /*
    |--------------------------------------------------------------------------
    | Nothing matches master-level filters
    |--------------------------------------------------------------------------
    */

    if (candidateCutListIds.length === 0) {
      return validationResponse(1, "Project cut list fetched", {
        project,

        items: [],

        pagination: {
          page: 1,
          limit,
          total: 0,
          total_pages: 0,
          from: 0,
          to: 0,
          has_previous: false,
          has_next: false,
        },

        summary: {
          total_project_qty: allProjectCutLists.reduce(
            (sum, item) => sum + Math.max(0, Number(item.qty || 0)),
            0,
          ),

          filtered_qty: 0,
          packed_qty: 0,
          pending_qty: 0,
          filtered_weight: 0,

          /*
            |--------------------------------------------------------------------------
            | Site receipt / verification
            |--------------------------------------------------------------------------
            */
          received_qty: 0,
          pending_receipt_qty: 0,
          receipt_progress_pct: 0,

          scanned_received_qty: 0,
          manual_received_qty: 0,

          site_in_qty: 0,
          site_in_received_qty: 0,
          pending_verification_qty: 0,
          site_verification_pct: 0,
        },

        filter_options: {
          groups: groupOptions,

          categories: categoryOptions,

          machines: [],

          boxes: boxes.map((box) => ({
            id: box.id,

            name: box.box_name,
          })),
        },
      });
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 5 - Fetch mappings only for candidate CutLists
    |--------------------------------------------------------------------------
    */

    const allMappings = await prisma.cutListMachineMapping.findMany({
      where: {
        project_id,
        vendor_id,
        expected_in: true,

        cut_list_id: {
          in: candidateCutListIds,
        },
      },

      select: {
        id: true,

        cut_list_id: true,
        machine_id: true,
        sequence_no: true,

        actual_in_at: true,
        box_id: true,
        in_operator: true,

        /*
          |--------------------------------------------------------------------------
          | Site receipt / verification
          |--------------------------------------------------------------------------
          |
          | Normal scanned item:
          |   site_in_at/site_in_by are used.
          |
          | Manual item:
          |   received_qty is the physical quantity verified at site.
          |--------------------------------------------------------------------------
          */
        site_in_at: true,
        site_in_by: true,
        received_qty: true,

        weight: true,
        qty: true,

        row_created_source: true,

        machine: {
          select: {
            id: true,
            machine_name: true,
            sequence_no: true,
            machine_type_id: true,
          },
        },
      },

      orderBy: [
        {
          cut_list_id: "asc",
        },
        {
          sequence_no: "asc",
        },
        {
          id: "asc",
        },
      ],
    });

    /*
    |--------------------------------------------------------------------------
    | STEP 6 - Operator names
    |--------------------------------------------------------------------------
    */

    const operatorIds = [
      ...new Set([
        ...allMappings.map((mapping) => mapping.in_operator).filter(Boolean),

        ...allMappings.map((mapping) => mapping.site_in_by).filter(Boolean),
      ]),
    ] as number[];

    const operators =
      operatorIds.length > 0
        ? await prisma.userMaster.findMany({
            where: {
              id: {
                in: operatorIds,
              },
            },

            select: {
              id: true,
              user_name: true,
            },
          })
        : [];

    const operatorMap = new Map<number, string>(
      operators.map((user) => [user.id, user.user_name]),
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 7 - Machine filter options
    |--------------------------------------------------------------------------
    */

    const machineOptionMap = new Map<
      number,
      {
        id: number;
        name: string;
        sequence_no: number;
      }
    >();

    for (const mapping of allMappings) {
      if (!machineOptionMap.has(mapping.machine_id)) {
        machineOptionMap.set(mapping.machine_id, {
          id: mapping.machine_id,

          name: mapping.machine.machine_name,

          sequence_no: mapping.sequence_no ?? mapping.machine.sequence_no ?? 0,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Manual-only project can have no machine-18 mapping yet.
    |--------------------------------------------------------------------------
    */

    const containsManualItem = candidateCutLists.some(
      (item) =>
        item.include_in_packing === true && item.scan_pack_validate === false,
    );

    if (
      packagingMachine &&
      containsManualItem &&
      !machineOptionMap.has(packagingMachine.id)
    ) {
      machineOptionMap.set(packagingMachine.id, {
        id: packagingMachine.id,

        name: packagingMachine.machine_name,

        sequence_no: packagingMachine.sequence_no ?? 0,
      });
    }

    const machineOptions = Array.from(machineOptionMap.values()).sort(
      (a, b) => a.sequence_no - b.sequence_no || a.id - b.id,
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 8 - Group mappings by CutList
    |--------------------------------------------------------------------------
    */

    const mappingsByCutList = new Map<number, typeof allMappings>();

    for (const mapping of allMappings) {
      if (!mappingsByCutList.has(mapping.cut_list_id)) {
        mappingsByCutList.set(mapping.cut_list_id, []);
      }

      mappingsByCutList.get(mapping.cut_list_id)!.push(mapping);
    }

    /*
    |--------------------------------------------------------------------------
    | Helper: expand a mapping row by mapping.qty
    |--------------------------------------------------------------------------
    */

    const expandRowsByQty = <
      T extends {
        qty: number;
      },
    >(
      rows: T[],
    ): T[] => {
      const expanded: T[] = [];

      for (const row of rows) {
        const rowQty = Math.max(1, Number(row.qty ?? 1));

        for (let index = 0; index < rowQty; index++) {
          expanded.push(row);
        }
      }

      return expanded;
    };

    /*
    |--------------------------------------------------------------------------
    | STEP 9 - Build physical / virtual unit rows
    |--------------------------------------------------------------------------
    */

    const unitRows: ProjectCutListUnitRow[] = [];

    let rowNumber = 1;

    for (const cutList of candidateCutLists) {
      const itemMappings = mappingsByCutList.get(cutList.id) ?? [];

      const isManual =
        cutList.include_in_packing === true &&
        cutList.scan_pack_validate === false;

      const totalQty = Math.max(0, Number(cutList.qty || 0));

      /*
      |--------------------------------------------------------------------------
      | Group mappings by machine
      |--------------------------------------------------------------------------
      */

      const byMachine = new Map<number, typeof itemMappings>();

      for (const mapping of itemMappings) {
        if (!byMachine.has(mapping.machine_id)) {
          byMachine.set(mapping.machine_id, []);
        }

        byMachine.get(mapping.machine_id)!.push(mapping);
      }

      /*
      |--------------------------------------------------------------------------
      | MANUAL ITEM
      |--------------------------------------------------------------------------
      */

      if (isManual) {
        if (totalQty <= 0) {
          continue;
        }

        /*
        |--------------------------------------------------------------------------
        | All non-packaging machines are expanded normally.
        |--------------------------------------------------------------------------
        */

        const expandedNonPackagingByMachine = new Map<
          number,
          typeof itemMappings
        >();

        for (const [currentMachineId, machineRows] of byMachine) {
          if (
            packagingMachine &&
            Number(currentMachineId) === Number(packagingMachine.id)
          ) {
            continue;
          }

          expandedNonPackagingByMachine.set(
            currentMachineId,
            expandRowsByQty(machineRows),
          );
        }

        /*
        |--------------------------------------------------------------------------
        | Only row_created_source=Manual is used as the manual machine-18 row.
        |--------------------------------------------------------------------------
        */

        const manualPackagingRows = packagingMachine
          ? (byMachine.get(packagingMachine.id) ?? [])
              .filter(
                (row) => normalizeText(row.row_created_source) === "manual",
              )
              .sort((a, b) => a.id - b.id)
          : [];

        const expandedManualPackagingRows = expandRowsByQty(
          manualPackagingRows,
        ).slice(0, totalQty);

        const fallbackWeight =
          Number(cutList.weight || 0) > 0 && totalQty > 0
            ? Number(cutList.weight || 0) / totalQty
            : 0;

        for (let unitIndex = 0; unitIndex < totalQty; unitIndex++) {
          const machineColumns: CutListMachineColumn[] = [];

          /*
          |--------------------------------------------------------------------------
          | Prior / non-packaging machines
          |--------------------------------------------------------------------------
          */

          for (const [, machineRows] of expandedNonPackagingByMachine) {
            const row = machineRows[unitIndex];

            if (!row) {
              continue;
            }

            machineColumns.push({
              mapping_id: row.id,

              machine_id: row.machine_id,

              machine_name: row.machine.machine_name,

              sequence_no: row.sequence_no ?? row.machine.sequence_no ?? 0,

              box_id: row.box_id,

              weight: Number(row.weight || 0),

              qty: 1,

              row_created_source: row.row_created_source,

              scanned: row.actual_in_at !== null,

              scanned_at: row.actual_in_at,

              scanned_by: row.in_operator
                ? (operatorMap.get(row.in_operator) ?? null)
                : null,
            });
          }

          /*
          |--------------------------------------------------------------------------
          | Packaging machine
          |--------------------------------------------------------------------------
          */

          const manualPackagingRow = expandedManualPackagingRows[unitIndex];

          if (packagingMachine) {
            if (manualPackagingRow) {
              machineColumns.push({
                mapping_id: manualPackagingRow.id,

                machine_id: packagingMachine.id,

                machine_name: packagingMachine.machine_name,

                sequence_no: packagingMachine.sequence_no ?? 0,

                box_id: manualPackagingRow.box_id,

                weight: Number(
                  manualPackagingRow.weight || fallbackWeight || 0,
                ),

                qty: 1,

                row_created_source: manualPackagingRow.row_created_source,

                scanned: manualPackagingRow.actual_in_at !== null,

                scanned_at: manualPackagingRow.actual_in_at,

                scanned_by: manualPackagingRow.in_operator
                  ? (operatorMap.get(manualPackagingRow.in_operator) ?? null)
                  : null,
              });
            } else {
              /*
              |--------------------------------------------------------------------------
              | Synthetic pending packaging row.
              |--------------------------------------------------------------------------
              */

              machineColumns.push({
                mapping_id: 0,

                machine_id: packagingMachine.id,

                machine_name: packagingMachine.machine_name,

                sequence_no: packagingMachine.sequence_no ?? 0,

                box_id: null,

                weight: Number(fallbackWeight.toFixed(4)),

                qty: 1,

                row_created_source: "Manual",

                scanned: false,

                scanned_at: null,

                scanned_by: null,
              });
            }
          }

          const packageBoxId = manualPackagingRow?.box_id ?? null;

          const packageBoxName = packageBoxId
            ? (boxNameMap.get(packageBoxId) ?? null)
            : null;

          const mappedWeight = manualPackagingRow
            ? Number(manualPackagingRow.weight || 0)
            : 0;

          const unitWeight = Number(
            Number(mappedWeight || fallbackWeight || 0).toFixed(4),
          );

          unitRows.push({
            id: cutList.id,

            row_number: rowNumber++,

            cut_list_id: cutList.id,

            item_name: cutList.item_name,

            unique_code: cutList.unique_code,

            unique_code_2: cutList.unique_code_2,

            description: cutList.description,

            qty: 1,

            total_qty: totalQty,

            unit_index: unitIndex + 1,

            category: cutList.category_name,

            group: cutList.group_name,

            material_details: cutList.material_details,

            procurement: cutList.procurement,

            length: cutList.length,

            width: cutList.width,

            thickness: cutList.thickness,

            weight: unitWeight,

            packing_method: "Manual",

            package_box_id: packageBoxId,

            package_box_name: packageBoxName,

            machines: machineColumns,
          });
        }

        continue;
      }

      /*
      |--------------------------------------------------------------------------
      | NORMAL / SCANNED ITEM
      |--------------------------------------------------------------------------
      */

      const expandedByMachine = new Map<number, typeof itemMappings>();

      for (const [currentMachineId, machineRows] of byMachine) {
        expandedByMachine.set(currentMachineId, expandRowsByQty(machineRows));
      }

      const unitCount = Math.max(
        0,
        ...[...expandedByMachine.values()].map(
          (machineRows) => machineRows.length,
        ),
      );

      if (unitCount <= 0) {
        continue;
      }

      const fallbackWeight =
        Number(cutList.weight || 0) > 0 && Number(cutList.qty || 0) > 0
          ? Number(cutList.weight || 0) / Number(cutList.qty || 1)
          : 0;

      for (let unitIndex = 0; unitIndex < unitCount; unitIndex++) {
        const machineColumns: CutListMachineColumn[] = [];

        for (const [, machineRows] of expandedByMachine) {
          const row = machineRows[unitIndex];

          if (!row) {
            continue;
          }

          machineColumns.push({
            mapping_id: row.id,

            machine_id: row.machine_id,

            machine_name: row.machine.machine_name,

            sequence_no: row.sequence_no ?? row.machine.sequence_no ?? 0,

            box_id: row.box_id,

            weight: Number(row.weight || 0),

            qty: 1,

            row_created_source: row.row_created_source,

            scanned: row.actual_in_at !== null,

            scanned_at: row.actual_in_at,

            scanned_by: row.in_operator
              ? (operatorMap.get(row.in_operator) ?? null)
              : null,
          });
        }

        /*
        |--------------------------------------------------------------------------
        | Prefer packaging machine box_id.
        |--------------------------------------------------------------------------
        */

        const packagingColumn = packagingMachine
          ? machineColumns.find(
              (column) =>
                Number(column.machine_id) === Number(packagingMachine.id),
            )
          : undefined;

        const packageBoxId =
          packagingColumn?.box_id ??
          machineColumns.find((column) => column.box_id !== null)?.box_id ??
          null;

        const packageBoxName = packageBoxId
          ? (boxNameMap.get(packageBoxId) ?? null)
          : null;

        const mappedWeight =
          packagingColumn && Number(packagingColumn.weight || 0) > 0
            ? Number(packagingColumn.weight)
            : (machineColumns.find((column) => Number(column.weight || 0) > 0)
                ?.weight ?? 0);

        const unitWeight = Number(
          Number(mappedWeight || fallbackWeight || 0).toFixed(4),
        );

        unitRows.push({
          id: cutList.id,

          row_number: rowNumber++,

          cut_list_id: cutList.id,

          item_name: cutList.item_name,

          unique_code: cutList.unique_code,

          unique_code_2: cutList.unique_code_2,

          description: cutList.description,

          qty: 1,

          total_qty: Number(cutList.qty || 0),

          unit_index: unitIndex + 1,

          category: cutList.category_name,

          group: cutList.group_name,

          material_details: cutList.material_details,

          procurement: cutList.procurement,

          length: cutList.length,

          width: cutList.width,

          thickness: cutList.thickness,

          weight: unitWeight,

          packing_method: "Scanned",

          package_box_id: packageBoxId,

          package_box_name: packageBoxName,

          machines: machineColumns,
        });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 10 - Add received_qty / site verification information
    |--------------------------------------------------------------------------
    |
    | Cut List rows are PHYSICAL / VIRTUAL units.
    |
    | Normal example:
    |   mapping.qty = 1
    |   site_in_at != null
    |   => received_qty = 1
    |
    | Manual example:
    |   mapping.qty = 5
    |   mapping.received_qty = 3
    |
    | The same mapping is expanded to five virtual Cut List rows:
    |
    |   Unit 1 => received_qty = 1
    |   Unit 2 => received_qty = 1
    |   Unit 3 => received_qty = 1
    |   Unit 4 => received_qty = 0
    |   Unit 5 => received_qty = 0
    |
    | This is intentionally done BEFORE server filtering/sorting/pagination,
    | so the requested page contains the correct physical receipt state.
    |--------------------------------------------------------------------------
    */

    const mappingReceiptInfoMap = new Map(
      allMappings.map((mapping) => [
        mapping.id,
        {
          qty: Math.max(0, Number(mapping.qty ?? 1)),

          received_qty: mapping.received_qty,

          site_in_at: mapping.site_in_at,

          site_in_by: mapping.site_in_by,

          row_created_source: mapping.row_created_source,
        },
      ]),
    );

    /*
    |--------------------------------------------------------------------------
    | Number of expanded units already assigned for each DB mapping.
    |--------------------------------------------------------------------------
    */

    const mappingUnitPositionMap = new Map<number, number>();

    const unitRowsWithReceipt = unitRows.map((row) => {
      /*
          |--------------------------------------------------------------------------
          | Receipt is based only on packaging machine (type 18).
          |--------------------------------------------------------------------------
          */

      const packagingColumn = packagingMachine
        ? row.machines.find(
            (machine) =>
              Number(machine.machine_id) === Number(packagingMachine.id),
          )
        : undefined;

      const mappingId = Number(packagingColumn?.mapping_id ?? 0);

      const mappingInfo =
        mappingId > 0 ? mappingReceiptInfoMap.get(mappingId) : undefined;

      const isManual = row.packing_method === "Manual";

      const packed = row.package_box_id !== null;

      const boxSiteInAt = row.package_box_id
        ? (boxSiteInMap.get(row.package_box_id) ?? null)
        : null;

      /*
          |--------------------------------------------------------------------------
          | How many physical units of this mapping are received?
          |--------------------------------------------------------------------------
          */

      let mappingReceivedQty = 0;

      if (mappingInfo) {
        if (isManual) {
          mappingReceivedQty = Math.min(
            mappingInfo.qty,
            Math.max(0, Number(mappingInfo.received_qty ?? 0)),
          );
        } else {
          mappingReceivedQty = mappingInfo.site_in_at ? mappingInfo.qty : 0;
        }
      }

      /*
          |--------------------------------------------------------------------------
          | Position of this virtual unit inside the DB mapping.
          |--------------------------------------------------------------------------
          */

      const mappingUnitPosition = mappingInfo
        ? (mappingUnitPositionMap.get(mappingId) ?? 0)
        : 0;

      if (mappingInfo) {
        mappingUnitPositionMap.set(mappingId, mappingUnitPosition + 1);
      }

      const isReceived =
        Boolean(mappingInfo) && mappingUnitPosition < mappingReceivedQty;

      const unitReceivedQty = isReceived ? 1 : 0;

      /*
          |--------------------------------------------------------------------------
          | Human-friendly receipt state
          |--------------------------------------------------------------------------
          */

      const receiptStatus:
        | "Not Packed"
        | "Not At Site"
        | "Pending Verification"
        | "Received" = !packed
        ? "Not Packed"
        : isReceived
          ? "Received"
          : !boxSiteInAt
            ? "Not At Site"
            : "Pending Verification";

      return {
        ...row,

        /*
            |--------------------------------------------------------------------------
            | Physical unit receipt information
            |--------------------------------------------------------------------------
            */

        received_qty: unitReceivedQty,

        is_received: isReceived,

        receipt_status: receiptStatus,

        receipt_method: isManual ? "Manual Verification" : "QR Scan",

        received_at: isReceived ? (mappingInfo?.site_in_at ?? null) : null,

        received_by_id: isReceived ? (mappingInfo?.site_in_by ?? null) : null,

        received_by:
          isReceived && mappingInfo?.site_in_by
            ? (operatorMap.get(mappingInfo.site_in_by) ?? null)
            : null,

        /*
            |--------------------------------------------------------------------------
            | Box-level site arrival state for this unit
            |--------------------------------------------------------------------------
            */

        box_site_in_at: boxSiteInAt,

        /*
            |--------------------------------------------------------------------------
            | Original mapping values are also returned for reference.
            |
            | Useful for manual rows:
            | mapping_packed_qty   = 5
            | mapping_received_qty = 3
            |--------------------------------------------------------------------------
            */

        mapping_packed_qty: mappingInfo?.qty ?? 0,

        mapping_received_qty: mappingInfo
          ? isManual
            ? Math.min(
                mappingInfo.qty,
                Math.max(0, Number(mappingInfo.received_qty ?? 0)),
              )
            : mappingInfo.site_in_at
              ? mappingInfo.qty
              : 0
          : 0,
      };
    });

    /*
    |--------------------------------------------------------------------------
    | STEP 11 - Server-side row filters
    |--------------------------------------------------------------------------
    */

    const searchText = normalizeText(search);

    const filteredRows = unitRowsWithReceipt.filter((row) => {
      /*
          |--------------------------------------------------------------------------
          | Search
          |--------------------------------------------------------------------------
          */

      if (searchText) {
        const searchable = [
          row.item_name,
          row.unique_code,
          row.unique_code_2,
          row.description,
          row.category,
          row.group,
          row.material_details,
          row.procurement,
          row.package_box_name,
          row.weight,
          row.length,
          row.width,
          row.thickness,
          row.packing_method,

          // Receipt information
          row.receipt_status,
          row.receipt_method,
          row.received_by,
          row.received_qty,
        ]
          .map((value) => normalizeText(value))
          .join(" ");

        if (!searchable.includes(searchText)) {
          return false;
        }
      }

      /*
          |--------------------------------------------------------------------------
          | Machine + machine status
          |--------------------------------------------------------------------------
          */

      if (machineId !== null) {
        const machineMapping = row.machines.find(
          (mapping) => Number(mapping.machine_id) === Number(machineId),
        );

        /*
            |--------------------------------------------------------------------------
            | Machine not applicable to this row.
            |--------------------------------------------------------------------------
            */

        if (!machineMapping) {
          return false;
        }

        if (machineStatus === "done" && machineMapping.scanned !== true) {
          return false;
        }

        if (machineStatus === "pending" && machineMapping.scanned === true) {
          return false;
        }
      }

      /*
          |--------------------------------------------------------------------------
          | Packing status
          |--------------------------------------------------------------------------
          */

      if (packingStatus === "packed" && row.package_box_id === null) {
        return false;
      }

      if (packingStatus === "pending" && row.package_box_id !== null) {
        return false;
      }

      /*
          |--------------------------------------------------------------------------
          | Box
          |--------------------------------------------------------------------------
          */

      if (boxId !== null && Number(row.package_box_id) !== Number(boxId)) {
        return false;
      }

      /*
          |--------------------------------------------------------------------------
          | Weight range
          |--------------------------------------------------------------------------
          */

      if (minWeight !== null && Number(row.weight || 0) < minWeight) {
        return false;
      }

      if (maxWeight !== null && Number(row.weight || 0) > maxWeight) {
        return false;
      }

      return true;
    });

    /*
    |--------------------------------------------------------------------------
    | STEP 12 - Server-side sorting
    |--------------------------------------------------------------------------
    */

    const compareText = (first: unknown, second: unknown) => {
      return String(first ?? "").localeCompare(
        String(second ?? ""),
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        },
      );
    };

    const sortedRows = [...filteredRows].sort((a, b) => {
      let result = 0;

      switch (sortBy) {
        case "item_name":
          result = compareText(a.item_name, b.item_name);
          break;

        case "unique_code":
          result = compareText(a.unique_code, b.unique_code);
          break;

        case "group":
          result = compareText(a.group, b.group);
          break;

        case "category":
          result = compareText(a.category, b.category);
          break;

        case "weight":
          result = Number(a.weight || 0) - Number(b.weight || 0);
          break;

        case "box":
          result = compareText(a.package_box_name, b.package_box_name);
          break;

        case "row_number":
        default:
          result = a.row_number - b.row_number;
          break;
      }

      if (result === 0) {
        result = a.row_number - b.row_number;
      }

      return sortOrder === "desc" ? result * -1 : result;
    });

    /*
    |--------------------------------------------------------------------------
    | STEP 13 - Pagination
    |--------------------------------------------------------------------------
    */

    const total = sortedRows.length;

    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;

    const skip = (safePage - 1) * limit;

    const paginatedRows = sortedRows.slice(skip, skip + limit);

    /*
    |--------------------------------------------------------------------------
    | Re-number only for visual index across filtered result.
    |--------------------------------------------------------------------------
    */

    const items = paginatedRows.map((row, index) => ({
      ...row,

      row_number: skip + index + 1,
    }));

    /*
    |--------------------------------------------------------------------------
    | STEP 14 - Summary
    |--------------------------------------------------------------------------
    */

    const filteredPackedQty = sortedRows.filter(
      (row) => row.package_box_id !== null,
    ).length;

    const filteredQty = sortedRows.length;

    const filteredPendingQty = Math.max(filteredQty - filteredPackedQty, 0);

    const filteredWeight = sortedRows.reduce(
      (totalWeight, row) => totalWeight + Number(row.weight || 0),
      0,
    );

    const totalProjectQty = allProjectCutLists.reduce(
      (totalQuantity, item) =>
        totalQuantity + Math.max(0, Number(item.qty || 0)),
      0,
    );

    /*
    |--------------------------------------------------------------------------
    | Receipt / verification summary for CURRENT FILTERED RESULT
    |--------------------------------------------------------------------------
    */

    const filteredReceivedQty = sortedRows.reduce(
      (sum, row) => sum + Math.max(0, Number(row.received_qty ?? 0)),
      0,
    );

    /*
    |--------------------------------------------------------------------------
    | Receipt pending is calculated only against packed quantity.
    |
    | Unpacked items are not yet eligible for site receipt.
    |--------------------------------------------------------------------------
    */

    const filteredPendingReceiptQty = Math.max(
      filteredPackedQty - filteredReceivedQty,
      0,
    );

    const filteredReceiptProgressPct =
      filteredPackedQty > 0
        ? Math.min(
            100,
            Math.round((filteredReceivedQty / filteredPackedQty) * 100),
          )
        : 0;

    const filteredScannedReceivedQty = sortedRows.reduce(
      (sum, row) =>
        row.packing_method === "Scanned"
          ? sum + Math.max(0, Number(row.received_qty ?? 0))
          : sum,
      0,
    );

    const filteredManualReceivedQty = sortedRows.reduce(
      (sum, row) =>
        row.packing_method === "Manual"
          ? sum + Math.max(0, Number(row.received_qty ?? 0))
          : sum,
      0,
    );

    const filteredSiteInQty = sortedRows.filter(
      (row) => row.package_box_id !== null && row.box_site_in_at !== null,
    ).length;

    const filteredSiteInReceivedQty = sortedRows.reduce(
      (sum, row) =>
        row.package_box_id !== null && row.box_site_in_at !== null
          ? sum + Math.max(0, Number(row.received_qty ?? 0))
          : sum,
      0,
    );

    const filteredPendingVerificationQty = Math.max(
      filteredSiteInQty - filteredSiteInReceivedQty,
      0,
    );

    const filteredSiteVerificationPct =
      filteredSiteInQty > 0
        ? Math.min(
            100,
            Math.round((filteredSiteInReceivedQty / filteredSiteInQty) * 100),
          )
        : 0;

    /*
    |--------------------------------------------------------------------------
    | STEP 15 - Response
    |--------------------------------------------------------------------------
    */

    return validationResponse(1, "Project cut list fetched", {
      project,

      items,

      pagination: {
        page: safePage,

        limit,

        total,

        total_pages: totalPages,

        from: total > 0 ? skip + 1 : 0,

        to: total > 0 ? Math.min(skip + limit, total) : 0,

        has_previous: safePage > 1,

        has_next: totalPages > 0 && safePage < totalPages,
      },

      summary: {
        total_project_qty: totalProjectQty,

        filtered_qty: filteredQty,

        packed_qty: filteredPackedQty,

        pending_qty: filteredPendingQty,

        filtered_weight: Number(filteredWeight.toFixed(4)),

        /*
          |--------------------------------------------------------------------------
          | Site receipt / verification summary
          |--------------------------------------------------------------------------
          */

        received_qty: filteredReceivedQty,

        pending_receipt_qty: filteredPendingReceiptQty,

        receipt_progress_pct: filteredReceiptProgressPct,

        scanned_received_qty: filteredScannedReceivedQty,

        manual_received_qty: filteredManualReceivedQty,

        site_in_qty: filteredSiteInQty,

        site_in_received_qty: filteredSiteInReceivedQty,

        pending_verification_qty: filteredPendingVerificationQty,

        site_verification_pct: filteredSiteVerificationPct,
      },

      filter_options: {
        groups: groupOptions,

        categories: categoryOptions,

        machines: machineOptions,

        boxes: boxes.map((box) => ({
          id: box.id,

          name: box.box_name,
        })),
      },
    });
  } catch (error) {
    console.error("getProjectCutListPaginatedService error:", error);

    return validationResponse(0, "Failed to fetch project cut list");
  }
};

export const getDefectDashboardService = async (vendor_id: number) => {
  try {
    // ── 1. Summary counts ─────────────────────────────────────────────────────
    const [total, pending, completed, rework, replace] = await Promise.all([
      prisma.defectedItem.count({ where: { vendor_id } }),
      prisma.defectedItem.count({
        where: { vendor_id, defect_status: "Pending" },
      }),
      prisma.defectedItem.count({
        where: { vendor_id, defect_status: "Completed" },
      }),
      prisma.defectedItem.count({ where: { vendor_id, action: "rework" } }),
      prisma.defectedItem.count({ where: { vendor_id, action: "replace" } }),
    ]);

    // ── 2. Defect breakdown by defect type ────────────────────────────────────
    const byDefectType = await prisma.defectedItem.groupBy({
      by: ["defect_id"],
      where: { vendor_id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const defectMasters = await prisma.defectMaster.findMany({
      where: {
        id: {
          in: byDefectType.map((d) => d.defect_id).filter(Boolean) as number[],
        },
      },
      select: { id: true, defect_name: true },
    });
    const defectMap = new Map(defectMasters.map((d) => [d.id, d.defect_name]));

    const defectBreakdown = byDefectType.map((d) => ({
      defect_id: d.defect_id,
      defect_name: d.defect_id
        ? (defectMap.get(d.defect_id) ?? "Unknown")
        : "Unknown",
      count: d._count.id,
    }));

    // ── 3. Defect breakdown by project ────────────────────────────────────────
    const byProject = await prisma.defectedItem.groupBy({
      by: ["project_id"],
      where: { vendor_id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    const projects = await prisma.projectMaster.findMany({
      where: { id: { in: byProject.map((p) => p.project_id) } },
      select: { id: true, project_name: true },
    });
    const projectMap = new Map(projects.map((p) => [p.id, p.project_name]));

    const projectBreakdown = byProject.map((p) => ({
      project_id: p.project_id,
      project_name: projectMap.get(p.project_id) ?? "Unknown",
      count: p._count.id,
    }));

    // ── 4. Defect breakdown by machine ────────────────────────────────────────
    const byMachine = await prisma.defectedItem.groupBy({
      by: ["machine_id"],
      where: { vendor_id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });

    const machines = await prisma.machineMaster.findMany({
      where: { id: { in: byMachine.map((m) => m.machine_id) } },
      select: { id: true, machine_name: true },
    });
    const machineMap = new Map(machines.map((m) => [m.id, m.machine_name]));

    const machineBreakdown = byMachine.map((m) => ({
      machine_id: m.machine_id,
      machine_name: machineMap.get(m.machine_id) ?? "Unknown",
      count: m._count.id,
    }));

    // ── 5. Status breakdown ───────────────────────────────────────────────────
    const byStatus = await prisma.defectedItem.groupBy({
      by: ["defect_status"],
      where: { vendor_id },
      _count: { id: true },
    });

    // ── 6. Recent defects list ────────────────────────────────────────────────
    const recentDefects = await prisma.defectedItem.findMany({
      where: { vendor_id },
      orderBy: { created_at: "desc" },
      take: 20,
      select: {
        id: true,
        defect_status: true,
        action: true,
        remark: true,
        created_at: true,
        defect_completed_at: true,
        defect: { select: { id: true, defect_name: true } },
        project: {
          select: { id: true, project_name: true, unique_project_id: true },
        },
        machine: { select: { id: true, machine_name: true } },
        cutList: { select: { id: true, item_name: true, unique_code: true } },
        createdBy: { select: { id: true, user_name: true } },
        images: { select: { id: true, doc_sys_name: true }, take: 1 },
      },
    });

    // ── 7. Avg resolution time (completed defects) ────────────────────────────
    const completedWithTime = await prisma.defectedItem.findMany({
      where: {
        vendor_id,
        defect_status: "Completed",
        defect_completed_at: { not: null },
      },
      select: { created_at: true, defect_completed_at: true },
    });

    const avgResolutionMs =
      completedWithTime.length > 0
        ? completedWithTime.reduce(
            (sum, d) =>
              sum + (d.defect_completed_at!.getTime() - d.created_at.getTime()),
            0,
          ) / completedWithTime.length
        : null;

    const avgResolutionHours =
      avgResolutionMs !== null
        ? Math.round((avgResolutionMs / 1000 / 60 / 60) * 10) / 10
        : null;

    return validationResponse(1, "Defect dashboard fetched", {
      summary: {
        total,
        pending,
        completed,
        rework,
        replace,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        avg_resolution_hours: avgResolutionHours,
      },
      by_defect_type: defectBreakdown,
      by_project: projectBreakdown,
      by_machine: machineBreakdown,
      by_status: byStatus.map((s) => ({
        status: s.defect_status,
        count: s._count.id,
      })),
      recent_defects: recentDefects,
    });
  } catch (error) {
    console.error("getDefectDashboardService error:", error);
    return validationResponse(0, "Failed to fetch defect dashboard");
  }
};

// ── Per-project defect list ───────────────────────────────────────────────────

export const getProjectDefectsService = async (
  vendor_id: number,
  unique_project_id: string,
) => {
  try {
    const project = await prisma.projectMaster.findFirst({
      where: { unique_project_id, vendor_id },
      select: { id: true, project_name: true },
    });
    if (!project) return validationResponse(0, "Project not found");

    const defects = await prisma.defectedItem.findMany({
      where: { vendor_id, project_id: project.id },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        defect_status: true,
        action: true,
        remark: true,
        created_at: true,
        defect_completed_at: true,
        defect: { select: { id: true, defect_name: true } },
        machine: { select: { id: true, machine_name: true } },
        cutList: { select: { id: true, item_name: true, unique_code: true } },
        createdBy: { select: { id: true, user_name: true } },
        images: { select: { id: true, doc_sys_name: true } },
        completionPhotos: { select: { id: true, doc_sys_name: true } },
      },
    });

    return validationResponse(1, "Project defects fetched", {
      project: { id: project.id, project_name: project.project_name },
      defects,
    });
  } catch (error) {
    console.error("getProjectDefectsService error:", error);
    return validationResponse(0, "Failed to fetch project defects");
  }
};

const PAGE_SIZE = 15;

// ─── Helper: attach signed URLs to images ─────────────────────────────────────

async function signImages(
  images: { id: number; doc_sys_name: string; doc_og_name: string }[],
) {
  return Promise.all(
    images.map(async (img) => ({
      ...img,
      signed_url: await generateSignedUrl(img.doc_sys_name),
    })),
  );
}

// ─── Summary (stat cards + bar charts) ───────────────────────────────────────

export const getDefectSummaryService = async (vendor_id: number) => {
  try {
    const [total, pending, completed, rework, replace] = await Promise.all([
      prisma.defectedItem.count({ where: { vendor_id } }),
      prisma.defectedItem.count({
        where: { vendor_id, defect_status: "Pending" },
      }),
      prisma.defectedItem.count({
        where: { vendor_id, defect_status: "Completed" },
      }),
      prisma.defectedItem.count({ where: { vendor_id, action: "rework" } }),
      prisma.defectedItem.count({ where: { vendor_id, action: "replace" } }),
    ]);

    // Breakdown by defect type
    const byDefectType = await prisma.defectedItem.groupBy({
      by: ["defect_id"],
      where: { vendor_id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const defectMasters = await prisma.defectMaster.findMany({
      where: {
        id: {
          in: byDefectType.map((d) => d.defect_id).filter(Boolean) as number[],
        },
      },
      select: { id: true, defect_name: true },
    });
    const defectMap = new Map(defectMasters.map((d) => [d.id, d.defect_name]));

    // Breakdown by machine
    const byMachine = await prisma.defectedItem.groupBy({
      by: ["machine_id"],
      where: { vendor_id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const machines = await prisma.machineMaster.findMany({
      where: { id: { in: byMachine.map((m) => m.machine_id) } },
      select: { id: true, machine_name: true },
    });
    const machineMap = new Map(machines.map((m) => [m.id, m.machine_name]));

    // Breakdown by project (top 10)
    const byProject = await prisma.defectedItem.groupBy({
      by: ["project_id"],
      where: { vendor_id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });
    const projects = await prisma.projectMaster.findMany({
      where: { id: { in: byProject.map((p) => p.project_id) } },
      select: { id: true, project_name: true },
    });
    const projectMap = new Map(projects.map((p) => [p.id, p.project_name]));

    // Avg resolution time
    const completedWithTime = await prisma.defectedItem.findMany({
      where: {
        vendor_id,
        defect_status: "Completed",
        defect_completed_at: { not: null },
      },
      select: { created_at: true, defect_completed_at: true },
    });
    const avgResolutionMs =
      completedWithTime.length > 0
        ? completedWithTime.reduce(
            (s, d) =>
              s + (d.defect_completed_at!.getTime() - d.created_at.getTime()),
            0,
          ) / completedWithTime.length
        : null;

    return validationResponse(1, "Defect summary fetched", {
      summary: {
        total,
        pending,
        completed,
        rework,
        replace,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        avg_resolution_hours:
          avgResolutionMs !== null
            ? Math.round((avgResolutionMs / 3_600_000) * 10) / 10
            : null,
      },
      by_defect_type: byDefectType.map((d) => ({
        defect_id: d.defect_id,
        defect_name: d.defect_id
          ? (defectMap.get(d.defect_id) ?? "Unknown")
          : "Unknown",
        count: d._count.id,
      })),
      by_machine: byMachine.map((m) => ({
        machine_id: m.machine_id,
        machine_name: machineMap.get(m.machine_id) ?? "Unknown",
        count: m._count.id,
      })),
      by_project: byProject.map((p) => ({
        project_id: p.project_id,
        project_name: projectMap.get(p.project_id) ?? "Unknown",
        count: p._count.id,
      })),
    });
  } catch (error) {
    console.error("getDefectSummaryService error:", error);
    return validationResponse(0, "Failed to fetch defect summary");
  }
};

// ─── Pending Defects (paginated) ─────────────────────────────────────────────

export const getPendingDefectsService = async (
  vendor_id: number,
  page: number,
) => {
  try {
    const skip = (page - 1) * PAGE_SIZE;

    const [total, items] = await Promise.all([
      prisma.defectedItem.count({
        where: { vendor_id, defect_status: "Pending" },
      }),
      prisma.defectedItem.findMany({
        where: { vendor_id, defect_status: "Pending" },
        orderBy: { created_at: "desc" },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          defect_status: true,
          action: true,
          remark: true,
          created_at: true,
          defect: { select: { id: true, defect_name: true } },
          project: {
            select: { id: true, project_name: true, unique_project_id: true },
          },
          machine: { select: { id: true, machine_name: true } },
          cutList: { select: { id: true, item_name: true, unique_code: true } },
          createdBy: { select: { id: true, user_name: true } },
          images: {
            select: { id: true, doc_sys_name: true, doc_og_name: true },
          },
        },
      }),
    ]);

    // Generate signed URLs for defect images
    const defectsWithUrls = await Promise.all(
      items.map(async (d) => ({
        ...d,
        images: await signImages(d.images),
      })),
    );

    return validationResponse(1, "Pending defects fetched", {
      defects: defectsWithUrls,
      total,
      page,
      page_size: PAGE_SIZE,
      total_pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (error) {
    console.error("getPendingDefectsService error:", error);
    return validationResponse(0, "Failed to fetch pending defects");
  }
};

// ─── Resolved Defects (paginated) ────────────────────────────────────────────

export const getResolvedDefectsService = async (
  vendor_id: number,
  page: number,
) => {
  try {
    const skip = (page - 1) * PAGE_SIZE;

    const [total, items] = await Promise.all([
      prisma.defectedItem.count({
        where: { vendor_id, defect_status: "Completed" },
      }),
      prisma.defectedItem.findMany({
        where: { vendor_id, defect_status: "Completed" },
        orderBy: { defect_completed_at: "desc" },
        skip,
        take: PAGE_SIZE,
        select: {
          id: true,
          defect_status: true,
          action: true,
          remark: true,
          created_at: true,
          defect_completed_at: true,
          defect: { select: { id: true, defect_name: true } },
          project: {
            select: { id: true, project_name: true, unique_project_id: true },
          },
          machine: { select: { id: true, machine_name: true } },
          cutList: { select: { id: true, item_name: true, unique_code: true } },
          createdBy: { select: { id: true, user_name: true } },
          // Defect images (original problem photos)
          images: {
            select: { id: true, doc_sys_name: true, doc_og_name: true },
          },
          // Completion/resolution photos
          completionPhotos: {
            select: { id: true, doc_sys_name: true, doc_og_name: true },
          },
        },
      }),
    ]);

    const defectsWithUrls = await Promise.all(
      items.map(async (d) => ({
        ...d,
        images: await signImages(d.images),
        completionPhotos: await signImages(d.completionPhotos),
      })),
    );

    return validationResponse(1, "Resolved defects fetched", {
      defects: defectsWithUrls,
      total,
      page,
      page_size: PAGE_SIZE,
      total_pages: Math.ceil(total / PAGE_SIZE),
    });
  } catch (error) {
    console.error("getResolvedDefectsService error:", error);
    return validationResponse(0, "Failed to fetch resolved defects");
  }
};

export const createUnitMaster = async (
  vendor_id: number,
  unit_name: string,
  short_name: string,
  created_by?: number | null,
) => {
  try {
    const unit = await prisma.unitMaster.create({
      data: {
        vendor_id,
        unit_name: unit_name.trim(),
        unit_class: "UOM",
        short_name: short_name.trim(),
        is_active: true,
        created_by,
        updated_by: created_by,
      },
    });
    return validationResponse(1, "Unit created successfully", unit);
  } catch (error: any) {
    if (error?.code === "P2002")
      return validationResponse(0, "Unit already exists");
    console.error("Error in createUnitMaster", error);
    return validationResponse(0, "Failed to create unit");
  }
};

type ApiResponseManualItems = ReturnType<typeof validationResponse>;

export const getManualPackingItemsService = async (
  projectId: number,
  vendorId: number,
): Promise<ApiResponseManualItems> => {
  if (!projectId || projectId <= 0) {
    return validationResponse(0, "project_id is required");
  }

  if (!vendorId || vendorId <= 0) {
    return validationResponse(0, "vendor_id is required");
  }

  /*
  |--------------------------------------------------------------------------
  | Step 1: Check project
  |--------------------------------------------------------------------------
  */

  const project = await prisma.projectMaster.findFirst({
    where: {
      id: projectId,
      vendor_id: vendorId,
    },
    select: {
      id: true,
      project_name: true,
      unique_project_id: true,
    },
  });

  if (!project) {
    return validationResponse(0, "Project not found");
  }

  /*
  |--------------------------------------------------------------------------
  | Step 2: Get CutList items applicable for manual packing
  |--------------------------------------------------------------------------
  */

  const cutListItems = await prisma.cutList.findMany({
    where: {
      project_id: projectId,
      vendor_id: vendorId,
      include_in_packing: true,
      scan_pack_validate: false,
      status: "Active",
    },
    select: {
      id: true,
      project_id: true,
      vendor_id: true,
      lead_id: true,

      item_name: true,
      description: true,
      material_details: true,

      qty: true,

      unique_code: true,
      unique_code_2: true,

      length: true,
      width: true,
      thickness: true,

      category_id: true,
      category_name: true,
      group_name: true,
      procurement: true,

      weight: true,

      use_in_assembled_packing: true,
      include_in_packing: true,
      scan_pack_validate: true,

      elf: true,
      elb: true,
      esl: true,
      esr: true,
    },

    orderBy: {
      id: "asc",
    },
  });

  /*
  |--------------------------------------------------------------------------
  | No items
  |--------------------------------------------------------------------------
  */

  if (cutListItems.length === 0) {
    return validationResponse(1, "", {
      project,
      summary: {
        total_items: 0,
        total_qty: 0,
        packed_qty: 0,
        pending_qty: 0,
      },
      items: [],
    });
  }

  /*
  |--------------------------------------------------------------------------
  | Step 3: Get packaging machines
  |--------------------------------------------------------------------------
  */

  const packagingMachines = await prisma.machineMaster.findMany({
    where: {
      vendor_id: vendorId,
      machine_type_id: 18,
    },
    select: {
      id: true,
    },
  });

  const packagingMachineIds = packagingMachines.map((machine) => machine.id);

  /*
  |--------------------------------------------------------------------------
  | Step 4: Get packed quantities
  |--------------------------------------------------------------------------
  */

  const cutListIds = cutListItems.map((item) => item.id);

  const packedQtyRows =
    packagingMachineIds.length > 0
      ? await prisma.cutListMachineMapping.groupBy({
          by: ["cut_list_id"],

          where: {
            project_id: projectId,
            vendor_id: vendorId,

            cut_list_id: {
              in: cutListIds,
            },

            machine_id: {
              in: packagingMachineIds,
            },
          },

          _sum: {
            qty: true,
          },
        })
      : [];

  /*
  |--------------------------------------------------------------------------
  | Step 5: Packed Qty Map
  |--------------------------------------------------------------------------
  */

  const packedQtyMap = new Map<number, number>();

  for (const row of packedQtyRows) {
    packedQtyMap.set(row.cut_list_id, Number(row._sum.qty ?? 0));
  }

  /*
  |--------------------------------------------------------------------------
  | Step 6: Prepare items
  |--------------------------------------------------------------------------
  */

  const items = cutListItems.map((item) => {
    const totalQty = Number(item.qty ?? 0);

    const packedQty = Math.min(
      Number(packedQtyMap.get(item.id) ?? 0),
      totalQty,
    );

    const pendingQty = Math.max(totalQty - packedQty, 0);

    return {
      ...item,

      total_qty: totalQty,
      packed_qty: packedQty,
      pending_qty: pendingQty,

      packing_status:
        pendingQty === 0
          ? "Packed"
          : packedQty > 0
            ? "Partially Packed"
            : "Pending",
    };
  });

  /*
  |--------------------------------------------------------------------------
  | Step 7: Summary
  |--------------------------------------------------------------------------
  */

  const summary = items.reduce(
    (result, item) => {
      result.total_qty += item.total_qty;
      result.packed_qty += item.packed_qty;
      result.pending_qty += item.pending_qty;

      return result;
    },
    {
      total_items: items.length,
      total_qty: 0,
      packed_qty: 0,
      pending_qty: 0,
    },
  );

  return validationResponse(1, "", {
    project,
    summary,
    items,
  });
};

interface AddManualPackingItemPayload {
  project_id: number;
  vendor_id: number;
  box_id: number;
  cut_list_id: number;
  qty: number;
  user_id: number;
}

export const addManualPackingItemService = async (
  payload: AddManualPackingItemPayload,
): Promise<ApiResponse> => {
  try {
    const project_id = Number(payload.project_id);
    const vendor_id = Number(payload.vendor_id);
    const box_id = Number(payload.box_id);
    const cut_list_id = Number(payload.cut_list_id);
    const qty = Number(payload.qty);
    const user_id = Number(payload.user_id);

    /*
    |--------------------------------------------------------------------------
    | STEP 1 — Basic validation
    |--------------------------------------------------------------------------
    */

    if (!project_id || project_id <= 0) {
      return validationResponse(0, "project_id is required");
    }

    if (!vendor_id || vendor_id <= 0) {
      return validationResponse(0, "vendor_id is required");
    }

    if (!box_id || box_id <= 0) {
      return validationResponse(0, "box_id is required");
    }

    if (!cut_list_id || cut_list_id <= 0) {
      return validationResponse(0, "cut_list_id is required");
    }

    if (!qty || qty <= 0 || !Number.isInteger(qty)) {
      return validationResponse(0, "qty must be a positive integer");
    }

    if (!user_id || user_id <= 0) {
      return validationResponse(0, "user_id is required");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 2 — Check project
    |--------------------------------------------------------------------------
    */

    const project = await prisma.projectMaster.findFirst({
      where: {
        id: project_id,
        vendor_id,
      },

      select: {
        id: true,
        project_name: true,
        packing_type: true,
        isDeleted: true,
        project_status: true,
      },
    });

    if (
      !project ||
      project.isDeleted ||
      ["deactivated", "deleted", "deactive", "inactive"].includes(
        (project.project_status || "").toLowerCase(),
      )
    ) {
      return validationResponse(0, "Project is deleted or deactivated");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 3 — Check box
    |--------------------------------------------------------------------------
    */

    const box = await prisma.boxMaster.findFirst({
      where: {
        id: box_id,
        project_id,
        vendor_id,
        is_deleted: false,
      },

      select: {
        id: true,
        box_name: true,
        box_status: true,
      },
    });

    if (!box) {
      return validationResponse(0, "Box not found");
    }

    if (String(box.box_status).toLowerCase() === "packed") {
      return validationResponse(0, "Packed box cannot be updated");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 4 — Check user
    |--------------------------------------------------------------------------
    */

    const user = await prisma.userMaster.findFirst({
      where: {
        id: user_id,
        vendor_id,
      },

      select: {
        id: true,
      },
    });

    if (!user) {
      return validationResponse(0, "User not found");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 5 — Check CutList item
    |--------------------------------------------------------------------------
    |
    | Manual packing is ONLY applicable when:
    |
    | include_in_packing = true
    | scan_pack_validate = false
    |--------------------------------------------------------------------------
    */

    const cutList = await prisma.cutList.findFirst({
      where: {
        id: cut_list_id,
        project_id,
        vendor_id,

        include_in_packing: true,
        scan_pack_validate: false,

        status: "Active",
      },

      select: {
        id: true,
        qty: true,
        lead_id: true,

        item_name: true,
        material_details: true,

        group_name: true,

        weight: true,

        include_in_packing: true,
        scan_pack_validate: true,
      },
    });

    if (!cutList) {
      return validationResponse(0, "Item is not available for manual packing");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 6 — Find ACTIVE packaging machine
    |--------------------------------------------------------------------------
    |
    | Machine Type 18 = Packaging
    |--------------------------------------------------------------------------
    */

    const packagingMachine = await prisma.machineMaster.findFirst({
      where: {
        vendor_id,
        machine_type_id: 18,
        status: "ACTIVE",
      },

      select: {
        id: true,
        sequence_no: true,
        machine_name: true,
      },

      orderBy: {
        id: "asc",
      },
    });

    if (!packagingMachine) {
      return validationResponse(0, "Active packaging machine not configured");
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 7 — GROUPWISE packing validation
    |--------------------------------------------------------------------------
    |
    | Keep same behavior as scan packing.
    |--------------------------------------------------------------------------
    */

    if (project.packing_type === PackingType.GROUPWISE) {
      const incomingGroupName = cutList.group_name?.trim();

      const incomingGroup = incomingGroupName?.toLowerCase();

      if (!incomingGroup) {
        return validationResponse(
          0,
          `Group is not configured for item "${cutList.item_name}"`,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | First existing packed item decides box group
      |--------------------------------------------------------------------------
      */

      const existingBoxItem = await prisma.cutListMachineMapping.findFirst({
        where: {
          box_id,
          vendor_id,
          project_id,

          actual_in_at: {
            not: null,
          },
        },

        orderBy: [
          {
            actual_in_at: "asc",
          },
          {
            id: "asc",
          },
        ],

        select: {
          id: true,

          cut_list: {
            select: {
              id: true,
              item_name: true,
              group_name: true,
            },
          },
        },
      });

      if (existingBoxItem?.cut_list) {
        const existingGroupName = existingBoxItem.cut_list.group_name?.trim();

        const existingGroup = existingGroupName?.toLowerCase();

        if (!existingGroup) {
          return validationResponse(
            0,
            `Existing item "${existingBoxItem.cut_list.item_name}" in this box does not have a group configured`,
          );
        }

        if (existingGroup !== incomingGroup) {
          return validationResponse(
            0,
            `This box belongs to group "${existingGroupName}". Item from group "${incomingGroupName}" cannot be packed in this box.`,
          );
        }
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 8 — Calculate per-item weight
    |--------------------------------------------------------------------------
    |
    | CutList.weight = total row weight.
    | CutListMachineMapping.weight = per-piece weight.
    |--------------------------------------------------------------------------
    */

    const totalCutListQty = Number(cutList.qty || 0);

    const totalCutListWeight = Number(cutList.weight || 0);

    const perItemWeight =
      totalCutListQty > 0
        ? Number((totalCutListWeight / totalCutListQty).toFixed(7))
        : 0;

    /*
    |--------------------------------------------------------------------------
    | STEP 9 — Add quantity to box
    |--------------------------------------------------------------------------
    */

    const result = await prisma.$transaction(
      async (tx) => {
        /*
          |--------------------------------------------------------------------------
          | Re-fetch CutList inside transaction
          |--------------------------------------------------------------------------
          */

        const currentCutList = await tx.cutList.findFirst({
          where: {
            id: cut_list_id,
            project_id,
            vendor_id,

            include_in_packing: true,
            scan_pack_validate: false,

            status: "Active",
          },

          select: {
            id: true,
            qty: true,
          },
        });

        if (!currentCutList) {
          return validationResponse(
            0,
            "Item is not available for manual packing",
          );
        }

        const totalQty = Number(currentCutList.qty || 0);

        /*
          |--------------------------------------------------------------------------
          | Calculate total quantity already packed across ALL boxes
          |--------------------------------------------------------------------------
          */

        const packedQtyResult = await tx.cutListMachineMapping.aggregate({
          where: {
            cut_list_id,
            project_id,
            vendor_id,

            machine_id: packagingMachine.id,

            /*
                |--------------------------------------------------------------------------
                | Only quantity assigned to a box is considered packed
                |--------------------------------------------------------------------------
                */
            box_id: {
              not: null,
            },
          },

          _sum: {
            qty: true,
          },
        });

        const packedQty = Number(packedQtyResult._sum.qty ?? 0);

        const pendingQty = Math.max(totalQty - packedQty, 0);

        /*
          |--------------------------------------------------------------------------
          | Nothing pending
          |--------------------------------------------------------------------------
          */

        if (pendingQty <= 0) {
          return validationResponse(0, "Item is already fully packed");
        }

        /*
          |--------------------------------------------------------------------------
          | User cannot add more than pending quantity
          |--------------------------------------------------------------------------
          */

        if (qty > pendingQty) {
          return validationResponse(0, `Only ${pendingQty} qty is pending`);
        }

        /*
          |--------------------------------------------------------------------------
          | Check same item + same box
          |--------------------------------------------------------------------------
          |
          | If found:
          | increment qty.
          |
          | If not found:
          | create a new row.
          |--------------------------------------------------------------------------
          */

        const existingMapping = await tx.cutListMachineMapping.findFirst({
          where: {
            cut_list_id,
            project_id,
            vendor_id,

            machine_id: packagingMachine.id,

            box_id,
          },

          select: {
            id: true,
            qty: true,
          },
        });

        let mapping;

        /*
          |--------------------------------------------------------------------------
          | Same box → UPDATE qty
          |--------------------------------------------------------------------------
          */

        if (existingMapping) {
          mapping = await tx.cutListMachineMapping.update({
            where: {
              id: existingMapping.id,
            },

            data: {
              qty: {
                increment: qty,
              },

              /*
                  |--------------------------------------------------------------------------
                  | Manual selection means item is packed
                  |--------------------------------------------------------------------------
                  */
              actual_in_at: new Date(),

              in_operator: user_id,

              box_id,

              expected_in: true,
            },

            select: {
              id: true,
              cut_list_id: true,
              machine_id: true,
              project_id: true,
              vendor_id: true,
              box_id: true,
              qty: true,
              actual_in_at: true,
              in_operator: true,
            },
          });
        } else {

        /*
          |--------------------------------------------------------------------------
          | New box → CREATE row
          |--------------------------------------------------------------------------
          */
          mapping = await tx.cutListMachineMapping.create({
            data: {
              cut_list_id,

              machine_id: packagingMachine.id,

              vendor_id,

              lead_id: cutList.lead_id,

              project_id,

              sequence_no: packagingMachine.sequence_no ?? 0,

              is_optional: false,

              expected_in: true,

              expected_out: false,

              status: "Pending",

              actual_in_at: new Date(),

              in_operator: user_id,

              created_by: user_id,

              box_id,

              qty,

              /*
                  |--------------------------------------------------------------------------
                  | Current convention:
                  | mapping weight stores per-piece weight
                  |--------------------------------------------------------------------------
                  */
              weight: perItemWeight,
              row_created_source: "Manual",
            },

            select: {
              id: true,
              cut_list_id: true,
              machine_id: true,
              project_id: true,
              vendor_id: true,
              box_id: true,
              qty: true,
              actual_in_at: true,
              in_operator: true,
            },
          });
        }

        /*
          |--------------------------------------------------------------------------
          | Calculate new totals
          |--------------------------------------------------------------------------
          */

        const newPackedQty = packedQty + qty;

        const newPendingQty = Math.max(totalQty - newPackedQty, 0);

        return validationResponse(1, "Product added to box successfully", {
          mapping,

          item: {
            cut_list_id: cut_list_id,

            item_name: cutList.item_name,

            box_id,

            box_name: box.box_name,

            added_qty: qty,

            total_qty: totalQty,

            packed_qty: newPackedQty,

            pending_qty: newPendingQty,

            packing_status: newPendingQty === 0 ? "Packed" : "Partially Packed",
          },
        });
      },
      {
        maxWait: 10000,
        timeout: 30000,
      },
    );

    return result;
  } catch (error: any) {
    console.error("addManualPackingItemService error:", error);

    return validationResponse(
      0,
      error?.message || "Failed to add product to box",
    );
  }
};

export type ProjectItemScanFilter = "all" | "scanned" | "pending";

export interface ProjectItemTrackingQuery {
  page: number;
  limit: number;
  search: string;
  scanStatus: ProjectItemScanFilter;
  machineId?: number;
}

type MappingRow = {
  sequence_no: number;
  qty: number;
  is_optional: boolean;
  actual_in_at: Date | null;
  machine: {
    id: number;
    machine_name: string;
    machine_code: string;
    scan_type: string;
  };
};

const getMappingScope = (
  vendorId: number,
  projectId: number,
): Prisma.CutListMachineMappingWhereInput => ({
  vendor_id: vendorId,
  project_id: projectId,
  expected_in: true,
});

const getSearchWhere = (
  search: string,
  mappingScope: Prisma.CutListMachineMappingWhereInput,
): Prisma.CutListWhereInput | undefined => {
  const value = search.trim();

  if (!value) {
    return undefined;
  }

  return {
    OR: [
      { item_name: { contains: value, mode: "insensitive" } },
      { description: { contains: value, mode: "insensitive" } },
      { unique_code: { contains: value, mode: "insensitive" } },
      { unique_code_2: { contains: value, mode: "insensitive" } },
      { material_details: { contains: value, mode: "insensitive" } },
      { category_name: { contains: value, mode: "insensitive" } },
      { group_name: { contains: value, mode: "insensitive" } },
      {
        cutListMachineMapping: {
          some: {
            ...mappingScope,
            machine: {
              is: {
                OR: [
                  {
                    machine_name: {
                      contains: value,
                      mode: "insensitive",
                    },
                  },
                  {
                    machine_code: {
                      contains: value,
                      mode: "insensitive",
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ],
  };
};

const addScanStatus = (
  where: Prisma.CutListWhereInput,
  scanStatus: ProjectItemScanFilter,
  mappingScope: Prisma.CutListMachineMappingWhereInput,
): Prisma.CutListWhereInput => {
  if (scanStatus === "all") {
    return where;
  }

  if (scanStatus === "scanned") {
    return {
      AND: [
        where,
        {
          // An unassigned item must not be considered scanned.
          cutListMachineMapping: {
            some: mappingScope,
          },
        },
        {
          // Every expected machine mapping must have a scan timestamp.
          cutListMachineMapping: {
            none: {
              ...mappingScope,
              actual_in_at: null,
            },
          },
        },
      ],
    };
  }

  return {
    AND: [
      where,
      {
        OR: [
          // Unassigned items remain visible under Pending.
          {
            cutListMachineMapping: {
              none: mappingScope,
            },
          },
          {
            cutListMachineMapping: {
              some: {
                ...mappingScope,
                actual_in_at: null,
              },
            },
          },
        ],
      },
    ],
  };
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normaliseQuantity = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const buildMachineSummaries = (rows: MappingRow[]) => {
  type MachineSummary = {
    machine_id: number;
    machine_name: string;
    machine_code: string;
    scan_type: string;
    sequence_no: number;
    is_optional: boolean;
    total_quantity: number;
    scanned_quantity: number;
    status: "scanned" | "pending";
    scanned_at: Date | null;
    last_scanned_at: Date | null;
  };

  const grouped = new Map<
    string,
    Omit<MachineSummary, "status" | "scanned_at">
  >();

  for (const row of rows) {
    // A machine can occur more than once at different points in the flow.
    const key = `${row.sequence_no}:${row.machine.id}`;
    const quantity = normaliseQuantity(row.qty);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        machine_id: row.machine.id,
        machine_name: row.machine.machine_name,
        machine_code: row.machine.machine_code,
        scan_type: String(row.machine.scan_type),
        sequence_no: row.sequence_no,
        is_optional: row.is_optional,
        total_quantity: quantity,
        scanned_quantity: row.actual_in_at ? quantity : 0,
        last_scanned_at: row.actual_in_at,
      });
      continue;
    }

    existing.total_quantity += quantity;
    existing.scanned_quantity += row.actual_in_at ? quantity : 0;
    existing.is_optional = existing.is_optional && row.is_optional;

    if (
      row.actual_in_at &&
      (!existing.last_scanned_at ||
        row.actual_in_at.getTime() > existing.last_scanned_at.getTime())
    ) {
      existing.last_scanned_at = row.actual_in_at;
    }
  }

  return Array.from(grouped.values())
    .map<MachineSummary>((machine) => {
      const scanned =
        machine.total_quantity > 0 &&
        machine.scanned_quantity >= machine.total_quantity;

      return {
        ...machine,
        status: scanned ? "scanned" : "pending",
        scanned_at: scanned ? machine.last_scanned_at : null,
      };
    })
    .sort(
      (a, b) =>
        a.sequence_no - b.sequence_no ||
        a.machine_name.localeCompare(b.machine_name),
    );
};

export const getProjectItemTrackingService = async (
  vendorId: number,
  projectId: number,
  query: ProjectItemTrackingQuery,
) => {
  const page = Math.max(1, query.page);
  const limit = Math.min(50, Math.max(1, query.limit));
  const skip = (page - 1) * limit;
  const mappingScope = getMappingScope(vendorId, projectId);

  const project = await prisma.projectMaster.findFirst({
    where: {
      id: projectId,
      vendor_id: vendorId,
    },
    select: {
      id: true,
      project_name: true,
      track_trace_status: true,
    },
  });

  if (!project) {
    return null;
  }

  const baseAnd: Prisma.CutListWhereInput[] = [];
  const searchWhere = getSearchWhere(query.search, mappingScope);

  if (searchWhere) {
    baseAnd.push(searchWhere);
  }

  if (query.machineId) {
    baseAnd.push({
      cutListMachineMapping: {
        some: {
          ...mappingScope,
          machine_id: query.machineId,
        },
      },
    });
  }

  const baseWhere: Prisma.CutListWhereInput = {
    vendor_id: vendorId,
    project_id: projectId,
    ...(baseAnd.length > 0 ? { AND: baseAnd } : {}),
  };

  const pageWhere = addScanStatus(baseWhere, query.scanStatus, mappingScope);
  const scannedWhere = addScanStatus(baseWhere, "scanned", mappingScope);
  const pendingWhere = addScanStatus(baseWhere, "pending", mappingScope);

  const [items, allCount, scannedCount, pendingCount, machines] =
    await Promise.all([
      prisma.cutList.findMany({
        where: pageWhere,
        skip,
        take: limit,
        orderBy: [{ item_name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          item_name: true,
          description: true,
          unique_code: true,
          unique_code_2: true,
          qty: true,
          length: true,
          width: true,
          thickness: true,
          material_details: true,
          category_name: true,
          group_name: true,
          procurement: true,
          weight: true,
          status: true,
          cutListMachineMapping: {
            where: mappingScope,
            orderBy: [
              { sequence_no: "asc" },
              { machine_id: "asc" },
              { id: "asc" },
            ],
            select: {
              sequence_no: true,
              qty: true,
              is_optional: true,
              actual_in_at: true,
              machine: {
                select: {
                  id: true,
                  machine_name: true,
                  machine_code: true,
                  scan_type: true,
                },
              },
            },
          },
        },
      }),
      prisma.cutList.count({ where: baseWhere }),
      prisma.cutList.count({ where: scannedWhere }),
      prisma.cutList.count({ where: pendingWhere }),
      prisma.machineMaster.findMany({
        where: {
          vendor_id: vendorId,
          cutListMachineMapping: {
            some: mappingScope,
          },
        },
        select: {
          id: true,
          machine_name: true,
          machine_code: true,
          scan_type: true,
          sequence_no: true,
        },
        orderBy: [{ sequence_no: "asc" }, { machine_name: "asc" }],
      }),
    ]);

  const data = items.map((item) => {
    const machineSummaries = buildMachineSummaries(
      item.cutListMachineMapping as MappingRow[],
    );
    const isScanned =
      machineSummaries.length > 0 &&
      machineSummaries.every((machine) => machine.status === "scanned");

    return {
      id: item.id,
      item_name: item.item_name,
      description: item.description,
      unique_code: item.unique_code,
      unique_code_2: item.unique_code_2,
      qty: item.qty,
      length: toNullableNumber(item.length),
      width: toNullableNumber(item.width),
      thickness: toNullableNumber(item.thickness),
      material_details: item.material_details,
      category_name: item.category_name,
      group_name: item.group_name,
      procurement: item.procurement,
      weight: toNullableNumber(item.weight) ?? 0,
      item_status: item.status,
      scan_status: isScanned ? ("scanned" as const) : ("pending" as const),
      assigned_machines_count: machineSummaries.length,
      scanned_machines_count: machineSummaries.filter(
        (machine) => machine.status === "scanned",
      ).length,
      machines: machineSummaries,
    };
  });

  const total =
    query.scanStatus === "scanned"
      ? scannedCount
      : query.scanStatus === "pending"
        ? pendingCount
        : allCount;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    project,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
    counts: {
      all: allCount,
      scanned: scannedCount,
      pending: pendingCount,
    },
    filters: {
      search: query.search,
      scanStatus: query.scanStatus,
      machineId: query.machineId ?? null,
    },
    filterOptions: {
      machines: machines.map((machine) => ({
        id: machine.id,
        machine_name: machine.machine_name,
        machine_code: machine.machine_code,
        scan_type: String(machine.scan_type),
        sequence_no: machine.sequence_no,
      })),
    },
  };
};
