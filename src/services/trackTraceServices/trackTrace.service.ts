import { validationResponse } from '../../../src/utils/validationResponse';
import axios from "axios";
import { prisma } from '../../prisma/client';
import { Prisma, CutListMachineMapping } from '../../prisma/generated';
import { CutListSavePayload, MarkDefectPayload, QRParam, TrackTraceDashboardPayload } from '../../../src/types/track-trace';
import ExcelJS from "exceljs";
import * as fs from "fs";
import * as path from "path";
import { getVendorSettingValue } from '../vendor.service';
import { generateSignedUrl, uploadToWasabiCompletionPhotos, uploadToWasabiDefectedItems } from '../../../src/utils/wasabiClient';
import { cache } from "../../utils/cache";

interface TrackTracePayload {
  project_id: number;
  vendor_id: number;
  machine_id: number;
  unique_code: string;
  created_by: number;
  box_id?: number;
}

// export const updateScannedItem = async (payload: TrackTracePayload) => {
//     const { project_id, vendor_id, machine_id, unique_code, created_by } = payload;

//     //check if item is mapped to any machine
//     const currentMapping =
//         await prisma.cutListMachineMapping.findFirst({
//             where: {
//                 machine_id: machine_id,
//                 vendor_id: vendor_id,

//                 cut_list: {
//                     unique_code: unique_code,
//                 },
//             },
//             select: {
//                 id: true,
//                 sequence_no: true,
//                 cut_list_id: true
//             },
//         });

//     if (!currentMapping) {
//         return validationResponse(0, 'Machine mapping not found');
//     }


//     const nextMapping =
//         await prisma.cutListMachineMapping.findFirst({
//             where: {
//                 machine_id: machine_id,
//                 vendor_id: vendor_id,

//                 cut_list: {
//                     unique_code: unique_code,
//                 },
//                 actual_in_at: null
//             },
//             select: {
//                 id: true,
//                 sequence_no: true,
//                 cut_list_id: true
//             },
//         });


//     if (!nextMapping) {
//         return validationResponse(0, 'Already Scanned');
//     }

//     const { id, sequence_no, cut_list_id } = nextMapping;
//     // return currentMapping;
//     // return id;

//     // 679 1 364

//     console.log(id, sequence_no, cut_list_id)

//     //check if already scanned in machine

//     const scanned_count = await prisma.cutListMachineMapping.count({
//         where: {
//             cut_list_id: cut_list_id,
//             vendor_id: vendor_id,            
//             sequence_no: sequence_no,
//             expected_in: true,
//             actual_in_at: null,
//             machine_id: machine_id

//         }
//     });

//     console.log("scanned_count",scanned_count);

//     //return scanned_count;


//     // this item is already scanned in provided machine
//     if (scanned_count == 0) {
//         return validationResponse(0, 'Already Scanned');
//     }



//     //check if any machine is left in sequence
//     const count = await prisma.cutListMachineMapping.count({
//         where: {
//             cut_list_id: cut_list_id,
//             vendor_id: vendor_id,            
//             sequence_no: { lt: sequence_no },
//             actual_in_at: null
//         }
//     });

//     // return count;

//     //No machine is left in sequence
//     if (count == 0) {

//         //update as scan done
//         const updated = await prisma.cutListMachineMapping.update({
//             where: {
//                 id: id,
//             },
//             data: {
//                 actual_in_at: new Date(),
//                 in_operator: created_by,
//             },
//         });
//         return validationResponse(1, 'Scan done');

//     } else {





//         return validationResponse(0, 'Scan on other machine first');
//     }







// };


