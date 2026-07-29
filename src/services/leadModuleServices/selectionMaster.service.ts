import { prisma } from "../../prisma/client";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import {
  CarcassType,
  CarcasMaterial,
  CarcasMaterialFinish,
  HandleType,
  ShutterType,
  ShutterMaterial,
  ShutterMaterialFinish,
  CarcassLegs,
  SkirtingCarcassLegs,
  SkirtingCarcassLegsColor,
  LightCarcasType,
  LightCarcasUnit,
  OtherAppliances,
  OtherApplianceType,
} from "../../types/leadModule.types";

const ensureVendorExists = async (vendor_id: number) => {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendor_id },
    select: { id: true },
  });

  if (!vendor) {
    throw new Error("Invalid vendor_id");
  }
};

export const getAllCarcassTypes = async (
  vendor_id: number,
): Promise<CarcassType[]> => {
  await ensureVendorExists(vendor_id);

  const types = await prisma.carcassTypeMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return types as CarcassType[];
};

export const createCarcassType = async (
  vendor_id: number,
  name: string,
): Promise<CarcassType> => {
  await ensureVendorExists(vendor_id);

  const type = await prisma.carcassTypeMaster.create({
    data: { vendor_id, name },
  });

  return type as CarcassType;
};

export const getAllShutterTypes = async (
  vendor_id: number,
): Promise<ShutterType[]> => {
  await ensureVendorExists(vendor_id);

  const types = await prisma.shutterTypeMaster.findMany({
    where: { vendor_id },
    include: {
      subTypes: {
        orderBy: { name: "asc" },
      },
    },
    orderBy: { name: "asc" },
  });

  return types as ShutterType[];
};

export const createShutterType = async (
  vendor_id: number,
  name: string,
): Promise<ShutterType> => {
  await ensureVendorExists(vendor_id);

  const type = await prisma.shutterTypeMaster.create({
    data: { vendor_id, name },
  });

  return type as ShutterType;
};

export const getAllCarcasMaterials = async (
  vendor_id: number,
): Promise<CarcasMaterial[]> => {
  await ensureVendorExists(vendor_id);

  const materials = await prisma.carcasMaterialMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return materials as CarcasMaterial[];
};

export const createCarcasMaterial = async (
  vendor_id: number,
  name: string,
): Promise<CarcasMaterial> => {
  await ensureVendorExists(vendor_id);

  const material = await prisma.carcasMaterialMaster.create({
    data: { vendor_id, name },
  });

  return material as CarcasMaterial;
};

export const getCarcassMaterialFinishes = async (
  carcas_material_id: number,
): Promise<CarcasMaterialFinish[]> => {
  const material = await prisma.carcasMaterialMaster.findUnique({
    where: { id: carcas_material_id },
    select: { id: true },
  });

  if (!material) {
    throw new Error("Invalid carcas_material_id");
  }

  const finishes = await prisma.carcassMaterialFinishMaster.findMany({
    where: { carcas_material_id },
    orderBy: { name: "asc" },
  });

  return finishes as CarcasMaterialFinish[];
};

export const createCarcassMaterialFinish = async (
  carcas_material_id: number,
  name: string,
): Promise<CarcasMaterialFinish> => {
  const material = await prisma.carcasMaterialMaster.findUnique({
    where: { id: carcas_material_id },
    select: { id: true },
  });

  if (!material) {
    throw new Error("Invalid carcas_material_id");
  }

  const finish = await prisma.carcassMaterialFinishMaster.create({
    data: { carcas_material_id, name },
  });

  return finish as CarcasMaterialFinish;
};

export const getAllCarcassMaterialFinishesForVendor = async (
  vendor_id: number,
): Promise<CarcasMaterialFinish[]> => {
  await ensureVendorExists(vendor_id);

  const finishes = await prisma.carcassMaterialFinishMaster.findMany({
    where: { material: { vendor_id } },
    include: { material: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  return finishes as CarcasMaterialFinish[];
};

const getCellValue = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText.map((t: any) => t.text).join("");
    }
    if ("text" in val) return String(val.text ?? "");
    if ("result" in val) return String(val.result ?? "");
    if ("formula" in val) return String(val.result ?? val.formula ?? "");
  }
  return String(val);
};

