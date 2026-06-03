import { Request } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../../prisma/client";
import { redis } from "../../config/redis";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const MASTER_OVERRIDE_PASSWORD =
  process.env.MASTER_LOGIN_OVERRIDE_PASSWORD || "";
const ACCESS_TOKEN_TTL_DAYS = 30;
const MAX_ACTIVE_SESSIONS = 10;

type TokenPayload = {
  id: number;
  vendor_id: number;
  franchise_id: number | null;
  user_type: string;
  session_id: number;
  jti: string;
};

type VendorLoginExchangePayload = {
  purpose: "vendor-login-exchange";
  target_user_id: number;
  target_vendor_id: number;
  actor_user_id: number;
  subdomain_url: string;
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

type CachedSession = {
  session_id: number;
  user_id: number;
  vendor_id: number;
  jti: string;
  status: "active";
  expires_at: string;
};

const sessionCacheKey = (sessionId: number) => `auth:session:${sessionId}`;
const vendorSessionsKey = (vendorId: number) => `auth:vendor-sessions:${vendorId}`;
const getSessionTtlSeconds = (expiresAt: Date) =>
  Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
const VENDOR_SESSION_INDEX_TTL_SECONDS = ACCESS_TOKEN_TTL_DAYS * 24 * 60 * 60;

export class AuthService {
  private async buildSuccessfulLoginResponse(
    req: Request,
    user: any,
    loginType: "MASTER_LOGIN" | "USER_LOGIN",
  ) {
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

    if (!session && loginType !== "MASTER_LOGIN") {
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
              "Maximum 10 active devices are allowed. Logout from another device first.",
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

    const customPrivileges = await this.getCustomPrivilegeCodes(
      user.id,
      user.vendor_id,
      user.user_type.user_type,
    );

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

    await this.cacheSession(session);

    return {
      status: 200,
      body: {
        message: "Login successful",
        token,
        session_id: session.id,
        franchise_id: user.franchise_id,
        customPrivileges,
        user: { ...user, is_ho_user },
      },
    };
  }

  private async getCustomPrivilegeCodes(
    userId: number,
    vendorId: number,
    userType: string,
  ) {
    if (userType.trim().toLowerCase() !== "custom") {
      return [] as string[];
    }

    const mappings = await prisma.userPrivilegeMapping.findMany({
      where: {
        user_id: userId,
        vendor_id: vendorId,
        is_allowed: true,
        privilege: {
          is_active: true,
        },
      },
      select: {
        privilege: {
          select: {
            code: true,
          },
        },
      },
      orderBy: {
        privilege_id: "asc",
      },
    });

    return [...new Set(mappings.map((mapping) => mapping.privilege.code))];
  }

  private async cacheSession(session: {
    id: number;
    user_id: number;
    vendor_id: number;
    access_jti: string | null;
    status: string;
    expires_at: Date;
  }) {
    if (!session.access_jti || session.status !== "active") return;

    const payload: CachedSession = {
      session_id: session.id,
      user_id: session.user_id,
      vendor_id: session.vendor_id,
      jti: session.access_jti,
      status: "active",
      expires_at: session.expires_at.toISOString(),
    };

    const ttlSeconds = getSessionTtlSeconds(session.expires_at);

    try {
      await redis.set(sessionCacheKey(session.id), JSON.stringify(payload), {
        EX: ttlSeconds,
      });
      await redis.sAdd(vendorSessionsKey(session.vendor_id), String(session.id));
      await redis.expire(
        vendorSessionsKey(session.vendor_id),
        VENDOR_SESSION_INDEX_TTL_SECONDS,
      );
    } catch (error) {
      console.error("Failed to cache auth session:", error);
    }
  }

  private async evictSessionCache(sessionId: number, vendorId?: number | null) {
    try {
      await redis.del(sessionCacheKey(sessionId));
      if (vendorId) {
        await redis.sRem(vendorSessionsKey(vendorId), String(sessionId));
      }
    } catch (error) {
      console.error("Failed to evict auth session cache:", error);
    }
  }

  private async evictVendorSessionsCache(vendorId: number) {
    try {
      const key = vendorSessionsKey(vendorId);
      const sessionIds = await redis.sMembers(key);

      if (sessionIds.length > 0) {
        await redis.del(sessionIds.map((id) => sessionCacheKey(Number(id))));
      }

      await redis.del(key);
    } catch (error) {
      console.error("Failed to evict vendor auth sessions cache:", error);
    }
  }

  private async getCachedSession(sessionId: number) {
    try {
      const cached = await redis.get(sessionCacheKey(sessionId));
      if (!cached) return null;

      return JSON.parse(cached) as CachedSession;
    } catch (error) {
      console.error("Failed to read auth session cache:", error);
      return null;
    }
  }

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

    return this.buildSuccessfulLoginResponse(req, user, loginType);
  }

  async createVendorLoginLaunch(req: Request, vendorId: number) {
    const actor = (req as any).user as TokenPayload | undefined;

    if (!actor?.id || !actor?.user_type) {
      return {
        status: 401,
        body: { message: "Unauthorized" },
      };
    }

    if (actor.user_type.toLowerCase() !== "super-admin") {
      return {
        status: 403,
        body: { message: "Only super-admin can use vendor login override." },
      };
    }

    const vendor = await prisma.vendorMaster.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        vendor_name: true,
        subdomain_url: true,
      },
    });

    if (!vendor) {
      return {
        status: 404,
        body: { message: "Vendor not found" },
      };
    }

    if (!vendor.subdomain_url) {
      return {
        status: 400,
        body: { message: "Vendor subdomain is not configured" },
      };
    }

    const targetUser = await prisma.userMaster.findFirst({
      where: {
        vendor_id: vendor.id,
        status: "active",
        user_type: {
          user_type: "super-admin",
        },
      },
      select: {
        id: true,
        user_email: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    if (!targetUser?.id || !targetUser.user_email) {
      return {
        status: 404,
        body: { message: "Vendor super-admin user not found" },
      };
    }

    const exchangeToken = jwt.sign(
      {
        purpose: "vendor-login-exchange",
        target_user_id: targetUser.id,
        target_vendor_id: vendor.id,
        actor_user_id: actor.id,
        subdomain_url: vendor.subdomain_url,
      } satisfies VendorLoginExchangePayload,
      JWT_SECRET,
      { expiresIn: "10m" },
    );

    await prisma.userActivityLog.create({
      data: {
        user_id: actor.id,
        action: `Vendor login override initiated for ${vendor.vendor_name}.`,
        activity_type: "LOGIN",
        ip_address: getIpAddress(req),
        user_agent: req.headers["user-agent"] || null,
        metadata: {
          target_vendor_id: vendor.id,
          target_user_id: targetUser.id,
          subdomain_url: vendor.subdomain_url,
        },
      },
    });

    return {
      status: 200,
      body: {
        message: "Vendor login launch URL created",
        data: {
          vendor_id: vendor.id,
          vendor_name: vendor.vendor_name,
          subdomain_url: vendor.subdomain_url,
          launch_url: `https://${vendor.subdomain_url}/login?vendorLoginToken=${encodeURIComponent(exchangeToken)}`,
        },
      },
    };
  }

  async exchangeVendorLoginToken(req: Request, token: string) {
    let payload: VendorLoginExchangePayload;

    try {
      payload = jwt.verify(token, JWT_SECRET) as VendorLoginExchangePayload;
    } catch {
      return {
        status: 401,
        body: { message: "Vendor login token is invalid or expired" },
      };
    }

    if (payload.purpose !== "vendor-login-exchange") {
      return {
        status: 401,
        body: { message: "Vendor login token is invalid" },
      };
    }

    const user = await prisma.userMaster.findFirst({
      where: {
        id: payload.target_user_id,
        vendor_id: payload.target_vendor_id,
        status: "active",
      },
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
        body: { message: "Target vendor super-admin not found or inactive" },
      };
    }

    return this.buildSuccessfulLoginResponse(req, user, "MASTER_LOGIN");
  }

  async logout(req: Request) {
    const user = (req as any).user as TokenPayload | undefined;
    const userId = user?.id;
    const sessionId = user?.session_id;
    const vendorId = user?.vendor_id;
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

    await this.evictSessionCache(sessionId, vendorId);

    return {
      status: 200,
      body: { message: "Logout activity logged." },
    };
  }

  async logoutAllByVendor(req: Request, vendorId: number) {
    const actor = (req as any).user as TokenPayload | undefined;
    const actorUserId = actor?.id;
    const actorVendorId = actor?.vendor_id;
    const actorUserType = actor?.user_type?.toLowerCase();
    const now = new Date();
    const ipAddress = getIpAddress(req);
    const userAgent = req.headers["user-agent"] || null;

    if (!actorUserId || !actorVendorId) {
      return {
        status: 401,
        body: { message: "Unauthorized" },
      };
    }

    if (actorVendorId !== vendorId) {
      return {
        status: 403,
        body: { message: "You can only logout sessions for your own vendor." },
      };
    }

    if (actorUserType !== "admin" && actorUserType !== "super-admin") {
      return {
        status: 403,
        body: { message: "Only admin and super-admin can logout all vendor sessions." },
      };
    }

    const result = await prisma.userSession.updateMany({
      where: {
        vendor_id: vendorId,
        status: "active",
      },
      data: {
        status: "revoked",
        is_current: false,
        revoked_at: now,
        revoked_by: actorUserId,
        revoke_reason: "Vendor-wide logout",
        last_seen_at: now,
      },
    });

    await this.evictVendorSessionsCache(vendorId);

    await prisma.userActivityLog.create({
      data: {
        user_id: actorUserId,
        action: `Logged out all active sessions for vendor ${vendorId}.`,
        activity_type: "LOGOUT",
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata: {
          vendor_id: vendorId,
          revoked_sessions_count: result.count,
          logged_out_at: now.toISOString(),
        },
      },
    });

    return {
      status: 200,
      body: {
        message: `Logged out ${result.count} active session${result.count === 1 ? "" : "s"} for vendor ${vendorId}.`,
        count: result.count,
      },
    };
  }

  async verifySessionToken(token: string) {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & TokenPayload;

    if (!decoded.session_id || !decoded.jti) {
      throw Object.assign(new Error("Session expired. Please login again."), {
        statusCode: 403,
      });
    }

    const cachedSession = await this.getCachedSession(decoded.session_id);
    if (cachedSession) {
      const expiresAt = new Date(cachedSession.expires_at);

      if (
        cachedSession.user_id === decoded.id &&
        cachedSession.jti === decoded.jti &&
        cachedSession.status === "active"
      ) {
        if (expiresAt <= new Date()) {
          await this.evictSessionCache(
            decoded.session_id,
            cachedSession.vendor_id,
          );
        } else {
          return decoded;
        }
      } else {
        await this.evictSessionCache(
          decoded.session_id,
          cachedSession.vendor_id,
        );
        throw Object.assign(new Error("Session is no longer active."), {
          statusCode: 403,
        });
      }
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
        user_id: true,
        vendor_id: true,
        access_jti: true,
        status: true,
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

      await this.evictSessionCache(session.id, session.vendor_id);

      throw Object.assign(new Error("Session expired. Please login again."), {
        statusCode: 403,
      });
    }

    if (session.user.status !== "active") {
      await this.evictSessionCache(session.id, session.vendor_id);
      throw Object.assign(new Error("User is inactive."), {
        statusCode: 403,
      });
    }

    await this.cacheSession(session);

    return decoded;
  }
}
