import { prisma } from "../../prisma/client";

export const getScanItemsByFields = async ({
  project_id,
  vendor_id,
  box_id,
}: {
  project_id: number;
  vendor_id: number;
  client_id: number; // kept for API compatibility
  box_id: number;
}) => {
  // ── Box details ────────────────────────────────────────────────────────────
  const boxDetails = await prisma.boxMaster.findFirst({
    where: {
      id: box_id,
      project_id,
      vendor_id,
      is_deleted: false,
      project: {
        isDeleted: false,
      },
    },
  });

  // ── Items: CutListMachineMapping rows assigned to this box ─────────────────
  // Each row joined with its CutList for item details.
  // Only packaging machine rows (machine with box_id set) — filter by box_id
  // which is already scoped to the packaging machine via scan flow.
  const mappingRows = await prisma.cutListMachineMapping.findMany({
    where: {
      box_id,
      project_id,
      vendor_id,
      expected_in: true,
    },
    select: {
      id: true,
      cut_list_id: true,
      machine_id: true,
      sequence_no: true,
      status: true,
      actual_in_at: true,
      actual_out_at: true,
      in_operator: true,
      created_at: true,
      qty: true,
      cut_list: {
        select: {
          id: true,
          unique_code: true,
          unique_code_2: true,
          item_name: true,
          description: true,
          length: true,
          width: true,
          thickness: true,
          qty: true,
          material_details: true,
          category_name: true,
          group_name: true,
          procurement: true,
          elf: true,
          elb: true,
          esl: true,
          esr: true,
        },
      },
    },
    orderBy: { created_at: "desc" },
  });

  const enrichedItems = mappingRows.map((row) => ({
    id: row.id,
    cut_list_id: row.cut_list_id,
    machine_id: row.machine_id,
    sequence_no: row.sequence_no,
    project_id,
    vendor_id,
    box_id,
    status: row.status,
    actual_in_at: row.actual_in_at,
    actual_out_at: row.actual_out_at,
    in_operator: row.in_operator,
    created_date: row.created_at,
    // CutList details are returned beside the mapping row for API compatibility.
    project_item_details: row.cut_list
      ? {
          unique_id: row.cut_list.unique_code,
          unique_code_2: row.cut_list.unique_code_2,
          item_name: row.cut_list.item_name,
          description: row.cut_list.description,
          L1: row.cut_list.length?.toString() ?? "0",
          L2: row.cut_list.width?.toString() ?? "0",
          L3: row.cut_list.thickness?.toString() ?? "0",
          qty: row.qty,
          material_details: row.cut_list.material_details,
          category: row.cut_list.category_name ?? "",
          group: row.cut_list.group_name ?? "",
          procurement: row.cut_list.procurement ?? "",
          elf: row.cut_list.elf ?? "",
          elb: row.cut_list.elb ?? "",
          esl: row.cut_list.esl ?? "",
          esr: row.cut_list.esr ?? "",
        }
      : null,
  }));

  return {
    box_details: boxDetails,
    items: enrichedItems,
    total_items: enrichedItems.length,
  };
};

