import { prisma } from '../../prisma/client';
import { Prisma, ProjectMaster, ProjectDetails, ProjectItemsMaster } from '../../prisma/generated';
import { CadbidPayload, FullProjectCreateInput } from '../../types/project.types';

export const createProject = async (data: Omit<ProjectMaster, 'id' | 'created_at'>) => {
  return prisma.projectMaster.create({
    data,
  });
};

export const createProjectDetails = async (data: Omit<ProjectDetails, 'id'>) => {
  return prisma.projectDetails.create({
    data,
  });
};

// export const createProjectItem = async (data: Omit<ProjectItemsMaster, 'id'>) => {
//   // 1. Create the new item
//   const newItem = await prisma.projectItemsMaster.create({ data });

//   // 2. Recalculate total_items
//   const totalQty = await prisma.projectItemsMaster.aggregate({
//     _sum: { qty: true },
//     where: {
//       project_id: data.project_id,
//       vendor_id: data.vendor_id,
//       client_id: data.client_id,
//     },
//   });

//   const total_items = totalQty._sum.qty || 0;

//   // 3. Get current packed count from projectDetails
//   const existingDetails = await prisma.projectDetails.findFirst({
//     where: {
//       project_id: data.project_id,
//       vendor_id: data.vendor_id,
//       client_id: data.client_id,
//     },
//   });

//   const total_packed = existingDetails?.total_packed || 0;
//   const total_unpacked = Math.max(total_items - total_packed, 0); // prevent negative

//   // 4. Update ProjectDetails
//   await prisma.projectDetails.updateMany({
//     where: {
//       project_id: data.project_id,
//       vendor_id: data.vendor_id,
//       client_id: data.client_id,
//     },
//     data: {
//       total_items,
//       total_unpacked,
//     },
//   });

//   return newItem;
// };

// export const getAllProjects = () => {
//   return prisma.projectMaster.findMany({
//     include: {
//       vendor: true,
//       createdByUser: true,
//       details: true,
//       items: true,
//     },
//   });
// };



export interface GetTrackTraceProjectsOptions {
  page?: number;
  limit?: number;
  search?: string;

  track_trace_status?: string;
  project_status?: string;

  deleted?: "active" | "deleted" | "all";

  date_from?: string;
  date_to?: string;

  sort_by?: string;
  sort_order?: "asc" | "desc";
}

const PROJECT_LIST_SELECT = {
  id: true,
  unique_project_id: true,
  project_name: true,
  project_status: true,
  track_trace_status: true,
  created_at: true,

  lead_id: true,

  order_no: true,
  client_name: true,
  client_address: true,
  client_contact_no: true,

  isDeleted: true,
  deleted_by: true,
  deleted_at: true,

  lead: {
    select: {
      id: true,
      lead_code: true,
      firstname: true,
      lastname: true,
      contact_no: true,
      site_address: true,
    },
  },
} satisfies Prisma.ProjectMasterSelect;