export const bulkUploadCarcassMaterialFinishes = async (
  vendor_id: number,
  fileBuffer: any,
  isCsv: boolean,
) => {
  await ensureVendorExists(vendor_id);

  const workbook = new ExcelJS.Workbook();
  if (isCsv) {
    const stream = Readable.from(fileBuffer);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(fileBuffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No sheets found in the file");
  }

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        headers.push(getCellValue(cell.value).trim().toLowerCase());
      });
    } else {
      const rowData: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerName = headers[colNumber - 1];
        if (headerName) {
          rowData[headerName] = getCellValue(cell.value).trim();
        }
      });
      rows.push(rowData);
    }
  });

  const typeKey = headers.find((h) => h.includes("type"));
  const materialKey = headers.find(
    (h) => h.includes("material") && !h.includes("finish"),
  );
  const finishKey = headers.find((h) => h.includes("finish"));

  const missingHeaders: string[] = [];
  if (!typeKey) missingHeaders.push("Carcass Type");
  if (!materialKey) missingHeaders.push("Carcass Material");
  if (!finishKey) missingHeaders.push("Carcass Material Finish");
  if (missingHeaders.length > 0) {
    throw new Error(
      `Required columns are missing in the sheet: ${missingHeaders.join(", ")}`,
    );
  }

  const [existingTypes, existingMaterials, existingFinishes] =
    await Promise.all([
      prisma.carcassTypeMaster.findMany({
        where: { vendor_id },
        select: { id: true, name: true },
      }),
      prisma.carcasMaterialMaster.findMany({
        where: { vendor_id },
        select: { id: true, name: true },
      }),
      prisma.carcassMaterialFinishMaster.findMany({
        where: { material: { vendor_id } },
        select: { id: true, name: true, carcas_material_id: true },
      }),
    ]);

  const typeMap = new Map<string, number>(
    existingTypes.map((t) => [t.name.trim().toLowerCase(), t.id]),
  );
  const materialMap = new Map<string, number>(
    existingMaterials.map((m) => [m.name.trim().toLowerCase(), m.id]),
  );
  const finishKeySet = new Set<string>(
    existingFinishes.map(
      (f) => `${f.carcas_material_id}::${f.name.trim().toLowerCase()}`,
    ),
  );

  const skippedRows: Array<{ row: Record<string, string>; reason: string }> =
    [];
  let typesCreated = 0;
  let materialsCreated = 0;
  let finishesCreated = 0;

  let rowIndex = 1;
  for (const row of rows) {
    rowIndex++;

    const typeName = (row[typeKey!] || "").trim();
    const materialName = (row[materialKey!] || "").trim();
    const finishName = (row[finishKey!] || "").trim();

    if (!typeName || !materialName || !finishName) {
      skippedRows.push({
        row,
        reason: `Row ${rowIndex}: Carcass Type, Carcass Material and Carcass Material Finish are all required`,
      });
      continue;
    }

    const typeLower = typeName.toLowerCase();
    const materialLower = materialName.toLowerCase();
    const finishLower = finishName.toLowerCase();

    let typeId = typeMap.get(typeLower);
    if (!typeId) {
      const createdType = await prisma.carcassTypeMaster.create({
        data: { vendor_id, name: typeName },
      });
      typeId = createdType.id;
      typeMap.set(typeLower, typeId);
      typesCreated++;
    }

    let materialId = materialMap.get(materialLower);
    if (!materialId) {
      const createdMaterial = await prisma.carcasMaterialMaster.create({
        data: { vendor_id, name: materialName },
      });
      materialId = createdMaterial.id;
      materialMap.set(materialLower, materialId);
      materialsCreated++;
    }

    const finishDedupeKey = `${materialId}::${finishLower}`;
    if (finishKeySet.has(finishDedupeKey)) {
      skippedRows.push({
        row,
        reason: `Row ${rowIndex}: Carcass Material Finish "${finishName}" already exists for material "${materialName}"`,
      });
      continue;
    }

    await prisma.carcassMaterialFinishMaster.create({
      data: { carcas_material_id: materialId, name: finishName },
    });
    finishKeySet.add(finishDedupeKey);
    finishesCreated++;
  }

  return {
    typesCreated,
    materialsCreated,
    finishesCreated,
    successCount: finishesCreated,
    skippedCount: skippedRows.length,
    skippedRows,
  };
};

export const getAllShutterMaterials = async (
  vendor_id: number,
): Promise<ShutterMaterial[]> => {
  await ensureVendorExists(vendor_id);

  const materials = await prisma.shutterMaterialMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return materials as ShutterMaterial[];
};

