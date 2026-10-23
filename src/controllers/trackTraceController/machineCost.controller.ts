import { Request, Response } from "express";
import { prisma } from "../../prisma/client";
import { MachineCostSheet } from "../../../generated/prisma_client/enums";

// Missing sheet means the original Machine Cost sheet, so older clients keep working.
const customSheetPattern = /^CUSTOM_\d{13}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const parseSheet = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") return MachineCostSheet.MACHINE_COST;
  return (Object.values(MachineCostSheet).includes(value as MachineCostSheet) || (typeof value === "string" && customSheetPattern.test(value))) ? (value as MachineCostSheet) : null;
};

export async function getMachineCostDescriptions(req: Request, res: Response) {
  // Tenant identity comes from the verified session, never query parameters.
  const vendorId = Number((req as Request & { user?: { vendor_id?: number } }).user?.vendor_id);
  const machineId = Number(req.params.machine_id);
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0) {
    return res.status(403).json({ success: false, message: "Vendor session required" });
  }
  if (!Number.isSafeInteger(machineId) || machineId <= 0) {
    return res.status(400).json({ success: false, message: "Invalid machine ID" });
  }
  const sheet = parseSheet(req.query.sheet);
  if (!sheet) {
    return res.status(400).json({ success: false, message: "Invalid sheet" });
  }
  try {
    const machine = await prisma.machineMaster.findFirst({
      where: { id: machineId, vendor_id: vendorId }, select: { id: true, mcp_sheet_names: true },
    });
    if (!machine) {
      return res.status(404).json({ success: false, message: "Workstation not found" });
    }
    if (!(sheet in defaultSheetNames) && !Object.prototype.hasOwnProperty.call(machine.mcp_sheet_names, sheet)) return res.status(404).json({ success: false, message: "Sheet not found" });
    const descriptions = await prisma.machineCostDescription.findMany({
      where: { vendor_id: vendorId, machine_id: machineId, sheet },
      orderBy: [{ sequence_no: "asc" }, { id: "asc" }],
      select: { id: true, code: true, description: true, sequence_no: true, amount: true, formula: true, text_value: true, value_format: true },
    });
    return res.json({ success: true, data: descriptions });
  } catch (error) {
    console.error("Failed to load machine cost descriptions", error);
    return res.status(500).json({ success: false, message: "Unable to load machine cost descriptions" });
  }
}

export async function saveMachineCostAmount(req: Request, res: Response) {
  const vendorId = Number((req as Request & { user?: { vendor_id?: number } }).user?.vendor_id);
  const machineId = Number(req.params.machine_id);
  const descriptionId = req.params.description_id ? Number(req.params.description_id) : null;
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0) {
    return res.status(403).json({ success: false, message: "Vendor session required" });
  }
  if (!Number.isSafeInteger(machineId) || machineId <= 0 ||
      (descriptionId !== null && (!Number.isSafeInteger(descriptionId) || descriptionId <= 0))) {
    return res.status(400).json({ success: false, message: "Invalid workstation or cost description ID" });
  }
  // A cell holds either a plain amount or an Excel-like formula ("=[code]*2"); formula results are computed by the client.
  const formula = req.body?.formula ?? null;
  if (formula !== null && (typeof formula !== "string" || !formula.startsWith("=") || formula.length > 1000)) {
    return res.status(400).json({ success: false, message: "Enter a formula starting with = (up to 1000 characters)" });
  }
  // Plain text such as "300x300" or "NA"; formulas treat it like Excel text (#VALUE! in arithmetic).
  const rawText = formula !== null ? null : req.body?.text_value ?? null;
  if (rawText !== null && (typeof rawText !== "string" || !rawText.trim() || rawText.length > 255)) {
    return res.status(400).json({ success: false, message: "Enter text of up to 255 characters" });
  }
  const textValue = rawText === null ? null : rawText.trim();
  const amount = formula !== null || textValue !== null ? null : req.body?.amount;
  // Display format only (like an Excel cell format): "percent" shows 0.05 as 5%.
  const valueFormat = req.body?.value_format ?? null;
  if (valueFormat !== null && valueFormat !== "percent") {
    return res.status(400).json({ success: false, message: "Invalid value format" });
  }
  // Up to 6 decimals so percentages stored as fractions (12.5% = 0.125) keep their precision.
  if (amount !== null && (typeof amount !== "string" || !/^\d{1,14}(\.\d{1,6})?$/.test(amount))) {
    return res.status(400).json({ success: false, message: "Enter a non-negative number with at most 14 digits and 6 decimal places" });
  }
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const hasDescription = req.body?.description !== undefined;
  if ((descriptionId === null || hasDescription) && (!description || description.length > 2000)) {
    return res.status(400).json({ success: false, message: "Enter a cost description (up to 2000 characters)" });
  }
  const draftKey = req.body?.draft_key;
  if (descriptionId === null && (typeof draftKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(draftKey))) {
    return res.status(400).json({ success: false, message: "A valid draft key is required" });
  }
  const sheet = parseSheet(req.body?.sheet);
  if (descriptionId === null && !sheet) {
    return res.status(400).json({ success: false, message: "Invalid sheet" });
  }
  try {
    const machine = await prisma.machineMaster.findFirst({ where: { id: machineId, vendor_id: vendorId }, select: { id: true, mcp_sheet_names: true } });
    if (!machine) return res.status(404).json({ success: false, message: "Workstation not found" });
    if (descriptionId === null && sheet && !(sheet in defaultSheetNames) && !Object.prototype.hasOwnProperty.call(machine.mcp_sheet_names, sheet)) return res.status(404).json({ success: false, message: "Sheet not found" });
    if (descriptionId === null) {
      const lastRow = await prisma.machineCostDescription.findFirst({
        where: { vendor_id: vendorId, machine_id: machineId, sheet: sheet! }, orderBy: { sequence_no: "desc" }, select: { sequence_no: true },
      });
      const code = `custom_${draftKey}`;
      const data = await prisma.machineCostDescription.upsert({
        where: { vendor_id_machine_id_code: { vendor_id: vendorId, machine_id: machineId, code } },
        create: { vendor_id: vendorId, machine_id: machineId, code, description, sequence_no: (lastRow?.sequence_no ?? 0) + 1, amount, formula, text_value: textValue, value_format: valueFormat, sheet: sheet! },
        update: { description, amount, formula, text_value: textValue, value_format: valueFormat },
        select: { id: true, code: true, description: true, sequence_no: true, amount: true, formula: true, text_value: true, value_format: true },
      });
      return res.status(201).json({ success: true, data });
    }
    const result = await prisma.machineCostDescription.updateMany({
      where: { id: descriptionId, vendor_id: vendorId, machine_id: machineId }, data: { ...(hasDescription ? { description } : {}), amount, formula, text_value: textValue, value_format: valueFormat },
    });
    if (!result.count) return res.status(404).json({ success: false, message: "Cost description not found" });
    return res.json({ success: true, data: { id: descriptionId, ...(hasDescription ? { description } : {}), amount, formula, text_value: textValue, value_format: valueFormat } });
  } catch (error) {
    console.error("Failed to save machine cost amount", error);
    return res.status(500).json({ success: false, message: "Unable to save amount. Please try again." });
  }
}

