import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../../prisma/client";
import dotenv from "dotenv";
import { AuthService } from "../../services/auth/auth.service";

dotenv.config();

const authService = new AuthService();

export const login = async (req: Request, res: Response) => {
  try {
    const response = await authService.login(req);
    return res.status(response.status).json(response.body);
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const logoutActivity = async (req: Request, res: Response) => {
  try {
    const response = await authService.logout(req);
    return res.status(response.status).json(response.body);
  } catch (err) {
    console.error("Logout activity log error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const logoutAllByVendor = async (req: Request, res: Response) => {
  const vendorId = Number(req.params.vendor_id);

  if (!vendorId || Number.isNaN(vendorId)) {
    return res.status(400).json({ message: "vendor_id must be a valid number" });
  }

  try {
    const response = await authService.logoutAllByVendor(req, vendorId);
    return res.status(response.status).json(response.body);
  } catch (err) {
    console.error("Logout all by vendor error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const validateSession = async (req: Request, res: Response) => {
  const user = (req as any).user;

  return res.status(200).json({
    message: "Session is active",
    user,
  });
};

export const changePassword = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "currentPassword and newPassword are required" });
  }

  try {
    const user = await prisma.userMaster.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: "Current password is incorrect" });

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.userMaster.update({ where: { id: userId }, data: { password: hashed } });

    await prisma.userActivityLog.create({
      data: {
        user_id: userId,
        action: "User successfully changed their password.",
        activity_type: "RESET_PASSWORD",
        ip_address: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null,
        user_agent: req.headers["user-agent"] || null,
        metadata: { changed_at: new Date().toISOString() },
      },
    });

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const checkUserStatus = async (req: Request, res: Response) => {
  const userId = Number(req.params.user_id);

  if (!userId || Number.isNaN(userId)) {
    return res.status(400).json({ message: "user_id must be a valid number" });
  }

  try {
    const user = await prisma.userMaster.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "User status fetched",
      status: user.status === "active" ? "active" : "inactive",
    });
  } catch (err) {
    console.error("Check user status error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