export const createShutterMaterial = async (
  vendor_id: number,
  name: string,
): Promise<ShutterMaterial> => {
  await ensureVendorExists(vendor_id);

  const material = await prisma.shutterMaterialMaster.create({
    data: { vendor_id, name },
  });

  return material as ShutterMaterial;
};

export const getShutterMaterialFinishes = async (
  shutter_material_id: number,
): Promise<ShutterMaterialFinish[]> => {
  const material = await prisma.shutterMaterialMaster.findUnique({
    where: { id: shutter_material_id },
    select: { id: true },
  });

  if (!material) {
    throw new Error("Invalid shutter_material_id");
  }

  const finishes = await prisma.shutterMaterialFinishMaster.findMany({
    where: { shutter_material_id },
    orderBy: { name: "asc" },
  });

  return finishes as ShutterMaterialFinish[];
};

export const createShutterMaterialFinish = async (
  shutter_material_id: number,
  name: string,
): Promise<ShutterMaterialFinish> => {
  const material = await prisma.shutterMaterialMaster.findUnique({
    where: { id: shutter_material_id },
    select: { id: true },
  });

  if (!material) {
    throw new Error("Invalid shutter_material_id");
  }

  const finish = await prisma.shutterMaterialFinishMaster.create({
    data: { shutter_material_id, name },
  });

  return finish as ShutterMaterialFinish;
};

export const getAllShutterMaterialFinishesForVendor = async (
  vendor_id: number,
): Promise<ShutterMaterialFinish[]> => {
  await ensureVendorExists(vendor_id);

  const finishes = await prisma.shutterMaterialFinishMaster.findMany({
    where: { material: { vendor_id } },
    include: { material: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  return finishes as ShutterMaterialFinish[];
};

export const bulkUploadShutterMaterialFinishes = async (
  vendor_id: number,
  fileBuffer: any,
  isCsv: boolean,
) => {
  await ensureVendorExists(vendor_id);

  const workbook = new ExcelJS.Workbook();
  if (isCsv) {
    const stream = Readable.from(fileBuffer);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(fileBuffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No sheets found in the file");
  }

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        headers.push(getCellValue(cell.value).trim().toLowerCase());
      });
    } else {
      const rowData: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerName = headers[colNumber - 1];
        if (headerName) {
          rowData[headerName] = getCellValue(cell.value).trim();
        }
      });
      rows.push(rowData);
    }
  });

  const typeKey = headers.find((h) => h.includes("type"));
  const materialKey = headers.find(
    (h) => h.includes("material") && !h.includes("finish"),
  );
  const finishKey = headers.find((h) => h.includes("finish"));

  const missingHeaders: string[] = [];
  if (!typeKey) missingHeaders.push("Shutter Type");
  if (!materialKey) missingHeaders.push("Shutter Material");
  if (!finishKey) missingHeaders.push("Shutter Material Finish");
  if (missingHeaders.length > 0) {
    throw new Error(
      `Required columns are missing in the sheet: ${missingHeaders.join(", ")}`,
    );
  }

  const [existingTypes, existingMaterials, existingFinishes] =
    await Promise.all([
      prisma.shutterTypeMaster.findMany({
        where: { vendor_id },
        select: { id: true, name: true },
      }),
      prisma.shutterMaterialMaster.findMany({
        where: { vendor_id },
        select: { id: true, name: true },
      }),
      prisma.shutterMaterialFinishMaster.findMany({
        where: { material: { vendor_id } },
        select: { id: true, name: true, shutter_material_id: true },
      }),
    ]);

  const typeMap = new Map<string, number>(
    existingTypes.map((t) => [t.name.trim().toLowerCase(), t.id]),
  );
  const materialMap = new Map<string, number>(
    existingMaterials.map((m) => [m.name.trim().toLowerCase(), m.id]),
  );
  const finishKeySet = new Set<string>(
    existingFinishes.map(
      (f) => `${f.shutter_material_id}::${f.name.trim().toLowerCase()}`,
    ),
  );

  const skippedRows: Array<{ row: Record<string, string>; reason: string }> =
    [];
  let typesCreated = 0;
  let materialsCreated = 0;
  let finishesCreated = 0;

  let rowIndex = 1;
  for (const row of rows) {
    rowIndex++;

    const typeName = (row[typeKey!] || "").trim();
    const materialName = (row[materialKey!] || "").trim();
    const finishName = (row[finishKey!] || "").trim();

    if (!typeName || !materialName || !finishName) {
      skippedRows.push({
        row,
        reason: `Row ${rowIndex}: Shutter Type, Shutter Material and Shutter Material Finish are all required`,
      });
      continue;
    }

    const typeLower = typeName.toLowerCase();
    const materialLower = materialName.toLowerCase();
    const finishLower = finishName.toLowerCase();

    let typeId = typeMap.get(typeLower);
    if (!typeId) {
      const createdType = await prisma.shutterTypeMaster.create({
        data: { vendor_id, name: typeName },
      });
      typeId = createdType.id;
      typeMap.set(typeLower, typeId);
      typesCreated++;
    }

    let materialId = materialMap.get(materialLower);
    if (!materialId) {
      const createdMaterial = await prisma.shutterMaterialMaster.create({
        data: { vendor_id, name: materialName },
      });
      materialId = createdMaterial.id;
      materialMap.set(materialLower, materialId);
      materialsCreated++;
    }

    const finishDedupeKey = `${materialId}::${finishLower}`;
    if (finishKeySet.has(finishDedupeKey)) {
      skippedRows.push({
        row,
        reason: `Row ${rowIndex}: Shutter Material Finish "${finishName}" already exists for material "${materialName}"`,
      });
      continue;
    }

    await prisma.shutterMaterialFinishMaster.create({
      data: { shutter_material_id: materialId, name: finishName },
    });
    finishKeySet.add(finishDedupeKey);
    finishesCreated++;
  }

  return {
    typesCreated,
    materialsCreated,
    finishesCreated,
    successCount: finishesCreated,
    skippedCount: skippedRows.length,
    skippedRows,
  };
};