export const deleteScanAndPackItemById = async (
  id: number,
  vendor_id: number,
  project_id: number,
  box_id: number,
  deleted_by?: number | null,
) => {
  /*
  |--------------------------------------------------------------------------
  | STEP 1 — Validate required params
  |--------------------------------------------------------------------------
  */

  if (!id || !vendor_id || !project_id || !box_id) {
    throw new Error("id, vendor_id, project_id and box_id are required");
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 2 — Check box exists and is not packed
  |--------------------------------------------------------------------------
  */

  const project = await prisma.projectMaster.findFirst({
    where: { id: Number(project_id), vendor_id: Number(vendor_id) },
    select: { id: true, isDeleted: true, project_status: true },
  });

  if (
    !project ||
    project.isDeleted ||
    ["deactivated", "deleted", "deactive", "inactive"].includes(
      (project.project_status || "").toLowerCase(),
    )
  ) {
    throw new Error("Project is deleted or deactivated");
  }

  const box = await prisma.boxMaster.findFirst({
    where: {
      id: Number(box_id),
      vendor_id: Number(vendor_id),
      project_id: Number(project_id),
      is_deleted: false,
    },

    select: {
      id: true,
      box_name: true,
      box_status: true,
    },
  });

  if (!box) {
    throw new Error("Box not found");
  }

  if (String(box.box_status).trim().toLowerCase() === "packed") {
    throw new Error("Packed box cannot be updated");
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 3 — Check mapping exists inside this box
  |--------------------------------------------------------------------------
  */

  const existingMapping = await prisma.cutListMachineMapping.findFirst({
    where: {
      id: Number(id),
      vendor_id: Number(vendor_id),
      project_id: Number(project_id),
      box_id: Number(box_id),
    },

    select: {
      id: true,
      box_id: true,
      cut_list_id: true,
      machine_id: true,
      project_id: true,
      vendor_id: true,
      qty: true,
      row_created_source: true,
      in_operator: true,
      actual_in_at: true,
      created_by: true,
      created_at: true,
    },
  });

  if (!existingMapping) {
    throw new Error("Item not found in this box");
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 3.5 — Log item deletion in BoxItemDeleteLog
  |--------------------------------------------------------------------------
  */

  try {
    await prisma.boxItemDeleteLog.create({
      data: {
        cut_list_machine_mapping_id: existingMapping.id,
        cut_list_id: existingMapping.cut_list_id,
        qty: existingMapping.qty || 1,
        box_id: Number(box_id),
        project_id: Number(project_id),
        vendor_id: Number(vendor_id),
        scanned_by:
          existingMapping.in_operator || existingMapping.created_by || null,
        scanned_at:
          existingMapping.actual_in_at || existingMapping.created_at || null,
        deleted_by: deleted_by ? Number(deleted_by) : null,
      },
    });
  } catch (logError) {
    console.error("Error creating BoxItemDeleteLog entry:", logError);
  }

  /*
  |--------------------------------------------------------------------------
  | STEP 4 — Check row source
  |--------------------------------------------------------------------------
  |
  | Manual:
  | Delete complete CutListMachineMapping row.
  |
  | Existing / Scan:
  | Keep existing logic and only remove box_id.
  |--------------------------------------------------------------------------
  */

  const isManualRow =
    existingMapping.row_created_source?.trim().toLowerCase() === "manual";

  /*
  |--------------------------------------------------------------------------
  | MANUAL ROW — Delete complete mapping
  |--------------------------------------------------------------------------
  */

  if (isManualRow) {
    await prisma.cutListMachineMapping.delete({
      where: {
        id: existingMapping.id,
      },
    });

    console.log("Manual item removed from box successfully");

    return {
      message: "Manual item removed from box successfully",

      action: "deleted",

      removed_mapping_id: existingMapping.id,

      removed_qty: existingMapping.qty,

      previous_box_id: Number(box_id),

      current_box_id: null,

      project_id: existingMapping.project_id,

      vendor_id: existingMapping.vendor_id,

      cut_list_id: existingMapping.cut_list_id,

      row_created_source: existingMapping.row_created_source,
    };
  }

  /*
  |--------------------------------------------------------------------------
  | NORMAL / SCANNED ROW — Existing logic
  |--------------------------------------------------------------------------
  |
  | Do not delete mapping.
  | Only set box_id = null.
  |--------------------------------------------------------------------------
  */

  const updatedMapping = await prisma.cutListMachineMapping.update({
    where: {
      id: existingMapping.id,
    },

    data: {
      box_id: null,
      actual_in_at: null,
      in_operator: null,
    },

    select: {
      id: true,
      box_id: true,
      cut_list_id: true,
      machine_id: true,
      project_id: true,
      vendor_id: true,
      qty: true,
      row_created_source: true,
    },
  });

  console.log("Item removed from box successfully");

  return {
    message: "Item removed from box successfully",

    action: "box_unassigned",

    removed_mapping_id: updatedMapping.id,

    removed_qty: updatedMapping.qty,

    previous_box_id: Number(box_id),

    current_box_id: updatedMapping.box_id,

    project_id: updatedMapping.project_id,

    vendor_id: updatedMapping.vendor_id,

    cut_list_id: updatedMapping.cut_list_id,

    row_created_source: updatedMapping.row_created_source,
  };
};
