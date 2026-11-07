import { Request } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../prisma/client";
import { redis } from "../../config/redis";
import { AuthService } from "../../services/auth/auth.service";
import { sendBrevoEmail } from "../../services/email/brevoEmail.service";
import { generateSignedUrl } from "../../utils/wasabiClient";
import { buildClientOtpEmail, type ClientOtpEmailVendor } from "./client-otp-email";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const MASTER_OVERRIDE_PASSWORD =
  process.env.MASTER_LOGIN_OVERRIDE_PASSWORD || "";
const BACKEND_ENVIRONMENT = (process.env.BACKEND_ENVIRONMENT || "").toUpperCase();

// Client tokens use a derived secret so the web `verifyToken` middleware
// (which accepts legacy JWTs signed with JWT_SECRET) never accepts them.
const CLIENT_JWT_SECRET = `${JWT_SECRET}:furnixcrm-app-client`;
const CLIENT_TOKEN_TTL_DAYS = 30;

export const OTP_TTL_SECONDS = 5 * 60;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
// Longest S3 presign allowed; mail clients cache the image on first open.
const LOGO_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export type AccountType = "system_user" | "client";

export type ClientTokenPayload = {
  kind: "furnixcrm_app_client";
  email: string;
  lead_ids: number[];
};

type ServiceResponse = { status: number; body: Record<string, unknown> };

const otpKey = (email: string) => `furnixcrm-app:client-otp:${email}`;
const otpCooldownKey = (email: string) =>
  `furnixcrm-app:client-otp-cooldown:${email}`;

const hashOtp = (email: string, otp: string) =>
  crypto.createHmac("sha256", JWT_SECRET).update(`${email}:${otp}`).digest("hex");

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const invalidEmailResponse: ServiceResponse = {
  status: 400,
  body: { message: "Enter a valid email address." },
};

const enabledVendorFilter = {
  is_furnixcrm_app_enabled: true,
  status: "active",
};

export class MobileAuthService {
  private webAuthService = new AuthService();

  private findSystemUser(email: string) {
    return prisma.userMaster.findFirst({
      where: {
        user_email: { equals: email, mode: "insensitive" },
        status: "active",
        vendor: enabledVendorFilter,
      },
      include: {
        vendor: true,
        user_type: true,
        documents: true,
        createdProjects: true,
      },
    });
  }