export const getAllCarcassLegs = async (
  vendor_id: number,
): Promise<CarcassLegs[]> => {
  await ensureVendorExists(vendor_id);

  const legs = await prisma.carcassLegsMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return legs as CarcassLegs[];
};

export const createCarcassLegs = async (
  vendor_id: number,
  name: string,
): Promise<CarcassLegs> => {
  await ensureVendorExists(vendor_id);

  const legs = await prisma.carcassLegsMaster.create({
    data: { vendor_id, name },
  });

  return legs as CarcassLegs;
};

export const getSkirtingCarcassLegs = async (
  carcass_legs_id: number,
): Promise<SkirtingCarcassLegs[]> => {
  const legs = await prisma.carcassLegsMaster.findUnique({
    where: { id: carcass_legs_id },
    select: { id: true },
  });

  if (!legs) {
    throw new Error("Invalid carcass_legs_id");
  }

  const skirtings = await prisma.skirtingCarcassLegsMaster.findMany({
    where: { carcass_legs_id },
    orderBy: { name: "asc" },
  });

  return skirtings as SkirtingCarcassLegs[];
};

export const createSkirtingCarcassLegs = async (
  carcass_legs_id: number,
  name: string,
  inScope: boolean,
): Promise<SkirtingCarcassLegs> => {
  const legs = await prisma.carcassLegsMaster.findUnique({
    where: { id: carcass_legs_id },
    select: { id: true },
  });

  if (!legs) {
    throw new Error("Invalid carcass_legs_id");
  }

  const skirting = await prisma.skirtingCarcassLegsMaster.create({
    data: { carcass_legs_id, name, inScope },
  });

  return skirting as SkirtingCarcassLegs;
};

