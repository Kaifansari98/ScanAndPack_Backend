import { prisma } from "../../prisma/client";
import logger from "../../utils/logger";

const CADBID_CREATE_EXTERNAL_CUSTOMER_URL =
  "https://cadbid.com/api/customers/create-external-customer";
const CADBID_EXTERNAL_PLATFORM_TYPE = "CADBID";

type CadbidExternalCustomerPayload = {
  cadbidSecretKey: string;
  sName: string;
  sAddr1: string;
  sAddr2: string;
  sAddr3: string;
  sContactPerson?: string;
  sEmail?: string;
  sMobileNo?: string;
  sTaxNo?: string;
  lead_id: number;
  lead_code: string;
};

export class CadbidIntegrationWithFurnixcrmService {
  private async getCadbidExternalPlatformToken(vendorId: number) {
    const externalPlatform = await prisma.externalPlatformMaster.findUnique({
      where: {
        type: CADBID_EXTERNAL_PLATFORM_TYPE,
      },
      select: {
        id: true,
      },
    });

    if (!externalPlatform) {
      throw Object.assign(
        new Error(
          `External platform master not found for type ${CADBID_EXTERNAL_PLATFORM_TYPE}`,
        ),
        { statusCode: 404 },
      );
    }

    const externalPlatformToken = await prisma.externalPlatformToken.findFirst({
      where: {
        external_platform_id: externalPlatform.id,
        vendor_id: vendorId,
        active: "Yes",
      },
      orderBy: {
        updated_at: "desc",
      },
      select: {
        id: true,
        token: true,
      },
    });

    if (!externalPlatformToken) {
      throw Object.assign(
        new Error(
          `Active external platform token not found for vendor ${vendorId} and type ${CADBID_EXTERNAL_PLATFORM_TYPE}`,
        ),
        { statusCode: 404 },
      );
    }

    return {
      externalPlatformId: externalPlatform.id,
      externalPlatformTokenId: externalPlatformToken.id,
      token: externalPlatformToken.token,
    };
  }

  private extractCadbidCustomerId(responseBody: unknown): string | null {
    if (!responseBody || typeof responseBody !== "object") {
      return null;
    }

    const directCadbidCustomerId =
      "cadbidCustomerId" in responseBody
        ? responseBody.cadbidCustomerId
        : "cadbid_customer_id" in responseBody
          ? responseBody.cadbid_customer_id
          : null;

    if (
      typeof directCadbidCustomerId === "string" ||
      typeof directCadbidCustomerId === "number"
    ) {
      return String(directCadbidCustomerId);
    }

    if ("data" in responseBody) {
      return this.extractCadbidCustomerId(responseBody.data);
    }

    return null;
  }

  private async syncLeadExternalCustomerMapping(
    vendorId: number,
    leadId: number,
    externalPlatformCustomerId: string,
    externalPlatformId: number,
    externalPlatformTokenId: number,
  ) {
    await prisma.leadExternalPlatformCustomerMapping.upsert({
      where: {
        uniq_vendor_lead_external_platform_customer_mapping: {
          vendor_id: vendorId,
          lead_id: leadId,
          external_platform_id: externalPlatformId,
        },
      },
      update: {
        external_platform_customer_id: externalPlatformCustomerId,
        external_platform_token_id: externalPlatformTokenId,
      },
      create: {
        vendor_id: vendorId,
        lead_id: leadId,
        external_platform_customer_id: externalPlatformCustomerId,
        external_platform_id: externalPlatformId,
        external_platform_token_id: externalPlatformTokenId,
      },
    });
  }

  private splitAddressIntoThreeParts(address?: string | null) {
    const normalized = address?.replace(/\s+/g, " ").trim() || "-";
    const commaParts = normalized
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (commaParts.length >= 3) {
      return [
        commaParts[0],
        commaParts[1],
        commaParts.slice(2).join(", "),
      ] as const;
    }

    if (commaParts.length === 2) {
      return [commaParts[0], commaParts[1], "-"] as const;
    }

    if (commaParts.length === 1 && commaParts[0] !== normalized) {
      return [commaParts[0], "-", "-"] as const;
    }

    const words = normalized.split(" ").filter(Boolean);
    if (words.length <= 1) {
      return [normalized, "-", "-"] as const;
    }

    const firstBreak = Math.ceil(words.length / 3);
    const secondBreak = Math.ceil((words.length * 2) / 3);

    const part1 = words.slice(0, firstBreak).join(" ") || "-";
    const part2 = words.slice(firstBreak, secondBreak).join(" ") || "-";
    const part3 = words.slice(secondBreak).join(" ") || "-";

    return [part1, part2, part3] as const;
  }

  private async buildPayload(
    vendorId: number,
    leadId: number,
    cadbidSecretKey: string,
  ) {
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        site_address: true,
        email: true,
        contact_no: true,
        created_by: true,
        createdBy: {
          select: {
            user_name: true,
          },
        },
      },
    });

    if (!lead) {
      throw Object.assign(new Error("Lead not found"), { statusCode: 404 });
    }

    const [sAddr1, sAddr2, sAddr3] = this.splitAddressIntoThreeParts(
      lead.site_address,
    );

    const payload: CadbidExternalCustomerPayload = {
      cadbidSecretKey,
      sName: `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim() || "-",
      sAddr1,
      sAddr2,
      sAddr3,
      sContactPerson: lead.createdBy?.user_name || undefined,
      sEmail: lead.email?.trim() || undefined,
      sMobileNo: lead.contact_no?.trim() || undefined,
      sTaxNo: "-",
      lead_id: lead.id,
      lead_code: lead.lead_code,
    };

    return payload;
  }

  async syncLeadToCadbid(vendorId: number, leadId: number) {
    if (!vendorId || !leadId) {
      throw Object.assign(new Error("vendorId and leadId are required"), {
        statusCode: 400,
      });
    }

    const cadbidPlatformToken =
      await this.getCadbidExternalPlatformToken(vendorId);

    const payload = await this.buildPayload(
      vendorId,
      leadId,
      cadbidPlatformToken.token,
    );

    const response = await fetch(CADBID_CREATE_EXTERNAL_CUSTOMER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let parsedBody: unknown = rawText;

    try {
      parsedBody = rawText ? JSON.parse(rawText) : rawText;
    } catch {
      parsedBody = rawText;
    }

    if (!response.ok) {
      logger.warn("Cadbid customer sync failed", {
        vendorId,
        leadId,
        status: response.status,
        response: parsedBody,
      });

      throw Object.assign(
        new Error(
          typeof parsedBody === "string" && parsedBody
            ? parsedBody
            : "Failed to create external customer in Cadbid",
        ),
        { statusCode: response.status || 500 },
      );
    }

    const cadbidCustomerId = this.extractCadbidCustomerId(parsedBody);

    if (!cadbidCustomerId) {
      throw Object.assign(
        new Error(
          "Cadbid customer synced but cadbidCustomerId was missing in the response",
        ),
        { statusCode: 502 },
      );
    }

    await this.syncLeadExternalCustomerMapping(
      vendorId,
      leadId,
      cadbidCustomerId,
      cadbidPlatformToken.externalPlatformId,
      cadbidPlatformToken.externalPlatformTokenId,
    );

    return {
      payload,
      status: response.status,
      response: parsedBody,
    };
  }
}

export const cadbidIntegrationWithFurnixcrmService =
  new CadbidIntegrationWithFurnixcrmService();
