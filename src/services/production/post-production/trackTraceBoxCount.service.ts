import { prisma } from "../../../prisma/client";

/**
 * Track & Trace large-scale vendors don't set "No. of Boxes" by hand: it is the
 * number of boxes in the lead's Track & Trace project that contain packed items
 * (same rule as "Boxes With Items" on the project detail page).
 */

export const isTrackTraceBoxCountVendor = async (vendorId: number) => {
  const vendor = await prisma.vendorMaster.findFirst({
    where: { id: vendorId },
    select: { is_tracktrace_enabled: true, handlesLargeScaleProjects: true },
  });
  return (
    vendor?.is_tracktrace_enabled === true &&
    vendor?.handlesLargeScaleProjects === true
  );
};

const countBoxesWithItems = async (vendorId: number, leadId: number) => {
  const project = await prisma.projectMaster.findFirst({
    where: { vendor_id: vendorId, lead_id: leadId, isDeleted: false },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  if (!project) return null;

  const packagingMachine = await prisma.machineMaster.findFirst({
    where: { vendor_id: vendorId, machine_type_id: 18 },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!packagingMachine) return 0;

  const rows = await prisma.cutListMachineMapping.groupBy({
    by: ["box_id"],
    where: {
      project_id: project.id,
      vendor_id: vendorId,
      machine_id: packagingMachine.id,
      expected_in: true,
      actual_in_at: { not: null },
      box_id: { not: null },
      boxMaster: { is_deleted: false },
    },
  });
  return rows.length;
};

/**
 * Writes the current boxes-with-items count to the lead and its instances.
 * Returns the count, or null when the vendor isn't a Track & Trace large-scale
 * vendor or the lead has no Track & Trace project yet.
 */
export const syncTrackTraceBoxCount = async (
  vendorId: number,
  leadId: number,
) => {
  if (!(await isTrackTraceBoxCountVendor(vendorId))) return null;

  const count = await countBoxesWithItems(vendorId, leadId);
  if (count === null) return null;

  // A null count would read as "never set", so store 0 explicitly.
  await prisma.$transaction([
    prisma.leadMaster.updateMany({
      where: {
        id: leadId,
        vendor_id: vendorId,
        OR: [{ no_of_boxes: null }, { NOT: { no_of_boxes: count } }],
      },
      data: { no_of_boxes: count },
    }),
    prisma.leadProductStructureInstance.updateMany({
      where: {
        lead_id: leadId,
        vendor_id: vendorId,
        OR: [{ no_of_boxes: null }, { NOT: { no_of_boxes: count } }],
      },
      data: { no_of_boxes: count },
    }),
  ]);

  return count;
};
