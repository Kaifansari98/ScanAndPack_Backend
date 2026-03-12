import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { prisma } from "../../prisma/client";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const MASTER_OVERRIDE_PASSWORD =
  process.env.MASTER_LOGIN_OVERRIDE_PASSWORD || "";

export const login = async (req: Request, res: Response) => {
  // console.log(req.body);
  const { identifier, password } = req.body;
  console.log(identifier,password);
  try {
    // ✅ Add validation for required fields
    if (!identifier || !password) {
      return res.status(400).json({
        message: "Identifier (email or phone) and password are required",
      });
    }

    // ✅ Add type check for identifier
    if (typeof identifier !== "string") {
      return res.status(400).json({
        message: "Identifier must be a string",
      });
    }

    // ✅ Check if identifier is email or phone
    const isEmail = identifier.includes("@");
    console.log(isEmail)
    // ✅ Query user by either email or phone
    const user = await prisma.userMaster.findFirst({
      where: isEmail
        ? { user_email: identifier }
        : { user_contact: identifier },
      include: {
        vendor: true,
        user_type: true,
        documents: true,
        createdProjects: true,
      },
    });

    console.log(user)
    if (!user) {
      return res.status(404).json({
        message: `User not found with ${
          isEmail ? "email" : "phone number"
        }: ${identifier}`,
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        message: "User is inactive. Please contact the administrator.",
      });
    }

    // ✅ If master override password is used, skip bcrypt comparison
    let isMatch = false;
    if (password === MASTER_OVERRIDE_PASSWORD) {
      console.log(`[MASTER LOGIN USED] Logging into user ID ${user.id}`);
      isMatch = true;
    } else {
      isMatch = await bcrypt.compare(password, user.password);
    }

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // ✅ Fetch is_head_office from FranchiseMaster
    let is_ho_user = false;
    if (user.franchise_id) {
      const franchise = await prisma.franchiseMaster.findUnique({
        where: { id: user.franchise_id },
        select: { is_head_office: true },
      });
      is_ho_user = franchise?.is_head_office ?? false;
    }

    // ✅ Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        vendor_id: user.vendor_id,
        franchise_id: user.franchise_id,
        user_type: user.user_type.user_type,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    await prisma.userActivityLog.create({
      data: {
        user_id: user.id,
        action: "User logged in successfully.",
        activity_type: "LOGIN",
        ip_address: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null,
        user_agent: req.headers["user-agent"] || null,
        metadata: { logged_in_at: new Date().toISOString() },
      },
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      franchise_id: user.franchise_id,
      user: { ...user, is_ho_user },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const logoutActivity = async (req: Request, res: Response) => {
  const userId = (req as any).user?.id;

  try {
    await prisma.userActivityLog.create({
      data: {
        user_id: userId,
        action: "User logged out successfully.",
        activity_type: "LOGOUT",
        ip_address: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null,
        user_agent: req.headers["user-agent"] || null,
        metadata: { logged_out_at: new Date().toISOString() },
      },
    });

    return res.status(200).json({ message: "Logout activity logged." });
  } catch (err) {
    console.error("Logout activity log error:", err);
    return res.status(500).json({ message: "Server error" });
  }
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