export const getAllSkirtingCarcassLegsForVendor = async (
  vendor_id: number,
): Promise<SkirtingCarcassLegs[]> => {
  await ensureVendorExists(vendor_id);

  const skirtings = await prisma.skirtingCarcassLegsMaster.findMany({
    where: { carcassLegs: { vendor_id } },
    include: { carcassLegs: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });

  return skirtings as SkirtingCarcassLegs[];
};

export const getSkirtingCarcassLegsColors = async (
  skirting_carcass_legs_id: number,
): Promise<SkirtingCarcassLegsColor[]> => {
  const skirting = await prisma.skirtingCarcassLegsMaster.findUnique({
    where: { id: skirting_carcass_legs_id },
    select: { id: true },
  });

  if (!skirting) {
    throw new Error("Invalid skirting_carcass_legs_id");
  }

  const colors = await prisma.skirtingCarcassLegsColorMaster.findMany({
    where: { skirting_carcass_legs_id },
    orderBy: { color: "asc" },
  });

  return colors as SkirtingCarcassLegsColor[];
};

export const createSkirtingCarcassLegsColor = async (
  carcass_legs_id: number,
  skirting_carcass_legs_id: number,
  color: string,
): Promise<SkirtingCarcassLegsColor> => {
  const skirting = await prisma.skirtingCarcassLegsMaster.findUnique({
    where: { id: skirting_carcass_legs_id },
    select: { id: true, carcass_legs_id: true },
  });

  if (!skirting || skirting.carcass_legs_id !== carcass_legs_id) {
    throw new Error("Invalid carcass_legs_id or skirting_carcass_legs_id");
  }

  const colorEntry = await prisma.skirtingCarcassLegsColorMaster.create({
    data: { carcass_legs_id, skirting_carcass_legs_id, color },
  });

  return colorEntry as SkirtingCarcassLegsColor;
};

export const getAllSkirtingCarcassLegsColorsForVendor = async (
  vendor_id: number,
): Promise<SkirtingCarcassLegsColor[]> => {
  await ensureVendorExists(vendor_id);

  const colors = await prisma.skirtingCarcassLegsColorMaster.findMany({
    where: { carcassLegs: { vendor_id } },
    include: { skirtingCarcassLegs: { select: { id: true, name: true } } },
    orderBy: { color: "asc" },
  });

  return colors as SkirtingCarcassLegsColor[];
};

export const bulkUploadSkirtingCarcassLegsColors = async (
  vendor_id: number,
  fileBuffer: any,
  isCsv: boolean,
) => {
  await ensureVendorExists(vendor_id);

  const workbook = new ExcelJS.Workbook();
  if (isCsv) {
    const stream = Readable.from(fileBuffer);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(fileBuffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No sheets found in the file");
  }

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        headers.push(getCellValue(cell.value).trim().toLowerCase());
      });
    } else {
      const rowData: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerName = headers[colNumber - 1];
        if (headerName) {
          rowData[headerName] = getCellValue(cell.value).trim();
        }
      });
      rows.push(rowData);
    }
  });

  const legsKey = headers.find((h) => h.includes("legs"));
  const skirtingKey = headers.find(
    (h) => h.includes("skirting") && !h.includes("color"),
  );
  const colorKey = headers.find((h) => h.includes("color"));

  const missingHeaders: string[] = [];
  if (!legsKey) missingHeaders.push("Carcass Legs");
  if (!skirtingKey) missingHeaders.push("Skirting");
  if (!colorKey) missingHeaders.push("Skirting Color");
  if (missingHeaders.length > 0) {
    throw new Error(
      `Required columns are missing in the sheet: ${missingHeaders.join(", ")}`,
    );
  }

  const [existingLegs, existingSkirtings, existingColors] = await Promise.all([
    prisma.carcassLegsMaster.findMany({
      where: { vendor_id },
      select: { id: true, name: true },
    }),
    prisma.skirtingCarcassLegsMaster.findMany({
      where: { carcassLegs: { vendor_id } },
      select: { id: true, name: true, carcass_legs_id: true },
    }),
    prisma.skirtingCarcassLegsColorMaster.findMany({
      where: { carcassLegs: { vendor_id } },
      select: { id: true, color: true, skirting_carcass_legs_id: true },
    }),
  ]);

  const legsMap = new Map<string, number>(
    existingLegs.map((l) => [l.name.trim().toLowerCase(), l.id]),
  );
  const skirtingMap = new Map<string, number>(
    existingSkirtings.map((s) => [
      `${s.carcass_legs_id}::${s.name.trim().toLowerCase()}`,
      s.id,
    ]),
  );
  const colorKeySet = new Set<string>(
    existingColors.map(
      (c) => `${c.skirting_carcass_legs_id}::${c.color.trim().toLowerCase()}`,
    ),
  );

  const skippedRows: Array<{ row: Record<string, string>; reason: string }> =
    [];
  let legsCreated = 0;
  let skirtingsCreated = 0;
  let colorsCreated = 0;

  let rowIndex = 1;
  for (const row of rows) {
    rowIndex++;

    const legsName = (row[legsKey!] || "").trim();
    const skirtingName = (row[skirtingKey!] || "").trim();
    const colorValue = (row[colorKey!] || "").trim();

    if (!legsName || !skirtingName) {
      skippedRows.push({
        row,
        reason: `Row ${rowIndex}: Carcass Legs and Skirting are required`,
      });
      continue;
    }

    const legsLower = legsName.toLowerCase();
    let legsId = legsMap.get(legsLower);
    if (!legsId) {
      const createdLegs = await prisma.carcassLegsMaster.create({
        data: { vendor_id, name: legsName },
      });
      legsId = createdLegs.id;
      legsMap.set(legsLower, legsId);
      legsCreated++;
    }

    const skirtingLower = skirtingName.toLowerCase();
    const skirtingDedupeKey = `${legsId}::${skirtingLower}`;
    let skirtingId = skirtingMap.get(skirtingDedupeKey);
    if (!skirtingId) {
      const createdSkirting = await prisma.skirtingCarcassLegsMaster.create({
        data: { carcass_legs_id: legsId, name: skirtingName },
      });
      skirtingId = createdSkirting.id;
      skirtingMap.set(skirtingDedupeKey, skirtingId);
      skirtingsCreated++;
    }

    if (!colorValue) {
      continue;
    }

    const colorLower = colorValue.toLowerCase();
    const colorDedupeKey = `${skirtingId}::${colorLower}`;
    if (colorKeySet.has(colorDedupeKey)) {
      skippedRows.push({
        row,
        reason: `Row ${rowIndex}: Skirting Color "${colorValue}" already exists for skirting "${skirtingName}"`,
      });
      continue;
    }

    await prisma.skirtingCarcassLegsColorMaster.create({
      data: {
        carcass_legs_id: legsId,
        skirting_carcass_legs_id: skirtingId,
        color: colorValue,
      },
    });
    colorKeySet.add(colorDedupeKey);
    colorsCreated++;
  }

  return {
    typesCreated: legsCreated,
    materialsCreated: skirtingsCreated,
    finishesCreated: colorsCreated,
    successCount: colorsCreated,
    skippedCount: skippedRows.length,
    skippedRows,
  };
};

