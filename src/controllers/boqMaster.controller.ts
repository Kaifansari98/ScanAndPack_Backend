import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { updateBoqMaster } from "../services/boqMaster/updateBoqMaster";
import { deleteBoqMaster } from "../services/boqMaster/deleteBoqMaster";

export async function updateBoqMasterController(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const user = await prisma.userMaster.findUnique({ where: { id: Number(userId) }, select: { vendor_id: true } });
    if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
    const data = await updateBoqMaster(user.vendor_id, String(req.params.kind), Number(req.params.id), req.body ?? {});
    return res.json({ success: true, data, message: "BOQ master updated" });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Failed to update BOQ master" });
  }
}

export async function deleteBoqMasterController(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const user = await prisma.userMaster.findUnique({ where: { id: Number(userId) }, select: { vendor_id: true } });
    if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
    const data = await deleteBoqMaster(user.vendor_id, String(req.params.kind), Number(req.params.id));
    return res.json({ success: true, data, message: "BOQ master deleted" });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Failed to delete BOQ master" });
  }
}