export const updateScannedItem_old = async (payload: TrackTracePayload, is_check: boolean = false) => {

  try {


    const { project_id, vendor_id, machine_id, unique_code, created_by } = payload;


    //check if item is mapped to any machine
    const currentMapping = await prisma.cutListMachineMapping.findFirst({
      where: {
        machine_id: machine_id,
        vendor_id: vendor_id,
        cut_list: {
          unique_code: {
            equals: unique_code,
            mode: "insensitive",
          },
        },
      },
      select: {
        id: true,
        sequence_no: true,
        cut_list_id: true,
        project_id: true,
        project: {
          select: {
            track_trace_status: true,
          },
        },
      },
    });

    //console.log("currentMapping",currentMapping)
    if (!currentMapping) {
      return validationResponse(0, 'Machine mapping not found');
    }

    //return currentMapping;


    const nextMapping = await prisma.cutListMachineMapping.findFirst({
      where: {
        machine_id: machine_id,
        vendor_id: vendor_id,
        cut_list: {
          unique_code: {
            equals: unique_code,
            mode: "insensitive",
          },
        },
        actual_in_at: null,
      },
      select: {
        id: true,
        sequence_no: true,
        cut_list_id: true,
      },
    });


    if (!nextMapping) {
      console.log("Already Scanned");
      return validationResponse(0, 'Already Scanned');
    }

    const { id, sequence_no, cut_list_id } = nextMapping;
    // return currentMapping;
    // return id;

    // 679 1 364

    console.log(id, sequence_no, cut_list_id)

    //check if already scanned in machine

    const scanned_count = await prisma.cutListMachineMapping.count({
      where: {
        cut_list_id: cut_list_id,
        vendor_id: vendor_id,
        sequence_no: sequence_no,
        expected_in: true,
        actual_in_at: null,
        machine_id: machine_id

      }
    });

    console.log("scanned_count", scanned_count);

    //return scanned_count;


    // this item is already scanned in provided machine
    if (scanned_count == 0) {
      return validationResponse(0, 'Already Scanned');
    }



    // ✅ Check if any machine is left in sequence (excluding 'pass' type machines)
    const count = await prisma.cutListMachineMapping.count({
      where: {
        cut_list_id: cut_list_id,
        vendor_id: vendor_id,
        sequence_no: { lt: sequence_no },
        actual_in_at: null,
        machine: {
          scan_type: {
            not: 'PASS'  // Only count machines that require scanning
          }
        }
      }
    });

    // console.log("pending_scans_count", count);


    const passMachines = await prisma.cutListMachineMapping.findMany({
      where: {
        cut_list_id: cut_list_id,
        vendor_id: vendor_id,
        sequence_no: { lt: sequence_no },
        actual_in_at: null,
        machine: {
          scan_type: 'PASS'
        }
      },
      select: {
        id: true,
        machine: {
          select: {
            machine_name: true
          }
        }
      }
    });

    console.log("pass_machines_to_update", passMachines.length);

    if (count == 0) {


      if (is_check) {

        const value = await getVendorSettingValue(vendor_id, 'SHOW_STATUS_ON_SCAN');
        if (value == "1") {

          const mappedItem = await prisma.cutListMachineMapping.findFirst({
            where: {
              machine_id: machine_id,
              vendor_id: vendor_id,
              cut_list: {
                unique_code: {
                  equals: unique_code,
                  mode: "insensitive",
                },
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
                },
              },
            },
          });
          if (!mappedItem) {
            return validationResponse(0, "Item not found for this machine");
          }
          let activeDefect = null;
          if (mappedItem.cut_list_id) {
            activeDefect = await prisma.defectedItem.findFirst({
              where: {
                cut_list_id: mappedItem.cut_list_id,
                defect_status: { not: "Completed" },
              },
              orderBy: { created_at: "desc" },
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
          // generate signed URLs for each image after fetching
          if (activeDefect && activeDefect.images.length > 0) {
            const imagesWithUrls = await Promise.all(
              activeDefect.images.map(async (img) => ({
                ...img,
                signed_url: await generateSignedUrl(img.doc_sys_name),
              }))
            );

            activeDefect = { ...activeDefect, images: imagesWithUrls };
          }
          console.log("mappedItem", mappedItem);
          return validationResponse(1, '', { mappedItem, activeDefect });
        } else {
          updateScannedItem(payload, false);
        }

      } else {

        // ✅ Update all 'pass' type machines as scanned
        if (passMachines.length > 0) {
          await prisma.cutListMachineMapping.updateMany({
            where: {
              id: {
                in: passMachines.map(m => m.id)
              }
            },
            data: {
              actual_in_at: new Date(),
              in_operator: created_by,
            }
          });

          console.log(`Auto-passed ${passMachines.length} machines with scan_type='pass'`);
        }

        // ✅ Update current machine as scanned
        const updated = await prisma.cutListMachineMapping.update({
          where: {
            id: id,
          },
          data: {
            actual_in_at: new Date(),
            in_operator: created_by,
          },
        });

        console.log("currentMapping.project.track_trace_status", currentMapping.project.track_trace_status);
        await updateProjectStatus(currentMapping.project_id, currentMapping.project.track_trace_status);

        return validationResponse(1, 'Scan done');
      }






    } else {
      // ✅ There are still machines that need to be scanned before this one
      return validationResponse(0, 'Scan on other machine first old');
    }

  } catch (error) {
    console.log("Error in api", error);
    return validationResponse(0, 'Something went wrong');
  }






};

//qty wise logic

type ApiResponse = ReturnType<typeof validationResponse>;

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

    // ── Validate box_id if provided ────────────────────────────────────────
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

    /**
     * STEP 1:
     * Check whether this barcode is mapped to this machine.
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

    /**
     * STEP 2:
     * Get pending rows for this barcode on the current machine.
     *
     * Important:
     * In your data, 5 qty share same cut_list_id.
     * So we cannot decide eligibility only using cut_list_id.
     * We have to compare scanned count of previous machine vs scanned count of current machine.
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
          },
        },
        project: {
          select: {
            track_trace_status: true,
            project_name: true,
          },
        },
      },
    });

    if (pendingMappings.length === 0) {
      return validationResponse(0, "Already Scanned");
    }

    /**
     * STEP 3:
     * Find one eligible row.
     *
     * Logic:
     * - If current machine is first machine, allow scan.
     * - Else previous machine scanned count should be greater than
     *   current machine scanned count.
     *
     * Example:
     * Previous machine scanned = 1
     * Current machine scanned = 0
     * Allow 1 scan.
     *
     * Previous machine scanned = 1
     * Current machine scanned = 1
     * Block until another qty is scanned on previous machine.
     */
    let eligibleMapping: (typeof pendingMappings)[number] | null = null;

    for (const item of pendingMappings) {
      const itemProjectFilter = item.project_id
        ? { project_id: item.project_id }
        : {};

      /**
       * Get all previous non-PASS machine mappings for same cut_list_id.
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

      /**
       * If there is no previous non-PASS machine, this is the first real scan stage.
       * So allow scan.
       */
      if (previousNonPassMappings.length === 0) {
        eligibleMapping = item;
        break;
      }

      /**
       * Group previous mappings by machine and sequence.
       *
       * For each previous machine, count how many qty are scanned.
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
       * Minimum scanned qty from previous machines.
       *
       * If previous machine scanned 1 qty, current machine can scan only 1 qty.
       * If previous machine scanned 3 qty, current machine can scan 3 qty.
       */
      const previousScannedQtyList = Array.from(
        previousMachineScanMap.values(),
      ).map((data) => data.scannedQty);

      const allowedQtyForCurrentMachine = Math.min(...previousScannedQtyList);

      /**
       * Count how many qty are already scanned on current machine.
       */
      const currentMachineScannedQty =
        await prisma.cutListMachineMapping.count({
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
        });

      console.log({
        cut_list_id: item.cut_list_id,
        machine_id,
        sequence_no: item.sequence_no,
        allowedQtyForCurrentMachine,
        currentMachineScannedQty,
      });

      /**
       * If previous machine has scanned more qty than current machine,
       * then this row is eligible for scanning.
       */
      if (currentMachineScannedQty < allowedQtyForCurrentMachine) {
        eligibleMapping = item;
        break;
      }
    }

    if (!eligibleMapping) {
      return validationResponse(0, "Scan on other machine first");
    }

    const { id, sequence_no, cut_list_id } = eligibleMapping;

    /**
     * STEP 4:
     * Check mode.
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
            activeDefect.images.map(async (img: any) => ({
              ...img,
              signed_url: await generateSignedUrl(img.doc_sys_name),
            })),
          );

          activeDefect = {
            ...activeDefect,
            images: imagesWithUrls,
          };
        }

        return validationResponse(1, "", {
          mappedItem,
          activeDefect,
          countdown_timer: 3,
        });
      }

      return await updateScannedItem(payload, false, files);
    }

    /**
     * STEP 5:
     * Auto-pass previous PASS machines.
     *
     * Important:
     * Do not update all PASS rows.
     * Only update one pending PASS row per previous PASS machine/sequence.
     */
    const previousPassMappings =
      await prisma.cutListMachineMapping.findMany({
        where: {
          cut_list_id,
          vendor_id,
          ...(eligibleMapping.project_id
            ? { project_id: eligibleMapping.project_id }
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
          machine: {
            select: {
              machine_name: true,
            },
          },
        },
      });

    const passMappingIdsToUpdate: number[] = [];
    const passMachineKeySet = new Set<string>();

    for (const passMapping of previousPassMappings) {
      const key = `${passMapping.sequence_no}_${passMapping.machine_id}`;

      if (!passMachineKeySet.has(key)) {
        passMachineKeySet.add(key);
        passMappingIdsToUpdate.push(passMapping.id);
      }
    }

    if (passMappingIdsToUpdate.length > 0) {
      await prisma.cutListMachineMapping.updateMany({
        where: {
          id: {
            in: passMappingIdsToUpdate,
          },
        },
        data: {
          actual_in_at: new Date(),
          in_operator: created_by,
        },
      });

      console.log(
        `Auto-passed ${passMappingIdsToUpdate.length} PASS machine rows`,
      );
    }

    /**
     * STEP 6:
     * Mark current machine row as scanned.
     */
    const scanUpdate = await prisma.cutListMachineMapping.updateMany({
      where: {
        id,
        actual_in_at: null,
      },
      data: {
        actual_in_at: new Date(),
        in_operator: created_by,
        ...(box_id ? { box_id } : {}),
      },
    });

    if (scanUpdate.count === 0) {
      return validationResponse(0, "Already Scanned");
    }

    /**
     * STEP 7:
     * Complete pending defect if available.
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

    /**
     * STEP 8:
     * Update project track-trace status.
     */
    await updateProjectStatus(
      eligibleMapping.project_id,
      eligibleMapping.project.track_trace_status,
    );

    return validationResponse(1, "Scan done");
  } catch (error) {
    console.log("Error in api", error);
    return validationResponse(0, "Something went wrong");
  }
};

//Barcode wise logic
export const updateScannedItem_8_july_2026 = async (
  payload: TrackTracePayload,
  is_check: boolean = false,
  files: Express.Multer.File[] = [],
) => {
  try {
    const { project_id, vendor_id, machine_id, unique_code, created_by, box_id } = payload;

    // conditionally add project_id filter if provided
    const projectFilter = project_id ? { project_id } : {};

    // ── Validate box_id if provided ────────────────────────────────────────
    if (box_id) {
      const box = await prisma.boxMaster.findFirst({
        where: { id: box_id, vendor_id, project_id, is_deleted: false },
        select: { id: true },
      });
      if (!box) {
        return validationResponse(0, "Invalid box_id: box not found for this project");
      }
    }

    // check if item is mapped to any machine
    const currentMapping = await prisma.cutListMachineMapping.findFirst({
      where: {
        machine_id: machine_id,
        vendor_id: vendor_id,
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
        sequence_no: true,
        cut_list_id: true,
        project_id: true,
        project: {
          select: {
            track_trace_status: true,
          },
        },
      },
    });

    if (!currentMapping) {
      return validationResponse(0, project_id
        ? 'Item not found for this machine in the selected project'
        : 'Machine mapping not found'
      );
    }

    const nextMapping = await prisma.cutListMachineMapping.findFirst({
      where: {
        machine_id: machine_id,
        vendor_id: vendor_id,
        ...projectFilter,
        cut_list: {
          unique_code: {
            equals: unique_code,
            mode: "insensitive",
          },
        },
        actual_in_at: null,
      },
      select: {
        id: true,
        sequence_no: true,
        cut_list_id: true,
      },
    });

    if (!nextMapping) {
      console.log("Already Scanned");
      return validationResponse(0, 'Already Scanned');
    }

    const { id, sequence_no, cut_list_id } = nextMapping;

    console.log(id, sequence_no, cut_list_id);

    const scanned_count = await prisma.cutListMachineMapping.count({
      where: {
        cut_list_id: cut_list_id,
        vendor_id: vendor_id,
        sequence_no: sequence_no,
        expected_in: true,
        actual_in_at: null,
        machine_id: machine_id,
      },
    });

    console.log("scanned_count", scanned_count);

    if (scanned_count == 0) {
      return validationResponse(0, 'Already Scanned');
    }

    // check if any machine is left in sequence (excluding 'pass' type machines)
    const count = await prisma.cutListMachineMapping.count({
      where: {
        cut_list_id: cut_list_id,
        vendor_id: vendor_id,
        sequence_no: { lt: sequence_no },
        actual_in_at: null,
        machine: {
          scan_type: {
            not: 'PASS',
          },
        },
      },
    });

    const passMachines = await prisma.cutListMachineMapping.findMany({
      where: {
        cut_list_id: cut_list_id,
        vendor_id: vendor_id,
        sequence_no: { lt: sequence_no },
        actual_in_at: null,
        machine: {
          scan_type: 'PASS',
        },
      },
      select: {
        id: true,
        machine: {
          select: {
            machine_name: true,
          },
        },
      },
    });

    console.log("count", count);


    if (count == 0) {

      if (is_check) {

        const value = await getVendorSettingValue(vendor_id, 'SHOW_STATUS_ON_SCAN');
        if (value == "1") {

          const mappedItem = await prisma.cutListMachineMapping.findFirst({
            where: {
              machine_id: machine_id,
              vendor_id: vendor_id,
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
                },
              },
            },
          });

          if (!mappedItem) {
            return validationResponse(0, "Item not found for this machine");
          }

          let activeDefect = null;
          if (mappedItem.cut_list_id) {
            activeDefect = await prisma.defectedItem.findFirst({
              where: {
                cut_list_id: mappedItem.cut_list_id,
                defect_status: { not: "Completed" },
              },
              orderBy: { created_at: "desc" },
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
              activeDefect.images.map(async (img) => ({
                ...img,
                signed_url: await generateSignedUrl(img.doc_sys_name),
              }))
            );
            activeDefect = { ...activeDefect, images: imagesWithUrls };
          }

          console.log("mappedItem", mappedItem);
          return validationResponse(1, '', { mappedItem, activeDefect, countdown_timer: 3 });

        } else {
          updateScannedItem(payload, false, files);
        }

      } else {

        // auto-pass pass-type machines
        if (passMachines.length > 0) {
          await prisma.cutListMachineMapping.updateMany({
            where: {
              id: { in: passMachines.map(m => m.id) },
            },
            data: {
              actual_in_at: new Date(),
              in_operator: created_by,
            },
          });
          console.log(`Auto-passed ${passMachines.length} machines with scan_type='pass'`);
        }

        // update current machine as scanned — include box_id if provided
        await prisma.cutListMachineMapping.update({
          where: { id: id },
          data: {
            actual_in_at: new Date(),
            in_operator: created_by,
            ...(box_id ? { box_id } : {}),
          },
        });

        // ── mark defect as completed + save completion photos ──
        if (cut_list_id) {
          const pendingDefect = await prisma.defectedItem.findFirst({
            where: {
              cut_list_id: cut_list_id,
              defect_status: { not: "Completed" },
            },
          });

          if (pendingDefect) {
            // mark defect as completed with completed_by and completed_at
            await prisma.defectedItem.update({
              where: { id: pendingDefect.id },
              data: {
                defect_status: "Completed",
                defect_completed_by: created_by,
                defect_completed_at: new Date(),
              },
            });

            // save completion photos linked to the defected item
            if (files.length > 0) {
              const uploadedPhotos = await uploadToWasabiCompletionPhotos(
                files,
                vendor_id,
                id,
              );

              await prisma.defectCompletionPhoto.createMany({
                data: uploadedPhotos.map((photo) => ({
                  cut_list_machine_mapping_id: id,
                  cut_list_id: cut_list_id,
                  vendor_id: vendor_id,
                  defected_item_id: pendingDefect.id,
                  doc_og_name: photo.originalName,
                  doc_sys_name: photo.systemName,
                  created_by: created_by,
                })),
              });

              console.log(
                `Saved ${uploadedPhotos.length} completion photos for defect ${pendingDefect.id}`
              );
            }
          }
        }

        await updateProjectStatus(currentMapping.project_id, currentMapping.project.track_trace_status);


        return validationResponse(1, 'Scan done');
      }

    } else {
      return validationResponse(0, 'Scan on other machine first');
    }

  } catch (error) {
    console.log("Error in api", error);
    return validationResponse(0, 'Something went wrong');
  }
};