export async function deleteMachineCostDescription(req: Request, res: Response) {
  const vendorId = Number((req as Request & { user?: { vendor_id?: number } }).user?.vendor_id);
  const machineId = Number(req.params.machine_id);
  const descriptionId = Number(req.params.description_id);
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0) {
    return res.status(403).json({ success: false, message: "Vendor session required" });
  }
  if (!Number.isSafeInteger(machineId) || machineId <= 0 || !Number.isSafeInteger(descriptionId) || descriptionId <= 0) {
    return res.status(400).json({ success: false, message: "Invalid workstation or cost description ID" });
  }
  try {
    // Scoped to this vendor and workstation so another machine's row can never be removed.
    const result = await prisma.machineCostDescription.deleteMany({
      where: { id: descriptionId, vendor_id: vendorId, machine_id: machineId },
    });
    if (!result.count) return res.status(404).json({ success: false, message: "Cost description not found" });
    return res.json({ success: true, data: { id: descriptionId } });
  } catch (error) {
    console.error("Failed to delete machine cost description", error);
    return res.status(500).json({ success: false, message: "Unable to delete this row. Please try again." });
  }
}

const defaultSheetNames: Record<MachineCostSheet, string> = {
  MACHINE_COST: "Machine Cost", MACHINE_ELECTRICALS: "Machine Electricals",
  MACHINE_MAINTENANCE: "Machine Maintenance", MACHINE_CAPACITY: "Machine Capacity",
  MACHINE_TOOL_GLUE: "Machine Tool / Glue", MACHINE_LABOUR: "Machine Labour",
  GENERAL_DATA: "General Data", PROCESS_COST: "Process Cost",
};

export async function machineCostSheetNames(req: Request, res: Response) {
  const vendorId = Number((req as Request & { user?: { vendor_id?: number } }).user?.vendor_id);
  const machineId = Number(req.params.machine_id);
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0) return res.status(403).json({ success: false, message: "Vendor session required" });
  if (!Number.isSafeInteger(machineId) || machineId <= 0) return res.status(400).json({ success: false, message: "Invalid machine ID" });
  const sheet = req.body?.sheet;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (req.method !== "GET" && (!parseSheet(sheet) || typeof sheet !== "string" || !name || name.length > 60 || /[\[\]\r\n\t]/.test(name))) {
    return res.status(400).json({ success: false, message: "Enter a sheet name of 1–60 characters without brackets or line breaks" });
  }
  try {
    const machine = await prisma.machineMaster.findFirst({ where: { id: machineId, vendor_id: vendorId }, select: { mcp_sheet_names: true } });
    if (!machine) return res.status(404).json({ success: false, message: "Workstation not found" });
    const names = machine.mcp_sheet_names as Record<string, string>;
    if (req.method === "GET") return res.json({ success: true, data: { ...defaultSheetNames, ...names } });
    const exists = Object.prototype.hasOwnProperty.call(defaultSheetNames, sheet) || Object.prototype.hasOwnProperty.call(names, sheet);
    if (req.method === "POST" && (!customSheetPattern.test(sheet) || exists)) return res.status(400).json({ success: false, message: "Use a new custom sheet ID" });
    if (req.method === "PATCH" && !exists) return res.status(404).json({ success: false, message: "Sheet not found" });
    const duplicate = Object.entries({ ...defaultSheetNames, ...names }).some(([key, title]) => key !== sheet && title.toLowerCase() === name.toLowerCase());
    if (duplicate) return res.status(400).json({ success: false, message: "Another sheet already uses this name" });
    const updated = { ...names, [sheet]: name };
    const result = await prisma.machineMaster.updateMany({
      where: { id: machineId, vendor_id: vendorId, mcp_sheet_names: { equals: names } },
      data: { mcp_sheet_names: updated },
    });
    if (!result.count) return res.status(409).json({ success: false, message: "Sheet names changed. Please try again." });
    return res.status(req.method === "POST" ? 201 : 200).json({ success: true, data: { ...defaultSheetNames, ...updated } });
  } catch (error) {
    console.error("Failed to access MCP sheet names", error);
    return res.status(500).json({ success: false, message: "Unable to access sheet names. Please try again." });
  }
}
