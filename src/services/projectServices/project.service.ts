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

export const createProjectItem = async (data: Omit<ProjectItemsMaster, 'id'>) => {
  // 1. Create the new item
  const newItem = await prisma.projectItemsMaster.create({ data });

  // 2. Recalculate total_items
  const totalQty = await prisma.projectItemsMaster.aggregate({
    _sum: { qty: true },
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
  });

  const total_items = totalQty._sum.qty || 0;

  // 3. Get current packed count from projectDetails
  const existingDetails = await prisma.projectDetails.findFirst({
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
  });

  const total_packed = existingDetails?.total_packed || 0;
  const total_unpacked = Math.max(total_items - total_packed, 0); // prevent negative

  // 4. Update ProjectDetails
  await prisma.projectDetails.updateMany({
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
    data: {
      total_items,
      total_unpacked,
    },
  });

  return newItem;
};

export const getAllProjects = () => {
  return prisma.projectMaster.findMany({
    include: {
      vendor: true,
      createdByUser: true,
      details: true,
      items: true,
    },
  });
};



export const getAllProjectsTrackTrace = (vendor_id: number) => {
  return prisma.projectMaster.findMany({
    where: {
      vendor_id: vendor_id,
    },
    include: {
      vendor: true,
      createdByUser: true,
      details: true,
      items: true,
      lead: {
        select: {
          id: true,
          firstname: true,
          lastname: true,
          lead_code: true
        }
      }
    },

    orderBy: { id: "desc" }
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

export const getAllProjectItems = () => {
  return prisma.projectItemsMaster.findMany({
    include: {
      project: true,
      vendor: true,
      details: true,
    },
  });
};

export const getProjectById = (id: number) => {
  return prisma.projectMaster.findUnique({
    where: { id },
    include: {
      vendor: true,
      createdByUser: true,
      details: true,
      items: true,
    },
  });
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

export const getProjectsByVendorIdService = async (vendorId: number) => {
  const projects = await prisma.projectMaster.findMany({
    where: {
      vendor_id: vendorId,
    },
    select: {
      id: true,
      project_name: true,
      vendor_id: true,
      client_id: true,
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
          client_id: true,
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
  });

  // Transform the data to sum up totals for each project
  const projectsWithAggregatedTotals = projects.map(project => {
    // Sum up all totals from all rooms (details) for this project
    const aggregatedTotals = project.details.reduce(
      (acc, detail) => {
        acc.total_items += detail.total_items || 0;
        acc.total_packed += detail.total_packed || 0;
        acc.total_unpacked += detail.total_unpacked || 0;
        return acc;
      },
      { total_items: 0, total_packed: 0, total_unpacked: 0 }
    );

    return {
      id: project.id,
      project_name: project.project_name,
      vendor_id: project.vendor_id,
      client_id: project.client_id,
      created_by: project.created_by,
      project_status: project.project_status,
      created_at: project.created_at,
      createdByUser: project.createdByUser,
      // Aggregated totals in separate object
      aggregatedTotals: {
        total_items: aggregatedTotals.total_items,
        total_packed: aggregatedTotals.total_packed,
        total_unpacked: aggregatedTotals.total_unpacked,
      },
      // Keep room-wise details for reference if needed
      details: project.details,
    };
  });

  return projectsWithAggregatedTotals;
};

export const getProjectItemByFields = async (params: {
  project_id: number;
  vendor_id: number;
  client_id: number;
  unique_id: string;
}) => {
  return prisma.projectItemsMaster.findFirst({
    where: {
      project_id: params.project_id,
      vendor_id: params.vendor_id,
      client_id: params.client_id,
      unique_id: {
        equals: params.unique_id.trim(),
        mode: 'insensitive',
      },
    },
    include: {
      project: true,
      vendor: true,
      details: true,
    },
  });
};

export const getProjectItemCounts = async ({
  project_id,
  vendor_id,
  client_id,
}: {
  project_id: number;
  vendor_id: number;
  client_id: number;
}) => {
  // 1. Total qty from ProjectItemsMaster
  const totalQty = await prisma.projectItemsMaster.aggregate({
    _sum: { qty: true },
    where: {
      project_id,
      vendor_id,
      client_id,
    },
  });

  // 2. Total packed qty from ScanAndPackItem (SUM qty, not just COUNT)
  const packedQty = await prisma.scanAndPackItem.aggregate({
    _sum: { qty: true },
    where: {
      project_id,
      vendor_id,
      client_id,
      status: 'packed',
    },
  });

  const total_items = totalQty._sum.qty || 0;
  const total_packed = packedQty._sum.qty || 0;
  const total_unpacked = total_items - total_packed;

  // 3. Update ProjectDetails here (optional step)
  await prisma.projectDetails.updateMany({
    where: {
      project_id,
      vendor_id,
      client_id,
    },
    data: {
      total_items,
      total_packed,
      total_unpacked,
    },
  });

  return {
    total_items,
    total_packed,
    total_unpacked,
  };
};

export const createOrUpdateFullProject = async (
  vendorToken: string,
  payload: FullProjectCreateInput
) => {
  // ✅ Step 1: Resolve vendor from token
  const vendorTokenEntry = await prisma.vendorTokens.findUnique({
    where: { token: vendorToken },
    include: { vendor: true }
  });

  if (!vendorTokenEntry || new Date() > vendorTokenEntry.expiry_date) {
    throw new Error("Invalid or expired vendor token");
  }

  const vendor = vendorTokenEntry.vendor;

  // ✅ Step 2: Resolve default admin user (created_by)
  const adminUser = await prisma.userMaster.findFirst({
    where: {
      vendor_id: vendor.id,
      user_type_id: 2 // assuming 1 = admin
    },
    orderBy: { created_at: "asc" }
  });

  if (!adminUser) throw new Error("No admin user found for this vendor");

  const createdByUserId = adminUser.id;

  // ✅ Step 3: Find or create client
  const orConditions: Prisma.ClientMasterWhereInput[] = [];
  if (payload.client.contact) orConditions.push({ contact: payload.client.contact });
  if (payload.client.id) orConditions.push({ id: payload.client.id });

  let client = await prisma.clientMaster.findFirst({
    where: { OR: orConditions }
  });

  if (!client) {
    client = await prisma.clientMaster.create({
      data: {
        name: payload.client.name,
        contact: payload.client.contact,
        alt_contact: payload.client.alt_contact || "",
        email: payload.client.email || "",
        address: payload.client.address.address || "",
        city: payload.client.address.city || "",
        state: payload.client.address.state || "",
        country: payload.client.address.country || "",
        pincode: payload.client.address.pincode || "",
        clientCode: payload.client.contact
      }
    });
  }

  // ✅ Step 4: Find or create project
  let project = await prisma.projectMaster.findFirst({
    where: {
      unique_project_id: payload.project.unique_project_id,
      vendor_id: vendor.id,
      client_id: client.id
    }
  });

  if (!project) {
    project = await prisma.projectMaster.create({
      data: {
        project_name: payload.project.project_name,
        unique_project_id: payload.project.unique_project_id,
        vendor_id: vendor.id,
        client_id: client.id,
        created_by: createdByUserId,
        project_status: "Initiated",
        is_grouping: payload.project.is_grouping ?? false
      }
    });
  } else {
    await prisma.projectMaster.update({
      where: { id: project.id },
      data: { project_status: "in-progress" }
    });
  }

  // ✅ Step 5: Loop through rooms and insert items
  for (const room of payload.rooms) {
    const projectDetails = await prisma.projectDetails.create({
      data: {
        project_id: project.id,
        vendor_id: vendor.id,
        client_id: client.id,
        estimated_completion_date: room.estimated_completion_date
          ? new Date(room.estimated_completion_date)
          : new Date(),
        total_items: 0,
        total_packed: 0,
        total_unpacked: 0,
        room_name: room.room_name,
        is_grouping: room.is_grouping ?? false
      }
    });

    const invalidItems: string[] = [];
    const seenUniqueIds = new Set<string>();

    for (const [index, item] of room.items.entries()) {
      if (!item.unique_id || !item.item_name || !item.category || !item.qty || !item.group) {
        invalidItems.push(`Room "${room.room_name}" item at index ${index} missing required fields.`);
        continue;
      }

      if (seenUniqueIds.has(item.unique_id)) {
        invalidItems.push(`Duplicate unique_id "${item.unique_id}" in same room.`);
        continue;
      }

      seenUniqueIds.add(item.unique_id);
    }

    const existingItems = await prisma.projectItemsMaster.findMany({
      where: { project_id: project.id },
      select: { unique_id: true }
    });

    const existingUniqueIds = new Set(existingItems.map(i => i.unique_id));

    const validItems = room.items.filter(item => {
      if (existingUniqueIds.has(item.unique_id)) {
        invalidItems.push(`Duplicate unique_id "${item.unique_id}" already exists in DB.`);
        return false;
      }
      return true;
    });

    if (invalidItems.length > 0) {
      throw new Error(`Validation errors in room "${room.room_name}":\n${invalidItems.join("\n")}`);
    }

    const totalQty = validItems.reduce((sum, i) => sum + i.qty, 0);

    await prisma.$transaction([
      ...validItems.map(item =>
        prisma.projectItemsMaster.create({
          data: {
            project_id: project.id,
            vendor_id: vendor.id,
            client_id: client.id,
            category: item.category,
            item_name: item.item_name,
            qty: item.qty,
            weight: item.weight ?? 0,
            group: item.group,
            L1: item.L1,
            L2: item.L2,
            L3: item.L3,
            unique_id: item.unique_id,
            project_details_id: projectDetails.id
          }
        })
      ),
      prisma.projectDetails.update({
        where: { id: projectDetails.id },
        data: {
          total_items: { increment: totalQty },
          total_unpacked: { increment: totalQty }
        }
      })
    ]);
  }

  return {
    message: "Project processed successfully",
    project_id: project.id,
    client_id: client.id
  };
};

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

export const getCompletedProjectsByVendorIdService = async (vendorId: number) => {
  // First get all projects with their details
  const projects = await prisma.projectMaster.findMany({
    where: {
      vendor_id: vendorId,
    },
    select: {
      id: true,
      project_name: true,
      vendor_id: true,
      client_id: true,
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
          client_id: true,
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
  });

  // Filter and transform projects where total_packed equals total_items (as sum)
  const completedProjectsWithAggregatedTotals = [];
  const boxUpdateResults = [];

  for (const project of projects) {
    // Sum up all totals from all rooms (details) for this project
    const aggregatedTotals = project.details.reduce(
      (acc, detail) => {
        acc.total_items += detail.total_items || 0;
        acc.total_packed += detail.total_packed || 0;
        acc.total_unpacked += detail.total_unpacked || 0;
        return acc;
      },
      { total_items: 0, total_packed: 0, total_unpacked: 0 }
    );

    // Check if project is completed (100% packed)
    const isCompleted = aggregatedTotals.total_items > 0 &&
      aggregatedTotals.total_packed === aggregatedTotals.total_items;

    if (isCompleted) {
      // First, check how many boxes are currently unpacked
      const unpackedBoxesCount = await prisma.boxMaster.count({
        where: {
          project_id: project.id,
          vendor_id: project.vendor_id,
          client_id: project.client_id ?? undefined,
          is_deleted: false,
          box_status: 'unpacked'
        }
      });

      let boxUpdateResult = { count: 0 };

      // Only update if there are unpacked boxes
      if (unpackedBoxesCount > 0) {
        console.log(`📦 Found ${unpackedBoxesCount} unpacked boxes for project "${project.project_name}", updating to packed...`);

        boxUpdateResult = await prisma.boxMaster.updateMany({
          where: {
            project_id: project.id,
            vendor_id: project.vendor_id,
            client_id: project.client_id ?? undefined,
            is_deleted: false, // Only update non-deleted boxes
            box_status: 'unpacked' // Only update boxes that are currently unpacked
          },
          data: {
            box_status: 'packed'
          }
        });
      } else {
        console.log(`✅ All boxes for project "${project.project_name}" are already packed, skipping update`);
      }

      // Get count of all boxes for this project (for reporting)
      const totalBoxesCount = await prisma.boxMaster.count({
        where: {
          project_id: project.id,
          vendor_id: project.vendor_id,
          client_id: project.client_id ?? undefined,
          is_deleted: false
        }
      });

      // Get count of packed boxes after update
      const packedBoxesCount = await prisma.boxMaster.count({
        where: {
          project_id: project.id,
          vendor_id: project.vendor_id,
          client_id: project.client_id ?? undefined,
          is_deleted: false,
          box_status: 'packed'
        }
      });

      boxUpdateResults.push({
        project_id: project.id,
        project_name: project.project_name,
        boxes_updated: boxUpdateResult.count,
        total_boxes: totalBoxesCount,
        packed_boxes: packedBoxesCount,
        was_already_completed: unpackedBoxesCount === 0
      });

      // Add to completed projects list
      completedProjectsWithAggregatedTotals.push({
        id: project.id,
        project_name: project.project_name,
        vendor_id: project.vendor_id,
        client_id: project.client_id,
        created_by: project.created_by,
        project_status: project.project_status,
        created_at: project.created_at,
        createdByUser: project.createdByUser,
        // Aggregated totals in separate object
        aggregatedTotals: {
          total_items: aggregatedTotals.total_items,
          total_packed: aggregatedTotals.total_packed,
          total_unpacked: aggregatedTotals.total_unpacked,
        },
        // Keep room-wise details for reference if needed
        details: project.details,
      });
    }
  }

  return {
    completedProjects: completedProjectsWithAggregatedTotals,
    boxUpdateSummary: boxUpdateResults
  };
};

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


export const handelItems = async (
  vendorToken: string,
  payload: CadbidPayload
) => {
  try {

    console.log("payload", payload);


    const requiredString = (field: string) =>
      z.string().min(1, `${field} blank`);

    const requiredNumber = (field: string) =>
      z.coerce.number({
        error: `${field} missing`
      });




    const itemSchema = z.object({
      articleCode: requiredString("articleCode"),
      groupName: requiredString("groupName"),
      l1: requiredNumber("l1"),
      l2: requiredNumber("l2"),
      l3: requiredNumber("l3"),
      name: requiredString("name"),
      qty: z.coerce.number().int().positive("qty must be greater than 0"),
      barcode1: z.string().optional(),
      barcode2: z.string().optional(),
      el1: z.string().optional(),
      el2: z.string().optional(),
      sl1: z.string().optional(),
      sl2: z.string().optional(),
    });

    const payloadSchema = z.object({
      projectName: requiredString("projectName"),
      items: z.array(itemSchema).min(1, "items missing")
    });

    const validation = payloadSchema.safeParse(payload);

    if (!validation.success) {
      const errors = validation.error.issues.map(issue => ({
        field_name: issue.path.join("."),
        message:
          issue.code === "invalid_type"
            ? "missing"
            : issue.message.includes("blank")
              ? "blank"
              : issue.message
      }));

      return {
        success: false,
        message: errors
      };
    }

    // ✅ Step 1: Collect all unique_codes (barcode1) that will be inserted
    const uniqueCodesToInsert: string[] = [];

    for (const item of payload.items) {
      if (item.barcode1) {
        const quantity = Number(item.qty);
        for (let i = 0; i < quantity; i++) {
          uniqueCodesToInsert.push(item.barcode1);
        }
      }
    }

    // ✅ Step 2: Check for duplicates within the payload itself
    const duplicatesInPayload = uniqueCodesToInsert.filter(
      (code, index) => uniqueCodesToInsert.indexOf(code) !== index
    );

    if (duplicatesInPayload.length > 0) {
      return {
        success: false,
        message: "Duplicate barcodes found in payload",
        duplicates: [...new Set(duplicatesInPayload)]
      };
    }

    // ✅ Step 3: Check if any barcode1 already exists in database
    if (uniqueCodesToInsert.length > 0) {
      const existingCodes = await prisma.cutList.findMany({
        where: {
          unique_code: {
            in: uniqueCodesToInsert
          }
        },
        select: {
          unique_code: true
        }
      });

      if (existingCodes.length > 0) {
        const duplicateCodes = existingCodes.map(c => c.unique_code);
        return {
          success: false,
          message: "Duplicate barcodes found in database",
          duplicates: duplicateCodes
        };
      }
    }

    // ✅ Step 4: Resolve vendor
    const vendorTokenEntry = await prisma.vendorTokens.findUnique({
      where: { token: vendorToken },
      include: { vendor: true }
    });

    if (!vendorTokenEntry || new Date() > vendorTokenEntry.expiry_date) {
      return {
        success: false,
        message: "Invalid or expired vendor token"
      };
    }

    const vendor = vendorTokenEntry.vendor;

    // ✅ Step 5: Resolve admin user
    const adminUser = await prisma.userMaster.findFirst({
      where: {
        vendor_id: vendor.id,
        user_type_id: 2
      },
      orderBy: { created_at: "asc" }
    });

    if (!adminUser) {
      return {
        success: false,
        message: "No admin user found for this vendor"
      };
    }

    const createdByUserId = adminUser.id;
    const lead_id = null;

    const { randomUUID } = require("crypto");
    const unique_project_id = randomUUID();

    // 🔥 MAIN TRANSACTION
    const result = await prisma.$transaction(async (tx) => {

      const project = await tx.projectMaster.create({
        data: {
          project_name: payload.projectName,
          unique_project_id,
          vendor_id: vendor.id,
          created_by: createdByUserId,
          project_status: "Initiated",
          is_grouping: false
        }
      });

      for (const item of payload.items) {

        const quantity = Number(item.qty);

        for (let i = 0; i < quantity; i++) {

          const row = await tx.cutList.create({
            data: {
              project_id: project.id,
              vendor_id: vendor.id,
              description: item.name,
              length: Number(item.l1),
              width: Number(item.l2),
              thickness: Number(item.l3),
              qty: 1,
              material_details: item.articleCode,
              item_name: item.groupName,
              status: "Active",
              created_by: createdByUserId,
              lead_id: lead_id,
              elf: item.el1 || '',
              elb: item.el2 || '',
              esl: item.sl1 || '',
              esr: item.sl2 || '',
              unique_code: "",
              unique_code_2: item.barcode2 || null,
            }
          });

          const uniqueCode = item.barcode1 || `${row.id}-${project.id}`;

          await tx.cutList.update({
            where: { id: row.id },
            data: { unique_code: uniqueCode }
          });

          let machine_type_id = 0;
          let sequence_no = 0;
          const hasEdgeBanding = item.el1 || item.el2 || item.sl1 || item.sl2;

          if (hasEdgeBanding) {

            if (machine_type_id == 0) {
              const machine_type = await tx.machineMaster.findFirst({
                where: {
                  vendor_id: Number(vendor.id),
                  machine_type_id: 11
                },
                select: {
                  id: true,
                  sequence_no: true
                }
              });
              if (machine_type) {
                machine_type_id = machine_type.id ?? 0;
                sequence_no = machine_type.sequence_no ?? 0;
              }
            }

            if (machine_type_id == 0) {
              return {
                success: false,
                message: "Edgebanding machine is not configured"
              };

              //throw new Error("Edgebanding machine is not configured");
            } else {
              await tx.cutListMachineMapping.create({
                data: {
                  cut_list_id: row.id,
                  machine_id: machine_type_id,
                  project_id: project.id,
                  vendor_id: vendor.id,
                  lead_id: lead_id,
                  sequence_no: sequence_no,
                  status: "Pending",
                  created_by: createdByUserId,
                  expected_in: true
                }
              });
            }
          }
        }


      }

      return project;
    });

    return {
      success: true,
      message: "Items processed successfully",
      project_id: result.id,
      unique_project_id: unique_project_id
    };

  } catch (error: any) {

    console.error("Transaction failed:", error);

    return {
      success: false,
      message: error.message || "Something went wrong. Transaction rolled back."
    };
  }
};