export const check_defect = async (payload: TrackTracePayload) => {
  console.log(payload);
  try {
    const { project_id, vendor_id, machine_id, unique_code, created_by } = payload;

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
          },
        },
      },
    });

    console.log("mappedItem", mappedItem);
    if (!mappedItem) {
      return validationResponse(0, project_id
        ? 'Item not found for this machine in the selected project'
        : 'Item not found for this machine'
      );
    }
    return validationResponse(1, '', mappedItem);
  } catch (error) {
    console.log("Error in api", error);
    return validationResponse(0, 'Something went wrong');
  }
};



export const updateProjectStatus = async (
  project_id: number,
  current_status: string
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

export const getPendingCutListMachineMappings = async (
  project_id: number
) => {
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

  const totalSqft = Math.round(
    processedItemsToday.reduce((sum, item) => {
      const length = Number(item.cut_list?.length ?? 0);
      const width = Number(item.cut_list?.width ?? 0);
      return sum + (length * width) / 92903;
    }, 0) * 100
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

  const yesterdaySqft = Math.round(
    processedItemsYesterday.reduce((sum, item) => {
      const length = Number(item.cut_list?.length ?? 0);
      const width = Number(item.cut_list?.width ?? 0);
      return sum + (length * width) / 92903;
    }, 0) * 100
  ) / 100;


  const sqftChange =
    yesterdaySqft > 0
      ? Math.round(((totalSqft - yesterdaySqft) / yesterdaySqft) * 100)
      : 0;

  const sqftTrend = totalSqft >= yesterdaySqft ? 'up' : 'down';

  const sqftSubtitle = `${sqftTrend === 'up' ? '↑' : '↓'} ${Math.abs(
    totalSqft - yesterdaySqft
  ).toFixed(2)} sqft`;


  const itemsYesterday = await prisma.cutListMachineMapping.count({
    where: baseWhereYesterday,
  });

  const itemsChange = itemsYesterday > 0
    ? Math.round(((itemsToday - itemsYesterday) / itemsYesterday) * 100)
    : 0;

  const totalMachines = await prisma.machineMaster.count({
    where: {
      vendor_id: payload.vendor_id, // or just vendor_id if variable name matches
    },
  });
  const activeMachines = await prisma.machineMaster.count({
    where: {
      status: 'ACTIVE',
      vendor_id: payload.vendor_id
    }
  });

  const machineUtilization = totalMachines > 0
    ? Math.round((activeMachines / totalMachines) * 100)
    : 0;

  const totalOperators = await prisma.userMaster.count({
    where: {
      status: 'active',
      vendor_id: payload.vendor_id
    }
  });

  const activeOperatorGroups = await prisma.userMachineMapping.groupBy({
    by: ['user_id'],
    where: {
      status: 'ACTIVE',
      vendor_id: payload.vendor_id,
    },
  });

  const activeOperatorMappings = activeOperatorGroups.length;

  const operatorAvailability = totalOperators > 0
    ? Math.round((activeOperatorMappings / totalOperators) * 100)
    : 0;

  return {
    totalItemsProcessed: {
      value: itemsToday,
      change: `${itemsChange >= 0 ? '+' : ''}${itemsChange}% vs yesterday`,
      subtitle: `${itemsChange >= 0 ? '↑' : '↓'} ${Math.abs(itemsToday - itemsYesterday)}`,
      trend: itemsChange >= 0 ? 'up' : 'down',
      sqft: {
        value: totalSqft,
        change: `${sqftChange >= 0 ? '+' : ''}${sqftChange}% vs yesterday`,
        subtitle: sqftSubtitle,
        trend: sqftTrend,
      },

    },
    activeMachines: {
      value: `${activeMachines}/${totalMachines}`,
      change: `${machineUtilization}% utilization`,
      subtitle: `${totalMachines - activeMachines} idle`,
      trend: 'neutral',
    },
    activeOperators: {
      value: `${activeOperatorMappings}/${totalOperators}`,
      change: `${operatorAvailability}% availability`,
      subtitle: `${totalOperators - activeOperatorMappings} available`,
      trend: 'neutral',
    },
  };


};


export const getRealTimeItemTracking = async (payload: TrackTraceDashboardPayload) => {

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
      actual_in_at: 'desc',
    },
    take: 10,
  });


  const today = new Date();
  today.setHours(0, 0, 0, 0);


  const formattedResult = result.map(item => {
    const date = new Date(item.actual_in_at ?? new Date());
    const isToday = date >= today;

    const formattedDate = isToday
      ? date.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
      })
      : date.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Asia/Kolkata',
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




export const getMachineStatus1 = async (payload: TrackTraceDashboardPayload) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const machines = await prisma.machineMaster.findMany({
      include: {
        userMachineMappings: {
          where: {
            status: 'ACTIVE'
          },
          include: {
            user: {
              select: {
                user_name: true,
                id: true
              }
            }
          },
          take: 1
        }
      },
      orderBy: {
        machine_name: 'asc'
      }
    });

    // Calculate utilization for each machine
    const machinesWithUtilization = await Promise.all(
      machines.map(async (machine) => {
        // Get all scans for this machine today, ordered by time
        const todayScans = await prisma.cutListMachineMapping.findMany({
          where: {
            machine_id: machine.id,
            actual_in_at: {
              gte: todayStart
            }
          },
          orderBy: {
            actual_in_at: 'asc'
          },
          select: {
            id: true,
            actual_in_at: true,
            cut_list_id: true,
          }
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
        const utilization = machine.status === 'MAINTENANCE' || machine.status === 'INACTIVE'
          ? 0
          : Math.min(Math.round((totalActiveSeconds / workingSeconds) * 100), 100);

        // Check if currently processing (has items with IN scan but no matching OUT)
        const currentlyProcessing = itemSessions.size > 0;

        // Count completed items today (items that have both IN and OUT scans)
        const completedItems = await prisma.cutListMachineMapping.groupBy({
          by: ['cut_list_id'],
          where: {
            machine_id: machine.id,
            actual_in_at: {
              gte: todayStart
            }
          }
        });

        const operator = machine.userMachineMappings[0]?.user
          ? `${machine.userMachineMappings[0].user.user_name}`
          : undefined;

        return {
          id: machine.id,
          name: machine.machine_name,
          status: currentlyProcessing && machine.status === 'ACTIVE'
            ? 'ACTIVE'
            : machine.status === 'ACTIVE'
              ? 'IDLE'
              : machine.status,
          operator,
          utilization,
          itemsProcessedToday: completedItems.length
        };
      })
    );

    machinesWithUtilization.sort(
      (a, b) => b.utilization - a.utilization
    );
    return machinesWithUtilization;
  } catch (error) {
    console.error('Error fetching machines:', error);
  }
};