export const getAllProjectsTrackTrace = async (
  vendor_id: number,
  options: GetTrackTraceProjectsOptions = {}
) => {
  const page = Math.max(options.page || 1, 1);

  const limit = Math.min(
    Math.max(options.limit || 10, 1),
    100
  );

  const skip = (page - 1) * limit;

  const search = options.search?.trim();

  const where: Prisma.ProjectMasterWhereInput = {
    vendor_id,
  };

  /*
  |--------------------------------------------------------------------------
  | Deleted filter
  |--------------------------------------------------------------------------
  |
  | active  => isDeleted = false
  | deleted => isDeleted = true
  | all     => do not add isDeleted condition
  |
  */

  switch (options.deleted) {
    case "deleted":
      where.isDeleted = true;
      break;

    case "all":
      break;

    case "active":
    default:
      where.isDeleted = false;
      break;
  }

  /*
  |--------------------------------------------------------------------------
  | Track & Trace Status
  |--------------------------------------------------------------------------
  */

  if (
    options.track_trace_status &&
    options.track_trace_status !== "all"
  ) {
    where.track_trace_status =
      options.track_trace_status;
  }

  /*
  |--------------------------------------------------------------------------
  | Project Status
  |--------------------------------------------------------------------------
  */

  if (
    options.project_status &&
    options.project_status !== "all"
  ) {
    where.project_status =
      options.project_status;
  }

  /*
  |--------------------------------------------------------------------------
  | Search
  |--------------------------------------------------------------------------
  |
  | Search:
  | - Project name
  | - Unique project ID
  | - Order number
  | - Client name
  | - Client contact
  | - Lead code
  | - Lead first name
  | - Lead last name
  | - Lead contact
  |
  */

  if (search) {
    where.OR = [
      {
        project_name: {
          contains: search,
          mode: "insensitive",
        },
      },

      {
        unique_project_id: {
          contains: search,
          mode: "insensitive",
        },
      },

      {
        order_no: {
          contains: search,
          mode: "insensitive",
        },
      },

      {
        client_name: {
          contains: search,
          mode: "insensitive",
        },
      },

      {
        client_contact_no: {
          contains: search,
          mode: "insensitive",
        },
      },

      {
        lead: {
          is: {
            OR: [
              {
                lead_code: {
                  contains: search,
                  mode: "insensitive",
                },
              },

              {
                firstname: {
                  contains: search,
                  mode: "insensitive",
                },
              },

              {
                lastname: {
                  contains: search,
                  mode: "insensitive",
                },
              },

              {
                contact_no: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          },
        },
      },
    ];
  }

  /*
  |--------------------------------------------------------------------------
  | Created Date Filter
  |--------------------------------------------------------------------------
  */

  if (options.date_from || options.date_to) {
    const createdAtFilter: Prisma.DateTimeFilter = {};

    if (options.date_from) {
      const startDate = new Date(
        `${options.date_from}T00:00:00.000Z`
      );

      if (!Number.isNaN(startDate.getTime())) {
        createdAtFilter.gte = startDate;
      }
    }

    if (options.date_to) {
      const endDate = new Date(
        `${options.date_to}T00:00:00.000Z`
      );

      if (!Number.isNaN(endDate.getTime())) {
        /*
         * Exclusive next-day boundary:
         *
         * date_to = 2026-08-24
         * means < 2026-08-25 00:00:00
         */

        endDate.setUTCDate(
          endDate.getUTCDate() + 1
        );

        createdAtFilter.lt = endDate;
      }
    }

    if (
      createdAtFilter.gte ||
      createdAtFilter.lt
    ) {
      where.created_at = createdAtFilter;
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Sorting
  |--------------------------------------------------------------------------
  */

  const allowedSortFields = [
    "id",
    "created_at",
    "project_name",
    "order_no",
    "project_status",
    "track_trace_status",
  ] as const;

  type SortField =
    (typeof allowedSortFields)[number];

  const requestedSort =
    options.sort_by as SortField;

  const sortBy: SortField =
    allowedSortFields.includes(requestedSort)
      ? requestedSort
      : "created_at";

  const sortOrder: Prisma.SortOrder =
    options.sort_order === "asc"
      ? "asc"
      : "desc";

  const primaryOrder = {
    [sortBy]: sortOrder,
  } as Prisma.ProjectMasterOrderByWithRelationInput;

  const orderBy:
    Prisma.ProjectMasterOrderByWithRelationInput[] =
    sortBy === "id"
      ? [primaryOrder]
      : [
          primaryOrder,
          {
            id: "desc",
          },
        ];

  /*
  |--------------------------------------------------------------------------
  | Query
  |--------------------------------------------------------------------------
  */

  const [total, projects] =
    await prisma.$transaction([
      prisma.projectMaster.count({
        where,
      }),

      prisma.projectMaster.findMany({
        where,

        select: PROJECT_LIST_SELECT,

        skip,
        take: limit,

        orderBy,
      }),
    ]);

  const totalPages =
    total === 0
      ? 0
      : Math.ceil(total / limit);

  return {
    projects,

    pagination: {
      page,
      limit,
      total,
      totalPages,

      hasNextPage:
        page < totalPages,

      hasPreviousPage:
        page > 1,
    },
  };
};

/*
|--------------------------------------------------------------------------
| Soft Delete Project
|--------------------------------------------------------------------------
*/

export const deleteTrackTraceProject = async (
  vendor_id: number,
  project_id: number,
  user_id: number
) => {
  /*
   * updateMany is intentional here because it allows us to
   * include vendor_id and isDeleted in the WHERE condition.
   */

  const result =
    await prisma.projectMaster.updateMany({
      where: {
        id: project_id,
        vendor_id,
        isDeleted: false,
      },

      data: {
        isDeleted: true,

        deleted_by: user_id,
        deleted_at: new Date(),

        updated_by: user_id,
      },
    });

  if (result.count === 0) {
    return null;
  }

  return prisma.projectMaster.findFirst({
    where: {
      id: project_id,
      vendor_id,
    },

    select: {
      id: true,
      unique_project_id: true,
      project_name: true,
      isDeleted: true,
      deleted_by: true,
      deleted_at: true,
    },
  });
};




export const getAllProjectDetails = () => {
  return prisma.projectDetails.findMany({
    include: {
      project: true,
      vendor: true,
    },
  });
};

// export const getAllProjectItems = () => {
//   return prisma.projectItemsMaster.findMany({
//     include: {
//       project: true,
//       vendor: true,
//       details: true,
//     },
//   });
// };


// ── Shared helper: compute total eligible rows for a packaging/QC machine ────
// Same logic as dashboard: Part A (waterfall) + Part B (packaging-only items)
const getPackagingTotal = async (
  project_id: number,
  vendor_id: number,
  machine: { id: number; sequence_no: number | null }
): Promise<number> => {
  const machineSeq = machine.sequence_no ?? 0;

  // Find cut_list_ids that have at least one row at seq < packaging seq
  const cutListsWithPrior = await prisma.cutListMachineMapping.findMany({
    where: {
      project_id,
      vendor_id,
      sequence_no: { lt: machineSeq },
      expected_in: true,
    },
    select: { cut_list_id: true },
    distinct: ["cut_list_id"],
  });
  const cutListIdsWithPrior = cutListsWithPrior.map((r) => r.cut_list_id);

  // Part A: rows at packaging where cut_list HAS prior machines
  //         eligible if their last prior machine is scanned
  const partARows = await prisma.cutListMachineMapping.findMany({
    where: {
      project_id,
      vendor_id,
      machine_id: machine.id,
      expected_in: true,
      cut_list_id: cutListIdsWithPrior.length > 0
        ? { in: cutListIdsWithPrior }
        : { in: [-1] }, // empty set
    },
    select: { cut_list_id: true, id: true },
  });

  let partAEligible = 0;
  for (const row of partARows) {
    const lastPriorRow = await prisma.cutListMachineMapping.findFirst({
      where: {
        project_id,
        vendor_id,
        cut_list_id: row.cut_list_id,
        sequence_no: { lt: machineSeq },
        expected_in: true,
      },
      orderBy: { sequence_no: "desc" },
      select: { actual_in_at: true },
    });
    if (lastPriorRow?.actual_in_at !== null) {
      partAEligible++;
    }
  }

  // Part B: rows at packaging with NO prior machines — always eligible
  const partBCount = await prisma.cutListMachineMapping.count({
    where: {
      project_id,
      vendor_id,
      machine_id: machine.id,
      expected_in: true,
      ...(cutListIdsWithPrior.length > 0
        ? { cut_list_id: { notIn: cutListIdsWithPrior } }
        : { cut_list_id: { notIn: [-1] } }
      ),
    },
  });

  return partAEligible + partBCount;
};

// ── getProjectById ────────────────────────────────────────────────────────────




export const getProjectById_old = async (id: number) => {
  const project = await prisma.projectMaster.findUnique({
    where: { id },
    include: {
      vendor: true,
      createdByUser: true,
      details: true,
    },
  });

  if (!project) return null;

  const packagingMachine = await prisma.machineMaster.findFirst({
    where: {
      vendor_id: project.vendor_id,
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
  });

  const packagingStats = packagingMachine
    ? await getPackagingStats(id, project.vendor_id, packagingMachine)
    : {
      total_items: 0,
      total_packed: 0,
      total_unpacked: 0,
      total_weight: 0,
    };

  return {
    ...project,
    machine_id: packagingMachine?.id ?? null,
    machine_name: packagingMachine?.machine_name ?? null,
    totals: packagingStats,
  };
};


export const getProjectById = async (id: number) => {
  const project = await prisma.projectMaster.findUnique({
    where: {
      id,
    },
    include: {
      vendor: true,
      createdByUser: true,
      details: true,
    },
  });

  if (!project) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | Find packaging machine - Type 18
  |--------------------------------------------------------------------------
  */

  const packagingMachine =
    await prisma.machineMaster.findFirst({
      where: {
        vendor_id: project.vendor_id,
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
    });

  /*
  |--------------------------------------------------------------------------
  | Calculate packaging totals
  |--------------------------------------------------------------------------
  |
  | Handles both:
  |
  | 1. Normal / scan packing
  |    One mapping row normally represents one qty.
  |
  | 2. Manual packing
  |    CutList:
  |      include_in_packing = true
  |      scan_pack_validate = false
  |
  |    One mapping row can contain qty > 1.
  |--------------------------------------------------------------------------
  */

  const packagingStats =
    await getPackagingStats(
      id,
      project.vendor_id,
      packagingMachine
        ? {
            id: packagingMachine.id,
            sequence_no:
              packagingMachine.sequence_no,
          }
        : null
    );

  return {
    ...project,

    machine_id:
      packagingMachine?.id ?? null,

    machine_name:
      packagingMachine?.machine_name ?? null,

    totals:
      packagingStats,
  };
};

const getPackagingStats_old = async (
  project_id: number,
  vendor_id: number,
  machine: {
    id: number;
    sequence_no: number | null;
  }
): Promise<{
  total_items: number;
  total_packed: number;
  total_unpacked: number;
  total_weight: number;
}> => {
  const machineSeq = machine.sequence_no ?? 0;

  const [packagingRows, priorRows] = await Promise.all([
    prisma.cutListMachineMapping.findMany({
      where: {
        project_id,
        vendor_id,
        machine_id: machine.id,
        expected_in: true,
      },
      select: {
        id: true,
        project_id: true,
        cut_list_id: true,
        box_id: true,
        actual_in_at: true,
      },
    }),

    prisma.cutListMachineMapping.findMany({
      where: {
        project_id,
        vendor_id,
        expected_in: true,
        sequence_no: {
          lt: machineSeq,
        },
      },
      select: {
        id: true,
        project_id: true,
        cut_list_id: true,
        sequence_no: true,
        actual_in_at: true,
      },
    }),
  ]);

  /**
   * Group prior rows by cut_list_id + sequence_no
   * Example:
   * cut_list_id 10 has qty 4
   * last prior machine has 4 mapping rows
   * scanned count = how many of those 4 rows have actual_in_at
   */
  type PriorKey = string;

  const priorBySeq = new Map<PriorKey, typeof priorRows>();

  for (const row of priorRows) {
    const seq = row.sequence_no ?? 0;
    const key = `${row.cut_list_id}-${seq}`;

    if (!priorBySeq.has(key)) {
      priorBySeq.set(key, []);
    }

    priorBySeq.get(key)!.push(row);
  }

  /**
   * For each cut_list_id, find highest previous machine sequence.
   */
  const lastSeqMap = new Map<number, number>();

  for (const row of priorRows) {
    const seq = row.sequence_no ?? 0;
    const currentSeq = lastSeqMap.get(row.cut_list_id) ?? -1;

    if (seq > currentSeq) {
      lastSeqMap.set(row.cut_list_id, seq);
    }
  }

  /**
   * Count eligible units per cut_list_id.
   * Eligible means actual_in_at is completed at the last prior machine.
   */
  const eligibleUnitCount = new Map<number, number>();

  for (const [cutListId, maxSeq] of lastSeqMap) {
    const seqKey = `${cutListId}-${maxSeq}`;
    const rows = priorBySeq.get(seqKey) ?? [];

    const scannedCount = rows.filter((row) => row.actual_in_at !== null).length;

    eligibleUnitCount.set(cutListId, scannedCount);
  }

  /**
   * Group packaging rows by cut_list_id.
   */
  const packagingRowsByCutList = new Map<number, typeof packagingRows>();

  for (const row of packagingRows) {
    if (!packagingRowsByCutList.has(row.cut_list_id)) {
      packagingRowsByCutList.set(row.cut_list_id, []);
    }

    packagingRowsByCutList.get(row.cut_list_id)!.push(row);
  }

  /**
   * Final unit-level count.
   */
  let total_items = 0;
  let total_packed = 0;

  for (const [cutListId, rows] of packagingRowsByCutList) {
    const hasPriorMachine = lastSeqMap.has(cutListId);

    const sortedPackagingRows = [...rows].sort((a, b) => a.id - b.id);

    if (hasPriorMachine) {
      const eligible = eligibleUnitCount.get(cutListId) ?? 0;

      total_items += eligible;

      const eligiblePackagingRows = sortedPackagingRows.slice(0, eligible);

      total_packed += eligiblePackagingRows.filter(
        (row) => row.box_id !== null
      ).length;
    } else {
      total_items += sortedPackagingRows.length;

      total_packed += sortedPackagingRows.filter(
        (row) => row.box_id !== null
      ).length;
    }
  }

  const total_unpacked = Math.max(0, total_items - total_packed);

  return {
    total_items,
    total_packed,
    total_unpacked,
    total_weight: 0,
  };
};

const getPackagingStats = async (
  project_id: number,
  vendor_id: number,
  machine: {
    id: number;
    sequence_no: number | null;
  } | null
): Promise<{
  total_items: number;
  total_packed: number;
  total_unpacked: number;
  total_weight: number;
}> => {
  /*
  |--------------------------------------------------------------------------
  | STEP 1 — Fetch manual packing CutList items
  |--------------------------------------------------------------------------
  |
  | These items DO NOT get a machine 18 mapping when project is created.
  |
  | Therefore total qty MUST come from CutList.qty.
  |--------------------------------------------------------------------------
  */

  const manualCutListItems =
    await prisma.cutList.findMany({
      where: {
        project_id,
        vendor_id,

        include_in_packing: true,
        scan_pack_validate: false,

        status: "Active",
      },

      select: {
        id: true,
        qty: true,
        weight: true,
      },
    });

  /*
  |--------------------------------------------------------------------------
  | Manual CutList IDs
  |--------------------------------------------------------------------------
  |
  | We exclude these from normal machine-row based calculation,
  | otherwise they would be counted twice after a manual mapping is created.
  |--------------------------------------------------------------------------
  */

  const manualCutListIds =
    new Set<number>(
      manualCutListItems.map(
        (item) => item.id
      )
    );

  /*
  |--------------------------------------------------------------------------
  | STEP 2 — Fetch packaging + previous machine rows
  |--------------------------------------------------------------------------
  */

  let packagingRows: {
    id: number;
    project_id: number;
    cut_list_id: number;
    box_id: number | null;
    actual_in_at: Date | null;
    qty: number;
    row_created_source: string | null;
  }[] = [];

  let priorRows: {
    id: number;
    project_id: number;
    cut_list_id: number;
    sequence_no: number;
    actual_in_at: Date | null;
  }[] = [];

  if (machine) {
    const machineSeq =
      machine.sequence_no ?? 0;

    [packagingRows, priorRows] =
      await Promise.all([
        /*
        |--------------------------------------------------------------------------
        | Machine type 18 mappings
        |--------------------------------------------------------------------------
        */

        prisma.cutListMachineMapping.findMany({
          where: {
            project_id,
            vendor_id,

            machine_id:
              machine.id,

            expected_in:
              true,
          },

          select: {
            id: true,
            project_id: true,
            cut_list_id: true,
            box_id: true,
            actual_in_at: true,

            /*
            |--------------------------------------------------------------------------
            | IMPORTANT
            |--------------------------------------------------------------------------
            */
            qty: true,
            row_created_source: true,
          },
        }),

        /*
        |--------------------------------------------------------------------------
        | Machines before packaging
        |--------------------------------------------------------------------------
        */

        prisma.cutListMachineMapping.findMany({
          where: {
            project_id,
            vendor_id,

            expected_in:
              true,

            sequence_no: {
              lt: machineSeq,
            },
          },

          select: {
            id: true,
            project_id: true,
            cut_list_id: true,
            sequence_no: true,
            actual_in_at: true,
          },
        }),
      ]);
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 3 — NORMAL / SCAN PACKING
  |--------------------------------------------------------------------------
  |
  | Existing logic remains.
  |
  | Manual CutList items are excluded because their quantity comes
  | directly from CutList.qty.
  |--------------------------------------------------------------------------
  */

  const normalPackagingRows =
    packagingRows.filter(
      (row) =>
        !manualCutListIds.has(
          row.cut_list_id
        )
    );

  const normalPriorRows =
    priorRows.filter(
      (row) =>
        !manualCutListIds.has(
          row.cut_list_id
        )
    );

  /*
  |--------------------------------------------------------------------------
  | Group prior rows by CutList + sequence
  |--------------------------------------------------------------------------
  */

  type PriorKey = string;

  const priorBySeq =
    new Map<
      PriorKey,
      typeof normalPriorRows
    >();

  for (
    const row
    of normalPriorRows
  ) {
    const sequence =
      row.sequence_no ?? 0;

    const key =
      `${row.cut_list_id}-${sequence}`;

    if (!priorBySeq.has(key)) {
      priorBySeq.set(
        key,
        []
      );
    }

    priorBySeq
      .get(key)!
      .push(row);
  }

  /*
  |--------------------------------------------------------------------------
  | Highest previous machine sequence for each CutList
  |--------------------------------------------------------------------------
  */

  const lastSeqMap =
    new Map<number, number>();

  for (
    const row
    of normalPriorRows
  ) {
    const sequence =
      row.sequence_no ?? 0;

    const existingSequence =
      lastSeqMap.get(
        row.cut_list_id
      ) ?? -1;

    if (
      sequence >
      existingSequence
    ) {
      lastSeqMap.set(
        row.cut_list_id,
        sequence
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Eligible qty at packaging machine
  |--------------------------------------------------------------------------
  |
  | Previous machine mappings are still unit-wise.
  |
  | Example:
  |
  | qty = 10
  | previous machine scanned = 7
  |
  | packaging total eligible = 7
  |--------------------------------------------------------------------------
  */

  const eligibleUnitCount =
    new Map<number, number>();

  for (
    const [
      cutListId,
      maxSequence,
    ]
    of lastSeqMap
  ) {
    const key =
      `${cutListId}-${maxSequence}`;

    const rows =
      priorBySeq.get(key) ?? [];

    const scannedQty =
      rows.filter(
        (row) =>
          row.actual_in_at !==
          null
      ).length;

    eligibleUnitCount.set(
      cutListId,
      scannedQty
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Group normal packaging rows by CutList
  |--------------------------------------------------------------------------
  */

  const packagingRowsByCutList =
    new Map<
      number,
      typeof normalPackagingRows
    >();

  for (
    const row
    of normalPackagingRows
  ) {
    if (
      !packagingRowsByCutList.has(
        row.cut_list_id
      )
    ) {
      packagingRowsByCutList.set(
        row.cut_list_id,
        []
      );
    }

    packagingRowsByCutList
      .get(row.cut_list_id)!
      .push(row);
  }

  /*
  |--------------------------------------------------------------------------
  | Normal packing totals
  |--------------------------------------------------------------------------
  */

  let normalTotalItems = 0;
  let normalPackedQty = 0;

  for (
    const [
      cutListId,
      rows,
    ]
    of packagingRowsByCutList
  ) {
    const hasPriorMachine =
      lastSeqMap.has(
        cutListId
      );

    /*
    |--------------------------------------------------------------------------
    | Total qty represented by packaging rows
    |--------------------------------------------------------------------------
    |
    | Normally qty = 1.
    |
    | We use qty instead of rows.length so this remains compatible
    | with quantity-based rows.
    |--------------------------------------------------------------------------
    */

    const packagingTotalQty =
      rows.reduce(
        (
          total,
          row
        ) =>
          total +
          Number(
            row.qty ?? 1
          ),
        0
      );

    /*
    |--------------------------------------------------------------------------
    | Packed qty = mapping has box_id
    |--------------------------------------------------------------------------
    */

    const packedQty =
      rows.reduce(
        (
          total,
          row
        ) => {
          if (
            row.box_id ===
            null
          ) {
            return total;
          }

          return (
            total +
            Number(
              row.qty ?? 1
            )
          );
        },
        0
      );

    /*
    |--------------------------------------------------------------------------
    | If prior workstation exists
    |--------------------------------------------------------------------------
    */

    if (hasPriorMachine) {
      const eligibleQty =
        eligibleUnitCount.get(
          cutListId
        ) ?? 0;

      normalTotalItems +=
        eligibleQty;

      /*
      |--------------------------------------------------------------------------
      | Cannot report more packed than eligible
      |--------------------------------------------------------------------------
      */

      normalPackedQty +=
        Math.min(
          packedQty,
          eligibleQty
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Packaging-only item
    |--------------------------------------------------------------------------
    */

    else {
      normalTotalItems +=
        packagingTotalQty;

      normalPackedQty +=
        Math.min(
          packedQty,
          packagingTotalQty
        );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 4 — MANUAL PACKING TOTALS
  |--------------------------------------------------------------------------
  |
  | include_in_packing = true
  | scan_pack_validate = false
  |
  | Total qty comes directly from CutList.
  |--------------------------------------------------------------------------
  */

  let manualTotalItems = 0;
  let manualPackedQty = 0;

  /*
  |--------------------------------------------------------------------------
  | Group manual machine mappings
  |--------------------------------------------------------------------------
  */

  const manualMappingsByCutList =
    new Map<
      number,
      typeof packagingRows
    >();

  for (
    const row
    of packagingRows
  ) {
    /*
    |--------------------------------------------------------------------------
    | Only manual CutList items
    |--------------------------------------------------------------------------
    */

    if (
      !manualCutListIds.has(
        row.cut_list_id
      )
    ) {
      continue;
    }

    /*
    |--------------------------------------------------------------------------
    | Only rows created by manual selection
    |--------------------------------------------------------------------------
    */

    if (
      row.row_created_source
        ?.trim()
        .toLowerCase() !==
      "manual"
    ) {
      continue;
    }

    if (
      !manualMappingsByCutList.has(
        row.cut_list_id
      )
    ) {
      manualMappingsByCutList.set(
        row.cut_list_id,
        []
      );
    }

    manualMappingsByCutList
      .get(row.cut_list_id)!
      .push(row);
  }

  /*
  |--------------------------------------------------------------------------
  | Calculate manual totals item by item
  |--------------------------------------------------------------------------
  */

  for (
    const cutList
    of manualCutListItems
  ) {
    const totalQty =
      Number(
        cutList.qty ?? 0
      );

    manualTotalItems +=
      totalQty;

    const mappings =
      manualMappingsByCutList.get(
        cutList.id
      ) ?? [];

    /*
    |--------------------------------------------------------------------------
    | Sum qty across every box
    |--------------------------------------------------------------------------
    |
    | Example:
    |
    | Box 1 = qty 3
    | Box 2 = qty 2
    |
    | packed qty = 5
    |--------------------------------------------------------------------------
    */

    const packedQty =
      mappings.reduce(
        (
          total,
          mapping
        ) => {
          /*
          |--------------------------------------------------------------------------
          | Mapping without box is not packed
          |--------------------------------------------------------------------------
          */

          if (
            mapping.box_id ===
            null
          ) {
            return total;
          }

          return (
            total +
            Number(
              mapping.qty ?? 0
            )
          );
        },
        0
      );

    /*
    |--------------------------------------------------------------------------
    | Safety cap
    |--------------------------------------------------------------------------
    */

    manualPackedQty +=
      Math.min(
        packedQty,
        totalQty
      );
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 5 — Combine both packing systems
  |--------------------------------------------------------------------------
  */

  const total_items =
    normalTotalItems +
    manualTotalItems;

  const total_packed =
    normalPackedQty +
    manualPackedQty;

  const total_unpacked =
    Math.max(
      total_items -
        total_packed,
      0
    );

  return {
    total_items,
    total_packed,
    total_unpacked,

    // Keep existing behaviour
    total_weight: 0,
  };
};

export const getProjectDetailsById = (id: number) => {
  return prisma.projectDetails.findUnique({
    where: { id },
    include: {
      project: true,
      vendor: true,
    },
  });
};


export const getProjectItemById = (id: number) => {
  return prisma.projectItemsMaster.findUnique({
    where: { id },
    include: {
      project: true,
      vendor: true,
      details: true,
    },
  });
};


export const getProjectsByVendorIdService_old = async (vendorId: number) => {

  // ── 1. Fetch packaging machine ───────────────────────────────────────────
  const packagingMachine = await prisma.machineMaster.findFirst({
    where: { vendor_id: vendorId, machine_type_id: 18 },
    select: { id: true, sequence_no: true },
  });

  // ── 2. Fetch all projects ────────────────────────────────────────────────
  const projects = await prisma.projectMaster.findMany({
    where: { vendor_id: vendorId },
    select: {
      id: true,
      project_name: true,
      vendor_id: true,
      lead_id: true,
      created_by: true,
      project_status: true,
      created_at: true,
      createdByUser: {
        select: {
          id: true,
          vendor_id: true,
          user_name: true,
          user_type_id: true,
        },
      },
      details: {
        select: {
          id: true,
          project_id: true,
          vendor_id: true,
          lead_id: true,
          total_items: true,
          total_packed: true,
          total_unpacked: true,
          start_date: true,
          estimated_completion_date: true,
          actual_completion_date: true,
          room_name: true,
        },
      },
    },
    orderBy: { id: "desc" },
  });

  if (!packagingMachine) {
    return projects.map((project) => ({
      id: project.id,
      project_name: project.project_name,
      vendor_id: project.vendor_id,
      created_by: project.created_by,
      project_status: project.project_status,
      created_at: project.created_at,
      createdByUser: project.createdByUser,
      details: project.details,
      aggregatedTotals: { total_items: 0, total_packed: 0, total_unpacked: 0 },
      factory_out_at: null,
      site_in_at: null,
      all_factory_out: false,
      any_factory_out: false,
    }));
  }

  const pkgMachineId = packagingMachine.id;
  const pkgMachineSeq = packagingMachine.sequence_no ?? 0;
  const allProjectIds = projects.map((p) => p.id);

  // ── 3. Fetch mapping rows ────────────────────────────────────────────────
  //
  // KEY CHANGE: we now work at the MAPPING ROW level, not cut_list_id level.
  // Each mapping row = one panel unit. qty=4 → 4 rows → 4 units counted.
  //
  const [priorRows, packagingRows, allBoxes] = await Promise.all([

    // Prior-machine rows: one row per unit per prior machine
    prisma.cutListMachineMapping.findMany({
      where: {
        vendor_id: vendorId,
        project_id: { in: allProjectIds },
        sequence_no: { lt: pkgMachineSeq },
        expected_in: true,
      },
      select: {
        id: true,             // mapping row id (unique per unit)
        project_id: true,
        cut_list_id: true,
        sequence_no: true,
        actual_in_at: true,
      },
    }),

    // Packaging machine rows: one row per unit
    prisma.cutListMachineMapping.findMany({
      where: {
        vendor_id: vendorId,
        project_id: { in: allProjectIds },
        machine_id: pkgMachineId,
        expected_in: true,
      },
      select: {
        id: true,             // unique per unit
        project_id: true,
        cut_list_id: true,
        box_id: true,
        actual_in_at: true,
      },
    }),

    // Boxes
    prisma.boxMaster.findMany({
      where: {
        vendor_id: vendorId,
        project_id: { in: allProjectIds },
        is_deleted: false,
      },
      select: {
        project_id: true,
        factory_out_at: true,
        site_in_at: true,
      },
    }),
  ]);

  // ── 4. Build prior-machine lookup: for each (project_id, cut_list_id),
  //       find the highest-sequence prior row per unit.
  //
  //  Strategy: group by (project_id, cut_list_id), then sort units by
  //  sequence_no desc. The "last prior machine" for unit u is the row with
  //  the highest sequence_no for that cut_list in that project.
  //  If that row has actual_in_at != null → unit is eligible for packaging.
  //
  //  Because we don't have a stable "unit index" column we pair units by
  //  position: among rows sharing (project_id, cut_list_id, sequence_no),
  //  row index i corresponds to packaging row index i.
  //
  //  Simpler approach that's correct: a packaging row (unit) is eligible
  //  if EVERY prior machine row sharing the same (project_id, cut_list_id)
  //  group has at least one scanned row for that unit's position.
  //
  //  Most accurate & schema-consistent approach:
  //  A packaging mapping row is eligible when its cut_list's last-prior-machine
  //  row (same unit index) has actual_in_at != null — but since unit index
  //  isn't stored, we approximate:
  //
  //  For each (project_id, cut_list_id), count how many prior-machine rows
  //  (of the LAST prior machine, by highest seq) have actual_in_at != null.
  //  That count = number of eligible units for this cut_list in this project.

  // Group prior rows by (project_id, cut_list_id, sequence_no)
  type PriorKey = string; // `${project_id}-${cut_list_id}-${sequence_no}`
  const priorBySeq = new Map<PriorKey, typeof priorRows>();

  for (const row of priorRows) {
    const key: PriorKey = `${row.project_id}-${row.cut_list_id}-${row.sequence_no}`;
    if (!priorBySeq.has(key)) priorBySeq.set(key, []);
    priorBySeq.get(key)!.push(row);
  }

  // For each (project_id, cut_list_id) find the highest sequence_no present
  const lastSeqMap = new Map<string, number>(); // `${pid}-${clid}` → max seq
  for (const row of priorRows) {
    const key = `${row.project_id}-${row.cut_list_id}`;
    const cur = lastSeqMap.get(key) ?? -1;
    if (row.sequence_no > cur) lastSeqMap.set(key, row.sequence_no);
  }

  // Count scanned units at last prior machine per (project_id, cut_list_id)
  // eligibleUnitCount[`${pid}-${clid}`] = number of units that passed last prior machine
  const eligibleUnitCount = new Map<string, number>();
  for (const [pkKey, maxSeq] of lastSeqMap) {
    const seqKey: PriorKey = `${pkKey}-${maxSeq}`;
    const rows = priorBySeq.get(seqKey) ?? [];
    const scanned = rows.filter(r => r.actual_in_at !== null).length;
    eligibleUnitCount.set(pkKey, scanned);
  }

  // cut_lists that have NO prior machine at all → all units are eligible
  const cutListsWithPriorByProject = new Map<number, Set<number>>();
  for (const row of priorRows) {
    if (!cutListsWithPriorByProject.has(row.project_id))
      cutListsWithPriorByProject.set(row.project_id, new Set());
    cutListsWithPriorByProject.get(row.project_id)!.add(row.cut_list_id);
  }

  // ── 5. Build factory_out / site_in per project ────────────────────────────
  const boxesByProject = new Map<number, typeof allBoxes>();
  for (const box of allBoxes) {
    if (!boxesByProject.has(box.project_id)) boxesByProject.set(box.project_id, []);
    boxesByProject.get(box.project_id)!.push(box);
  }

  // ── 6. Compute totals per project ─────────────────────────────────────────
  const result = projects.map((project) => {
    const pid = project.id;
    const hasPrior = cutListsWithPriorByProject.get(pid) ?? new Set<number>();

    // Group packaging rows by cut_list_id
    const pkgByClid = new Map<number, typeof packagingRows>();
    for (const row of packagingRows.filter(r => r.project_id === pid)) {
      if (!pkgByClid.has(row.cut_list_id)) pkgByClid.set(row.cut_list_id, []);
      pkgByClid.get(row.cut_list_id)!.push(row);
    }

    let totalItems = 0;
    let totalPacked = 0;

    for (const [clid, rows] of pkgByClid) {
      const clKey = `${pid}-${clid}`;

      if (hasPrior.has(clid)) {
        // Only units that passed the last prior machine are eligible
        const eligible = eligibleUnitCount.get(clKey) ?? 0;
        totalItems += eligible;
        // Packed = units that are eligible AND have box_id set
        // We pair by position: first `eligible` rows sorted by id
        const sortedRows = [...rows].sort((a, b) => a.id - b.id);
        const eligibleRows = sortedRows.slice(0, eligible);
        totalPacked += eligibleRows.filter(r => r.box_id !== null).length;
      } else {
        // No prior machine → all units eligible
        totalItems += rows.length;
        totalPacked += rows.filter(r => r.box_id !== null).length;
      }
    }

    const totalUnpacked = Math.max(0, totalItems - totalPacked);

    // Dispatch status
    const projectBoxes = boxesByProject.get(pid) ?? [];
    const anyFactoryOutNull = projectBoxes.length === 0 || projectBoxes.some(b => b.factory_out_at === null);
    const allFactoryOutSet = projectBoxes.length > 0 && projectBoxes.every(b => b.factory_out_at !== null);
    const anyFactoryOutSet = projectBoxes.some(b => b.factory_out_at !== null);
    const anySiteInNull = projectBoxes.some(b => b.site_in_at === null);

    const latestFactoryOutAt = anyFactoryOutNull
      ? null
      : projectBoxes.reduce<Date | null>((latest, b) => {
        if (!b.factory_out_at) return latest;
        return !latest || b.factory_out_at > latest ? b.factory_out_at : latest;
      }, null);

    const latestSiteInAt = !allFactoryOutSet || anySiteInNull
      ? null
      : projectBoxes.reduce<Date | null>((latest, b) => {
        if (!b.site_in_at) return latest;
        return !latest || b.site_in_at > latest ? b.site_in_at : latest;
      }, null);

    return {
      id: project.id,
      project_name: project.project_name,
      vendor_id: project.vendor_id,
      created_by: project.created_by,
      project_status: project.project_status,
      created_at: project.created_at,
      createdByUser: project.createdByUser,
      details: project.details,
      aggregatedTotals: {
        total_items: totalItems,
        total_packed: totalPacked,
        total_unpacked: totalUnpacked,
      },
      factory_out_at: latestFactoryOutAt,
      site_in_at: latestSiteInAt,
      all_factory_out: allFactoryOutSet,
      any_factory_out: anyFactoryOutSet,
    };
  });

  return result;
};

export const getProjectsByVendorIdService = async (
  vendorId: number
) => {
  /*
  |--------------------------------------------------------------------------
  | STEP 1 — Fetch packaging machine
  |--------------------------------------------------------------------------
  */

  const packagingMachine =
    await prisma.machineMaster.findFirst({
      where: {
        vendor_id: vendorId,
        machine_type_id: 18,
      },

      select: {
        id: true,
        sequence_no: true,
      },

      orderBy: {
        id: "asc",
      },
    });

  /*
  |--------------------------------------------------------------------------
  | STEP 2 — Fetch projects
  |--------------------------------------------------------------------------
  */

  const projects =
    await prisma.projectMaster.findMany({
      where: {
        vendor_id: vendorId,
      },

      select: {
        id: true,
        project_name: true,
        vendor_id: true,
        lead_id: true,
        created_by: true,
        project_status: true,
        created_at: true,

        createdByUser: {
          select: {
            id: true,
            vendor_id: true,
            user_name: true,
            user_type_id: true,
          },
        },

        details: {
          select: {
            id: true,
            project_id: true,
            vendor_id: true,
            lead_id: true,
            total_items: true,
            total_packed: true,
            total_unpacked: true,
            start_date: true,
            estimated_completion_date: true,
            actual_completion_date: true,
            room_name: true,
          },
        },
      },

      orderBy: {
        id: "desc",
      },
    });

  if (projects.length === 0) {
    return [];
  }

  const allProjectIds =
    projects.map(
      (project) =>
        project.id
    );

  /*
  |--------------------------------------------------------------------------
  | STEP 3 — Fetch manual packing CutList items
  |--------------------------------------------------------------------------
  |
  | These items do NOT have machine 18 rows initially.
  |
  | include_in_packing = true
  | scan_pack_validate = false
  |--------------------------------------------------------------------------
  */

  const [manualCutListItems, allBoxes] =
    await Promise.all([
      prisma.cutList.findMany({
        where: {
          vendor_id: vendorId,

          project_id: {
            in: allProjectIds,
          },

          include_in_packing: true,
          scan_pack_validate: false,

          status: "Active",
        },

        select: {
          id: true,
          project_id: true,
          qty: true,
          weight: true,
        },
      }),

      /*
      |--------------------------------------------------------------------------
      | Boxes
      |--------------------------------------------------------------------------
      */

      prisma.boxMaster.findMany({
        where: {
          vendor_id: vendorId,

          project_id: {
            in: allProjectIds,
          },

          is_deleted: false,
        },

        select: {
          project_id: true,
          factory_out_at: true,
          site_in_at: true,
        },
      }),
    ]);

  /*
  |--------------------------------------------------------------------------
  | Manual CutList IDs
  |--------------------------------------------------------------------------
  */

  const manualCutListIds =
    new Set<number>(
      manualCutListItems.map(
        (item) =>
          item.id
      )
    );

  /*
  |--------------------------------------------------------------------------
  | STEP 4 — Fetch machine mapping rows
  |--------------------------------------------------------------------------
  */

  let priorRows: {
    id: number;
    project_id: number;
    cut_list_id: number;
    sequence_no: number;
    actual_in_at: Date | null;
  }[] = [];

  let packagingRows: {
    id: number;
    project_id: number;
    cut_list_id: number;
    box_id: number | null;
    actual_in_at: Date | null;
    qty: number;
    row_created_source: string | null;
  }[] = [];

  /*
  |--------------------------------------------------------------------------
  | Only query machine mappings if packaging machine exists
  |--------------------------------------------------------------------------
  */

  if (packagingMachine) {
    const pkgMachineId =
      packagingMachine.id;

    const pkgMachineSeq =
      packagingMachine.sequence_no ??
      0;

    [
      priorRows,
      packagingRows,
    ] =
      await Promise.all([
        /*
        |--------------------------------------------------------------------------
        | Previous workstation mappings
        |--------------------------------------------------------------------------
        */

        prisma.cutListMachineMapping.findMany({
          where: {
            vendor_id:
              vendorId,

            project_id: {
              in:
                allProjectIds,
            },

            sequence_no: {
              lt:
                pkgMachineSeq,
            },

            expected_in:
              true,
          },

          select: {
            id: true,
            project_id: true,
            cut_list_id: true,
            sequence_no: true,
            actual_in_at: true,
          },
        }),

        /*
        |--------------------------------------------------------------------------
        | Packaging machine mappings
        |--------------------------------------------------------------------------
        */

        prisma.cutListMachineMapping.findMany({
          where: {
            vendor_id:
              vendorId,

            project_id: {
              in:
                allProjectIds,
            },

            machine_id:
              pkgMachineId,

            expected_in:
              true,
          },

          select: {
            id: true,
            project_id: true,
            cut_list_id: true,
            box_id: true,
            actual_in_at: true,

            /*
            |--------------------------------------------------------------------------
            | NEW quantity logic
            |--------------------------------------------------------------------------
            */

            qty: true,
            row_created_source: true,
          },
        }),
      ]);
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 5 — Separate normal packing from manual packing
  |--------------------------------------------------------------------------
  |
  | Manual items must NOT enter the old row-count logic.
  |--------------------------------------------------------------------------
  */

  const normalPriorRows =
    priorRows.filter(
      (row) =>
        !manualCutListIds.has(
          row.cut_list_id
        )
    );

  const normalPackagingRows =
    packagingRows.filter(
      (row) =>
        !manualCutListIds.has(
          row.cut_list_id
        )
    );

  /*
  |--------------------------------------------------------------------------
  | STEP 6 — Build prior machine lookup for NORMAL items
  |--------------------------------------------------------------------------
  */

  type PriorKey =
    string;

  const priorBySeq =
    new Map<
      PriorKey,
      typeof normalPriorRows
    >();

  for (
    const row
    of normalPriorRows
  ) {
    const key: PriorKey =
      `${row.project_id}-${row.cut_list_id}-${row.sequence_no}`;

    if (
      !priorBySeq.has(
        key
      )
    ) {
      priorBySeq.set(
        key,
        []
      );
    }

    priorBySeq
      .get(key)!
      .push(row);
  }

  /*
  |--------------------------------------------------------------------------
  | Find highest previous machine sequence
  |--------------------------------------------------------------------------
  */

  const lastSeqMap =
    new Map<
      string,
      number
    >();

  for (
    const row
    of normalPriorRows
  ) {
    const key =
      `${row.project_id}-${row.cut_list_id}`;

    const current =
      lastSeqMap.get(
        key
      ) ?? -1;

    if (
      row.sequence_no >
      current
    ) {
      lastSeqMap.set(
        key,
        row.sequence_no
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Count eligible units
  |--------------------------------------------------------------------------
  |
  | Eligible = scanned at latest previous workstation.
  |--------------------------------------------------------------------------
  */

  const eligibleUnitCount =
    new Map<
      string,
      number
    >();

  for (
    const [
      projectCutListKey,
      maxSequence,
    ]
    of lastSeqMap
  ) {
    const seqKey =
      `${projectCutListKey}-${maxSequence}`;

    const rows =
      priorBySeq.get(
        seqKey
      ) ?? [];

    const scanned =
      rows.filter(
        (row) =>
          row.actual_in_at !==
          null
      ).length;

    eligibleUnitCount.set(
      projectCutListKey,
      scanned
    );
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 7 — Group normal packaging rows by project and CutList
  |--------------------------------------------------------------------------
  */

  const normalPackagingByProject =
    new Map<
      number,
      Map<
        number,
        typeof normalPackagingRows
      >
    >();

  for (
    const row
    of normalPackagingRows
  ) {
    if (
      !normalPackagingByProject.has(
        row.project_id
      )
    ) {
      normalPackagingByProject.set(
        row.project_id,
        new Map()
      );
    }

    const projectMap =
      normalPackagingByProject.get(
        row.project_id
      )!;

    if (
      !projectMap.has(
        row.cut_list_id
      )
    ) {
      projectMap.set(
        row.cut_list_id,
        []
      );
    }

    projectMap
      .get(row.cut_list_id)!
      .push(row);
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 8 — Group manual CutList items by project
  |--------------------------------------------------------------------------
  */

  const manualItemsByProject =
    new Map<
      number,
      typeof manualCutListItems
    >();

  for (
    const item
    of manualCutListItems
  ) {
    if (
      !manualItemsByProject.has(
        item.project_id
      )
    ) {
      manualItemsByProject.set(
        item.project_id,
        []
      );
    }

    manualItemsByProject
      .get(item.project_id)!
      .push(item);
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 9 — Calculate packed qty for manual items
  |--------------------------------------------------------------------------
  |
  | Example:
  |
  | CutList qty = 10
  |
  | Box 1 mapping qty = 3
  | Box 2 mapping qty = 2
  |
  | packed = 5
  |--------------------------------------------------------------------------
  */

  const manualPackedQtyMap =
    new Map<
      number,
      number
    >();

  for (
    const row
    of packagingRows
  ) {
    /*
    |--------------------------------------------------------------------------
    | Must be a manual CutList
    |--------------------------------------------------------------------------
    */

    if (
      !manualCutListIds.has(
        row.cut_list_id
      )
    ) {
      continue;
    }

    /*
    |--------------------------------------------------------------------------
    | Only manually created rows
    |--------------------------------------------------------------------------
    */

    if (
      row.row_created_source
        ?.trim()
        .toLowerCase() !==
      "manual"
    ) {
      continue;
    }

    /*
    |--------------------------------------------------------------------------
    | No box means not packed
    |--------------------------------------------------------------------------
    */

    if (
      row.box_id ===
      null
    ) {
      continue;
    }

    const currentPackedQty =
      manualPackedQtyMap.get(
        row.cut_list_id
      ) ?? 0;

    manualPackedQtyMap.set(
      row.cut_list_id,

      currentPackedQty +
        Number(
          row.qty ?? 0
        )
    );
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 10 — Boxes by project
  |--------------------------------------------------------------------------
  */

  const boxesByProject =
    new Map<
      number,
      typeof allBoxes
    >();

  for (
    const box
    of allBoxes
  ) {
    if (
      !boxesByProject.has(
        box.project_id
      )
    ) {
      boxesByProject.set(
        box.project_id,
        []
      );
    }

    boxesByProject
      .get(box.project_id)!
      .push(box);
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 11 — Compute totals per project
  |--------------------------------------------------------------------------
  */

  const result =
    projects.map(
      (project) => {
        const pid =
          project.id;

        /*
        |--------------------------------------------------------------------------
        | NORMAL PACKING TOTALS
        |--------------------------------------------------------------------------
        */

        let normalTotalItems =
          0;

        let normalTotalPacked =
          0;

        const projectPackagingRows =
          normalPackagingByProject.get(
            pid
          ) ??
          new Map();

        for (
          const [
            cutListId,
            rows,
          ]
          of projectPackagingRows
        ) {
          const clKey =
            `${pid}-${cutListId}`;

          const hasPriorMachine =
            lastSeqMap.has(
              clKey
            );

          /*
          |--------------------------------------------------------------------------
          | Total quantity represented by machine 18 mappings
          |--------------------------------------------------------------------------
          */

          const packagingTotalQty =
            rows.reduce(
              (
                total,
                row
              ) =>
                total +
                Number(
                  row.qty ??
                    1
                ),
              0
            );

          /*
          |--------------------------------------------------------------------------
          | Quantity actually inside boxes
          |--------------------------------------------------------------------------
          */

          const packedQty =
            rows.reduce(
              (
                total,
                row
              ) => {
                if (
                  row.box_id ===
                  null
                ) {
                  return total;
                }

                return (
                  total +
                  Number(
                    row.qty ??
                      1
                  )
                );
              },
              0
            );

          /*
          |--------------------------------------------------------------------------
          | Previous machine exists
          |--------------------------------------------------------------------------
          */

          if (
            hasPriorMachine
          ) {
            const eligible =
              eligibleUnitCount.get(
                clKey
              ) ?? 0;

            normalTotalItems +=
              eligible;

            normalTotalPacked +=
              Math.min(
                packedQty,
                eligible
              );
          }

          /*
          |--------------------------------------------------------------------------
          | Packaging only item
          |--------------------------------------------------------------------------
          */

          else {
            normalTotalItems +=
              packagingTotalQty;

            normalTotalPacked +=
              Math.min(
                packedQty,
                packagingTotalQty
              );
          }
        }

        /*
        |--------------------------------------------------------------------------
        | MANUAL PACKING TOTALS
        |--------------------------------------------------------------------------
        */

        let manualTotalItems =
          0;

        let manualTotalPacked =
          0;

        const manualItems =
          manualItemsByProject.get(
            pid
          ) ?? [];

        for (
          const item
          of manualItems
        ) {
          const totalQty =
            Number(
              item.qty ??
                0
            );

          /*
          |--------------------------------------------------------------------------
          | Total always comes from CutList.qty
          |--------------------------------------------------------------------------
          */

          manualTotalItems +=
            totalQty;

          /*
          |--------------------------------------------------------------------------
          | Packed comes from SUM(CutListMachineMapping.qty)
          |--------------------------------------------------------------------------
          */

          const packedQty =
            manualPackedQtyMap.get(
              item.id
            ) ?? 0;

          /*
          |--------------------------------------------------------------------------
          | Never allow packed > total
          |--------------------------------------------------------------------------
          */

          manualTotalPacked +=
            Math.min(
              packedQty,
              totalQty
            );
        }

        /*
        |--------------------------------------------------------------------------
        | COMBINE NORMAL + MANUAL
        |--------------------------------------------------------------------------
        */

        const totalItems =
          normalTotalItems +
          manualTotalItems;

        const totalPacked =
          normalTotalPacked +
          manualTotalPacked;

        const totalUnpacked =
          Math.max(
            0,
            totalItems -
              totalPacked
          );

        /*
        |--------------------------------------------------------------------------
        | Dispatch status
        |--------------------------------------------------------------------------
        */

        const projectBoxes =
          boxesByProject.get(
            pid
          ) ?? [];

        const anyFactoryOutNull =
          projectBoxes.length ===
            0 ||
          projectBoxes.some(
            (box) =>
              box.factory_out_at ===
              null
          );

        const allFactoryOutSet =
          projectBoxes.length >
            0 &&
          projectBoxes.every(
            (box) =>
              box.factory_out_at !==
              null
          );

        const anyFactoryOutSet =
          projectBoxes.some(
            (box) =>
              box.factory_out_at !==
              null
          );

        const anySiteInNull =
          projectBoxes.some(
            (box) =>
              box.site_in_at ===
              null
          );

        /*
        |--------------------------------------------------------------------------
        | Latest Factory Out
        |--------------------------------------------------------------------------
        */

        const latestFactoryOutAt =
          anyFactoryOutNull
            ? null
            : projectBoxes.reduce<
                Date | null
              >(
                (
                  latest,
                  box
                ) => {
                  if (
                    !box.factory_out_at
                  ) {
                    return latest;
                  }

                  return (
                    !latest ||
                    box.factory_out_at >
                      latest
                      ? box.factory_out_at
                      : latest
                  );
                },
                null
              );

        /*
        |--------------------------------------------------------------------------
        | Latest Site In
        |--------------------------------------------------------------------------
        */

        const latestSiteInAt =
          !allFactoryOutSet ||
          anySiteInNull
            ? null
            : projectBoxes.reduce<
                Date | null
              >(
                (
                  latest,
                  box
                ) => {
                  if (
                    !box.site_in_at
                  ) {
                    return latest;
                  }

                  return (
                    !latest ||
                    box.site_in_at >
                      latest
                      ? box.site_in_at
                      : latest
                  );
                },
                null
              );

        /*
        |--------------------------------------------------------------------------
        | Final response
        |--------------------------------------------------------------------------
        */

        return {
          id:
            project.id,

          project_name:
            project.project_name,

          vendor_id:
            project.vendor_id,

          lead_id:
            project.lead_id,

          created_by:
            project.created_by,

          project_status:
            project.project_status,

          created_at:
            project.created_at,

          createdByUser:
            project.createdByUser,

          details:
            project.details,

          aggregatedTotals: {
            total_items:
              totalItems,

            total_packed:
              totalPacked,

            total_unpacked:
              totalUnpacked,
          },

          factory_out_at:
            latestFactoryOutAt,

          site_in_at:
            latestSiteInAt,

          all_factory_out:
            allFactoryOutSet,

          any_factory_out:
            anyFactoryOutSet,
        };
      }
    );

  return result;
};



// export const getProjectItemByFields = async (params: {
//   project_id: number;
//   vendor_id: number;
//   client_id: number;
//   unique_id: string;
// }) => {
//   return prisma.projectItemsMaster.findFirst({
//     where: {
//       project_id: params.project_id,
//       vendor_id: params.vendor_id,
//       client_id: params.client_id,
//       unique_id: {
//         equals: params.unique_id.trim(),
//         mode: 'insensitive',
//       },
//     },
//     include: {
//       project: true,
//       vendor: true,
//       details: true,
//     },
//   });
// };

// export const getProjectItemCounts = async ({
//   project_id,
//   vendor_id,
//   client_id,
// }: {
//   project_id: number;
//   vendor_id: number;
//   client_id: number;
// }) => {
//   // 1. Total qty from ProjectItemsMaster
//   const totalQty = await prisma.projectItemsMaster.aggregate({
//     _sum: { qty: true },
//     where: {
//       project_id,
//       vendor_id,
//       client_id,
//     },
//   });

//   // 2. Total packed qty from ScanAndPackItem (SUM qty, not just COUNT)
//   const packedQty = await prisma.scanAndPackItem.aggregate({
//     _sum: { qty: true },
//     where: {
//       project_id,
//       vendor_id,
//       client_id,
//       status: 'packed',
//     },
//   });

//   const total_items = totalQty._sum.qty || 0;
//   const total_packed = packedQty._sum.qty || 0;
//   const total_unpacked = total_items - total_packed;

//   // 3. Update ProjectDetails here (optional step)
//   await prisma.projectDetails.updateMany({
//     where: {
//       project_id,
//       vendor_id,
//       client_id,
//     },
//     data: {
//       total_items,
//       total_packed,
//       total_unpacked,
//     },
//   });

//   return {
//     total_items,
//     total_packed,
//     total_unpacked,
//   };
// };

// export const createOrUpdateFullProject = async (
//   vendorToken: string,
//   payload: FullProjectCreateInput
// ) => {
//   // ✅ Step 1: Resolve vendor from token
//   const vendorTokenEntry = await prisma.vendorTokens.findUnique({
//     where: { token: vendorToken },
//     include: { vendor: true }
//   });

//   if (!vendorTokenEntry || new Date() > vendorTokenEntry.expiry_date) {
//     throw new Error("Invalid or expired vendor token");
//   }

//   const vendor = vendorTokenEntry.vendor;

//   // ✅ Step 2: Resolve default admin user (created_by)
//   const adminUser = await prisma.userMaster.findFirst({
//     where: {
//       vendor_id: vendor.id,
//       user_type_id: 2 // assuming 1 = admin
//     },
//     orderBy: { created_at: "asc" }
//   });

//   if (!adminUser) throw new Error("No admin user found for this vendor");

//   const createdByUserId = adminUser.id;

//   // ✅ Step 3: Find or create client
//   const orConditions: Prisma.ClientMasterWhereInput[] = [];
//   if (payload.client.contact) orConditions.push({ contact: payload.client.contact });
//   if (payload.client.id) orConditions.push({ id: payload.client.id });

//   let client = await prisma.clientMaster.findFirst({
//     where: { OR: orConditions }
//   });

//   if (!client) {
//     client = await prisma.clientMaster.create({
//       data: {
//         name: payload.client.name,
//         contact: payload.client.contact,
//         alt_contact: payload.client.alt_contact || "",
//         email: payload.client.email || "",
//         address: payload.client.address.address || "",
//         city: payload.client.address.city || "",
//         state: payload.client.address.state || "",
//         country: payload.client.address.country || "",
//         pincode: payload.client.address.pincode || "",
//         clientCode: payload.client.contact
//       }
//     });
//   }

//   // ✅ Step 4: Find or create project
//   let project = await prisma.projectMaster.findFirst({
//     where: {
//       unique_project_id: payload.project.unique_project_id,
//       vendor_id: vendor.id,
//       client_id: client.id
//     }
//   });

//   if (!project) {
//     project = await prisma.projectMaster.create({
//       data: {
//         project_name: payload.project.project_name,
//         unique_project_id: payload.project.unique_project_id,
//         vendor_id: vendor.id,
//         client_id: client.id,
//         created_by: createdByUserId,
//         project_status: "Initiated",
//         is_grouping: payload.project.is_grouping ?? false
//       }
//     });
//   } else {
//     await prisma.projectMaster.update({
//       where: { id: project.id },
//       data: { project_status: "in-progress" }
//     });
//   }

//   // ✅ Step 5: Loop through rooms and insert items
//   for (const room of payload.rooms) {
//     const projectDetails = await prisma.projectDetails.create({
//       data: {
//         project_id: project.id,
//         vendor_id: vendor.id,
//         client_id: client.id,
//         estimated_completion_date: room.estimated_completion_date
//           ? new Date(room.estimated_completion_date)
//           : new Date(),
//         total_items: 0,
//         total_packed: 0,
//         total_unpacked: 0,
//         room_name: room.room_name,
//         is_grouping: room.is_grouping ?? false
//       }
//     });

//     const invalidItems: string[] = [];
//     const seenUniqueIds = new Set<string>();

//     for (const [index, item] of room.items.entries()) {
//       if (!item.unique_id || !item.item_name || !item.category || !item.qty || !item.group) {
//         invalidItems.push(`Room "${room.room_name}" item at index ${index} missing required fields.`);
//         continue;
//       }

//       if (seenUniqueIds.has(item.unique_id)) {
//         invalidItems.push(`Duplicate unique_id "${item.unique_id}" in same room.`);
//         continue;
//       }

//       seenUniqueIds.add(item.unique_id);
//     }

//     const existingItems = await prisma.projectItemsMaster.findMany({
//       where: { project_id: project.id },
//       select: { unique_id: true }
//     });

//     const existingUniqueIds = new Set(existingItems.map(i => i.unique_id));

//     const validItems = room.items.filter(item => {
//       if (existingUniqueIds.has(item.unique_id)) {
//         invalidItems.push(`Duplicate unique_id "${item.unique_id}" already exists in DB.`);
//         return false;
//       }
//       return true;
//     });

//     if (invalidItems.length > 0) {
//       throw new Error(`Validation errors in room "${room.room_name}":\n${invalidItems.join("\n")}`);
//     }

//     const totalQty = validItems.reduce((sum, i) => sum + i.qty, 0);

//     await prisma.$transaction([
//       ...validItems.map(item =>
//         prisma.projectItemsMaster.create({
//           data: {
//             project_id: project.id,
//             vendor_id: vendor.id,
//             client_id: client.id,
//             category: item.category,
//             item_name: item.item_name,
//             qty: item.qty,
//             weight: item.weight ?? 0,
//             group: item.group,
//             L1: item.L1,
//             L2: item.L2,
//             L3: item.L3,
//             unique_id: item.unique_id,
//             project_details_id: projectDetails.id
//           }
//         })
//       ),
//       prisma.projectDetails.update({
//         where: { id: projectDetails.id },
//         data: {
//           total_items: { increment: totalQty },
//           total_unpacked: { increment: totalQty }
//         }
//       })
//     ]);
//   }

//   return {
//     message: "Project processed successfully",
//     project_id: project.id,
//     client_id: client.id
//   };
// };

export const calculateProjectWeight = async (
  vendorId: number,
  projectId: number
): Promise<number> => {
  const project = await prisma.projectMaster.findFirst({
    where: {
      id: projectId,
      vendor_id: vendorId,
    }
  });

  if (!project) throw new Error('Project not found for this vendor');

  const items = await prisma.projectItemsMaster.findMany({
    where: { project_id: project.id },
    select: { weight: true, qty: true }
  });

  const totalWeight = items.reduce((sum, item) => {
    const itemWeight = (item.weight || 0) * item.qty;
    return sum + itemWeight;
  }, 0);

  return totalWeight;
};

export const calculateProjectAndBoxWeight = async (
  vendorId: number,
  projectId: number,
  boxId: number
): Promise<{ project_weight: number; box_weight: number }> => {
  const project = await prisma.projectMaster.findFirst({
    where: {
      id: projectId,
      vendor_id: vendorId,
    }
  });

  if (!project) throw new Error('Project not found for this vendor');

  const [projectItems, boxWeightResult] = await Promise.all([
    prisma.projectItemsMaster.findMany({
      where: { project_id: project.id },
      select: { weight: true, qty: true }
    }),
    prisma.scanAndPackItem.aggregate({
      where: {
        project_id: project.id,
        box_id: boxId,
        is_deleted: false
      },
      _sum: { weight: true }
    })
  ]);

  const project_weight = projectItems.reduce((sum, item) => {
    const itemWeight = (item.weight || 0) * item.qty;
    return sum + itemWeight;
  }, 0);

  const box_weight = boxWeightResult._sum?.weight ?? 0;

  return { project_weight, box_weight };
};

// ============================================
// UPDATED SERVICE FUNCTION
// ============================================

// export const getCompletedProjectsByVendorIdService = async (vendorId: number) => {
//   // First get all projects with their details
//   const projects = await prisma.projectMaster.findMany({
//     where: {
//       vendor_id: vendorId,
//     },
//     select: {
//       id: true,
//       project_name: true,
//       vendor_id: true,
//       client_id: true,
//       created_by: true,
//       project_status: true,
//       created_at: true,
//       createdByUser: {
//         select: {
//           id: true,
//           vendor_id: true,
//           user_name: true,
//           user_type_id: true,
//         },
//       },
//       details: {
//         select: {
//           id: true,
//           project_id: true,
//           vendor_id: true,
//           client_id: true,
//           total_items: true,
//           total_packed: true,
//           total_unpacked: true,
//           start_date: true,
//           estimated_completion_date: true,
//           actual_completion_date: true,
//           room_name: true,
//         },
//       },
//     },
//   });

//   // Filter and transform projects where total_packed equals total_items (as sum)
//   const completedProjectsWithAggregatedTotals = [];
//   const boxUpdateResults = [];

//   for (const project of projects) {
//     // Sum up all totals from all rooms (details) for this project
//     const aggregatedTotals = project.details.reduce(
//       (acc, detail) => {
//         acc.total_items += detail.total_items || 0;
//         acc.total_packed += detail.total_packed || 0;
//         acc.total_unpacked += detail.total_unpacked || 0;
//         return acc;
//       },
//       { total_items: 0, total_packed: 0, total_unpacked: 0 }
//     );

//     // Check if project is completed (100% packed)
//     const isCompleted = aggregatedTotals.total_items > 0 &&
//       aggregatedTotals.total_packed === aggregatedTotals.total_items;

//     if (isCompleted) {
//       // First, check how many boxes are currently unpacked
//       const unpackedBoxesCount = await prisma.boxMaster.count({
//         where: {
//           project_id: project.id,
//           vendor_id: project.vendor_id,
//           client_id: project.client_id ?? undefined,
//           is_deleted: false,
//           box_status: 'unpacked'
//         }
//       });

//       let boxUpdateResult = { count: 0 };

//       // Only update if there are unpacked boxes
//       if (unpackedBoxesCount > 0) {
//         console.log(`📦 Found ${unpackedBoxesCount} unpacked boxes for project "${project.project_name}", updating to packed...`);

//         boxUpdateResult = await prisma.boxMaster.updateMany({
//           where: {
//             project_id: project.id,
//             vendor_id: project.vendor_id,
//             client_id: project.client_id ?? undefined,
//             is_deleted: false, // Only update non-deleted boxes
//             box_status: 'unpacked' // Only update boxes that are currently unpacked
//           },
//           data: {
//             box_status: 'packed'
//           }
//         });
//       } else {
//         console.log(`✅ All boxes for project "${project.project_name}" are already packed, skipping update`);
//       }

//       // Get count of all boxes for this project (for reporting)
//       const totalBoxesCount = await prisma.boxMaster.count({
//         where: {
//           project_id: project.id,
//           vendor_id: project.vendor_id,
//           client_id: project.client_id ?? undefined,
//           is_deleted: false
//         }
//       });

//       // Get count of packed boxes after update
//       const packedBoxesCount = await prisma.boxMaster.count({
//         where: {
//           project_id: project.id,
//           vendor_id: project.vendor_id,
//           client_id: project.client_id ?? undefined,
//           is_deleted: false,
//           box_status: 'packed'
//         }
//       });

//       boxUpdateResults.push({
//         project_id: project.id,
//         project_name: project.project_name,
//         boxes_updated: boxUpdateResult.count,
//         total_boxes: totalBoxesCount,
//         packed_boxes: packedBoxesCount,
//         was_already_completed: unpackedBoxesCount === 0
//       });

//       // Add to completed projects list
//       completedProjectsWithAggregatedTotals.push({
//         id: project.id,
//         project_name: project.project_name,
//         vendor_id: project.vendor_id,
//         client_id: project.client_id,
//         created_by: project.created_by,
//         project_status: project.project_status,
//         created_at: project.created_at,
//         createdByUser: project.createdByUser,
//         // Aggregated totals in separate object
//         aggregatedTotals: {
//           total_items: aggregatedTotals.total_items,
//           total_packed: aggregatedTotals.total_packed,
//           total_unpacked: aggregatedTotals.total_unpacked,
//         },
//         // Keep room-wise details for reference if needed
//         details: project.details,
//       });
//     }
//   }

//   return {
//     completedProjects: completedProjectsWithAggregatedTotals,
//     boxUpdateSummary: boxUpdateResults
//   };
// };

export const autoPackGroupedBoxesService = async (vendorId: number) => {
  // Step 1: Get all projects with grouping enabled
  const groupingProjects = await prisma.projectMaster.findMany({
    where: {
      vendor_id: vendorId,
      is_grouping: true, // Only projects with grouping enabled
    },
    include: {
      details: {
        where: {
          is_grouping: true, // Only room details with grouping enabled
        },
      },
    },
  });

  if (groupingProjects.length === 0) {
    return {
      message: 'No projects with grouping enabled found',
      updatedBoxes: [],
      summary: {
        projects_checked: 0,
        boxes_checked: 0,
        boxes_updated: 0,
      },
    };
  }

  const updatedBoxes = [];
  let totalBoxesChecked = 0;
  let totalBoxesUpdated = 0;

  // Step 2: Process each project with grouping
  for (const project of groupingProjects) {
    console.log(`🔍 Checking project: ${project.project_name} (ID: ${project.id})`);

    // Step 3: Get all unpacked boxes for this project
    const unpackedBoxes = await prisma.boxMaster.findMany({
      where: {
        project_id: project.id,
        vendor_id: vendorId,
        box_status: 'unpacked',
        is_deleted: false,
      },
    });

    totalBoxesChecked += unpackedBoxes.length;

    // Step 4: Check each unpacked box
    for (const box of unpackedBoxes) {
      try {
        // Get all items currently in this box
        const itemsInBox = await prisma.scanAndPackItem.findMany({
          where: {
            box_id: box.id,
            is_deleted: false,
          },
          select: {
            unique_id: true,
          },
        });

        if (itemsInBox.length === 0) {
          console.log(`📦 Box "${box.box_name}" is empty, skipping...`);
          continue;
        }

        // Get the first item to determine the group
        const firstItemUniqueId = itemsInBox[0].unique_id;

        const firstItemDetails = await prisma.projectItemsMaster.findFirst({
          where: {
            project_id: project.id,
            vendor_id: vendorId,
            unique_id: firstItemUniqueId,
          },
          select: {
            group: true,
            project_details_id: true,
          },
        });

        if (!firstItemDetails || !firstItemDetails.group) {
          console.log(`⚠️ Box "${box.box_name}": First item has no group, skipping...`);
          continue;
        }

        const boxGroup = firstItemDetails.group;
        const projectDetailsId = firstItemDetails.project_details_id;

        console.log(`📦 Checking box "${box.box_name}" for group "${boxGroup}"`);

        // Step 5: Get all items that should be in this group for this room
        const allGroupItems = await prisma.projectItemsMaster.findMany({
          where: {
            project_id: project.id,
            vendor_id: vendorId,
            project_details_id: projectDetailsId,
            group: boxGroup,
          },
          select: {
            unique_id: true,
            qty: true,
          },
        });

        // Calculate total quantity needed for this group
        const totalGroupQty = allGroupItems.reduce((sum, item) => sum + item.qty, 0);

        // Count how many items from this group are currently packed (in any box)
        const packedGroupItems = await prisma.scanAndPackItem.count({
          where: {
            project_id: project.id,
            vendor_id: vendorId,
            project_details_id: projectDetailsId,
            unique_id: {
              in: allGroupItems.map(item => item.unique_id),
            },
            is_deleted: false,
          },
        });

        console.log(`📊 Group "${boxGroup}": ${packedGroupItems}/${totalGroupQty} items packed`);

        // Step 6: If all group items are packed, mark the box as packed
        if (packedGroupItems >= totalGroupQty && packedGroupItems > 0) {
          await prisma.boxMaster.update({
            where: {
              id: box.id,
            },
            data: {
              box_status: 'packed',
            },
          });

          updatedBoxes.push({
            box_id: box.id,
            box_name: box.box_name,
            project_id: project.id,
            project_name: project.project_name,
            project_details_id: projectDetailsId,
            group: boxGroup,
            items_in_group: totalGroupQty,
            items_packed: packedGroupItems,
          });

          totalBoxesUpdated++;
          console.log(`✅ Box "${box.box_name}" marked as packed (group "${boxGroup}" complete)`);
        } else {
          console.log(`⏳ Box "${box.box_name}": Group "${boxGroup}" not yet complete (${packedGroupItems}/${totalGroupQty})`);
        }

      } catch (error) {
        console.error(`❌ Error processing box "${box.box_name}":`, error);
        continue;
      }
    }
  }

  return {
    message: `Processed ${groupingProjects.length} projects with grouping. Updated ${totalBoxesUpdated} boxes.`,
    updatedBoxes,
    summary: {
      projects_checked: groupingProjects.length,
      boxes_checked: totalBoxesChecked,
      boxes_updated: totalBoxesUpdated,
    },
  };
};

import { z } from "zod";

export const handelItems_13_aug_2026 = async (
  vendorToken: string,
  payload: CadbidPayload
) => {
  let resolvedVendorId: number | null = null;
  let resolvedProjectId: number | null = null;

  try {
    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint: "handelItems",
          vendor_token: vendorToken,
          vendor_id: resolvedVendorId,
          payload: payload as any,
          success: false,
          response: "",
          error: null,
          project_id: resolvedProjectId,
        },
      });
    } catch (logError) {
      console.error("Failed to write api log:", logError);
    }

    console.log("payload", payload);

    const requiredString = (field: string) =>
      z.string().min(1, `${field} blank`);

    const requiredNumber = (field: string) =>
      z.coerce.number({ error: `${field} missing` });

    const itemSchema = z.object({
      articleCode: requiredString("articleCode"),
      groupName: requiredString("groupName"),
      categoryName: z.string().optional().nullable(),
      procurement: z.string().optional().nullable(),

      l1: requiredNumber("l1"),
      l2: requiredNumber("l2"),
      l3: requiredNumber("l3"),

      name: requiredString("name"),

      qty: z.coerce
        .number()
        .int()
        .positive("qty must be greater than 0"),

      barcode1: z.string().optional().nullable(),
      barcode2: z.string().optional().nullable(),

      el1: z.string().optional().nullable(),
      el2: z.string().optional().nullable(),
      sl1: z.string().optional().nullable(),
      sl2: z.string().optional().nullable(),
    });

    const payloadSchema = z.object({
      projectName: requiredString("projectName"),
      customer_id: z.coerce.number().optional().nullable(),
      items: z.array(itemSchema).min(1, "items missing"),
    });

    const validation = payloadSchema.safeParse(payload);

    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        field_name: issue.path.join("."),
        message:
          issue.code === "invalid_type"
            ? "missing"
            : issue.message.includes("blank")
              ? "blank"
              : issue.message,
      }));

      return {
        success: false,
        message: errors,
      };
    }

    const validPayload = validation.data;

    const normalizeBarcode = (value?: string | null) =>
      String(value ?? "").trim();

    /*
    |--------------------------------------------------------------------------
    | Step 1: Resolve vendor
    |--------------------------------------------------------------------------
    */

    const vendorTokenEntry = await prisma.vendorTokens.findUnique({
      where: {
        token: vendorToken,
      },
      include: {
        vendor: true,
      },
    });

    if (!vendorTokenEntry || new Date() > vendorTokenEntry.expiry_date) {
      return {
        success: false,
        message: "Invalid or expired vendor token",
      };
    }

    const vendor = vendorTokenEntry.vendor;

    resolvedVendorId = vendor.id;

    /*
    |--------------------------------------------------------------------------
    | Step 2: Workstation configuration
    |--------------------------------------------------------------------------
    | is_tracktrace_enabled = true
    | -> machines 3, 7, 11
    |
    | is_scanpack_enabled = true
    | -> machines 17, 18
    |
    | both true
    | -> machines 3, 7, 11, 17, 18
    |--------------------------------------------------------------------------
    */

    const isTrackTraceEnabled = vendor.is_tracktrace_enabled === true;
    const isScanPackEnabled = vendor.is_scanpack_enabled === true;

    if (!isTrackTraceEnabled && !isScanPackEnabled) {
      return {
        success: false,
        message: "workstation not configured",
      };
    }

    const enabledMachineTypeIds = [
      ...(isTrackTraceEnabled ? [3, 7, 11] : []),
      ...(isScanPackEnabled ? [17, 18] : []),
    ];

    /*
    |--------------------------------------------------------------------------
    | Step 3: Barcode validation
    |--------------------------------------------------------------------------
    */

    const uniqueCodesToInsert = validPayload.items
      .map((item) => normalizeBarcode(item.barcode1))
      .filter((code): code is string => Boolean(code));

    const barcodeCountMap = new Map<string, number>();

    for (const code of uniqueCodesToInsert) {
      barcodeCountMap.set(code, (barcodeCountMap.get(code) || 0) + 1);
    }

    const duplicatesInPayload = [...barcodeCountMap.entries()]
      .filter(([, count]) => count > 1)
      .map(([code]) => code);

    if (duplicatesInPayload.length > 0) {
      return {
        success: false,
        message: "Duplicate barcodes found in this Excel",
        duplicates: duplicatesInPayload,
      };
    }

    /*
    |--------------------------------------------------------------------------
    | If Track & Trace is enabled, barcode must be unique in database.
    | If only ScanPack is enabled, same barcode can exist in old projects.
    |--------------------------------------------------------------------------
    */

    const shouldCheckDatabaseBarcodeDuplicate =
      vendor.is_tracktrace_enabled === true;

    if (shouldCheckDatabaseBarcodeDuplicate && uniqueCodesToInsert.length > 0) {
      const existingCodes = await prisma.cutList.findMany({
        where: {
          vendor_id: vendor.id,
          unique_code: {
            in: uniqueCodesToInsert,
          },
        },
        select: {
          unique_code: true,
        },
      });

      const databaseDuplicates = [
        ...new Set(
          existingCodes
            .map((code) => code.unique_code)
            .filter((code): code is string => Boolean(code))
        ),
      ];

      if (databaseDuplicates.length > 0) {
        return {
          success: false,
          message: "Duplicate barcodes found in database",
          duplicates: databaseDuplicates,
        };
      }
    }

    /*
    |--------------------------------------------------------------------------
    | Step 4: Resolve admin user
    |--------------------------------------------------------------------------
    */

    const adminUser = await prisma.userMaster.findFirst({
      where: {
        vendor_id: vendor.id,
        user_type_id: 2,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    if (!adminUser) {
      return {
        success: false,
        message: "No admin user found for this vendor",
      };
    }

    const createdByUserId = adminUser.id;

    /*
    |--------------------------------------------------------------------------
    | Step 5: Resolve lead_id from customer_id
    |--------------------------------------------------------------------------
    */

    let lead_id: number | null = null;

    const shouldPushLeadToCadbid = vendor.push_lead_to_cadbid === true;

    if (shouldPushLeadToCadbid) {
      if (!validPayload.customer_id || Number(validPayload.customer_id) <= 0) {
        return {
          success: false,
          message: "customer_id is required",
        };
      }

      const customerMapping =
        await prisma.leadExternalPlatformCustomerMapping.findFirst({
          where: {
            external_platform_customer_id: String(validPayload.customer_id),
            vendor_id: vendor.id,
          },
          select: {
            lead_id: true,
          },
        });

      if (!customerMapping) {
        return {
          success: false,
          message: "lead not mapped in cadbid and furnix",
        };
      }

      lead_id = customerMapping.lead_id;
    }

    /*
    |--------------------------------------------------------------------------
    | Step 6: Pre-fetch category type mappings
    |--------------------------------------------------------------------------
    */

    const categoryMappings = await prisma.projectCategoriesMaster.findMany({
      where: {
        vendor_id: vendor.id,
        status: "Yes",
      },
      select: {
        category_name: true,
        projectCategoriesMasterVendorMapping: {
          select: {
            project_categories_type_master_id: true,
          },
        },
      },
    });

    const categoryTypeMap = new Map<string, number[]>();

    for (const category of categoryMappings) {
      const typeIds = category.projectCategoriesMasterVendorMapping.map(
        (mapping) => mapping.project_categories_type_master_id
      );

      categoryTypeMap.set(category.category_name.trim().toLowerCase(), typeIds);
    }

    /*
    |--------------------------------------------------------------------------
    | Step 7: Pre-fetch machines once
    |--------------------------------------------------------------------------
    | Important:
    | Do not query machineMaster inside transaction item loop.
    |--------------------------------------------------------------------------
    */

    const machines = await prisma.machineMaster.findMany({
      where: {
        vendor_id: vendor.id,
        machine_type_id: {
          in: enabledMachineTypeIds,
        },
      },
      select: {
        id: true,
        machine_type_id: true,
        sequence_no: true,
        status: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    const getMachine = (
      machineTypeId: number,
      activeOnly: boolean = false
    ) => {
      return machines.find((machine) => {
        if (machine.machine_type_id !== machineTypeId) return false;
        if (activeOnly && machine.status !== "ACTIVE") return false;

        return true;
      });
    };

    const { randomUUID } = require("crypto");
    const unique_project_id = randomUUID();

    /*
    |--------------------------------------------------------------------------
    | Step 8: Transaction
    |--------------------------------------------------------------------------
    */

    const result = await prisma.$transaction(
      async (tx) => {
        const project = await tx.projectMaster.create({
          data: {
            project_name: validPayload.projectName,
            unique_project_id,
            vendor_id: vendor.id,
            created_by: createdByUserId,
            project_status: "Initiated",
            is_grouping: false,
            lead_id,
          },
        });

        resolvedProjectId = project.id;

        const totalItems = validPayload.items.reduce((sum, item) => {
          return sum + Number(item.qty);
        }, 0);

        await tx.projectDetails.create({
          data: {
            project_id: project.id,
            vendor_id: vendor.id,
            lead_id,
            room_name: validPayload.projectName,
            total_items: totalItems,
            total_packed: 0,
            total_unpacked: totalItems,
            is_grouping: false,
            start_date: new Date(),
            estimated_completion_date: null,
          },
        });

        const cutListMachineMappingRows: any[] = [];

        const pushMachineMappingRows = ({
          cutListId,
          machine,
          quantity,
        }: {
          cutListId: number;
          machine: {
            id: number;
            sequence_no: number | null;
          };
          quantity: number;
        }) => {
          for (let i = 0; i < quantity; i++) {
            cutListMachineMappingRows.push({
              cut_list_id: cutListId,
              machine_id: machine.id,
              project_id: project.id,
              vendor_id: vendor.id,
              lead_id,
              sequence_no: machine.sequence_no ?? 0,
              status: "Pending",
              created_by: createdByUserId,
              expected_in: true,
            });
          }
        };

        for (const item of validPayload.items) {
          const quantity = Number(item.qty);
          const hasEdgeBanding =
            !!item.el1 || !!item.el2 || !!item.sl1 || !!item.sl2;

          const row = await tx.cutList.create({
            data: {
              project_id: project.id,
              vendor_id: vendor.id,
              description: item.name,
              length: Number(item.l1),
              width: Number(item.l2),
              thickness: Number(item.l3),
              qty: quantity,
              material_details: item.articleCode,
              item_name: item.name,
              status: "Active",
              created_by: createdByUserId,
              lead_id,
              elf: item.el1 || "",
              elb: item.el2 || "",
              esl: item.sl1 || "",
              esr: item.sl2 || "",
              unique_code: "",
              unique_code_2: normalizeBarcode(item.barcode2) || null,
              group_name: item.groupName || null,
              category_name: item.categoryName || null,
              procurement: item.procurement || null,
            },
          });

          const uniqueCode =
            normalizeBarcode(item.barcode1) || `${row.id}-${project.id}`;

          await tx.cutList.update({
            where: {
              id: row.id,
            },
            data: {
              unique_code: uniqueCode,
            },
          });

          const itemCategoryName = (item.categoryName ?? "")
            .trim()
            .toLowerCase();

          const categoryTypeIds = categoryTypeMap.get(itemCategoryName) ?? [];

          const hasType4 = categoryTypeIds.includes(4);
          const hasType3 = categoryTypeIds.includes(3);
          const hasType1or2 = categoryTypeIds.some(
            (typeId) => typeId === 1 || typeId === 2
          );

          const isNormalFlow = hasType1or2 || categoryTypeIds.length === 0;

          /*
          |--------------------------------------------------------------------------
          | Type 4: No machine mapping
          |--------------------------------------------------------------------------
          */

          if (hasType4) {
            continue;
          }

          /*
          |--------------------------------------------------------------------------
          | Type 3: Only ScanPack flow
          |--------------------------------------------------------------------------
          */

          if (hasType3 && !isNormalFlow) {
            if (isScanPackEnabled) {
              const scanMachine = getMachine(17);
              const packMachine = getMachine(18);

              if (scanMachine) {
                pushMachineMappingRows({
                  cutListId: row.id,
                  machine: scanMachine,
                  quantity,
                });
              }

              if (packMachine) {
                pushMachineMappingRows({
                  cutListId: row.id,
                  machine: packMachine,
                  quantity,
                });
              }
            }

            continue;
          }

          /*
          |--------------------------------------------------------------------------
          | Track & Trace flow: 3, 7, 11
          |--------------------------------------------------------------------------
          */

          if (isTrackTraceEnabled) {
            if (hasEdgeBanding) {
              const edgeBandingMachine = getMachine(11);

              if (edgeBandingMachine) {
                pushMachineMappingRows({
                  cutListId: row.id,
                  machine: edgeBandingMachine,
                  quantity,
                });
                //throw new Error("Edgebanding machine is not configured");
              }


            }

            const cuttingMachine = getMachine(3, true);

            if (cuttingMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: cuttingMachine,
                quantity,
              });
            }

            if (Number(item.l3) > 9) {
              const cncMachine = getMachine(7, true);

              if (cncMachine) {
                pushMachineMappingRows({
                  cutListId: row.id,
                  machine: cncMachine,
                  quantity,
                });
              }
            }
          }

          /*
          |--------------------------------------------------------------------------
          | ScanPack flow: 17, 18
          |--------------------------------------------------------------------------
          */

          if (isScanPackEnabled) {
            const scanMachine = getMachine(17);
            const packMachine = getMachine(18);

            if (scanMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: scanMachine,
                quantity,
              });
            }

            if (packMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: packMachine,
                quantity,
              });
            }
          }
        }

        /*
        |--------------------------------------------------------------------------
        | Bulk insert machine mappings
        |--------------------------------------------------------------------------
        */

        const chunkSize = 1000;

        for (
          let index = 0;
          index < cutListMachineMappingRows.length;
          index += chunkSize
        ) {
          const chunk = cutListMachineMappingRows.slice(
            index,
            index + chunkSize
          );

          await tx.cutListMachineMapping.createMany({
            data: chunk,
          });
        }

        return project;
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );

    return {
      success: true,
      message: "Items processed successfully",
      project_id: result.id,
      unique_project_id,
    };
  } catch (error: any) {
    console.error("Transaction failed:", error);

    return {
      success: false,
      message:
        error.message || "Something went wrong. Transaction rolled back.",
    };
  }
};


export const handelItems = async (
  vendorToken: string,
  payload: CadbidPayload
) => {
  let resolvedVendorId: number | null = null;
  let resolvedProjectId: number | null = null;

  const endpoint = "handelItems";

  try {
    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint,
          vendor_token: vendorToken,
          vendor_id: resolvedVendorId,
          payload: payload as any,
          success: false,
          response: "",
          error: null,
          project_id: resolvedProjectId,
        },
      });
    } catch (logError) {
      console.error("Failed to write initial api log:", logError);
    }

    console.log("payload", payload);

    const cleanText = (value: unknown): string => {
      if (value === null || value === undefined) return "";
      return String(value).trim();
    };

    const requiredString = (field: string) =>
      z.string().min(1, `${field} blank`);

    const requiredNumber = (field: string) =>
      z.coerce.number({ error: `${field} missing` });

    const optionalWeight = z.preprocess((value) => {
      if (value === null || value === undefined || value === "") {
        return 0;
      }

      if (typeof value === "string") {
        return value
          .replace(/,/g, "")
          .replace(/kg/gi, "")
          .trim();
      }

      return value;
    }, z.coerce.number().min(0, "weight cannot be negative").default(0));

    const itemSchema = z.object({
      articleCode: requiredString("articleCode"),
      groupName: requiredString("groupName"),
      categoryName: z.string().optional().nullable(),
      procurement: z.string().optional().nullable(),

      l1: requiredNumber("l1"),
      l2: requiredNumber("l2"),
      l3: requiredNumber("l3"),

      name: requiredString("name"),

      qty: z.coerce
        .number()
        .int()
        .positive("qty must be greater than 0"),

      /*
      |--------------------------------------------------------------------------
      | Same as createProjectService
      |--------------------------------------------------------------------------
      | API weight is treated as per-piece weight.
      | Example: qty = 4 and weight = 6
      | CutList.weight = 24
      | CutListMachineMapping.weight = 6 only for machine type 18
      |--------------------------------------------------------------------------
      */
      weight: optionalWeight,

      barcode1: z.string().optional().nullable(),
      barcode2: z.string().optional().nullable(),

      el1: z.string().optional().nullable(),
      el2: z.string().optional().nullable(),
      sl1: z.string().optional().nullable(),
      sl2: z.string().optional().nullable(),
    });

    /*
    |--------------------------------------------------------------------------
    | customer_id is optional at schema level
    |--------------------------------------------------------------------------
    | It is required only when VendorMaster.push_lead_to_cadbid = true.
    |--------------------------------------------------------------------------
    */
    const payloadSchema = z.object({
      projectName: requiredString("projectName"),
      customer_id: z.coerce.number().optional().nullable(),
      items: z.array(itemSchema).min(1, "items missing"),
    });

    const validation = payloadSchema.safeParse(payload);

    if (!validation.success) {
      const errors = validation.error.issues.map((issue) => ({
        field_name: issue.path.join("."),
        message:
          issue.code === "invalid_type"
            ? "missing"
            : issue.message.includes("blank")
              ? "blank"
              : issue.message,
      }));

      return {
        success: false,
        message: errors,
      };
    }

    const validPayload = validation.data;

    const normalizeBarcode = (value?: string | null) =>
      String(value ?? "").trim();

    const toNumber = (value: any): number => {
      if (value === undefined || value === null || value === "") {
        return 0;
      }

      const numericValue = Number(
        String(value)
          .replace(/,/g, "")
          .replace(/kg/gi, "")
          .trim()
      );

      return Number.isFinite(numericValue) ? numericValue : 0;
    };

    const roundWeight = (value: number): number => {
      return Number(value.toFixed(7));
    };

    /*
    |--------------------------------------------------------------------------
    | STEP 1 — Resolve vendor from token
    |--------------------------------------------------------------------------
    */

    const vendorTokenEntry = await prisma.vendorTokens.findUnique({
      where: {
        token: vendorToken,
      },
      include: {
        vendor: true,
      },
    });

    if (!vendorTokenEntry || new Date() > vendorTokenEntry.expiry_date) {
      return {
        success: false,
        message: "Invalid or expired vendor token",
      };
    }

    const vendor = vendorTokenEntry.vendor;
    resolvedVendorId = vendor.id;

    /*
    |--------------------------------------------------------------------------
    | STEP 2 — Workstation configuration
    |--------------------------------------------------------------------------
    | is_tracktrace_enabled = true
    | -> machine types 3, 7, 11
    |
    | is_scanpack_enabled = true
    | -> machine types 17, 18
    |
    | both true
    | -> machine types 3, 7, 11, 17, 18
    |--------------------------------------------------------------------------
    */

    const isTrackTraceEnabled = vendor.is_tracktrace_enabled === true;
    const isScanPackEnabled = vendor.is_scanpack_enabled === true;

    if (!isTrackTraceEnabled && !isScanPackEnabled) {
      return {
        success: false,
        message: "workstation not configured",
      };
    }

    const enabledMachineTypeIds = [
      ...(isTrackTraceEnabled ? [3, 7, 11] : []),
      ...(isScanPackEnabled ? [17, 18] : []),
    ];

    /*
    |--------------------------------------------------------------------------
    | STEP 3 — Duplicate barcode validation
    |--------------------------------------------------------------------------
    | Same rule as createProjectService:
    | 1. Duplicate barcode inside current payload is never allowed.
    | 2. Track & Trace enabled -> barcode must be unique in DB.
    | 3. Only Scan & Pack enabled -> DB duplicate is allowed.
    |--------------------------------------------------------------------------
    */

    const uniqueCodesToInsert = validPayload.items
      .map((item) => normalizeBarcode(item.barcode1))
      .filter((code): code is string => Boolean(code));

    const duplicatesInPayload = uniqueCodesToInsert.filter(
      (code, index) => uniqueCodesToInsert.indexOf(code) !== index
    );

    if (duplicatesInPayload.length > 0) {
      return {
        success: false,
        message: `Duplicate barcodes found in Excel: ${[
          ...new Set(duplicatesInPayload),
        ].join(", ")}`,
        duplicates: [...new Set(duplicatesInPayload)],
      };
    }

    const shouldAllowDatabaseDuplicateBarcode =
      vendor.is_tracktrace_enabled === false &&
      vendor.is_scanpack_enabled === true;

    const shouldCheckDatabaseBarcodeDuplicate =
      vendor.is_tracktrace_enabled === true ||
      !shouldAllowDatabaseDuplicateBarcode;

    if (shouldCheckDatabaseBarcodeDuplicate && uniqueCodesToInsert.length > 0) {
      const existingCodes = await prisma.cutList.findMany({
        where: {
          vendor_id: vendor.id,
          unique_code: {
            in: uniqueCodesToInsert,
          },
        },
        select: {
          unique_code: true,
        },
      });

      if (existingCodes.length > 0) {
        const databaseDuplicates = [
          ...new Set(
            existingCodes
              .map((code) => code.unique_code)
              .filter((code): code is string => Boolean(code))
          ),
        ];

        return {
          success: false,
          message: `Duplicate barcodes found in database: ${databaseDuplicates.join(", ")}`,
          duplicates: databaseDuplicates,
        };
      }
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 4 — Resolve admin user
    |--------------------------------------------------------------------------
    */

    const adminUser = await prisma.userMaster.findFirst({
      where: {
        vendor_id: vendor.id,
        user_type_id: 2,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    if (!adminUser) {
      return {
        success: false,
        message: "No admin user found for this vendor",
      };
    }

    const createdByUserId = adminUser.id;

    /*
    |--------------------------------------------------------------------------
    | STEP 5 — Resolve lead only when push_lead_to_cadbid is enabled
    |--------------------------------------------------------------------------
    */

    let lead_id: number | null = null;

    const shouldPushLeadToCadbid = vendor.push_lead_to_cadbid === true;

    if (shouldPushLeadToCadbid) {
      if (!validPayload.customer_id || Number(validPayload.customer_id) <= 0) {
        return {
          success: false,
          message: "customer_id is required",
        };
      }

      const customerMapping =
        await prisma.leadExternalPlatformCustomerMapping.findFirst({
          where: {
            external_platform_customer_id: String(validPayload.customer_id),
            vendor_id: vendor.id,
          },
          select: {
            lead_id: true,
          },
        });

      if (!customerMapping) {
        return {
          success: false,
          message: "lead not mapped in cadbid and furnix",
        };
      }

      lead_id = customerMapping.lead_id;
    }

    /*
    |--------------------------------------------------------------------------
    | STEP 6 — Pre-fetch category type mappings
    |--------------------------------------------------------------------------
    */

    const categoryMappingsRaw = await prisma.projectCategoriesMaster.findMany({
      where: {
        vendor_id: vendor.id,
        status: "Yes",
      },
      select: {
        id: true,
        category_name: true,
        use_in_assembled_packing: true,
        include_in_packing: true,
        scan_pack_validate: true,
        projectCategoriesMasterVendorMapping: {
          select: {
            project_categories_type_master_id: true,
          },
        },
      },
    });

    const categoryMappings = categoryMappingsRaw.map((category) => ({
      ...category,
      category_name: category.category_name.trim(),
    }));

    type CategoryConfig = {
      id: number;
      use_in_assembled_packing: boolean;
      include_in_packing: boolean;
      scan_pack_validate: boolean;
    };

    const categoryTypeMap = new Map<string, number[]>();
    const categoryMasterMap = new Map<string, CategoryConfig>();

    for (const category of categoryMappings) {
      const categoryKey = category.category_name.trim().toLowerCase();

      const typeIds = category.projectCategoriesMasterVendorMapping.map(
        (mapping) => mapping.project_categories_type_master_id
      );

      categoryTypeMap.set(categoryKey, typeIds);
      categoryMasterMap.set(categoryKey, {
        id: category.id,
        use_in_assembled_packing: category.use_in_assembled_packing === true,
        include_in_packing: category.include_in_packing === true,
        scan_pack_validate: category.scan_pack_validate === true,
      });
    }

    // console.log("categoryMasterMap", categoryMasterMap); return;

    /*
    |--------------------------------------------------------------------------
    | STEP 7 — Pre-fetch machines once
    |--------------------------------------------------------------------------
    | Do not query machineMaster inside item loop.
    |--------------------------------------------------------------------------
    */

    const machines = await prisma.machineMaster.findMany({
      where: {
        vendor_id: vendor.id,
        status: "ACTIVE",
        machine_type_id: {
          in: enabledMachineTypeIds,
        },
      },
      select: {
        id: true,
        machine_type_id: true,
        sequence_no: true,
        status: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    const getMachine = (
      machineTypeId: number,
      activeOnly: boolean = false
    ) => {
      return machines.find((machine) => {
        if (machine.machine_type_id !== machineTypeId) return false;
        if (activeOnly && machine.status !== "ACTIVE") return false;

        return true;
      });
    };

    const { randomUUID } = require("crypto");
    const unique_project_id = randomUUID();

    /*
    |--------------------------------------------------------------------------
    | STEP 8 — Transaction
    |--------------------------------------------------------------------------
    */

    const result = await prisma.$transaction(
      async (tx) => {
        const project = await tx.projectMaster.create({
          data: {
            project_name: validPayload.projectName,
            unique_project_id,
            vendor_id: vendor.id,
            created_by: createdByUserId,
            project_status: "Initiated",
            is_grouping: false,
            lead_id,
          },
        });

        resolvedProjectId = project.id;

        const totalItems = validPayload.items.reduce((sum, item) => {
          return sum + Number(item.qty);
        }, 0);

        await tx.projectDetails.create({
          data: {
            project_id: project.id,
            vendor_id: vendor.id,
            lead_id,
            room_name: validPayload.projectName,
            total_items: totalItems,
            total_packed: 0,
            total_unpacked: totalItems,
            is_grouping: false,
            start_date: new Date(),
            estimated_completion_date: null,
          },
        });

        const cutListMachineMappingRows: any[] = [];

        const pushMachineMappingRows = ({
          cutListId,
          machine,
          quantity,
          perItemWeight,
        }: {
          cutListId: number;
          machine: {
            id: number;
            machine_type_id: number | null;
            sequence_no: number | null;
          };
          quantity: number;
          perItemWeight: number;
        }) => {
          for (let i = 0; i < quantity; i++) {
            cutListMachineMappingRows.push({
              cut_list_id: cutListId,
              machine_id: machine.id,
              project_id: project.id,
              vendor_id: vendor.id,
              lead_id,
              sequence_no: machine.sequence_no ?? 0,
              status: "Pending",
              created_by: createdByUserId,
              expected_in: true,

              /*
              |--------------------------------------------------------------------------
              | Same as createProjectService
              |--------------------------------------------------------------------------
              | Weight is stored only against packaging machine type 18.
              |--------------------------------------------------------------------------
              */
              weight:
                Number(machine.machine_type_id) === 18
                  ? perItemWeight
                  : 0,
            });
          }
        };

        for (const item of validPayload.items) {
          const quantity = Number(item.qty);

          /*
          |--------------------------------------------------------------------------
          | Same weight logic as createProjectService
          |--------------------------------------------------------------------------
          | API item.weight is per-piece weight.
          | CutList.weight stores total weight = per-piece weight * qty.
          | Packaging mapping weight stores per-piece weight.
          |--------------------------------------------------------------------------
          */
          const excelRowWeight = roundWeight(
            toNumber((item as any).weight) * quantity
          );

          const perItemWeight =
            quantity > 0 ? roundWeight(excelRowWeight / quantity) : 0;

          const hasEdgeBanding =
            !!item.el1 || !!item.el2 || !!item.sl1 || !!item.sl2;

          const itemCategoryName = (item.categoryName ?? "")
            .trim()
            .toLowerCase();

          const categoryConfig = categoryMasterMap.get(itemCategoryName) ?? null;

          /*
          |--------------------------------------------------------------------------
          | Packaging machine type 18 category rule
          |--------------------------------------------------------------------------
          | If category does not exist, keep old/default behaviour.
          | If category exists:
          | - include_in_packing = false => do not create packaging machine 18 row.
          | - include_in_packing = true and scan_pack_validate = true => create packaging 18 row.
          | - include_in_packing = true and scan_pack_validate = false => only CutList stores item;
          |   no packaging machine 18 row will be created.
          |--------------------------------------------------------------------------
          */
          const shouldInsertPackagingMachineMapping =
            !categoryConfig ||
            (categoryConfig.include_in_packing === true &&
              categoryConfig.scan_pack_validate === true);

          const row = await tx.cutList.create({
            data: {
              project_id: project.id,
              vendor_id: vendor.id,
              description: item.name,
              length: Number(item.l1),
              width: Number(item.l2),
              thickness: Number(item.l3),
              qty: quantity,
              material_details: item.articleCode,
              item_name: item.name,
              status: "Active",
              created_by: createdByUserId,
              lead_id,
              elf: item.el1 || "",
              elb: item.el2 || "",
              esl: item.sl1 || "",
              esr: item.sl2 || "",
              unique_code: "",
              unique_code_2: item.barcode2 || null,
              group_name: item.groupName || null,
              category_name: item.categoryName || null,
              category_id: categoryConfig?.id ?? null,
              use_in_assembled_packing:
                categoryConfig?.use_in_assembled_packing ?? null,
              include_in_packing:
                categoryConfig?.include_in_packing ?? null,
              scan_pack_validate:
                categoryConfig?.scan_pack_validate ?? null,
              procurement: item.procurement || null,
              weight: excelRowWeight,
            },
          });

          const uniqueCode =
            cleanText(item.barcode1) || `${row.id}-${project.id}`;

          await tx.cutList.update({
            where: {
              id: row.id,
            },
            data: {
              unique_code: uniqueCode,
            },
          });

          const categoryTypeIds = categoryTypeMap.get(itemCategoryName) ?? [];

          const hasType4 = categoryTypeIds.includes(4);
          const hasType3 = categoryTypeIds.includes(3);
          const hasType1Or2 = categoryTypeIds.some(
            (typeId) => typeId === 1 || typeId === 2
          );

          const isNormalFlow = hasType1Or2 || categoryTypeIds.length === 0;

          /*
          |--------------------------------------------------------------------------
          | Existing categoryTypeIds logic for non-packaging machines only
          |--------------------------------------------------------------------------
          | IMPORTANT: machine type 18 is NOT controlled by categoryTypeIds.
          |--------------------------------------------------------------------------
          */

          if (!hasType4) {
            /*
            |------------------------------------------------------------------------
            | Type 3 — Scan validation machine 17 only
            |------------------------------------------------------------------------
            */
            if (hasType3 && !isNormalFlow) {
              if (isScanPackEnabled) {
                const scanMachine = getMachine(17, true);

                if (scanMachine) {
                  pushMachineMappingRows({
                    cutListId: row.id,
                    machine: scanMachine,
                    quantity,
                    perItemWeight,
                  });
                }
              }
            } else {
              /*
              |----------------------------------------------------------------------
              | Track & Trace flow — machine types 3, 7, 11
              |----------------------------------------------------------------------
              */
              if (isTrackTraceEnabled) {
                if (hasEdgeBanding) {
                  const edgeBandingMachine = getMachine(11, true);

                  if (edgeBandingMachine) {
                    pushMachineMappingRows({
                      cutListId: row.id,
                      machine: edgeBandingMachine,
                      quantity,
                      perItemWeight,
                    });
                  }
                }

                const cuttingMachine = getMachine(3, true);

                if (cuttingMachine) {
                  pushMachineMappingRows({
                    cutListId: row.id,
                    machine: cuttingMachine,
                    quantity,
                    perItemWeight,
                  });
                }

                if (Number(item.l3) > 9) {
                  const cncMachine = getMachine(7, true);

                  if (cncMachine) {
                    pushMachineMappingRows({
                      cutListId: row.id,
                      machine: cncMachine,
                      quantity,
                      perItemWeight,
                    });
                  }
                }
              }

              /*
              |----------------------------------------------------------------------
              | Existing ScanPack validation flow — machine type 17
              |----------------------------------------------------------------------
              */
              if (isScanPackEnabled) {
                const scanMachine = getMachine(17, true);

                if (scanMachine) {
                  pushMachineMappingRows({
                    cutListId: row.id,
                    machine: scanMachine,
                    quantity,
                    perItemWeight,
                  });
                }
              }
            }
          }

          /*
          |--------------------------------------------------------------------------
          | Packaging machine type 18 — ProjectCategoriesMaster ONLY
          |--------------------------------------------------------------------------
          | categoryTypeIds / hasType4 / hasType3 do NOT affect packaging.
          |
          | Category not found:
          |   -> keep old/default behaviour and create packaging mapping.
          |
          | Category found:
          |   include_in_packing = false
          |     -> no machine 18 mapping
          |
          |   include_in_packing = true && scan_pack_validate = true
          |     -> create machine 18 mapping
          |
          |   include_in_packing = true && scan_pack_validate = false
          |     -> no machine 18 mapping; item remains only in CutList for packing.
          |--------------------------------------------------------------------------
          */
          if (isScanPackEnabled && shouldInsertPackagingMachineMapping) {
            const packMachine = getMachine(18, true);

            if (packMachine) {
              pushMachineMappingRows({
                cutListId: row.id,
                machine: packMachine,
                quantity,
                perItemWeight,
              });
            }
          }
        }

        /*
        |--------------------------------------------------------------------------
        | Bulk insert machine mappings
        |--------------------------------------------------------------------------
        */

        const chunkSize = 1000;

        for (
          let index = 0;
          index < cutListMachineMappingRows.length;
          index += chunkSize
        ) {
          const chunk = cutListMachineMappingRows.slice(
            index,
            index + chunkSize
          );

          await tx.cutListMachineMapping.createMany({
            data: chunk,
          });
        }

        return project;
      },
      {
        maxWait: 10000,
        timeout: 30000,
      }
    );

    /*
    |--------------------------------------------------------------------------
    | STEP 9 — Success API log
    |--------------------------------------------------------------------------
    */

    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint,
          vendor_token: vendorToken,
          vendor_id: vendor.id,
          payload: {
            ...validPayload,
            lead_id,
          } as any,
          success: true,
          response: {
            project_id: result.id,
            unique_project_id,
          } as any,
          error: null,
          project_id: result.id,
        },
      });
    } catch (logError) {
      console.error("Failed to write success api log:", logError);
    }

    return {
      success: true,
      message: "Items processed successfully",
      project_id: result.id,
      unique_project_id,
    };
  } catch (error: any) {
    console.error("Transaction failed:", error);

    try {
      await prisma.apiRequestLog.create({
        data: {
          endpoint,
          vendor_token: vendorToken,
          vendor_id: resolvedVendorId,
          payload: payload as any,
          success: false,
          response: "",
          error: error.message,
          project_id: resolvedProjectId,
        },
      });
    } catch (logError) {
      console.error("Failed to write failure api log:", logError);
    }

    return {
      success: false,
      message:
        error.message || "Something went wrong. Transaction rolled back.",
    };
  }
};


