import { Request } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../../prisma/client";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const MASTER_OVERRIDE_PASSWORD =
  process.env.MASTER_LOGIN_OVERRIDE_PASSWORD || "";
const ACCESS_TOKEN_TTL_DAYS = 30;
const MAX_ACTIVE_SESSIONS = 2;

type TokenPayload = {
  id: number;
  vendor_id: number;
  franchise_id: number | null;
  user_type: string;
  session_id: number;
  jti: string;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getIpAddress = (req: Request) =>
  (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
  req.socket.remoteAddress ||
  null;

const buildDeviceId = (req: Request) => {
  const fromHeader = req.headers["x-device-id"];
  const fromBody = typeof req.body?.device_id === "string" ? req.body.device_id : null;
  const explicitDeviceId =
    (Array.isArray(fromHeader) ? fromHeader[0] : fromHeader) || fromBody;

  if (explicitDeviceId) {
    return explicitDeviceId;
  }

  const seed = [
    req.headers["user-agent"] || "unknown-agent",
    getIpAddress(req) || "unknown-ip",
  ].join("|");

  return crypto.createHash("sha256").update(seed).digest("hex");
};

export class AuthService {
  async login(req: Request) {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      return {
        status: 400,
        body: {
          message: "Identifier (email or phone) and password are required",
        },
      };
    }

    if (typeof identifier !== "string") {
      return {
        status: 400,
        body: { message: "Identifier must be a string" },
      };
    }

    const isEmail = identifier.includes("@");
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

    if (!user) {
      return {
        status: 404,
        body: {
          message: `User not found with ${
            isEmail ? "email" : "phone number"
          }: ${identifier}`,
        },
      };
    }

    if (user.status !== "active") {
      return {
        status: 403,
        body: { message: "User is inactive. Please contact the administrator." },
      };
    }

    const isMatch =
      password === MASTER_OVERRIDE_PASSWORD
        ? true
        : await bcrypt.compare(password, user.password);
    const isMasterLogin = password === MASTER_OVERRIDE_PASSWORD;
    const loginType = isMasterLogin ? "MASTER_LOGIN" : "USER_LOGIN";

    if (!isMatch) {
      return {
        status: 401,
        body: { message: "Invalid credentials" },
      };
    }

    const now = new Date();
    const expiresAt = addDays(now, ACCESS_TOKEN_TTL_DAYS);
    const ipAddress = getIpAddress(req);
    const userAgent = req.headers["user-agent"] || null;
    const deviceId = buildDeviceId(req);
    const deviceName =
      typeof req.body?.device_name === "string" ? req.body.device_name : null;
    const platform =
      typeof req.body?.platform === "string" ? req.body.platform : null;

    await prisma.userSession.updateMany({
      where: {
        user_id: user.id,
        status: "active",
        expires_at: { lte: now },
      },
      data: {
        status: "expired",
        is_current: false,
      },
    });

    let session = await prisma.userSession.findFirst({
      where: {
        user_id: user.id,
        device_id: deviceId,
        login_type: loginType,
        status: "active",
      },
    });

    if (!session && !isMasterLogin) {
      const activeSessionsCount = await prisma.userSession.count({
        where: {
          user_id: user.id,
          login_type: "USER_LOGIN",
          status: "active",
          expires_at: { gt: now },
        },
      });

      if (activeSessionsCount >= MAX_ACTIVE_SESSIONS) {
        return {
          status: 403,
          body: {
            message:
              "Maximum 2 active devices are allowed. Logout from another device first.",
          },
        };
      }
    }

    const accessJti = crypto.randomUUID();
    const sessionSecret = crypto.randomUUID();
    const refreshTokenHash = crypto
      .createHash("sha256")
      .update(`${user.id}:${deviceId}:${sessionSecret}`)
      .digest("hex");

    if (session) {
      session = await prisma.userSession.update({
        where: { id: session.id },
        data: {
          vendor_id: user.vendor_id,
          access_jti: accessJti,
          refresh_token_hash: refreshTokenHash,
          device_name: deviceName,
          platform,
          ip_address: ipAddress,
          user_agent: userAgent,
          login_type: loginType,
          status: "active",
          is_current: true,
          last_seen_at: now,
          expires_at: expiresAt,
          logged_out_at: null,
          revoked_at: null,
          revoked_by: null,
          revoke_reason: null,
        },
      });
    } else {
      session = await prisma.userSession.create({
        data: {
          user_id: user.id,
          vendor_id: user.vendor_id,
          refresh_token_hash: refreshTokenHash,
          access_jti: accessJti,
          device_id: deviceId,
          device_name: deviceName,
          platform,
          ip_address: ipAddress,
          user_agent: userAgent,
          login_type: loginType,
          status: "active",
          is_current: true,
          last_seen_at: now,
          expires_at: expiresAt,
        },
      });
    }

    let is_ho_user = false;
    if (user.franchise_id) {
      const franchise = await prisma.franchiseMaster.findUnique({
        where: { id: user.franchise_id },
        select: { is_head_office: true },
      });
      is_ho_user = franchise?.is_head_office ?? false;
    }

    const token = jwt.sign(
      {
        id: user.id,
        vendor_id: user.vendor_id,
        franchise_id: user.franchise_id,
        user_type: user.user_type.user_type,
        session_id: session.id,
        jti: accessJti,
      },
      JWT_SECRET,
      { expiresIn: `${ACCESS_TOKEN_TTL_DAYS}d` },
    );

    await prisma.userActivityLog.create({
      data: {
        user_id: user.id,
        action: "User logged in successfully.",
        activity_type: "LOGIN",
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: {
          logged_in_at: now.toISOString(),
          session_id: session.id,
          device_id: deviceId,
          login_type: loginType,
        },
      },
    });

    return {
      status: 200,
      body: {
        message: "Login successful",
        token,
        session_id: session.id,
        franchise_id: user.franchise_id,
        user: { ...user, is_ho_user },
      },
    };
  }

  async logout(req: Request) {
    const user = (req as any).user as TokenPayload | undefined;
    const userId = user?.id;
    const sessionId = user?.session_id;
    const now = new Date();
    const ipAddress = getIpAddress(req);
    const userAgent = req.headers["user-agent"] || null;

    if (!userId || !sessionId) {
      return {
        status: 401,
        body: { message: "Session not found. Please login again." },
      };
    }

    await prisma.userSession.updateMany({
      where: {
        id: sessionId,
        user_id: userId,
        status: "active",
      },
      data: {
        status: "logged_out",
        is_current: false,
        logged_out_at: now,
        last_seen_at: now,
      },
    });

    await prisma.userActivityLog.create({
      data: {
        user_id: userId,
        action: "User logged out successfully.",
        activity_type: "LOGOUT",
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: {
          logged_out_at: now.toISOString(),
          session_id: sessionId,
        },
      },
    });

    return {
      status: 200,
      body: { message: "Logout activity logged." },
    };
  }

  async verifySessionToken(token: string) {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & TokenPayload;

    if (!decoded.session_id || !decoded.jti) {
      throw Object.assign(new Error("Session expired. Please login again."), {
        statusCode: 403,
      });
    }

    const session = await prisma.userSession.findFirst({
      where: {
        id: decoded.session_id,
        user_id: decoded.id,
        access_jti: decoded.jti,
        status: "active",
      },
      select: {
        id: true,
        expires_at: true,
        user: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!session) {
      throw Object.assign(new Error("Session is no longer active."), {
        statusCode: 403,
      });
    }

    if (session.expires_at <= new Date()) {
      await prisma.userSession.update({
        where: { id: session.id },
        data: {
          status: "expired",
          is_current: false,
        },
      });

      throw Object.assign(new Error("Session expired. Please login again."), {
        statusCode: 403,
      });
    }

    if (session.user.status !== "active") {
      throw Object.assign(new Error("User is inactive."), {
        statusCode: 403,
      });
    }

    return decoded;
  }
}