export const getHourlyProduction1 = async (payload: TrackTraceDashboardPayload) => {

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
            not: null
          }
        }
      });

      const hourLabel = hour === 12
        ? '12 PM'
        : hour > 12
          ? `${hour - 12} PM`
          : `${hour} AM`;

      labels.push(hourLabel);
      data.push(count);
    }

    // Target is 60 items per hour
    const target = new Array(labels.length).fill(60);

    return {
      labels,
      datasets: [
        {
          label: 'Items Processed',
          data,
          borderColor: '#111827',
          backgroundColor: 'rgba(17, 24, 39, 0.1)',
        },
        {
          label: 'Target',
          data: target,
          borderColor: '#9CA3AF',
          backgroundColor: 'transparent',
        }
      ]
    };
  } catch (error) {
    console.error('Error fetching hourly production:', error);
  }
};

export const getHourlyProduction = async (
  payload: TrackTraceDashboardPayload
) => {
  try {
    const timeZone = 'Asia/Kolkata';

    // Today's date in vendor timezone
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone }); // "2025-04-08"

    // Get vendor's UTC offset in ms
    // e.g. Asia/Kolkata = +5:30 = +19800000ms
    const offsetMs = (() => {
      const utcDate = new Date(`${todayStr}T12:00:00Z`);
      const localStr = utcDate.toLocaleString('en-CA', { timeZone, hour12: false })
        .replace(',', '');
      const localDate = new Date(localStr + 'Z');
      return localDate.getTime() - utcDate.getTime();
    })();

    const labels: string[] = [];
    const data: number[] = [];

    for (let hour = 8; hour <= 20; hour++) {
      // Build hour boundaries as if in vendor timezone, then shift to UTC
      const hourStartUTC = new Date(
        new Date(`${todayStr}T${String(hour).padStart(2, '0')}:00:00Z`).getTime() - offsetMs
      );
      const hourEndUTC = new Date(
        new Date(`${todayStr}T${String(hour + 1).padStart(2, '0')}:00:00Z`).getTime() - offsetMs
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
        hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`;

      labels.push(hourLabel);
      data.push(Math.round(sqftThisHour * 100) / 100);
    }

    const targetSqftPerHour = 500;
    const target = new Array(labels.length).fill(targetSqftPerHour);

    return {
      labels,
      datasets: [
        {
          label: 'SQFT Processed',
          data,
          borderColor: '#111827',
          backgroundColor: 'rgba(17, 24, 39, 0.1)',
        },
        {
          label: 'Target SQFT',
          data: target,
          borderColor: '#9CA3AF',
          backgroundColor: 'transparent',
          borderDash: [6, 6],
        },
      ],
    };
  } catch (error) {
    console.error('Error fetching hourly production:', error);
    throw error;
  }
};


export const getMachineUtilization1 = async (payload: TrackTraceDashboardPayload) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));

    // Get all machines
    const machines = await prisma.machineMaster.findMany({
      select: {
        id: true,
        machine_name: true,
        status: true
      }
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
            gte: todayStart
          }
        },
        orderBy: {
          actual_in_at: 'asc'
        },
        select: {
          cut_list_id: true,
          actual_in_at: true,
          actual_out_at: true,
          created_at: true
        }
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
      const utilization = machine.status === 'MAINTENANCE' || machine.status === 'INACTIVE'
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
      '#111827', '#1F2937', '#374151', '#4B5563', '#6B7280', '#9CA3AF'
    ];

    let colorIndex = 0;
    machineTypes.forEach((stats, type) => {
      labels.push(type);
      const avgUtilization = stats.active > 0
        ? Math.round(stats.total / stats.active)
        : 0;
      data.push(avgUtilization);
      colors.push(colorPalette[colorIndex % colorPalette.length]);
      colorIndex++;
    });

    return {
      labels,
      datasets: [
        {
          label: 'Utilization %',
          data,
          backgroundColor: colors,
        }
      ]
    };
  } catch (error) {
    console.error('Error fetching machine utilization:', error);
    throw new Error('Failed to fetch machine utilization data');
  }
};


export const getMachineUtilization = async (
  payload: TrackTraceDashboardPayload
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
    console.log(machines)

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

      if (machine.status !== 'ACTIVE') continue;

      const scans = await prisma.cutListMachineMapping.findMany({
        where: {
          machine_id: machine.id,
          actual_in_at: { gte: todayStart },
        },
        orderBy: { actual_in_at: 'asc' },
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

        const durationSeconds =
          (end.getTime() - start.getTime()) / 1000;

        const sqft =
          (Number(current.cut_list.length) * Number(current.cut_list.width)) / 92903;

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
      '#111827',
      '#1F2937',
      '#374151',
      '#4B5563',
      '#6B7280',
      '#9CA3AF',
    ];

    let colorIndex = 0;


    machineTypes.forEach((stats, type) => {
      const maxWeightedSeconds =
        WORKING_SECONDS * EXPECTED_SQFT_PER_MACHINE * stats.count;

      const utilization =
        maxWeightedSeconds > 0
          ? Math.min(
            Math.round(
              (stats.weightedSeconds / maxWeightedSeconds) * 100
            ),
            100
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
          label: 'SQFT Weighted Utilization %',
          data,
          backgroundColor: colors,
        },
      ],
    };
  } catch (error) {
    console.error('Error fetching machine utilization:', error);
    throw new Error('Failed to fetch machine utilization data');
  }
};


export const getMachineStatus = async (payload: TrackTraceDashboardPayload) => {
  try {
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
    const now = new Date();



    const baseWhere: any = {
      vendor_id: payload.vendor_id,
      status: 'ACTIVE'
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
      status: 'ACTIVE'
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
            user: { select: { user_name: true, id: true } }
          },
          take: 1
        }
      },
      orderBy: { machine_name: 'asc' }
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
          actual_in_at: { gte: todayStart }
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
          orderBy: { actual_in_at: 'asc' },
          include: {
            cut_list: {
              select: {
                id: true,
                length: true,
                width: true
              }
            }
          }
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

          const durationSeconds =
            (end.getTime() - start.getTime()) / 1000;

          totalActiveSeconds += durationSeconds;

          const sqft =
            (Number(current.cut_list.length) * Number(current.cut_list.width)) / 92903;

          if (next) {
            sqftProcessedToday += sqft;
          } else {
            sqftInProcess += sqft;
          }
        }

        const workingSeconds = 8 * 60 * 60;

        const utilization =
          machine.status !== 'ACTIVE'
            ? 0
            : Math.min(
              Math.round((totalActiveSeconds / workingSeconds) * 100),
              100
            );

        const operator = machine.userMachineMappings[0]?.user?.user_name;

        return {
          id: machine.id,
          name: machine.machine_name,
          status:
            sqftInProcess > 0 && machine.status === 'ACTIVE'
              ? 'ACTIVE'
              : machine.status === 'ACTIVE'
                ? 'IDLE'
                : machine.status,
          operator,
          utilization,
          sqftProcessedToday: Math.round(sqftProcessedToday * 100) / 100,
          sqftInProcess: Math.round(sqftInProcess * 100) / 100
        };
      })
    );

    return machinesWithMetrics.sort(
      (a, b) => b.utilization - a.utilization
    );
  } catch (error) {
    console.error('Error fetching machines:', error);
    throw error;
  }
};



export const getTopPerformer = async (payload: TrackTraceDashboardPayload) => {
  try {
    // Get today's start
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0));


    const baseWhere: any = {
      status: 'ACTIVE',
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
          }
        },
        machine: {
          select: {
            id: true,
            machine_name: true
          }
        }
      }
    });

    const operatorPerformance = await Promise.all(
      userMappings.map(async (mapping) => {
        // Get all items scanned on this machine today
        const scannedItems = await prisma.cutListMachineMapping.findMany({
          where: {
            machine_id: mapping.machine_id,
            actual_in_at: {
              gte: todayStart,
              not: null
            }
          },
          orderBy: {
            actual_in_at: 'asc'
          },
          select: {
            cut_list_id: true,
            actual_in_at: true,
          }
        });

        const itemsProcessed = scannedItems.length;

        // Calculate average time between scans (throughput rate)
        let totalGapSeconds = 0;
        for (let i = 1; i < scannedItems.length; i++) {
          const gap = (scannedItems[i].actual_in_at!.getTime() - scannedItems[i - 1].actual_in_at!.getTime()) / 1000;
          totalGapSeconds += gap;
        }

        const avgTimeSeconds = scannedItems.length > 1
          ? totalGapSeconds / (scannedItems.length - 1)
          : 0;
        const avgTimeMinutes = Math.round(avgTimeSeconds / 60 * 10) / 10;

        // Calculate efficiency based on throughput
        // Target: 1 item every 10 minutes (6 items per hour)
        const targetTimeSeconds = 10 * 60;
        const efficiency = avgTimeSeconds > 0
          ? Math.min(Math.round((targetTimeSeconds / avgTimeSeconds) * 100), 100)
          : 0;

        return {
          id: mapping.user_id,
          name: `${mapping.user.user_name}`,
          machine: mapping.machine.machine_name,
          itemsProcessed,
          avgTime: itemsProcessed > 1 ? `${avgTimeMinutes}m` : '-',
          efficiency: itemsProcessed > 1 ? efficiency : 0
        };
      })
    );

    const sortedOperators = operatorPerformance
      .filter(op => op.itemsProcessed > 0)
      .sort((a, b) => b.itemsProcessed - a.itemsProcessed)
      .slice(0, 10);


    return sortedOperators;
  } catch (error) {
    console.error('Error fetching operator performance:', error);

  }
};



export const getProjectProgress = async (payload: TrackTraceDashboardPayload) => {
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
WHERE clmm.vendor_id = ${payload.vendor_id}
GROUP BY
    cl.item_name,
    lm.lead_code,
    pm.project_name
`;


    const enrichedResult = result.map(item => {
      const total = item.pending + item.processed;
      const progress =
        total > 0
          ? Math.round((item.processed / total) * 100)
          : 0;

      const total_sqft = item.sqft_pending + item.sqft_processed;
      const progress_sqft =
        total > 0
          ? Math.round((item.sqft_processed / total_sqft) * 100)
          : 0;

      return {
        ...item,
        total,
        progress, // percentage
        progress_sqft
      };
    });




    return enrichedResult;


  } catch (error) {
    console.error('Error fetching projects:', error);

  }
}

