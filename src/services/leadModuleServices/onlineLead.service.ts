import { Request } from "express";
import { prisma } from "../../prisma/client";
import { LeadEntryType } from "../../../generated/prisma_client/client";
import logger from "../../utils/logger";
import { NotificationService } from "../notification/notification.service";
import { sendNewLeadsAddedLeadPoolEmail } from "../email/brevoEmail2.service";

export interface CreateOnlineLeadDTO {
  vendor_id: number;
  leads_name: string;
  contact: string;
  source?: string;
  email?: string | null;
  city?: string | null;
  remark?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  alt_contact_no?: string | null;
  site_address?: string | null;
  site_type_id?: number | null;
  source_id?: number | null;
  refered_by?: string | null;
  archetech_name?: string | null;
  archetech_number?: string | null;
  priority?: string | null;
  product_types?: string[];
  product_structures?: string[];
  store_id?: number | null;
  created_by?: number | null;
  assign_to?: number | null;
  lead_entry_type?: LeadEntryType;
}

export interface ResolvedVendorResult {
  vendorId?: number;
  error?: string;
  ambiguous?: boolean;
  eligibleVendors?: Array<{ id: number; vendor_name: string; vendor_code: string }>;
}

/**
 * Resolves the target vendor dynamically based on is_online_lead_feature_enabled:
 * 1. If explicit vendor is provided (header/query/body), validates is_online_lead_feature_enabled === true.
 * 2. If not provided, finds active vendors with is_online_lead_feature_enabled === true.
 * 3. If exactly 1 vendor matches, uses it.
 * 4. If 0 vendors match, reports feature is disabled.
 * 5. If >1 vendors match, reports ambiguity without guessing.
 */
export async function resolveTargetOnlineLeadVendor(
  req: Request,
): Promise<ResolvedVendorResult> {
  const headerVendorId =
    req.headers["x-vendor-id"] ||
    req.headers["vendor_id"] ||
    req.headers["vendor-id"];
  const headerVendorCode =
    req.headers["x-vendor-code"] ||
    req.headers["vendor_code"] ||
    req.headers["vendor-code"];
  const queryVendorId = req.query.vendor_id || req.query.vendorId;
  const queryVendorCode = req.query.vendor_code || req.query.vendorCode;
  const bodyVendorId = req.body?.vendor_id || req.body?.vendorId;
  const bodyVendorCode = req.body?.vendor_code || req.body?.vendorCode;

  const rawVendorId = Array.isArray(queryVendorId)
    ? queryVendorId[0]
    : (headerVendorId || queryVendorId || bodyVendorId);
  const rawVendorCode = Array.isArray(queryVendorCode)
    ? queryVendorCode[0]
    : (headerVendorCode || queryVendorCode || bodyVendorCode);

  const explicitVendorId = Number(rawVendorId);
  const explicitVendorCode = String(rawVendorCode || "").trim();

  // If explicit vendor ID was supplied:
  if (explicitVendorId && !isNaN(explicitVendorId)) {
    const vendor = await prisma.vendorMaster.findUnique({
      where: { id: explicitVendorId },
      select: {
        id: true,
        vendor_name: true,
        vendor_code: true,
        status: true,
        is_online_lead_feature_enabled: true,
      },
    });
    if (!vendor) {
      return { error: `Specified vendor ID ${explicitVendorId} does not exist.` };
    }
    if (vendor.status !== "active") {
      return {
        error: `Specified vendor '${vendor.vendor_name}' (ID: ${vendor.id}) is inactive.`,
      };
    }
    if (!vendor.is_online_lead_feature_enabled) {
      return {
        error: `Online Lead feature is disabled for vendor '${vendor.vendor_name}' (ID: ${vendor.id}). 'is_online_lead_feature_enabled' must be true.`,
      };
    }
    return { vendorId: vendor.id };
  }

  // If explicit vendor code was supplied:
  if (explicitVendorCode) {
    const vendor = await prisma.vendorMaster.findFirst({
      where: {
        vendor_code: { equals: explicitVendorCode, mode: "insensitive" },
      },
      select: {
        id: true,
        vendor_name: true,
        vendor_code: true,
        status: true,
        is_online_lead_feature_enabled: true,
      },
    });
    if (!vendor) {
      return {
        error: `Specified vendor_code '${explicitVendorCode}' does not exist.`,
      };
    }
    if (vendor.status !== "active") {
      return {
        error: `Specified vendor '${vendor.vendor_name}' (Code: ${vendor.vendor_code}) is inactive.`,
      };
    }
    if (!vendor.is_online_lead_feature_enabled) {
      return {
        error: `Online Lead feature is disabled for vendor '${vendor.vendor_name}' (Code: ${vendor.vendor_code}). 'is_online_lead_feature_enabled' must be true.`,
      };
    }
    return { vendorId: vendor.id };
  }

  // Automatically find active vendors with is_online_lead_feature_enabled === true
  const eligibleVendors = await prisma.vendorMaster.findMany({
    where: {
      status: "active",
      is_online_lead_feature_enabled: true,
    },
    select: {
      id: true,
      vendor_name: true,
      vendor_code: true,
    },
    orderBy: { id: "asc" },
  });

  if (eligibleVendors.length === 0) {
    return {
      error:
        "No active vendor has 'is_online_lead_feature_enabled' set to true in VendorMaster.",
    };
  }

  if (eligibleVendors.length === 1) {
    return { vendorId: eligibleVendors[0].id };
  }

  // Ambiguous: multiple vendors with is_online_lead_feature_enabled === true
  return {
    ambiguous: true,
    error:
      "Multiple active vendors have 'is_online_lead_feature_enabled' set to true. Please specify the target vendor by passing 'vendor_code' parameter or 'x-vendor-code' header.",
    eligibleVendors,
  };
}