  private findClientLeads(email: string) {
    return prisma.leadMaster.findMany({
      where: {
        email: { equals: email, mode: "insensitive" },
        is_deleted: false,
        vendor: enabledVendorFilter,
      },
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        email: true,
        contact_no: true,
        country_code: true,
        site_address: true,
        vendor_id: true,
        vendor: { select: { id: true, vendor_name: true } },
      },
      orderBy: { created_at: "desc" },
    });
  }

  /** Vendor branding for the OTP email. A failed logo lookup falls back to a text wordmark. */
  private async getEmailVendor(vendorId: number): Promise<ClientOtpEmailVendor> {
    const vendor = await prisma.vendorMaster.findUnique({
      where: { id: vendorId },
      select: {
        vendor_name: true,
        logo: true,
        tag_line: true,
        website_link: true,
        toll_free_no: true,
        primary_contact_email: true,
        address: true,
        city: true,
      },
    });

    let logoUrl: string | null = null;
    if (vendor?.logo) {
      try {
        logoUrl = await generateSignedUrl(vendor.logo, LOGO_URL_TTL_SECONDS);
      } catch (error) {
        console.error("[furnixcrm-app] Failed to sign vendor logo for OTP email:", error);
      }
    }

    return {
      vendor_name: vendor?.vendor_name || "FurnixCRM",
      logoUrl,
      tag_line: vendor?.tag_line ?? null,
      website_link: vendor?.website_link ?? null,
      toll_free_no: vendor?.toll_free_no ?? null,
      primary_contact_email: vendor?.primary_contact_email ?? null,
      address: vendor?.address ?? null,
      city: vendor?.city ?? null,
    };
  }

  /**
   * Step 1: tells the app which sign-in flow(s) apply to an email.
   * When both match, the app lets the person choose.
   */
  async identify(req: Request): Promise<ServiceResponse> {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return invalidEmailResponse;

    const [user, leads] = await Promise.all([
      this.findSystemUser(email),
      this.findClientLeads(email),
    ]);

    const accountTypes: AccountType[] = [];
    if (user) accountTypes.push("system_user");
    if (leads.length > 0) accountTypes.push("client");

    if (accountTypes.length === 0) {
      return {
        status: 404,
        body: { message: "We couldn’t find a FurnixCRM account for this email." },
      };
    }

    return {
      status: 200,
      body: { email, account_types: accountTypes },
    };
  }

  /** System user sign-in. Returns the same payload as the web `/auth/login`. */
  async loginSystemUser(req: Request): Promise<ServiceResponse> {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!isValidEmail(email)) return invalidEmailResponse;
    if (typeof password !== "string" || !password) {
      return { status: 400, body: { message: "Password is required." } };
    }

    const user = await this.findSystemUser(email);
    if (!user) {
      return { status: 401, body: { message: "Invalid credentials" } };
    }

    const isMasterLogin =
      Boolean(MASTER_OVERRIDE_PASSWORD) && password === MASTER_OVERRIDE_PASSWORD;
    const isMatch = isMasterLogin || (await bcrypt.compare(password, user.password));

    if (!isMatch) {
      return { status: 401, body: { message: "Invalid credentials" } };
    }

    return this.webAuthService.buildSuccessfulLoginResponse(
      req,
      user,
      isMasterLogin ? "MASTER_LOGIN" : "USER_LOGIN",
    );
  }

  /** Sends a 6-digit OTP to the client's LeadMaster email. */
  async sendClientOtp(req: Request): Promise<ServiceResponse> {
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) return invalidEmailResponse;

    const leads = await this.findClientLeads(email);
    if (leads.length === 0) {
      return {
        status: 404,
        body: { message: "We couldn’t find a client account for this email." },
      };
    }

    // Claim the cooldown atomically so parallel requests can't send twice.
    const claimed = await redis.set(otpCooldownKey(email), "1", {
      EX: OTP_RESEND_COOLDOWN_SECONDS,
      NX: true,
    });
    if (!claimed) {
      const ttl = await redis.ttl(otpCooldownKey(email));
      const retryAfter = ttl > 0 ? ttl : OTP_RESEND_COOLDOWN_SECONDS;
      return {
        status: 429,
        body: {
          message: `Please wait ${retryAfter}s before requesting a new code.`,
          resend_after_seconds: retryAfter,
        },
      };
    }

    const otp = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    await redis.set(
      otpKey(email),
      JSON.stringify({ hash: hashOtp(email, otp), attempts: 0 }),
      { EX: OTP_TTL_SECONDS },
    );

    const lead = leads[0];
    const clientName = `${lead.firstname} ${lead.lastname}`.trim();
    const vendor = await this.getEmailVendor(lead.vendor_id);
    const { subject, html, text } = buildClientOtpEmail({
      otp,
      clientName,
      minutes: OTP_TTL_SECONDS / 60,
      vendor,
    });

    const result = await sendBrevoEmail(
      {
        toEmail: lead.email || email,
        toName: clientName || null,
        subject,
        html,
        text,
      },
      {
        senderName: vendor.vendor_name,
        senderEmail: process.env.BREVO_SENDER_EMAIL || "",
      },
    );

    if (!result.success) {
      if (BACKEND_ENVIRONMENT === "LOCAL") {
        console.warn(`[furnixcrm-app] OTP email not sent; local OTP for ${email}: ${otp}`);
      } else {
        await redis.del([otpKey(email), otpCooldownKey(email)]);
        return {
          status: 502,
          body: { message: "We couldn’t send the code right now. Please try again." },
        };
      }
    }

    return {
      status: 200,
      body: {
        message: "A sign-in code has been sent to your email.",
        email,
        expires_in_seconds: OTP_TTL_SECONDS,
        resend_after_seconds: OTP_RESEND_COOLDOWN_SECONDS,
      },
    };
  }

  /** Verifies the OTP and issues a client token. */
  async verifyClientOtp(req: Request): Promise<ServiceResponse> {
    const email = normalizeEmail(req.body?.email);
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : "";

    if (!isValidEmail(email)) return invalidEmailResponse;
    if (!/^\d{6}$/.test(otp)) {
      return { status: 400, body: { message: "Enter the 6-digit code." } };
    }

    const stored = await redis.get(otpKey(email));
    if (!stored) {
      return {
        status: 410,
        body: { message: "This code has expired. Request a new one." },
      };
    }

    const record = JSON.parse(stored) as { hash: string; attempts: number };
    const expected = Buffer.from(record.hash, "hex");
    const actual = Buffer.from(hashOtp(email, otp), "hex");

    if (!crypto.timingSafeEqual(expected, actual)) {
      const attempts = record.attempts + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await redis.del(otpKey(email));
        return {
          status: 429,
          body: { message: "Too many incorrect attempts. Request a new code." },
        };
      }
      // KEEPTTL preserves the original 5-minute expiry.
      await redis.set(otpKey(email), JSON.stringify({ ...record, attempts }), {
        KEEPTTL: true,
      });
      return {
        status: 401,
        body: {
          message: "Incorrect code. Please try again.",
          attempts_remaining: OTP_MAX_ATTEMPTS - attempts,
        },
      };
    }

    await redis.del(otpKey(email));

    const leads = await this.findClientLeads(email);
    if (leads.length === 0) {
      return {
        status: 404,
        body: { message: "We couldn’t find a client account for this email." },
      };
    }

    const payload: ClientTokenPayload = {
      kind: "furnixcrm_app_client",
      email,
      lead_ids: leads.map((lead) => lead.id),
    };
    const token = jwt.sign(payload, CLIENT_JWT_SECRET, {
      expiresIn: `${CLIENT_TOKEN_TTL_DAYS}d`,
    });

    const primaryLead = leads[0];
    return {
      status: 200,
      body: {
        message: "Login successful",
        token,
        client: {
          email,
          name: `${primaryLead.firstname} ${primaryLead.lastname}`.trim(),
          contact_no: primaryLead.contact_no,
          country_code: primaryLead.country_code,
        },
        leads,
      },
    };
  }
}

export const verifyClientToken = (token: string) => {
  const decoded = jwt.verify(token, CLIENT_JWT_SECRET) as ClientTokenPayload;
  if (decoded.kind !== "furnixcrm_app_client") {
    throw new Error("Invalid client token");
  }
  return decoded;
};
