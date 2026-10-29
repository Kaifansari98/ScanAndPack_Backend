import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { updateSpecsMaster } from "../services/specsMaster/updateSpecsMaster";

export async function updateSpecsMasterController(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const user = await prisma.userMaster.findUnique({ where: { id: Number(userId) }, select: { vendor_id: true } });
    if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
    const data = await updateSpecsMaster(user.vendor_id, String(req.params.kind), Number(req.params.id), req.body ?? {});
    return res.json({ success: true, data, message: "Specification master updated" });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Failed to update specification master" });
  }
}