/**
 * Ensures default followup statuses exist and are active for the vendor.
 */
export const ensureDefaultStatuses = async (vendorId: number) => {
  const defaultStatuses = [
    { name: "Pending", required: true },
    { name: "Follow Up Done", required: true },
    { name: "Store Assigned", required: true },
    { name: "Store Visit Done", required: false },
    { name: "Lost", required: false },
  ];

  for (const status of defaultStatuses) {
    const existing = await prisma.online_lead_followup_status.findFirst({
      where: {
        vendor_id: vendorId,
        status_name: { equals: status.name, mode: "insensitive" },
      },
    });

    if (!existing) {
      await prisma.online_lead_followup_status.create({
        data: {
          vendor_id: vendorId,
          status_name: status.name,
          followup_required: status.required,
          is_active: true,
          updated_at: new Date(),
        },
      });
    } else if (!existing.is_active) {
      await prisma.online_lead_followup_status.update({
        where: { id: existing.id },
        data: { is_active: true },
      });
    }
  }
};

/**
 * Generates an incremented online lead code (e.g. VK-101) with row-level locking.
 */
export async function generateOnlineLeadCode(
  tx: any,
  vendorId: number,
): Promise<string> {
  await tx.$queryRawUnsafe(
    `SELECT id FROM "VendorMaster" WHERE id = $1 FOR UPDATE`,
    vendorId,
  );

  const vendor = await tx.vendorMaster.findUnique({
    where: { id: vendorId },
    select: { online_leads_lead_code: true, vendor_code: true },
  });

  const prefix = String(vendor?.online_leads_lead_code || vendor?.vendor_code || "OL")
    .trim()
    .toUpperCase();

  const lastOnlineLead = await tx.online_leads.findFirst({
    where: {
      vendor_id: vendorId,
      lead_code: {
        startsWith: `${prefix}-`,
      },
    },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    select: {
      lead_code: true,
    },
  });

  const lastSequenceMatch = lastOnlineLead?.lead_code?.match(/-(\d+)$/);
  let nextNumber = lastSequenceMatch
    ? parseInt(lastSequenceMatch[1], 10) + 1
    : 1;

  let generatedCode = `${prefix}-${nextNumber}`;

  let exists = true;
  while (exists) {
    const existingOnlineLead = await tx.online_leads.findFirst({
      where: {
        vendor_id: vendorId,
        lead_code: generatedCode,
      },
      select: { id: true },
    });

    if (!existingOnlineLead) {
      exists = false;
    } else {
      nextNumber += 1;
      generatedCode = `${prefix}-${nextNumber}`;
    }
  }

  return generatedCode;
}

export interface SurveyDesignRemarkInput {
  budget?: string | null;
  propertyType?: string | null;
  modularSolution?: string | null;
  whenNeedReady?: string | null;
  preferredShowroom?: string | null;
  projectLocation?: string | null;
}

/**
 * Extracts survey details flexibly from any object (Google Sheet row, webhook payload, nested lead object).
 * Normalizes keys by removing underscores, spaces, slashes, question marks, and lowercase comparison.
 */