export const getBottleNeck = async (payload: TrackTraceDashboardPayload) => {
  try {
    const machines = await prisma.machineMaster.findMany({
      where: {
        status: {
          in: ['ACTIVE']
        },
        vendor_id: payload.vendor_id
      },
      include: {
        userMachineMappings: {
          where: {
            status: 'ACTIVE',
            vendor_id: payload.vendor_id
          },
          include: {
            user: {
              select: {
                user_name: true,
              }
            }
          },
          take: 1
        },
        cutListMachineMapping: {
          where: {
            actual_in_at: null  // Items not yet completed (queued items)
          },
          include: {
            cut_list: true
          }
        }
      }
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
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          },
          orderBy: {
            actual_in_at: 'asc'
          },
          select: {
            actual_in_at: true,
          },
          take: 20
        });

        let avgWaitMinutes = 10; // Default: 10 minutes per item

        // Calculate average time between scans (processing rate)
        if (recentScans.length > 1) {
          let totalGapSeconds = 0;
          for (let i = 1; i < recentScans.length; i++) {
            const gap = (recentScans[i].actual_in_at!.getTime() - recentScans[i - 1].actual_in_at!.getTime()) / 1000;
            totalGapSeconds += gap;
          }
          avgWaitMinutes = Math.round((totalGapSeconds / (recentScans.length - 1)) / 60);
        }

        const avgWait = avgWaitMinutes >= 60
          ? `${Math.round(avgWaitMinutes / 60)}h ${avgWaitMinutes % 60}m`
          : `${avgWaitMinutes}m`;

        // Estimate total wait time for queue
        const estimatedWaitMinutes = avgWaitMinutes * queueCount;

        // Determine severity based on queue size and estimated wait
        let severity: 'high' | 'medium' | 'low';
        let percentage: number;

        if (queueCount > 20 || estimatedWaitMinutes > 120) {
          severity = 'high';
          percentage = Math.min(100, Math.round((estimatedWaitMinutes / 180) * 100));
        } else if (queueCount > 10 || estimatedWaitMinutes > 60) {
          severity = 'medium';
          percentage = Math.round((estimatedWaitMinutes / 120) * 100);
        } else {
          severity = 'low';
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
          percentage: Math.min(percentage, 100)
        };
      })
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
    console.error('Error fetching bottlenecks:', error);
    throw new Error('Failed to fetch bottleneck data');
  }
};



export const getAllProjectsByVendorId = (vendor_id: number) => {
  return prisma.projectMaster.findMany({
    where: {
      vendor_id: vendor_id,
    },
    orderBy: {
      project_name: 'asc', // or 'desc'
    },

  });
};


export const getAllMachinesByVendorId = (vendor_id: number) => {
  return prisma.machineMaster.findMany({
    where: {
      vendor_id: vendor_id,
    },
    orderBy: {
      machine_name: 'asc', // or 'desc'
    },

  });
};

export const getAllUsersByVendorId = (vendor_id: number) => {
  return prisma.userMaster.findMany({
    where: {
      vendor_id: vendor_id,
    },
    orderBy: {
      user_name: 'asc', // or 'desc'
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

  return {
    data: result,
    machineColumns: machineColumns,
  };
};




export const assignMachine = async (payload: CutListSavePayload) => {

  try {
    console.log("payload.project_id", payload.project_id);
    const projectMaster = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id: payload.project_id
      },
      select: {
        id: true
      }
    });

    console.log("projectMaster", projectMaster);

    const projectId = projectMaster?.id;

    if (!projectId) {
      return validationResponse(0, 'Project not found');
    }

    const cutListIdArray = payload.cutListIds
      .split(",")
      .map(id => Number(id.trim()))
      .filter(id => !isNaN(id));

    return await prisma.$transaction(async (tx) => {

      if (!payload.assigned) {
        await tx.cutListMachineMapping.deleteMany({
          where: {
            cut_list_id: { in: cutListIdArray },
            machine_id: payload.machine_id,
            project_id: Number(projectId)
          }
        });

        return validationResponse(1, 'Machine unmapped');
      }

      // ✅ Fetch cutList rows to get qty and lead_id per cut_list_id
      const cutListRows = await tx.cutList.findMany({
        where: {
          id: { in: cutListIdArray }
        },
        select: {
          id: true,
          qty: true,
          lead_id: true
        }
      });

      console.log(cutListRows);

      // ✅ Find which cut_list_ids already have mapping for this machine
      const existing = await tx.cutListMachineMapping.findMany({
        where: {
          cut_list_id: { in: cutListIdArray },
          machine_id: payload.machine_id,
          project_id: Number(projectId)
        },
        select: { cut_list_id: true }
      });

      const existingIds = new Set(existing.map(e => e.cut_list_id));

      // ✅ Only process cut_list_ids that don't already have a mapping
      const newCutListRows = cutListRows.filter(row => !existingIds.has(row.id));

      if (newCutListRows.length === 0) {
        return validationResponse(1, 'Machine mapped successfully');
      }

      const machine = await tx.machineMaster.findFirst({
        where: {
          id: payload.machine_id
        }
      });

      const sequence = machine?.sequence_no;
      if (sequence == null) {
        return validationResponse(0, 'Machine sequence not set');
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
            expected_in: true
          });
        }
      }

      await tx.cutListMachineMapping.createMany({
        data: mappingData
      });

      return validationResponse(1, 'Machine mapped successfully');

    });
  } catch (error) {
    console.log(error);
    return validationResponse(0, 'Something went wrong');
  }
};


export const createQR = async (payload: QRParam) => {

  try {


    const projectId = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id: payload.projectId
      },
      select: {
        id: true
      }
    })

    // console.log(payload.cutListIds)
    if (projectId) {
      let cutListIds: number[] | undefined;
      if (payload.cutListIds) {
        cutListIds = payload.cutListIds
          .split(",")
          .map((id) => Number(id.trim()))
          .filter((id) => !isNaN(id));
      }


      console.log("cutListIds", cutListIds)

      const cutLists = await prisma.cutListMachineMapping.findMany({
        where: {
          vendor_id: Number(payload.vendorId),
          project_id: Number(projectId.id),
          ...(cutListIds && cutListIds.length > 0
            ? { cut_list_id: { in: cutListIds } }
            : {}),
        },
        distinct: ['cut_list_id'],
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

      console.log("cutLists", cutLists)
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
    console.error('Error generating QR code:', error);
    throw error;
  }
}







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
  const fixedWidths: number[] = [30, 12, 12, 12, 8, 35, 30, 20, 20, 15, 15, 15, 15];
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
      lastname: true
    },
    orderBy: {
      lead_code: "asc",
    },
    take: 20, // limit results for search dropdown
  });

  return leads;
};


export const linkLeadToProject = async (vendorId: number, leadId: number, projectId: number) => {
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

    return validationResponse(1, 'Lead Updated Successfully');
  });


};




export const get_defect = async (vendorId: number) => {

  const defects = await prisma.defectMaster.findMany({
    where: {
      OR: [
        { vendor_id: null },
        { vendor_id: vendorId }
      ]
    },
    select: {
      id: true,
      defect_name: true
    },
    orderBy: {
      defect_name: "asc"
    }
  });
  return {
    data: defects,
  };
};

