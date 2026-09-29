import { prisma } from "../prisma/client";

export interface CadbidVerifyResult {
  success: boolean;
  data?: {
    userId?: number;
    name: string;
    email: string;
    companyName: string;
    companyId?: number;
  };
  error?: string;
  statusCode?: number;
}

export interface StudioEligibilityResult {
  eligible: boolean;
  reason?: string;
}

export const getCadbidBaseUrl = (): string => {
  if (process.env.CADBID_API_URL) {
    return process.env.CADBID_API_URL.replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3002";
  }
  return (process.env.CADBID_URL || "https://core.cadbid.com").replace(
    /\/+$/,
    "",
  );
};

export const getStudioBaseUrl = (): string => {
  if (process.env.CADX_STUDIO_URL || process.env.STUDIO_URL) {
    return (
      process.env.CADX_STUDIO_URL ||
      process.env.STUDIO_URL ||
      ""
    ).replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:5174";
  }
  return "https://studio.cadbid.com";
};

export const verifyCadbidToken = async (
  token: string,
): Promise<CadbidVerifyResult> => {
  try {
    const trimmed = (token || "").trim();

    if (!trimmed) {
      return {
        success: false,
        error: "Cadbid token is required",
        statusCode: 400,
      };
    }

    const baseUrl = getCadbidBaseUrl();

    console.log("baseUrl", baseUrl);

    const res = await fetch(`${baseUrl}/api/auth/verify-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: trimmed }),
    });

    const body = (await res.json()) as any;

    console.log("body", body);

    if (!res.ok) {
      return {
        success: false,
        error: body?.message || "Invalid Cadbid secret key",
        statusCode: res.status,
      };
    }

    const userData = body.data || body;
    return {
      success: true,
      data: {
        userId: userData.userId,
        name: userData.name || "",
        email: userData.email || "",
        companyName: userData.companyName || "",
        companyId: userData.companyId,
      },
      statusCode: 200,
    };
  } catch (err: any) {
    console.error("Error communicating with Cadbid server:", err);
    return {
      success: false,
      error: "Unable to reach Cadbid authentication service",
      statusCode: 502,
    };
  }
};

export const checkStudioAccess = async (
  cadbidToken: string,
): Promise<StudioEligibilityResult> => {
  try {
    const baseUrl = getCadbidBaseUrl();
    const res = await fetch(`${baseUrl}/api/studio/auth/sso-eligible`, {
      headers: {
        Authorization: `Bearer ${cadbidToken.trim()}`,
      },
    });

    if (!res.ok) {
      return { eligible: false, reason: "studio_check_failed" };
    }

    const body = (await res.json()) as StudioEligibilityResult;
    return body;
  } catch (err: any) {
    console.error("Error checking Studio eligibility:", err);
    return { eligible: false, reason: "studio_service_unreachable" };
  }
};

export const requestStudioSsoTicket = async (
  cadbidToken: string,
): Promise<{ ticket?: string; error?: string }> => {
  try {
    const baseUrl = getCadbidBaseUrl();
    const res = await fetch(`${baseUrl}/api/studio/auth/sso-ticket`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cadbidToken.trim()}`,
      },
    });

    const body = (await res.json()) as any;

    if (!res.ok) {
      return { error: body?.message || "Failed to create Studio SSO ticket" };
    }

    return { ticket: body.ticket };
  } catch (err: any) {
    console.error("Error requesting Studio SSO ticket:", err);
    return { error: "Studio authentication service unavailable" };
  }
};

export const getUserCadbidToken = async (
  userId: number,
): Promise<string | null> => {
  try {
    const user = await prisma.userMaster.findUnique({
      where: { id: userId },
      select: { cadbidToken: true },
    });
    return user?.cadbidToken || null;
  } catch (err: any) {
    console.warn(
      "Could not read cadbidToken from UserMaster (column may not exist yet in DB):",
      err?.message || err,
    );
    return null;
  }
};

export const saveUserCadbidToken = async (userId: number, token: string) => {
  try {
    return await prisma.userMaster.update({
      where: { id: userId },
      data: { cadbidToken: token.trim() },
    });
  } catch (err: any) {
    if (
      err?.message?.includes("cadbid_token") ||
      err?.message?.includes("does not exist")
    ) {
      throw new Error(
        "Column 'cadbid_token' does not exist in UserMaster table. Please run the ALTER TABLE query.",
      );
    }
    throw err;
  }
};

export const clearUserCadbidToken = async (userId: number) => {
  try {
    return await prisma.userMaster.update({
      where: { id: userId },
      data: { cadbidToken: null },
    });
  } catch (err: any) {
    if (
      err?.message?.includes("cadbid_token") ||
      err?.message?.includes("does not exist")
    ) {
      return;
    }
    throw err;
  }
};
