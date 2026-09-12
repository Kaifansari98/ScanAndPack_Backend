import ExcelJS from "exceljs";
import { prisma } from "../../prisma/client";

export type ProjectLocationRowInput = {
  location_name?: unknown;
  quantities?: Record<string, unknown>;
};

type ProjectLocationEntry = {
  project_id: number;
  vendor_id: number;
  location_name: string;
  group_name: string;
  qty: number;
};

const normalizeName = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, " ");

const getProjectLocationContext = async (
  uniqueProjectId: string,
  vendorId: number
) => {
  const project = await prisma.projectMaster.findFirst({
    where: {
      unique_project_id: uniqueProjectId,
      vendor_id: vendorId,
      isDeleted: false,
    },
    select: {
      id: true,
      unique_project_id: true,
      project_name: true,
      is_multi_location: true,
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  if (!project.is_multi_location) {
    throw new Error("Multi Location is not enabled for this project");
  }

  const cutListGroups = await prisma.cutList.findMany({
    where: {
      project_id: project.id,
      vendor_id: vendorId,
      group_name: {
        not: null,
      },
    },
    select: {
      group_name: true,
      qty: true,
    },
  });

  const distinctGroups = new Map<string, string>();
  const groupQuantityLimits = new Map<string, number>();

  for (const item of cutListGroups) {
    const groupName = item.group_name?.trim();
    const normalizedGroupName = normalizeName(groupName);

    if (!groupName || !normalizedGroupName) continue;

    if (!distinctGroups.has(normalizedGroupName)) {
      distinctGroups.set(normalizedGroupName, groupName);
    }

    groupQuantityLimits.set(
      normalizedGroupName,
      (groupQuantityLimits.get(normalizedGroupName) ?? 0) + item.qty
    );
  }

  const groupNames = Array.from(distinctGroups.values()).sort((a, b) =>
    a.localeCompare(b)
  );

  return {
    project,
    groupNames,
    groupQuantityLimits,
  };
};

const validateAndFlattenRows = ({
  rows,
  groupNames,
  groupQuantityLimits,
  projectId,
  vendorId,
  requireRows,
}: {
  rows: ProjectLocationRowInput[];
  groupNames: string[];
  groupQuantityLimits: Map<string, number>;
  projectId: number;
  vendorId: number;
  requireRows: boolean;
}): ProjectLocationEntry[] => {
  if (!Array.isArray(rows)) {
    throw new Error("Locations must be an array");
  }

  if (requireRows && rows.length === 0) {
    throw new Error("At least one location row is required");
  }

  if (groupNames.length === 0 && rows.length > 0) {
    throw new Error("No CutList group names found for this project");
  }

  const canonicalGroups = new Map(
    groupNames.map((groupName) => [normalizeName(groupName), groupName])
  );
  const seenLocations = new Set<string>();
  const allocatedGroupQuantities = new Map<string, number>();
  const entries: ProjectLocationEntry[] = [];

  rows.forEach((row, rowIndex) => {
    const displayRowNumber = rowIndex + 2;
    const locationName = String(row?.location_name ?? "").trim();
    const normalizedLocationName = normalizeName(locationName);

    if (!locationName) {
      throw new Error(`Location Name is required in row ${displayRowNumber}`);
    }

    if (locationName.length > 200) {
      throw new Error(
        `Location Name must not exceed 200 characters in row ${displayRowNumber}`
      );
    }

    if (seenLocations.has(normalizedLocationName)) {
      throw new Error(`Duplicate Location Name: ${locationName}`);
    }
    seenLocations.add(normalizedLocationName);

    const quantities =
      row?.quantities && typeof row.quantities === "object"
        ? row.quantities
        : {};
    const normalizedQuantities = new Map<string, unknown>();

    for (const [submittedGroupName, quantity] of Object.entries(quantities)) {
      const normalizedGroupName = normalizeName(submittedGroupName);

      if (!canonicalGroups.has(normalizedGroupName)) {
        throw new Error(
          `Group Name "${submittedGroupName}" is not present in this project's CutList`
        );
      }

      if (normalizedQuantities.has(normalizedGroupName)) {
        throw new Error(`Duplicate Group Name: ${submittedGroupName}`);
      }

      normalizedQuantities.set(normalizedGroupName, quantity);
    }

    for (const groupName of groupNames) {
      const normalizedGroupName = normalizeName(groupName);
      const rawQuantity = normalizedQuantities.get(normalizedGroupName);
      const quantity =
        rawQuantity === null ||
        rawQuantity === undefined ||
        String(rawQuantity).trim() === ""
          ? 0
          : Number(rawQuantity);

      if (!Number.isInteger(quantity) || quantity < 0) {
        throw new Error(
          `Quantity for "${groupName}" must be a non-negative integer in row ${displayRowNumber}`
        );
      }

      if (quantity > 2147483647) {
        throw new Error(
          `Quantity for "${groupName}" is too large in row ${displayRowNumber}`
        );
      }

      const allocatedQuantity =
        (allocatedGroupQuantities.get(normalizedGroupName) ?? 0) + quantity;
      const cutListQuantity =
        groupQuantityLimits.get(normalizedGroupName) ?? 0;

      if (allocatedQuantity > cutListQuantity) {
        throw new Error(
          `Total quantity for "${groupName}" cannot exceed CutList quantity ${cutListQuantity}. Entered total is ${allocatedQuantity} at row ${displayRowNumber}`
        );
      }

      allocatedGroupQuantities.set(normalizedGroupName, allocatedQuantity);

      entries.push({
        project_id: projectId,
        vendor_id: vendorId,
        location_name: locationName,
        group_name: groupName,
        qty: quantity,
      });
    }
  });

  return entries;
};

const replaceProjectLocationEntries = async (
  projectId: number,
  vendorId: number,
  entries: ProjectLocationEntry[]
) => {
  await prisma.$transaction(async (tx) => {
    await tx.projectLocationProductQuantity.deleteMany({
      where: {
        project_id: projectId,
        vendor_id: vendorId,
      },
    });

    if (entries.length > 0) {
      await tx.projectLocationProductQuantity.createMany({
        data: entries,
      });
    }
  });
};

export const getProjectLocationsService = async (
  uniqueProjectId: string,
  vendorId: number
) => {
  const { project, groupNames, groupQuantityLimits } =
    await getProjectLocationContext(uniqueProjectId, vendorId);
  const records = await prisma.projectLocationProductQuantity.findMany({
    where: {
      project_id: project.id,
      vendor_id: vendorId,
    },
    select: {
      location_name: true,
      group_name: true,
      qty: true,
    },
    orderBy: [{ location_name: "asc" }, { group_name: "asc" }],
  });
  const locationsByName = new Map<
    string,
    { location_name: string; quantities: Record<string, number> }
  >();

  for (const record of records) {
    const normalizedLocationName = normalizeName(record.location_name);
    const location = locationsByName.get(normalizedLocationName) ?? {
      location_name: record.location_name,
      quantities: Object.fromEntries(
        groupNames.map((groupName) => [groupName, 0])
      ),
    };

    if (groupNames.some((groupName) => groupName === record.group_name)) {
      location.quantities[record.group_name] = record.qty;
    }

    locationsByName.set(normalizedLocationName, location);
  }

  return {
    success: true,
    message: "Project locations fetched successfully",
    data: {
      project_id: project.id,
      unique_project_id: project.unique_project_id,
      project_name: project.project_name,
      group_names: groupNames,
      group_quantity_limits: Object.fromEntries(
        groupNames.map((groupName) => [
          groupName,
          groupQuantityLimits.get(normalizeName(groupName)) ?? 0,
        ])
      ),
      locations: Array.from(locationsByName.values()),
    },
  };
};

export const saveProjectLocationsService = async ({
  uniqueProjectId,
  vendorId,
  locations,
}: {
  uniqueProjectId: string;
  vendorId: number;
  locations: ProjectLocationRowInput[];
}) => {
  const { project, groupNames, groupQuantityLimits } =
    await getProjectLocationContext(uniqueProjectId, vendorId);
  const entries = validateAndFlattenRows({
    rows: locations,
    groupNames,
    groupQuantityLimits,
    projectId: project.id,
    vendorId,
    requireRows: false,
  });

  await replaceProjectLocationEntries(project.id, vendorId, entries);

  return {
    success: true,
    message: "Project locations saved successfully",
    data: {
      project_id: project.id,
      location_count: locations.length,
      quantity_record_count: entries.length,
    },
  };
};

export const importProjectLocationsExcelService = async ({
  uniqueProjectId,
  vendorId,
  fileBuffer,
}: {
  uniqueProjectId: string;
  vendorId: number;
  fileBuffer: Buffer;
}) => {
  const { project, groupNames, groupQuantityLimits } =
    await getProjectLocationContext(uniqueProjectId, vendorId);
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(Uint8Array.from(fileBuffer).buffer);

  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("Excel sheet not found");
  }

  const headerRow = worksheet.getRow(1);
  const headerColumns = new Map<number, string>();
  const seenHeaders = new Set<string>();
  let locationColumn = 0;

  headerRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    const header = cell.text.trim();

    if (!header) return;

    const normalizedHeader = normalizeName(header);

    if (seenHeaders.has(normalizedHeader)) {
      throw new Error(`Duplicate Excel column: ${header}`);
    }
    seenHeaders.add(normalizedHeader);

    if (normalizedHeader === "location name") {
      locationColumn = columnNumber;
      return;
    }

    headerColumns.set(columnNumber, header);
  });

  if (!locationColumn) {
    throw new Error('The "Location Name" column is required');
  }

  const canonicalGroups = new Map(
    groupNames.map((groupName) => [normalizeName(groupName), groupName])
  );
  const uploadedGroups = new Set<string>();

  for (const uploadedGroupName of headerColumns.values()) {
    const normalizedGroupName = normalizeName(uploadedGroupName);

    if (!canonicalGroups.has(normalizedGroupName)) {
      throw new Error(
        `Group Name "${uploadedGroupName}" is not present in this project's CutList`
      );
    }

    uploadedGroups.add(normalizedGroupName);
  }

  const missingGroups = groupNames.filter(
    (groupName) => !uploadedGroups.has(normalizeName(groupName))
  );

  if (missingGroups.length > 0) {
    throw new Error(
      `Excel is missing CutList Group Name column${missingGroups.length > 1 ? "s" : ""}: ${missingGroups.join(", ")}`
    );
  }

  const locations: ProjectLocationRowInput[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const rowValues = Array.isArray(row.values)
      ? row.values.slice(1)
      : Object.values(row.values);
    const hasData = rowValues.some(
      (value) => String(value ?? "").trim() !== ""
    );

    if (!hasData) return;

    const quantities: Record<string, unknown> = {};

    for (const [columnNumber, uploadedGroupName] of headerColumns) {
      const canonicalGroupName = canonicalGroups.get(
        normalizeName(uploadedGroupName)
      );

      if (canonicalGroupName) {
        quantities[canonicalGroupName] = row.getCell(columnNumber).text.trim();
      }
    }

    locations.push({
      location_name: row.getCell(locationColumn).text.trim(),
      quantities,
    });
  });

  const entries = validateAndFlattenRows({
    rows: locations,
    groupNames,
    groupQuantityLimits,
    projectId: project.id,
    vendorId,
    requireRows: true,
  });

  await replaceProjectLocationEntries(project.id, vendorId, entries);

  return {
    success: true,
    message: "Location Excel imported successfully",
    data: {
      project_id: project.id,
      location_count: locations.length,
      quantity_record_count: entries.length,
    },
  };
};