export const getAllLightCarcasTypes = async (
  vendor_id: number,
): Promise<LightCarcasType[]> => {
  await ensureVendorExists(vendor_id);

  const types = await prisma.lightCarcasTypeMaster.findMany({
    where: { vendor_id, is_active: true },
    orderBy: { type: "asc" },
  });

  return types as LightCarcasType[];
};

export const createLightCarcasType = async (
  vendor_id: number,
  type: string,
): Promise<LightCarcasType> => {
  await ensureVendorExists(vendor_id);

  const created = await prisma.lightCarcasTypeMaster.create({
    data: { vendor_id, type },
  });

  return created as LightCarcasType;
};

export const getLightCarcasUnits = async (
  light_carcas_type_id: number,
): Promise<LightCarcasUnit[]> => {
  const type = await prisma.lightCarcasTypeMaster.findUnique({
    where: { id: light_carcas_type_id },
    select: { id: true },
  });

  if (!type) {
    throw new Error("Invalid light_carcas_type_id");
  }

  const units = await prisma.lightCarcasUnitMaster.findMany({
    where: { light_carcas_type_id, is_active: true },
    orderBy: { type: "asc" },
  });

  return units as LightCarcasUnit[];
};

export const createLightCarcasUnit = async (
  vendor_id: number,
  type: string,
  light_carcas_type_id: number,
): Promise<LightCarcasUnit> => {
  const parentType = await prisma.lightCarcasTypeMaster.findUnique({
    where: { id: light_carcas_type_id },
    select: { id: true },
  });

  if (!parentType) {
    throw new Error("Invalid light_carcas_type_id");
  }

  const created = await prisma.lightCarcasUnitMaster.create({
    data: { vendor_id, type, light_carcas_type_id },
  });

  return created as LightCarcasUnit;
};

export const getAllLightCarcasUnitsForVendor = async (
  vendor_id: number,
): Promise<LightCarcasUnit[]> => {
  await ensureVendorExists(vendor_id);

  const units = await prisma.lightCarcasUnitMaster.findMany({
    where: { vendor_id, is_active: true },
    include: { lightCarcasType: { select: { id: true, type: true } } },
    orderBy: { type: "asc" },
  });

  return units as LightCarcasUnit[];
};

