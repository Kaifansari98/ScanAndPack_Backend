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
  if (process.env.NODE_ENV === "development") {
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
  if (process.env.NODE_ENV === "development") {
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

export interface CreateCadbidCustomerResult {
  success: boolean;
  cadbidCustomerId?: number | string;
  message: string;
  statusCode: number;
}

export interface UpdateCadbidCustomerResult {
  success: boolean;
  skipped: boolean;
  message: string;
  statusCode: number;
}

// Status tags of leads that haven't reached Designing; these never sync to Cadbid
const PRE_DESIGNING_STATUS_TAGS = ["Type 1", "Type 2"];

const buildCadbidCustomerPayload = (lead: {
  firstname: string | null;
  lastname: string | null;
  site_address: string | null;
  email: string | null;
  country_code: string | null;
  contact_no: string | null;
}) => {
  const fullName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();
  const mobileNo =
    `${lead.country_code ?? ""}${lead.contact_no ?? ""}`.trim() || undefined;

  return {
    sName: fullName || "-",
    sAddr1: lead.site_address?.trim() || undefined,
    sContactPerson: fullName || undefined,
    sEmail: lead.email?.trim() || undefined,
    sMobileNo: mobileNo,
  };
};

export const createCadbidCustomerFromLead = async (
  cadbidToken: string,
  vendorId: number,
  leadId: number,
): Promise<CreateCadbidCustomerResult> => {
  const lead = await prisma.leadMaster.findFirst({
    where: { id: leadId, vendor_id: vendorId, is_deleted: false },
    select: {
      firstname: true,
      lastname: true,
      site_address: true,
      email: true,
      country_code: true,
      contact_no: true,
    },
  });

  if (!lead) {
    return {
      success: false,
      message: "We couldn't find this lead, so it was not sent to Cadbid.",
      statusCode: 404,
    };
  }

  const payload = buildCadbidCustomerPayload(lead);

  try {
    const res = await fetch(`${getCadbidBaseUrl()}/api/customers/create-customer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cadbidToken.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => ({}))) as any;

    if (res.ok) {
      const cadbidCustomerId = Number(body?.cadbidCustomerId ?? body?.nCustId);
      if (Number.isInteger(cadbidCustomerId) && cadbidCustomerId > 0) {
        await prisma.leadMaster
          .update({
            where: { id: leadId },
            data: { cadbid_customer_id: cadbidCustomerId },
          })
          .catch((err: any) =>
            console.error(
              "Created Cadbid customer but failed to save cadbid_customer_id:",
              err?.message || err,
            ),
          );
      } else {
        console.warn("Cadbid create-customer succeeded without a customer id");
      }

      return {
        success: true,
        cadbidCustomerId,
        message: "A new project has been created in Cadbid for this lead.",
        statusCode: res.status,
      };
    }

    if (res.status === 409) {
      return {
        success: false,
        message: `"${payload.sName}" already exists in Cadbid, so a new project was not created.`,
        statusCode: 409,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        message:
          "Your Cadbid connection has expired or is invalid. Please reconnect your Cadbid account and try again.",
        statusCode: res.status,
      };
    }

    console.error("Cadbid create-customer failed:", res.status, body?.message);
    return {
      success: false,
      message:
        "Cadbid couldn't create the project for this lead right now. Please try again later.",
      statusCode: 502,
    };
  } catch (err: any) {
    console.error("Error reaching Cadbid create-customer:", err?.message || err);
    return {
      success: false,
      message:
        "We couldn't reach Cadbid, so the project was not created there. Please try again later.",
      statusCode: 502,
    };
  }
};

export const updateCadbidCustomerFromLead = async (
  cadbidToken: string,
  vendorId: number,
  leadId: number,
): Promise<UpdateCadbidCustomerResult> => {
  const lead = await prisma.leadMaster.findFirst({
    where: { id: leadId, vendor_id: vendorId, is_deleted: false },
    select: {
      firstname: true,
      lastname: true,
      site_address: true,
      email: true,
      country_code: true,
      contact_no: true,
      cadbid_customer_id: true,
      statusType: { select: { tag: true } },
    },
  });

  if (!lead) {
    return {
      success: false,
      skipped: false,
      message: "We couldn't find this lead, so Cadbid was not updated.",
      statusCode: 404,
    };
  }

  const statusTag = lead.statusType?.tag;
  if (!statusTag || PRE_DESIGNING_STATUS_TAGS.includes(statusTag)) {
    return {
      success: true,
      skipped: true,
      message: "Lead has not reached Designing yet",
      statusCode: 200,
    };
  }

  // Lead was never pushed to Cadbid (e.g. moved to Designing before linking)
  if (!lead.cadbid_customer_id) {
    return {
      success: true,
      skipped: true,
      message: "Lead is not linked to a Cadbid customer",
      statusCode: 200,
    };
  }

  const payload = {
    nCustId: lead.cadbid_customer_id,
    ...buildCadbidCustomerPayload(lead),
  };

  try {
    const res = await fetch(`${getCadbidBaseUrl()}/api/customers/update-customer`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${cadbidToken.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await res.json().catch(() => ({}))) as any;

    if (res.ok) {
      return {
        success: true,
        skipped: false,
        message: "The lead's details have also been updated in Cadbid.",
        statusCode: res.status,
      };
    }

    if (res.status === 404) {
      return {
        success: false,
        skipped: false,
        message:
          "This lead's project could not be found in Cadbid, so it was not updated there.",
        statusCode: 404,
      };
    }

    if (res.status === 409) {
      return {
        success: false,
        skipped: false,
        message: `Another customer named "${payload.sName}" already exists in Cadbid, so the details were not updated there.`,
        statusCode: 409,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        skipped: false,
        message:
          "Your Cadbid connection has expired or is invalid. Please reconnect your Cadbid account and try again.",
        statusCode: res.status,
      };
    }

    console.error("Cadbid update-customer failed:", res.status, body?.message);
    return {
      success: false,
      skipped: false,
      message:
        "Cadbid couldn't update this lead's details right now. Please try again later.",
      statusCode: 502,
    };
  } catch (err: any) {
    console.error("Error reaching Cadbid update-customer:", err?.message || err);
    return {
      success: false,
      skipped: false,
      message:
        "We couldn't reach Cadbid, so the lead's details were not updated there. Please try again later.",
      statusCode: 502,
    };
  }
};

export interface CadbidCustomerQuote {
  nQuotationId: number;
  sDocumentNo: string | null;
  sRefNo: string | null;
  sName: string | null;
  sStage: string | null;
  sUserName: string | null;
  nTotalAmt: number | null;
  nDiscountAmt: number | null;
  dtCreated: string | null;
}

export interface GetCadbidQuotesResult {
  success: boolean;
  linked: boolean;
  quotes: CadbidCustomerQuote[];
  message: string;
  statusCode: number;
}

export const getCadbidQuotesForLead = async (
  cadbidToken: string,
  vendorId: number,
  leadId: number,
): Promise<GetCadbidQuotesResult> => {
  const lead = await prisma.leadMaster.findFirst({
    where: { id: leadId, vendor_id: vendorId, is_deleted: false },
    select: { cadbid_customer_id: true },
  });

  if (!lead) {
    return {
      success: false,
      linked: false,
      quotes: [],
      message: "We couldn't find this lead.",
      statusCode: 404,
    };
  }

  if (!lead.cadbid_customer_id) {
    return {
      success: true,
      linked: false,
      quotes: [],
      message: "This lead is not linked to a Cadbid project yet.",
      statusCode: 200,
    };
  }

  try {
    const res = await fetch(
      `${getCadbidBaseUrl()}/api/quotes/get-cq?nCustId=${lead.cadbid_customer_id}`,
      { headers: { Authorization: `Bearer ${cadbidToken.trim()}` } },
    );

    const body = (await res.json().catch(() => null)) as any;

    if (res.ok) {
      const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      return {
        success: true,
        linked: true,
        quotes: rows.map((row: any) => ({
          nQuotationId: Number(row.nQuotationId),
          sDocumentNo: row.sDocumentNo ?? null,
          sRefNo: row.sRefNo ?? null,
          sName: row.sName ?? null,
          sStage: row.sStage ?? null,
          sUserName: row.sUserName ?? null,
          nTotalAmt: row.nTotalAmt != null ? Number(row.nTotalAmt) : null,
          nDiscountAmt: row.nDiscountAmt != null ? Number(row.nDiscountAmt) : null,
          dtCreated: row.dtCreated ?? null,
        })),
        message: "Quotations loaded from Cadbid",
        statusCode: 200,
      };
    }

    if (res.status === 404) {
      return {
        success: false,
        linked: true,
        quotes: [],
        message: "This lead's project could not be found in Cadbid.",
        statusCode: 404,
      };
    }

    if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        linked: true,
        quotes: [],
        message:
          "Your Cadbid connection has expired or is invalid. Please reconnect your Cadbid account.",
        statusCode: res.status,
      };
    }

    console.error("Cadbid get-cq failed:", res.status, body?.message);
    return {
      success: false,
      linked: true,
      quotes: [],
      message: "Cadbid couldn't load the quotations right now. Please try again later.",
      statusCode: 502,
    };
  } catch (err: any) {
    console.error("Error reaching Cadbid get-cq:", err?.message || err);
    return {
      success: false,
      linked: true,
      quotes: [],
      message: "We couldn't reach Cadbid to load the quotations. Please try again later.",
      statusCode: 502,
    };
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
