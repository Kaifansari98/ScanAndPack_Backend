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

    // ✅ Generate JWT
    const token = jwt.sign(
      {
        id: user.id,
        vendor_id: user.vendor_id,
        user_type: user.user_type.user_type,
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
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