export function extractSurveyDetails(
  data: Record<string, any>,
): SurveyDesignRemarkInput {
  if (!data || typeof data !== "object") return {};

  const clean = (val: any) =>
    val !== null && val !== undefined ? String(val).trim() : "";

  // Flatten nested structures if present
  const merged: Record<string, any> = {
    ...(data.survey_data && typeof data.survey_data === "object"
      ? data.survey_data
      : {}),
    ...(data.lead && typeof data.lead === "object" ? data.lead : {}),
    ...data,
  };

  const keys = Object.keys(merged);
  const norm = (k: string) => k.toLowerCase().replace(/[\s_\/|\-?]+/g, "");

  const modularSolutionKey = keys.find((k) => {
    const nk = norm(k);
    return (
      nk.includes("whatmodularsolution") ||
      nk.includes("modularsolution") ||
      (nk.includes("modular") && nk.includes("solution"))
    );
  });

  const whenNeedReadyKey = keys.find((k) => {
    const nk = norm(k);
    return (
      nk.includes("whendoyouneed") ||
      nk.includes("kitchenwardrobe") ||
      nk.includes("whenneedready") ||
      (nk.includes("need") && nk.includes("ready"))
    );
  });

  const preferredShowroomKey = keys.find((k) => {
    const nk = norm(k);
    return (
      nk.includes("shambhala") ||
      nk.includes("showroom") ||
      nk.includes("prefertovisit") ||
      nk.includes("preferredshowroom")
    );
  });

  const projectLocationKey = keys.find((k) => {
    const nk = norm(k);
    return (
      nk.includes("whereisyourproject") ||
      nk.includes("projectlocated") ||
      nk.includes("projectlocation") ||
      (nk.includes("project") && nk.includes("located"))
    );
  });

  const budgetKey = keys.find((k) => {
    const nk = norm(k);
    return nk === "budget" || nk === "leadbudget";
  });

  const propertyTypeKey = keys.find((k) => {
    const nk = norm(k);
    return nk === "propertytype" || nk === "property";
  });

  return {
    budget: budgetKey ? clean(merged[budgetKey]) : undefined,
    propertyType: propertyTypeKey ? clean(merged[propertyTypeKey]) : undefined,
    modularSolution: modularSolutionKey ? clean(merged[modularSolutionKey]) : undefined,
    whenNeedReady: whenNeedReadyKey ? clean(merged[whenNeedReadyKey]) : undefined,
    preferredShowroom: preferredShowroomKey ? clean(merged[preferredShowroomKey]) : undefined,
    projectLocation: projectLocationKey ? clean(merged[projectLocationKey]) : undefined,
  };
}

/**
 * Formats survey fields into Design Remarks using exact Super Admin Bulk Upload logic:
 * Heading is bold with bullet marker (**• <Heading>**), value is normal text on the next line.
 * Preserves existing remark if present.
 */
export function formatDesignRemarks(
  surveyData: SurveyDesignRemarkInput,
  existingRemark?: string | null,
): string {
  const cleanVal = (v: any) =>
    String(v || "")
      .replace(/_/g, " ")
      .trim();

  const extraRemarks: string[] = [];

  const budget = surveyData.budget ? cleanVal(surveyData.budget) : "";
  const propertyType = surveyData.propertyType ? cleanVal(surveyData.propertyType) : "";
  const modularSolution = surveyData.modularSolution ? cleanVal(surveyData.modularSolution) : "";
  const whenNeedReady = surveyData.whenNeedReady ? cleanVal(surveyData.whenNeedReady) : "";
  const preferredShowroom = surveyData.preferredShowroom ? cleanVal(surveyData.preferredShowroom) : "";
  const projectLocation = surveyData.projectLocation ? cleanVal(surveyData.projectLocation) : "";

  if (budget) extraRemarks.push(`**• Budget:**\n${budget}`);
  if (propertyType) extraRemarks.push(`**• Property Type:**\n${propertyType}`);
  if (modularSolution)
    extraRemarks.push(
      `**• What modular solution are you interested in?**\n${modularSolution}`,
    );
  if (whenNeedReady)
    extraRemarks.push(
      `**• When do you need your modular kitchen/wardrobe ready?**\n${whenNeedReady}`,
    );
  if (preferredShowroom)
    extraRemarks.push(
      `**• Which Shambhala showroom would you prefer to visit?**\n${preferredShowroom}`,
    );
  if (projectLocation)
    extraRemarks.push(
      `**• Where is your project located?**\n${projectLocation}`,
    );

  let remark = existingRemark
    ? String(existingRemark).replace(/ΓÇó/g, "•").trim()
    : "";
  if (extraRemarks.length > 0) {
    const suffix = extraRemarks.join("\n\n");
    if (remark && remark !== "-" && remark !== "N/A") {
      if (!remark.includes(suffix)) {
        remark = `${remark}\n\n${suffix}`;
      }
    } else {
      remark = suffix;
    }
  }

  return remark ? remark.trim() : (existingRemark ? String(existingRemark).trim() : "-");
}

