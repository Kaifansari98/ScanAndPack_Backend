import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { resolveOnlineLeadExecutive } from "../utils/online-lead-executive";

async function checkAccess(req: Request, write: boolean) {
  const vendorId = Number(req.params.vendor_id);
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0) throw Object.assign(new Error("Invalid vendor_id"), { statusCode: 400 });
  const actor = (req as any).user;
  const role = String(actor?.user_type ?? "").toLowerCase();
  const master = ["master-admin", "master", "vloq master", "masteradmin", "master_admin"].includes(role);
  if (!master && (actor?.vendor_id !== vendorId || (write && !["admin", "super-admin"].includes(role)))) {
    throw Object.assign(new Error("Vendor access denied"), { statusCode: 403 });
  }
  const vendor = await prisma.vendorMaster.findUnique({ where: { id: vendorId }, select: { id: true } });
  if (!vendor) throw Object.assign(new Error("Vendor not found"), { statusCode: 404 });
  return vendorId;
}

async function getRows(vendorId: number) {
  const franchises = await prisma.franchiseMaster.findMany({
    where: { vendor_id: vendorId },
    orderBy: { franchise_name: "asc" },
    select: {
      id: true, franchise_name: true, online_lead_sales_executive_id: true,
      users: {
        where: { vendor_id: vendorId, status: "active" },
        select: { id: true, user_name: true, user_type: { select: { user_type: true } } },
        orderBy: { user_name: "asc" },
      },
    },
  });
  return franchises.map((franchise) => {
    const executives = franchise.users.filter((user) => ["sales executive", "sales-executive"].includes(user.user_type?.user_type?.toLowerCase() || ""))
      .map(({ id, user_name }) => ({ id, user_name }));
    return { id: franchise.id, franchise_name: franchise.franchise_name, executives,
      sales_executive_id: resolveOnlineLeadExecutive(executives, franchise.online_lead_sales_executive_id)?.id ?? null };
  });
}

export async function getOnlineLeadExecutiveMappings(req: Request, res: Response) {
  try {
    const vendorId = await checkAccess(req, false);
    return res.json({ success: true, data: await getRows(vendorId) });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Unable to load sales executive mappings." });
  }
}

export async function saveOnlineLeadExecutiveMapping(req: Request, res: Response) {
  try {
    const vendorId = await checkAccess(req, true);
    const { franchise_id, sales_executive_id } = req.body;
    if (!Number.isSafeInteger(franchise_id) || !Number.isSafeInteger(sales_executive_id) || franchise_id <= 0 || sales_executive_id <= 0) {
      return res.status(400).json({ success: false, message: "Select a franchise and sales executive." });
    }
    const franchise = await prisma.franchiseMaster.findFirst({ where: { id: franchise_id, vendor_id: vendorId }, select: { id: true } });
    const executive = await prisma.userMaster.findFirst({
      where: { id: sales_executive_id, vendor_id: vendorId, franchise_id, status: "active" },
      select: { user_type: { select: { user_type: true } } },
    });
    if (!franchise || !executive || !["sales executive", "sales-executive"].includes(executive.user_type?.user_type?.toLowerCase() || "")) {
      return res.status(400).json({ success: false, message: "Choose an active sales executive belonging to this franchise." });
    }
    await prisma.franchiseMaster.update({ where: { id: franchise.id }, data: { online_lead_sales_executive_id: sales_executive_id } });
    return res.json({ success: true, data: await getRows(vendorId) });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Unable to save sales executive mapping." });
  }
}
