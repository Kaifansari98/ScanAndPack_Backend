import { Request, Response } from "express";
import { prisma } from "../../../prisma/client";
import { Prisma } from "../../../prisma/generated";
import { getReadinessQuestionMaster, validateReadinessQuestions } from "../../../services/installation/site-readiness/questions";

export async function readinessQuestionMaster(req: Request, res: Response) {
  const user = (req as any).user;
  const vendorId = Number(req.params.vendorId);
  if (!Number.isSafeInteger(vendorId) || vendorId <= 0 || Number(user?.vendor_id) !== vendorId) return res.status(403).json({ message: "Vendor access denied" });
  if (req.method !== "GET" && !["admin", "super-admin"].includes(String(user?.user_type ?? "").toLowerCase())) return res.status(403).json({ message: "Only admins can manage site readiness questions" });
  let questions;
  if (req.method === "PUT") {
    try { questions = validateReadinessQuestions(req.body?.questions); }
    catch (error) { return res.status(400).json({ message: (error as Error).message }); }
  }
  try {
    if (req.method !== "GET") await prisma.vendorMaster.update({ where: { id: vendorId }, data: { site_readiness_questions: questions ?? Prisma.DbNull } });
    return res.json({ success: true, data: await getReadinessQuestionMaster(vendorId) });
  } catch (error) {
    console.error("Site readiness questions request failed", error);
    return res.status(500).json({ message: "Unable to load or save site readiness questions" });
  }
}