/**
 * Core reusable function to create or update an online lead.
 * Unassigned leads (assign_to = null) directly appear in Lead Pool.
 */
export async function createOrUpdateOnlineLead(input: CreateOnlineLeadDTO) {
  const {
    vendor_id,
    leads_name,
    email,
    contact,
    source = "Google Sheet",
    remark,
    firstname,
    lastname,
    alt_contact_no,
    site_address,
    site_type_id,
    source_id,
    refered_by,
    archetech_name,
    archetech_number,
    priority,
    city,
    product_types = [],
    product_structures = [],
    store_id,
    created_by = 1,
    assign_to = null,
    lead_entry_type = LeadEntryType.ONLINE,
  } = input;

  if (!vendor_id) {
    throw new Error("vendor_id is required to create a lead");
  }

  // Enforce: only process/create lead when is_online_lead_feature_enabled === true
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: Number(vendor_id) },
    select: {
      id: true,
      vendor_name: true,
      status: true,
      is_online_lead_feature_enabled: true,
    },
  });

  if (!vendor) {
    throw new Error(`Vendor with ID ${vendor_id} does not exist.`);
  }
  if (!vendor.is_online_lead_feature_enabled) {
    throw new Error(
      `Online Lead feature is disabled for vendor '${vendor.vendor_name}' (ID: ${vendor.id}). 'is_online_lead_feature_enabled' must be true.`,
    );
  }
  if (!leads_name || !String(leads_name).trim()) {
    throw new Error("leads_name is required");
  }
  if (!contact || !String(contact).trim()) {
    throw new Error("contact number is required");
  }

  // Extract numeric digits only and keep only the last 10 digits
  const cleanDigits = String(contact).replace(/\D/g, "");
  if (cleanDigits.length < 10) {
    throw new Error("Contact number must be at least 10 digits");
  }
  const normalizedContact = cleanDigits.slice(-10);

  let cleanAltContact: string | null = null;
  if (alt_contact_no) {
    const altDigits = String(alt_contact_no).replace(/\D/g, "");
    cleanAltContact = altDigits.length >= 10 ? altDigits.slice(-10) : altDigits || null;
  }

  await ensureDefaultStatuses(Number(vendor_id));
  const defaultStatus = await prisma.online_lead_followup_status.findFirst({
    where: {
      vendor_id: Number(vendor_id),
      is_active: true,
    },
    orderBy: { id: "asc" },
  });

  let isNew = false;
  const lead = await prisma.$transaction(async (tx) => {
    const existingOnlineLead = await tx.online_leads.findFirst({
      where: {
        vendor_id: Number(vendor_id),
        OR: [
          { contact: normalizedContact },
          { contact: cleanDigits },
          { contact: String(contact).trim() },
          { contact: `+91${normalizedContact}` },
          { contact: `91${normalizedContact}` },
          { contact: `0${normalizedContact}` },
          { contact: `p:+91${normalizedContact}` },
          { contact: `p:${normalizedContact}` },
        ],
      },
    });

    if (existingOnlineLead) {
      const existingTypes = Array.isArray(existingOnlineLead.product_types)
        ? existingOnlineLead.product_types
        : [];
      const existingStructs = Array.isArray(
        existingOnlineLead.product_structures,
      )
        ? existingOnlineLead.product_structures
        : [];
      const newTypes = Array.isArray(product_types) ? product_types : [];
      const newStructs = Array.isArray(product_structures)
        ? product_structures
        : [];

      const combinedTypes = Array.from(
        new Set([...existingTypes, ...newTypes].map(String)),
      ).filter(Boolean);
      const combinedStructs = Array.from(
        new Set([...existingStructs, ...newStructs].map(String)),
      ).filter(Boolean);

      let combinedRemark = existingOnlineLead.remark;
      if (remark && remark !== "-" && remark !== "N/A") {
        const prev =
          existingOnlineLead.remark &&
          existingOnlineLead.remark !== "-" &&
          existingOnlineLead.remark !== "N/A"
            ? existingOnlineLead.remark.trim()
            : "";
        if (!prev) {
          combinedRemark = remark.trim();
        } else if (prev === remark.trim()) {
          combinedRemark = prev;
        } else if (remark.trim().includes(prev)) {
          combinedRemark = remark.trim();
        } else if (prev.includes(remark.trim())) {
          combinedRemark = prev;
        } else {
          combinedRemark = `${prev}\n\n${remark.trim()}`;
        }
      }

      return await tx.online_leads.update({
        where: { id: existingOnlineLead.id },
        data: {
          leads_name: leads_name || existingOnlineLead.leads_name,
          contact: normalizedContact,
          email: email || existingOnlineLead.email,
          remark: combinedRemark,
          city: city || existingOnlineLead.city,
          product_types: combinedTypes,
          product_structures: combinedStructs,
          priority: priority || existingOnlineLead.priority,
          updated_at: new Date(),
        },
      });
    }

    isNew = true;
    const generatedCode = await generateOnlineLeadCode(
      tx,
      Number(vendor_id),
    );

    let fName = firstname || null;
    let lName = lastname || null;
    if (!fName && !lName && leads_name) {
      const parts = String(leads_name).trim().split(/\s+/);
      fName = parts[0] || null;
      lName = parts.slice(1).join(" ") || null;
    }

    // Lookup source_id if not explicitly provided
    let resolvedSourceId = source_id ? Number(source_id) : null;
    if (!resolvedSourceId && source) {
      try {
        const matchedSource = await tx.sourceMaster.findFirst({
          where: {
            vendor_id: Number(vendor_id),
            type: { contains: source, mode: "insensitive" },
          },
        });
        if (matchedSource) resolvedSourceId = matchedSource.id;
      } catch {}
    }

    return await tx.online_leads.create({
      data: {
        vendor_id: Number(vendor_id),
        leads_name: String(leads_name).trim(),
        lead_code: generatedCode,
        email: email || null,
        contact: normalizedContact,
        source: source || "Google Sheet",
        lead_entry_type: lead_entry_type,
        remark: remark ? String(remark).trim() : "-",
        status: defaultStatus?.id || null,
        store_id: store_id ? Number(store_id) : null,
        assign_to: assign_to ?? null, // Default null sends directly to Lead Pool
        created_by: created_by ? Number(created_by) : 1,
        updated_at: new Date(),
        firstname: fName,
        lastname: lName,
        alt_contact_no: cleanAltContact,
        site_address: site_address || null,
        site_type_id: site_type_id ? Number(site_type_id) : null,
        source_id: resolvedSourceId,
        refered_by: refered_by || null,
        archetech_name: archetech_name || null,
        archetech_number: archetech_number || null,
        priority: priority || "Medium",
        city: city || null,
        product_types: Array.isArray(product_types) ? product_types : [],
        product_structures: Array.isArray(product_structures)
          ? product_structures
          : [],
      },
    });
  });

  // Create lead history entry
  if (defaultStatus) {
    try {
      await prisma.online_lead_history.create({
        data: {
          vendor_id: Number(vendor_id),
          online_lead_id: lead.id,
          remark: isNew
            ? (remark || `Lead registered via ${source}`)
            : `Lead updated with new data via ${source}`,
          created_by: created_by ? Number(created_by) : 1,
          online_lead_status_id: defaultStatus.id,
        },
      });
    } catch (histErr: any) {
      logger.warn("[ONLINE LEAD SERVICE] Failed to record lead history:", histErr?.message);
    }
  }

  // If a brand new lead is added to the Lead Pool, notify telecallers
  if (isNew && lead.assign_to === null) {
    try {
      const telecallers = await prisma.userMaster.findMany({
        where: {
          vendor_id: Number(vendor_id),
          status: "active",
          user_type: {
            user_type: {
              in: [
                "telecaller",
                "telecaller team lead",
                "telecaller-team-lead",
                "store caller",
                "caller",
              ],
              mode: "insensitive",
            },
          },
        },
        select: {
          id: true,
          user_name: true,
          user_email: true,
        },
      });

      const leadPoolUrl = `/dashboard/online-leads?tab=pool`;
      for (const caller of telecallers) {
        try {
          await NotificationService.sendNewLeadsAddedLeadPool({
            vendor_id: Number(vendor_id),
            telecaller_id: caller.id,
            sender_id: Number(created_by || 1),
            leadCount: 1,
            redirectUrl: leadPoolUrl,
          });
        } catch {}

        if (caller.user_email) {
          try {
            await sendNewLeadsAddedLeadPoolEmail({
              vendor_id: Number(vendor_id),
              toEmail: caller.user_email,
              toName: caller.user_name,
              telecaller_name: caller.user_name,
              leadPoolUrl: leadPoolUrl,
            });
          } catch {}
        }
      }
    } catch (notifErr: any) {
      logger.warn("[ONLINE LEAD SERVICE] Warning sending telecaller notification:", notifErr?.message);
    }
  }

  return { lead, isNew };
}