export const mark_Defect_old = async (payload: MarkDefectPayload) => {

  console.log("payload.cut_list_machine_mapping_id", payload.cut_list_machine_mapping_id);
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
  vendorId: number
) => {
  return await prisma.$transaction(async (tx) => {

    const existingDefect = await tx.defectedItem.findFirst({
      where: {
        cut_list_id: payload.cut_list_id,
        defect_status: { not: "Completed" },
      },
      orderBy: { created_at: "desc" },
    });

    if (existingDefect) {
      return validationResponse(0, "Item is already marked as defected and has not been completed yet");
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
        rework_machine_id: payload.rework_machine_id
      },
    });

    // upload to wasabi now that we have defectedItem.id
    const uploadedImages = await uploadToWasabiDefectedItems(files, vendorId, defectedItem.id);

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
    }
    else if (payload.action == "rework" && payload.rework_machine_id) {
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


export const getScanStatsDashboard = async (vendor_id: number, user_id: number) => {
  try {

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const total_items_scanned_today =
      await prisma.cutListMachineMapping.count({
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
export const getReworkMachines = async (vendor_id: number, machine_id: number) => {


  const currentMachine = await prisma.machineMaster.findFirst({
    where: { id: machine_id, vendor_id },
    select: { sequence_no: true },
  });

  console.log(currentMachine)

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
    // Get all machine type IDs assigned to this user
    const mappings = await prisma.userMachineMapping.findMany({
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
    });

    // Collect unique machine_type_ids
    const typeIds = [...new Set(
      mappings
        .map(m => m.machine.machine_type_id)
        .filter((id): id is number => id !== null)
    )];

    const modules = {
      track_and_trace: false,
      quality_check: false,
      scan_and_pack: false,
    };

    for (const typeId of typeIds) {
      if (typeId === 17) {
        modules.quality_check = true;
      } else if (typeId === 18) {
        modules.scan_and_pack = true;
      } else {
        modules.track_and_trace = true;
      }
    }

    return validationResponse(1, "", { modules });
  } catch (error) {
    console.log("Error in getUserModules", error);
    return validationResponse(0, "Something went wrong");
  }
};


export const getQualityCheckProjects = async (vendor_id: number) => {
  try {
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
      return validationResponse(1, "", { projects: [] });
    }

    const qualityMachineId = qualityMachine.id;

    /**
     * Show all projects for this vendor.
     */
    const projects = await prisma.projectMaster.findMany({
      where: {
        vendor_id,
      },
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
    });

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
          const qualityScannedQty =
            await prisma.cutListMachineMapping.count({
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
      select: { id: true, machine_name: true, sequence_no: true, machine_type_id: true },
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

          const isQCStation = machine.machine_type_id === 17 || machine.machine_type_id === 18;

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
            const cutListsWithPrior = await prisma.cutListMachineMapping.findMany({
              where: {
                project_id: project.id,
                vendor_id,
                sequence_no: { lt: machine.sequence_no ?? 0 },
                expected_in: true,
              },
              select: { cut_list_id: true },
              distinct: ["cut_list_id"],
            });
            const cutListIdsWithPrior = cutListsWithPrior.map((r) => r.cut_list_id);

            // Part A: rows at QC where cut_list HAS prior machines
            // eligible = the immediately previous assigned machine for that cut_list is scanned
            // We count QC rows where the cut_list's max-seq prior row has actual_in_at != null
            const partARows = await prisma.cutListMachineMapping.findMany({
              where: {
                project_id: project.id,
                vendor_id,
                machine_id: machine.id,
                expected_in: true,
                cut_list_id: cutListIdsWithPrior.length > 0
                  ? { in: cutListIdsWithPrior }
                  : { in: [-1] }, // empty set
              },
              select: { cut_list_id: true, id: true },
            });

            // For each Part A row, check if the last prior machine is scanned
            let partAEligible = 0;
            for (const row of partARows) {
              // Find the highest sequence_no prior machine row for this cut_list
              const lastPriorRow = await prisma.cutListMachineMapping.findFirst({
                where: {
                  project_id: project.id,
                  vendor_id,
                  cut_list_id: row.cut_list_id,
                  sequence_no: { lt: machine.sequence_no ?? 0 },
                  expected_in: true,
                },
                orderBy: { sequence_no: "desc" },
                select: { actual_in_at: true },
              });
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
                  : { cut_list_id: { notIn: [-1] } } // empty set — nothing qualifies as prior-less if no prior exists at all
                ),
              },
            });

            total = partAEligible + partBCount;

          } else {
            // Normal machines: count rows at this machine where
            // the last assigned machine before this one (for that cut_list) is scanned
            const thisMachineRows = await prisma.cutListMachineMapping.findMany({
              where: {
                project_id: project.id,
                vendor_id,
                machine_id: machine.id,
                expected_in: true,
              },
              select: { cut_list_id: true },
            });

            let eligible = 0;
            for (const row of thisMachineRows) {
              // Find the last machine assigned to this cut_list before current seq
              const lastPriorRow = await prisma.cutListMachineMapping.findFirst({
                where: {
                  project_id: project.id,
                  vendor_id,
                  cut_list_id: row.cut_list_id,
                  sequence_no: { lt: machine.sequence_no ?? 0 },
                  expected_in: true,
                },
                orderBy: { sequence_no: "desc" },
                select: { actual_in_at: true },
              });

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
        })
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
    const active = allStatuses.filter((p) => activeStatuses.includes(p.project_status));
    const archived = allStatuses.filter((p) => !activeStatuses.includes(p.project_status));

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
        where: { vendor_id },
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
      cutListId: Mapping["cut_list_id"]
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
        (assignedCountByProjectMachine.get(pmKey) ?? 0) + 1
      );

      if (row.actual_in_at !== null) {
        scannedCountByProjectMachine.set(
          pmKey,
          (scannedCountByProjectMachine.get(pmKey) ?? 0) + 1
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
      currentSequenceNo: number
    ) => {
      const rows = rowsByProjectCutList.get(
        projectCutListKey(projectId, cutListId)
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
                machineSequenceNo
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
        ? assignedCountByProjectMachine.get(
          projectMachineKey(project.id, firstMachine.id)
        ) ?? 0
        : 0;

      const panels_scanned = lastMachine
        ? scannedCountByProjectMachine.get(
          projectMachineKey(project.id, lastMachine.id)
        ) ?? 0
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
      activeStatuses.has(p.project_status ?? "")
    );

    const archived = allStatuses.filter(
      (p) => !activeStatuses.has(p.project_status ?? "")
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
        status: true,
        created_at: true,
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
  created_by: number
) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const category = await tx.projectCategoriesMaster.create({
        data: { category_name, vendor_id, status: "Yes" },
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

      return category;
    });

    return validationResponse(1, "Category created successfully", { id: result.id });
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
  updated_by: number
) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.projectCategoriesMaster.update({
        where: { id },
        data: { category_name, status },
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
  status: "Yes" | "No"
) => {
  try {
    await prisma.projectCategoriesMaster.update({
      where: { id },
      data: { status },
    });

    return validationResponse(1, `Category ${status === "Yes" ? "activated" : "deactivated"} successfully`);
  } catch (error) {
    console.error("Error in toggleProjectCategoryStatus", error);
    return validationResponse(0, "Something went wrong");
  }
};

export const unsetBoxFromMappingService = async (
  mapping_id: number,
  project_id: number,
  vendor_id: number
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
    if (!mapping.box_id) return validationResponse(0, "Item is not assigned to any box");

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
  user_id: number
) => {
  try {
    const box = await prisma.boxMaster.findFirst({
      where: { id: box_id, project_id, vendor_id, is_deleted: false },
      select: { id: true, box_status: true, factory_out_at: true },
    });

    if (!box) return validationResponse(0, "Box not found");
    if (box.box_status !== "packed") return validationResponse(0, "Only packed boxes can be marked as factory out");
    if (box.factory_out_at) return validationResponse(0, "Box already marked as factory out");

    const updated = await prisma.boxMaster.update({
      where: { id: box_id },
      data: {
        factory_out_at: new Date(),
        factory_out_by: user_id,
      },
      select: { id: true, box_name: true, factory_out_at: true, factory_out_by: true },
    });

    return validationResponse(1, "Box marked as factory out successfully", updated);

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
  user_id: number
) => {
  try {
    const box = await prisma.boxMaster.findFirst({
      where: { id: box_id, project_id, vendor_id, is_deleted: false },
      select: { id: true, box_status: true, factory_out_at: true, site_in_at: true },
    });

    if (!box) return validationResponse(0, "Box not found");
    if (box.box_status !== "packed") return validationResponse(0, "Only packed boxes can be marked as site in");
    if (!box.factory_out_at) return validationResponse(0, "Box has not been marked as factory out yet");
    if (box.site_in_at) return validationResponse(0, "Box already marked as site in");

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
      return validationResponse(0, "No active token found for this vendor. Please connect your CadBid account first.");
    }

    // ── 2. Call CadBid API ───────────────────────────────────────────────────
    let externalCategories: { nItemCategoryId: number; sName: string }[] = [];

    try {
      const response = await axios.get(CADBID_API_URL, {
        headers: {
          "Authorization": `Bearer ${tokenRecord.token}`,
        },
        timeout: 15000,
      });

      // externalCategories = Array.isArray(response.data.categories) ? response.data : [];
      externalCategories = Array.isArray(response.data?.categories) ? response.data.categories : [];

      console.log("externalCategories count:", externalCategories.length);
    } catch (apiErr: any) {
      console.error("CadBid API error:", apiErr?.response?.data ?? apiErr.message);
      return validationResponse(0, "Failed to fetch categories from CadBid. Please check your token.");
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

    return validationResponse(1, `Sync complete. ${created} created, ${updated} updated.`, {
      total: externalCategories.length,
      created,
      updated,
      skipped: externalCategories.length - created - updated,
    });

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

    return validationResponse(1, "Token status fetched", { has_token: !!token, token });
  } catch (error) {
    console.error("Error in checkExternalTokenService:", error);
    return validationResponse(0, "Failed to check token");
  }
};




export const getProjectDetailService = async (
  vendor_id: number,
  unique_project_id: string
) => {
  try {

    // ── Resolve unique_project_id → project_id ────────────────────────────────
    const projectLookup = await prisma.projectMaster.findFirst({
      where: { unique_project_id, vendor_id },
      select: { id: true },
    });
    if (!projectLookup) return validationResponse(0, "Project not found");
    const project_id = projectLookup.id;

    // ── 1. Project + lead info ────────────────────────────────────────────────
    const project = await prisma.projectMaster.findFirst({
      where: { id: project_id, vendor_id },
      select: {                              // ✅ fix 1: select was missing
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

    if (!project) return validationResponse(0, "Project not found");

    // Fetch lead separately
    let lead: { firstname: string; contact_no: string; email: string | null; site_address: string | null } | null = null;
    if (project.lead_id) {
      lead = await prisma.leadMaster.findUnique({
        where: { id: project.lead_id },
        select: { firstname: true, contact_no: true, email: true, site_address: true },
      });
    }

    // ── 2. Boxes ──────────────────────────────────────────────────────────────
    const boxes = await prisma.boxMaster.findMany({
      where: { project_id, vendor_id, is_deleted: false },
      select: {
        id: true,
        box_name: true,
        box_status: true,
        factory_out_at: true,
        factory_out_by: true,
        site_in_at: true,
        site_in_by: true,
      },
      orderBy: { id: "asc" },
    });

    const boxItemCounts = await Promise.all(
      boxes.map(b =>
        prisma.cutListMachineMapping.count({
          where: { box_id: b.id, project_id, vendor_id, expected_in: true },
        })
      )
    );

    const operatorIds = [
      ...new Set([
        ...boxes.map(b => b.factory_out_by).filter(Boolean),
        ...boxes.map(b => b.site_in_by).filter(Boolean),
      ])
    ] as number[];

    const operators = operatorIds.length > 0
      ? await prisma.userMaster.findMany({
        where: { id: { in: operatorIds } },
        select: { id: true, user_name: true },
      })
      : [];
    const operatorMap = new Map(operators.map(u => [u.id, u.user_name]));

    // ── 3. Machines ───────────────────────────────────────────────────────────
    const distinctMachines = await prisma.cutListMachineMapping.findMany({
      where: { project_id, vendor_id, expected_in: true },
      distinct: ["machine_id"],
      select: {
        machine_id: true,
        machine: {
          select: {
            id: true,
            machine_name: true,
            machineType: { select: { machine_type: true } },
          },
        },
      },
    });

    const machineStats = await Promise.all(
      distinctMachines.map(async (m) => {
        const [total, scanned] = await Promise.all([
          prisma.cutListMachineMapping.count({ where: { project_id, vendor_id, machine_id: m.machine_id, expected_in: true } }),
          prisma.cutListMachineMapping.count({ where: { project_id, vendor_id, machine_id: m.machine_id, expected_in: true, actual_in_at: { not: null } } }),
        ]);
        return {
          machine_id: m.machine_id,
          machine_name: m.machine.machine_name,
          machine_type: m.machine.machineType?.machine_type ?? null,
          total, scanned,
          pending: total - scanned,
          pct: total > 0 ? Math.round((scanned / total) * 100) : 0,
        };
      })
    );

    // ── 4. Cut list — one row per panel unit ──────────────────────────────────
    const allMappings = await prisma.cutListMachineMapping.findMany({
      where: { project_id, vendor_id, expected_in: true },
      select: {
        id: true,
        cut_list_id: true,
        machine_id: true,
        sequence_no: true,
        actual_in_at: true,
        box_id: true,
        in_operator: true,
        machine: { select: { id: true, machine_name: true } },
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
          },
        },
      },
      orderBy: [{ cut_list_id: "asc" }, { machine_id: "asc" }, { id: "asc" }],
    });

    // Collect operator ids for name lookup
    const allInOperatorIds = [
      ...new Set(allMappings.map(m => m.in_operator).filter(Boolean))
    ] as number[];

    const allOperators = allInOperatorIds.length > 0
      ? await prisma.userMaster.findMany({
        where: { id: { in: allInOperatorIds } },
        select: { id: true, user_name: true },
      })
      : [];
    const allOperatorMap = new Map(allOperators.map(u => [u.id, u.user_name]));

    // Group by cut_list_id, then pair units across machines
    const cutlistByItem = new Map<number, typeof allMappings>();
    for (const m of allMappings) {
      if (!cutlistByItem.has(m.cut_list_id)) cutlistByItem.set(m.cut_list_id, []);
      cutlistByItem.get(m.cut_list_id)!.push(m);
    }

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
      machines: {
        mapping_id: number;
        machine_id: number;
        machine_name: string;
        sequence_no: number;
        box_id: number | null;
        scanned: boolean;
        scanned_at: Date | null;
        scanned_by: string | null;
      }[];
    }[] = [];

    let rowNumber = 1;
    for (const [cut_list_id, rows] of cutlistByItem) {
      const cl = rows[0].cut_list;

      // Group rows by machine_id
      const byMachine = new Map<number, typeof rows>();
      for (const r of rows) {
        if (!byMachine.has(r.machine_id)) byMachine.set(r.machine_id, []);
        byMachine.get(r.machine_id)!.push(r);
      }

      // Unit count = rows for any single machine (all machines have same count)
      const unitCount = Math.max(...[...byMachine.values()].map(v => v.length));

      for (let u = 0; u < unitCount; u++) {
        const machineColumns = [];
        for (const [, machineRows] of byMachine) {
          const r = machineRows[u];
          if (!r) continue;
          machineColumns.push({
            mapping_id: r.id,
            machine_id: r.machine_id,
            machine_name: r.machine.machine_name,
            sequence_no: r.sequence_no,
            box_id: r.box_id,
            scanned: r.actual_in_at !== null,
            scanned_at: r.actual_in_at,
            scanned_by: r.in_operator ? (allOperatorMap.get(r.in_operator) ?? null) : null,
          });
        }
        unitRows.push({
          row_number: rowNumber++,
          cut_list_id,
          item_name: cl.item_name,
          unique_code: cl.unique_code,
          description: cl.description,
          qty: cl.qty,
          unit_index: u + 1,
          category: cl.category_name,
          group: cl.group_name,
          length: cl.length,
          width: cl.width,
          thickness: cl.thickness,
          machines: machineColumns,
        });
      }
    }

    // ── 5. Stats ──────────────────────────────────────────────────────────────
    const totalPanels = unitRows.length;
    const uniqueItems = cutlistByItem.size;   // ✅ fix 2: replaces cutListItems.length

    return validationResponse(1, "Project detail fetched", {
      project: {
        id: project.id,
        project_name: project.project_name,
        project_status: project.project_status,
        track_trace_status: project.track_trace_status,
        lead_id: project.lead_id,
        lead: lead ? {
          lead_name: lead.firstname,
          lead_phone: lead.contact_no,
          lead_email: lead.email,
          lead_address: lead.site_address,
        } : null,
        details: project.details[0] ?? null,
      },
      stats: {
        total_panels: totalPanels,
        total_items: uniqueItems,            // ✅ fix 2: was cutListItems.length
        total_boxes: boxes.length,
        packed_boxes: boxes.filter(b => b.box_status === "packed").length,
        unpacked_boxes: boxes.filter(b => b.box_status === "unpacked").length,
      },
      machines: machineStats,
      boxes: boxes.map((b, idx) => ({
        id: b.id,
        box_name: b.box_name,
        box_status: b.box_status,
        items_count: boxItemCounts[idx],
        factory_out_at: b.factory_out_at,
        factory_out_by: b.factory_out_by ? (operatorMap.get(b.factory_out_by) ?? null) : null,
        site_in_at: b.site_in_at,
        site_in_by: b.site_in_by ? (operatorMap.get(b.site_in_by) ?? null) : null,
      })),
      cutlist: unitRows,
    });

  } catch (error) {
    console.error("getProjectDetailService error:", error);
    return validationResponse(0, "Failed to fetch project detail");
  }
};

// ─── GET box items ────────────────────────────────────────────────────────────

export const getBoxItemsService = async (
  vendor_id: number,
  unique_project_id: string,
  box_id: number
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
      select: { id: true, box_name: true, box_status: true, factory_out_at: true, site_in_at: true },
    });

    if (!box) return validationResponse(0, "Box not found");

    const mappings = await prisma.cutListMachineMapping.findMany({
      where: { box_id, project_id, vendor_id, expected_in: true },
      select: {
        id: true,
        machine_id: true,
        actual_in_at: true,
        site_in_at: true,
        in_operator: true,
        site_in_by: true,
        machine: { select: { machine_name: true } },
        cut_list: {
          select: {
            id: true, item_name: true, unique_code: true,
            qty: true, category_name: true, group_name: true,
            length: true, width: true, thickness: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const opIds = [...new Set([
      ...mappings.map(m => m.in_operator).filter(Boolean),
      ...mappings.map(m => m.site_in_by).filter(Boolean),
    ])] as number[];

    const ops = opIds.length > 0
      ? await prisma.userMaster.findMany({ where: { id: { in: opIds } }, select: { id: true, user_name: true } })
      : [];
    const opMap = new Map(ops.map(u => [u.id, u.user_name]));

    return validationResponse(1, "Box items fetched", {
      box,
      items: mappings.map(m => ({
        id: m.id,
        machine: { machine_name: m.machine.machine_name },
        actual_in_at: m.actual_in_at,
        site_in_at: m.site_in_at,
        scanned_by: m.in_operator ? (opMap.get(m.in_operator) ?? null) : null,
        site_in_by: m.site_in_by ? (opMap.get(m.site_in_by) ?? null) : null,
        cut_list: m.cut_list,
      })),
    });

  } catch (error) {
    console.error("getBoxItemsService error:", error);
    return validationResponse(0, "Failed to fetch box items");
  }
};



export const getDefectDashboardService = async (vendor_id: number) => {
  try {

    // ── 1. Summary counts ─────────────────────────────────────────────────────
    const [total, pending, completed, rework, replace] = await Promise.all([
      prisma.defectedItem.count({ where: { vendor_id } }),
      prisma.defectedItem.count({ where: { vendor_id, defect_status: "Pending" } }),
      prisma.defectedItem.count({ where: { vendor_id, defect_status: "Completed" } }),
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
      where: { id: { in: byDefectType.map(d => d.defect_id).filter(Boolean) as number[] } },
      select: { id: true, defect_name: true },
    });
    const defectMap = new Map(defectMasters.map(d => [d.id, d.defect_name]));

    const defectBreakdown = byDefectType.map(d => ({
      defect_id: d.defect_id,
      defect_name: d.defect_id ? (defectMap.get(d.defect_id) ?? "Unknown") : "Unknown",
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
      where: { id: { in: byProject.map(p => p.project_id) } },
      select: { id: true, project_name: true },
    });
    const projectMap = new Map(projects.map(p => [p.id, p.project_name]));

    const projectBreakdown = byProject.map(p => ({
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
      where: { id: { in: byMachine.map(m => m.machine_id) } },
      select: { id: true, machine_name: true },
    });
    const machineMap = new Map(machines.map(m => [m.id, m.machine_name]));

    const machineBreakdown = byMachine.map(m => ({
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
        project: { select: { id: true, project_name: true, unique_project_id: true } },
        machine: { select: { id: true, machine_name: true } },
        cutList: { select: { id: true, item_name: true, unique_code: true } },
        createdBy: { select: { id: true, user_name: true } },
        images: { select: { id: true, doc_sys_name: true }, take: 1 },
      },
    });

    // ── 7. Avg resolution time (completed defects) ────────────────────────────
    const completedWithTime = await prisma.defectedItem.findMany({
      where: { vendor_id, defect_status: "Completed", defect_completed_at: { not: null } },
      select: { created_at: true, defect_completed_at: true },
    });

    const avgResolutionMs = completedWithTime.length > 0
      ? completedWithTime.reduce((sum, d) =>
        sum + (d.defect_completed_at!.getTime() - d.created_at.getTime()), 0
      ) / completedWithTime.length
      : null;

    const avgResolutionHours = avgResolutionMs !== null
      ? Math.round(avgResolutionMs / 1000 / 60 / 60 * 10) / 10
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
      by_status: byStatus.map(s => ({ status: s.defect_status, count: s._count.id })),
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
  unique_project_id: string
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

async function signImages(images: { id: number; doc_sys_name: string; doc_og_name: string }[]) {
  return Promise.all(
    images.map(async (img) => ({
      ...img,
      signed_url: await generateSignedUrl(img.doc_sys_name),
    }))
  );
}

// ─── Summary (stat cards + bar charts) ───────────────────────────────────────

export const getDefectSummaryService = async (vendor_id: number) => {
  try {
    const [total, pending, completed, rework, replace] = await Promise.all([
      prisma.defectedItem.count({ where: { vendor_id } }),
      prisma.defectedItem.count({ where: { vendor_id, defect_status: "Pending" } }),
      prisma.defectedItem.count({ where: { vendor_id, defect_status: "Completed" } }),
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
      where: { id: { in: byDefectType.map(d => d.defect_id).filter(Boolean) as number[] } },
      select: { id: true, defect_name: true },
    });
    const defectMap = new Map(defectMasters.map(d => [d.id, d.defect_name]));

    // Breakdown by machine
    const byMachine = await prisma.defectedItem.groupBy({
      by: ["machine_id"],
      where: { vendor_id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
    });
    const machines = await prisma.machineMaster.findMany({
      where: { id: { in: byMachine.map(m => m.machine_id) } },
      select: { id: true, machine_name: true },
    });
    const machineMap = new Map(machines.map(m => [m.id, m.machine_name]));

    // Breakdown by project (top 10)
    const byProject = await prisma.defectedItem.groupBy({
      by: ["project_id"],
      where: { vendor_id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });
    const projects = await prisma.projectMaster.findMany({
      where: { id: { in: byProject.map(p => p.project_id) } },
      select: { id: true, project_name: true },
    });
    const projectMap = new Map(projects.map(p => [p.id, p.project_name]));

    // Avg resolution time
    const completedWithTime = await prisma.defectedItem.findMany({
      where: { vendor_id, defect_status: "Completed", defect_completed_at: { not: null } },
      select: { created_at: true, defect_completed_at: true },
    });
    const avgResolutionMs = completedWithTime.length > 0
      ? completedWithTime.reduce((s, d) => s + (d.defect_completed_at!.getTime() - d.created_at.getTime()), 0)
      / completedWithTime.length
      : null;

    return validationResponse(1, "Defect summary fetched", {
      summary: {
        total, pending, completed, rework, replace,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
        avg_resolution_hours: avgResolutionMs !== null
          ? Math.round(avgResolutionMs / 3_600_000 * 10) / 10
          : null,
      },
      by_defect_type: byDefectType.map(d => ({
        defect_id: d.defect_id,
        defect_name: d.defect_id ? (defectMap.get(d.defect_id) ?? "Unknown") : "Unknown",
        count: d._count.id,
      })),
      by_machine: byMachine.map(m => ({
        machine_id: m.machine_id,
        machine_name: machineMap.get(m.machine_id) ?? "Unknown",
        count: m._count.id,
      })),
      by_project: byProject.map(p => ({
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

export const getPendingDefectsService = async (vendor_id: number, page: number) => {
  try {
    const skip = (page - 1) * PAGE_SIZE;

    const [total, items] = await Promise.all([
      prisma.defectedItem.count({ where: { vendor_id, defect_status: "Pending" } }),
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
          project: { select: { id: true, project_name: true, unique_project_id: true } },
          machine: { select: { id: true, machine_name: true } },
          cutList: { select: { id: true, item_name: true, unique_code: true } },
          createdBy: { select: { id: true, user_name: true } },
          images: { select: { id: true, doc_sys_name: true, doc_og_name: true } },
        },
      }),
    ]);

    // Generate signed URLs for defect images
    const defectsWithUrls = await Promise.all(
      items.map(async (d) => ({
        ...d,
        images: await signImages(d.images),
      }))
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

export const getResolvedDefectsService = async (vendor_id: number, page: number) => {
  try {
    const skip = (page - 1) * PAGE_SIZE;

    const [total, items] = await Promise.all([
      prisma.defectedItem.count({ where: { vendor_id, defect_status: "Completed" } }),
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
          project: { select: { id: true, project_name: true, unique_project_id: true } },
          machine: { select: { id: true, machine_name: true } },
          cutList: { select: { id: true, item_name: true, unique_code: true } },
          createdBy: { select: { id: true, user_name: true } },
          // Defect images (original problem photos)
          images: { select: { id: true, doc_sys_name: true, doc_og_name: true } },
          // Completion/resolution photos
          completionPhotos: { select: { id: true, doc_sys_name: true, doc_og_name: true } },
        },
      }),
    ]);

    const defectsWithUrls = await Promise.all(
      items.map(async (d) => ({
        ...d,
        images: await signImages(d.images),
        completionPhotos: await signImages(d.completionPhotos),
      }))
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