export const bulkUploadLightCarcasUnits = async (
  vendor_id: number,
  fileBuffer: any,
  isCsv: boolean,
) => {
  await ensureVendorExists(vendor_id);

  const workbook = new ExcelJS.Workbook();
  if (isCsv) {
    const stream = Readable.from(fileBuffer);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(fileBuffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No sheets found in the file");
  }

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        headers.push(getCellValue(cell.value).trim().toLowerCase());
      });
    } else {
      const rowData: Record<string, string> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerName = headers[colNumber - 1];
        if (headerName) {
          rowData[headerName] = getCellValue(cell.value).trim();
        }
      });
      rows.push(rowData);
    }
  });

  const typeKey = headers.find((h) => h.includes("type"));
  const unitKey = headers.find((h) => h.includes("unit"));

  const missingHeaders: string[] = [];
  if (!typeKey) missingHeaders.push("Light Carcas Type");
  if (!unitKey) missingHeaders.push("Light Unit");
  if (missingHeaders.length > 0) {
    throw new Error(
      `Required columns are missing in the sheet: ${missingHeaders.join(", ")}`,
    );
  }

  const [existingTypes, existingUnits] = await Promise.all([
    prisma.lightCarcasTypeMaster.findMany({
      where: { vendor_id },
      select: { id: true, type: true },
    }),
    prisma.lightCarcasUnitMaster.findMany({
      where: { vendor_id },
      select: { id: true, type: true, light_carcas_type_id: true },
    }),
  ]);

  const typeMap = new Map<string, number>(
    existingTypes.map((t) => [t.type.trim().toLowerCase(), t.id]),
  );
  const unitKeySet = new Set<string>(
    existingUnits.map(
      (u) => `${u.light_carcas_type_id}::${u.type.trim().toLowerCase()}`,
    ),
  );

  const skippedRows: Array<{ row: Record<string, string>; reason: string }> =
    [];
  let typesCreated = 0;
  let unitsCreated = 0;

  let rowIndex = 1;
  for (const row of rows) {
    rowIndex++;

    const typeName = (row[typeKey!] || "").trim();
    const unitName = (row[unitKey!] || "").trim();

    if (!typeName || !unitName) {
      skippedRows.push({
        row,
        reason: `Row ${rowIndex}: Light Carcas Type and Light Unit are both required`,
      });
      continue;
    }

    const typeLower = typeName.toLowerCase();
    let typeId = typeMap.get(typeLower);
    if (!typeId) {
      const createdType = await prisma.lightCarcasTypeMaster.create({
        data: { vendor_id, type: typeName },
      });
      typeId = createdType.id;
      typeMap.set(typeLower, typeId);
      typesCreated++;
    }

    const unitLower = unitName.toLowerCase();
    const unitDedupeKey = `${typeId}::${unitLower}`;
    if (unitKeySet.has(unitDedupeKey)) {
      skippedRows.push({
        row,
        reason: `Row ${rowIndex}: Light Unit "${unitName}" already exists for light carcas type "${typeName}"`,
      });
      continue;
    }

    await prisma.lightCarcasUnitMaster.create({
      data: { vendor_id, type: unitName, light_carcas_type_id: typeId },
    });
    unitKeySet.add(unitDedupeKey);
    unitsCreated++;
  }

  return {
    typesCreated,
    unitsCreated,
    successCount: unitsCreated,
    skippedCount: skippedRows.length,
    skippedRows,
  };
};

export const getAllOtherAppliances = async (
  vendor_id: number,
): Promise<OtherAppliances[]> => {
  await ensureVendorExists(vendor_id);

  const appliances = await prisma.otherAppliancesMaster.findMany({
    where: { vendor_id },
    orderBy: [{ type: "asc" }, { article_number: "asc" }],
  });

  return appliances as OtherAppliances[];
};

export const createOtherAppliances = async (
  vendor_id: number,
  type: OtherApplianceType,
  article_number: string,
  description: string,
): Promise<OtherAppliances> => {
  await ensureVendorExists(vendor_id);

  const existing = await prisma.otherAppliancesMaster.findFirst({
    where: {
      vendor_id,
      type,
      article_number: { equals: article_number, mode: 'insensitive' },
    },
  });

  if (existing) {
    throw new Error(`Article number "${article_number}" already exists for ${type}.`);
  }

  const created = await prisma.otherAppliancesMaster.create({
    data: { vendor_id, type, article_number, description },
  });

  return created as OtherAppliances;
};

export const getAllHandleTypes = async (
  vendor_id: number,
): Promise<HandleType[]> => {
  await ensureVendorExists(vendor_id);

  const types = await prisma.handleTypeMaster.findMany({
    where: { vendor_id },
    orderBy: { name: "asc" },
  });

  return types as HandleType[];
};

export const getFastProductionTimelineRules = async (vendor_id: number) => {
  await ensureVendorExists(vendor_id);

  return prisma.timelineRule.findMany({
    where: {
      vendor_id,
      OR: [
        { kitchen_manufacturing_days_for_fast_production: { not: null } },
        { other_manufacturing_days_for_fast_production: { not: null } },
      ],
    },
    select: {
      id: true,
      vendor_id: true,
      carcass_id: true,
      shutter_id: true,
      kitchen_manufacturing_days_for_fast_production: true,
      other_manufacturing_days_for_fast_production: true,
      carcass: {
        select: {
          id: true,
          name: true,
        },
      },
      shutter: {
        select: {
          id: true,
          name: true,
          subTypes: {
            select: {
              id: true,
              name: true,
            },
            orderBy: { name: "asc" },
          },
        },
      },
    },
    orderBy: [
      { carcass: { name: "asc" } },
      { shutter: { name: "asc" } },
    ],
  });
};

export const bulkUploadOtherAppliances = async (
  vendor_id: number,
  fileBuffer: any,
  isCsv: boolean,
  type: OtherApplianceType,
) => {
  await ensureVendorExists(vendor_id);

  const workbook = new ExcelJS.Workbook();
  if (isCsv) {
    const stream = Readable.from(fileBuffer);
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(fileBuffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("No worksheet found in the uploaded workbook.");
  }

  let createdCount = 0;
  const skippedRows: Array<{ row: number; sheet: string; reason: string }> = [];

  const headers: string[] = [];
  const firstRow = worksheet.getRow(1);
  if (!firstRow) {
    throw new Error("The first row of the worksheet is empty.");
  }

  firstRow.eachCell({ includeEmpty: true }, (cell) => {
    headers.push(getCellValue(cell.value).trim().toLowerCase());
  });

  const articleIndex = headers.findIndex((h) => h.includes("article"));
  const descIndex = headers.findIndex((h) => h.includes("desc"));

  if (articleIndex === -1 || descIndex === -1) {
    throw new Error("Required columns ('Article Number' and 'Description') are missing in the sheet.");
  }

  // Get existing records for this vendor and type to optimize checks
  const existingRecords = await prisma.otherAppliancesMaster.findMany({
    where: { vendor_id, type },
    select: { id: true, article_number: true },
  });
  const existingMap = new Map<string, number>(
    existingRecords.map((r) => [r.article_number.trim().toLowerCase(), r.id])
  );

  const rowCount = worksheet.rowCount;
  for (let r = 2; r <= rowCount; r++) {
    const row = worksheet.getRow(r);
    const articleVal = getCellValue(row.getCell(articleIndex + 1).value).trim();
    const descVal = getCellValue(row.getCell(descIndex + 1).value).trim();

    if (!articleVal && !descVal) {
      continue; // skip empty rows
    }

    if (!articleVal || !descVal) {
      skippedRows.push({
        row: r - 1,
        sheet: worksheet.name || "Sheet1",
        reason: `Both 'Article Number' and 'Description' are required.`,
      });
      continue;
    }

    const articleLower = articleVal.toLowerCase();
    const existingId = existingMap.get(articleLower);

    if (existingId) {
      skippedRows.push({
        row: r - 1,
        sheet: worksheet.name || "Sheet1",
        reason: `Duplicate article number "${articleVal}"`,
      });
      continue;
    }

    await prisma.otherAppliancesMaster.create({
      data: {
        vendor_id,
        type,
        article_number: articleVal,
        description: descVal,
      },
    });
    createdCount++;
    existingMap.set(articleLower, -1);
  }

  return {
    createdCount,
    updatedCount: 0,
    successCount: createdCount,
    skippedCount: skippedRows.length,
    skippedRows,
  };
};

export const getOtherAppliancesReport = async (vendor_id: number) => {
  await ensureVendorExists(vendor_id);

  const workbook = new ExcelJS.Workbook();
  const types = ["Appliances", "Stone", "Sinks", "Faucets"] as const;

  for (const type of types) {
    const worksheet = workbook.addWorksheet(type);

    worksheet.columns = [
      { header: "Article Number", key: "article_number", width: 25 },
      { header: "Description", key: "description", width: 50 },
    ];

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };

    const data = await prisma.otherAppliancesMaster.findMany({
      where: { vendor_id, type },
      select: { article_number: true, description: true },
      orderBy: { article_number: "asc" },
    });

    for (const item of data) {
      worksheet.addRow({
        article_number: item.article_number,
        description: item.description,
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

