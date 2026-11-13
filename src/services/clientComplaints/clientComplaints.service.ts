import { prisma, Prisma } from "../../prisma/client";
import {
  ComplaintComponent,
  ComplaintStatus,
} from "../../prisma/generated";
import { PHOTO_TYPES, validFMFileSignature } from "../fmRequirements/schema";
import { deleteWasabiObjects, uploadComplaintFile } from "../../utils/wasabiClient";

export class ComplaintError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}

export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const COMPLAINT_MAX_PHOTOS = 10;
export const COMPLAINT_MAX_VIDEOS = 3;
export const COMPLAINT_MAX_PHOTO_SIZE = 15 * 1024 * 1024;
export const COMPLAINT_MAX_VIDEO_SIZE = 50 * 1024 * 1024;

// Spec 5.1 starting list; the Department Head can edit categories afterwards.
const DEFAULT_CATEGORIES = [
  "Hardware Issue",
  "Shutter Issue",
  "Carcass Issue",
  "Installation Issue",
  "Alignment / Adjustment",
  "Accessories Issue",
  "Finish / Surface Damage",
  "Civil / Site-Related Issue",
  "Water / Moisture Damage",
  "Other",
];

// Statuses that still count as an open complaint for duplicate warnings.
const FINISHED_STATUSES: ComplaintStatus[] = ["CLOSED", "REJECTED", "CANCELLED"];

export interface ComplaintActor {
  vendorId: number;
  actorId: number;
  role: string;
}

export const canRegisterComplaints = (role: string) =>
  role === "super-admin" || role === "head-site-supervisor";

export const canViewAllComplaints = canRegisterComplaints;

export const canViewComplaints = (role: string) =>
  canViewAllComplaints(role) || role === "site-supervisor";

export async function requireComplaintsVendor(vendorId: number) {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendorId },
    select: { is_client_complaints_enabled: true },
  });
  if (!vendor?.is_client_complaints_enabled)
    throw new ComplaintError("Client Complaints is not enabled for this vendor.", 403);
}

const fullName = (first?: string | null, last?: string | null) =>
  [first, last].map((v) => v?.trim()).filter(Boolean).join(" ");

const digits = (value: string) => value.replace(/\D/g, "");

const lastTen = (value: string) => digits(value).slice(-10);

const toDateOnly = (value: Date | null | undefined) =>
  value ? value.toISOString().slice(0, 10) : null;

function parseDate(value: unknown, label: string, required = false): Date | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ComplaintError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ComplaintError(`${label} must be a date (YYYY-MM-DD).`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new ComplaintError(`${label} is not a valid date.`);
  return date;
}

function text(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string | null {
  if (value === undefined || value === null) {
    if (required) throw new ComplaintError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new ComplaintError(`${label} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) throw new ComplaintError(`${label} is required.`);
    return null;
  }
  if (trimmed.length > max)
    throw new ComplaintError(`${label} must be at most ${max} characters.`);
  return trimmed;
}

function mobile(value: unknown, label: string, required = false) {
  const raw = text(value, label, 40, required);
  if (raw === null) return null;
  const count = digits(raw).length;
  if (count < 10 || count > 15)
    throw new ComplaintError(`${label} must contain 10 to 15 digits.`);
  // Stored compact so duplicate checks can match on the trailing 10 digits.
  return raw.replace(/[^\d+]/g, "");
}

function optionalId(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0)
    throw new ComplaintError(`${label} is invalid.`);
  return id;
}

export async function ensureDefaultCategories(vendorId: number, actorId: number) {
  const count = await prisma.complaintCategoryMaster.count({ where: { vendor_id: vendorId } });
  if (count > 0) return;
  await prisma.complaintCategoryMaster.createMany({
    data: DEFAULT_CATEGORIES.map((name, index) => ({
      vendor_id: vendorId,
      name,
      sort_order: index + 1,
      created_by: actorId,
    })),
    skipDuplicates: true,
  });
}

export async function getComplaintMeta(actor: ComplaintActor) {
  await ensureDefaultCategories(actor.vendorId, actor.actorId);
  const [categories, productTypes, vendor] = await Promise.all([
    prisma.complaintCategoryMaster.findMany({
      where: { vendor_id: actor.vendorId, is_active: true },
      orderBy: [{ sort_order: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.productTypeMaster.findMany({
      where: { vendor_id: actor.vendorId },
      orderBy: { type: "asc" },
      select: { id: true, type: true },
    }),
    prisma.vendorMaster.findUniqueOrThrow({
      where: { id: actor.vendorId },
      select: { complaint_visit_fee: true },
    }),
  ]);
  return {
    categories,
    product_types: productTypes,
    components: Object.values(ComplaintComponent),
    can_register: canRegisterComplaints(actor.role),
    visit_fee: Number(vendor.complaint_visit_fee),
    can_configure: canConfigureComplaints(actor.role),
  };
}

// Vendor-wide money policy, so only a super-admin may change it.
export const canConfigureComplaints = (role: string) => role === "super-admin";

export async function updateComplaintSettings(actor: ComplaintActor, body: Record<string, unknown>) {
  if (!canConfigureComplaints(actor.role))
    throw new ComplaintError("Only a super-admin can change complaint settings.", 403);
  const fee = Number(body.visit_fee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 1_000_000 || Math.round(fee * 100) !== fee * 100)
    throw new ComplaintError("Enter a valid visiting charge (₹0 or more, up to 2 decimals).");
  const vendor = await prisma.vendorMaster.update({
    where: { id: actor.vendorId },
    data: { complaint_visit_fee: fee },
    select: { complaint_visit_fee: true },
  });
  return { visit_fee: Number(vendor.complaint_visit_fee) };
}

function leadForComplaintQuery(vendorId: number, leadCode: string) {
  return prisma.leadMaster.findFirst({
    where: {
      vendor_id: vendorId,
      is_deleted: false,
      lead_code: { equals: leadCode, mode: "insensitive" },
    },
    select: {
      id: true,
      lead_code: true,
      account_id: true,
      firstname: true,
      lastname: true,
      country_code: true,
      contact_no: true,
      alt_contact_no: true,
      email: true,
      site_address: true,
      usable_handover_completed_at: true,
      final_handover_marked_at: true,
      franchise_id: true,
    },
  });
}

// The supervisor already working the lead. LeadUserMapping is the current
// record; LeadSiteSupervisorMapping is the legacy one for site supervisors.
async function leadOwnSupervisor(
  vendorId: number,
  leadId: number,
  type: "site-supervisor" | "head-site-supervisor",
) {
  const mapping = await prisma.leadUserMapping.findFirst({
    where: { vendor_id: vendorId, lead_id: leadId, type, status: "active", user: { status: "active" } },
    orderBy: { created_at: "desc" },
    select: { user: { select: { id: true, user_name: true } } },
  });
  if (mapping || type === "head-site-supervisor") return mapping?.user ?? null;
  const legacy = await prisma.leadSiteSupervisorMapping.findFirst({
    where: { vendor_id: vendorId, lead_id: leadId, status: "active", supervisor: { status: "active" } },
    orderBy: { created_at: "desc" },
    select: { supervisor: { select: { id: true, user_name: true } } },
  });
  return legacy?.supervisor ?? null;
}

type Assignee = { id: number; name: string };

const SS_TYPES = ["site-supervisor", "site supervisor", "site_supervisor"];
const HSS_TYPES = ["head-site-supervisor", "head site supervisor", "head_site_supervisor"];

// Spec 1: the complaint goes to the SS (and HSS) already assigned to the lead.
// Only a lead without one falls back to whoever covers its franchise.
async function complaintAssigneeOptions(
  vendorId: number,
  lead: { id: number; franchise_id: number | null },
) {
  const franchiseId = lead.franchise_id;
  const userSelect = { id: true, user_name: true } as const;
  const [siteSupervisors, headSiteSupervisors] = franchiseId
    ? await Promise.all([
        prisma.userMaster.findMany({
          where: {
            vendor_id: vendorId,
            status: "active",
            user_type: { user_type: { in: SS_TYPES, mode: "insensitive" } },
            OR: [
              { franchise_id: franchiseId },
              { siteSupervisorFranchiseMappings: { some: { vendor_id: vendorId, franchise_id: franchiseId } } },
            ],
          },
          orderBy: { user_name: "asc" },
          select: userSelect,
        }),
        prisma.userMaster.findMany({
          where: {
            vendor_id: vendorId,
            status: "active",
            OR: [
              {
                headSiteSupervisorFranchiseMappings: {
                  some: { vendor_id: vendorId, franchise_id: franchiseId, status: true },
                },
              },
              {
                franchise_id: franchiseId,
                user_type: { user_type: { in: HSS_TYPES, mode: "insensitive" } },
              },
            ],
          },
          orderBy: { user_name: "asc" },
          select: userSelect,
        }),
      ])
    : [[], []];

  const toAssignee = (u: { id: number; user_name: string }): Assignee => ({ id: u.id, name: u.user_name });
  const [leadSs, leadHss] = await Promise.all([
    leadOwnSupervisor(vendorId, lead.id, "site-supervisor"),
    leadOwnSupervisor(vendorId, lead.id, "head-site-supervisor"),
  ]);
  return {
    siteSupervisors: (leadSs ? [leadSs] : siteSupervisors).map(toAssignee),
    headSiteSupervisors: (leadHss ? [leadHss] : headSiteSupervisors).map(toAssignee),
    leadSupervisorId: leadSs?.id ?? null,
  };
}

// One candidate is assigned automatically; several require an explicit pick.
function pickAssignee(options: Assignee[], rawId: unknown, label: string) {
  const id = optionalId(rawId, label);
  if (id) {
    if (!options.some((o) => o.id === id))
      throw new ComplaintError(`The selected ${label.toLowerCase()} is not assigned to this lead or its franchise.`);
    return id;
  }
  if (options.length > 1) throw new ComplaintError(`Select the ${label.toLowerCase()} for this complaint.`);
  return options[0]?.id ?? null;
}

const leadMobile = (lead: { country_code: string; contact_no: string }) =>
  [lead.country_code?.trim(), lead.contact_no?.trim()].filter(Boolean).join(" ");

export async function lookupLeadForComplaint(actor: ComplaintActor, rawLeadCode: unknown) {
  const leadCode = text(rawLeadCode, "Lead code", 100, true)!;
  const lead = await leadForComplaintQuery(actor.vendorId, leadCode);
  if (!lead) throw new ComplaintError("No CRM lead matches this lead code.", 404);
  if (!lead.account_id)
    throw new ComplaintError("This lead has no client account yet, so a complaint cannot be raised against it.");

  const [products, assignees, complaints] = await Promise.all([
    prisma.leadProductStructureInstance.findMany({
      where: { vendor_id: actor.vendorId, lead_id: lead.id, is_archived: false },
      orderBy: [{ product_type_id: "asc" }, { quantity_index: "asc" }],
      select: { id: true, title: true, productType: { select: { type: true } } },
    }),
    complaintAssigneeOptions(actor.vendorId, lead),
    prisma.complaintMaster.findMany({
      where: { vendor_id: actor.vendorId, lead_id: lead.id },
      orderBy: { created_at: "desc" },
      take: 10,
      select: { complaint_code: true, status: true, created_at: true, description: true },
    }),
  ]);

  return {
    lead_id: lead.id,
    lead_code: lead.lead_code,
    client_name: fullName(lead.firstname, lead.lastname),
    mobile: leadMobile(lead),
    alternate_mobile: lead.alt_contact_no,
    email: lead.email,
    site_address: lead.site_address,
    usable_handover_date: toDateOnly(lead.usable_handover_completed_at),
    final_handover_date: toDateOnly(lead.final_handover_marked_at),
    products: products.map((p) => ({
      instance_id: p.id,
      title: p.title,
      product_type: p.productType.type,
    })),
    site_supervisors: assignees.siteSupervisors,
    head_site_supervisors: assignees.headSiteSupervisors,
    // Preselected when the franchise has several candidates.
    default_site_supervisor_id: assignees.leadSupervisorId,
    existing_complaints: complaints,
  };
}

// Possible matches are only shown to HO; nothing is merged or rejected automatically.
export async function findPossibleDuplicates(
  vendorId: number,
  input: { mobile?: string | null; name?: string | null; address?: string | null },
) {
  const mobileKey = input.mobile ? lastTen(input.mobile) : "";
  const name = input.name?.trim();
  const address = input.address?.trim();
  const or: Prisma.ComplaintExternalClientWhereInput[] = [];
  if (mobileKey.length === 10) or.push({ mobile: { contains: mobileKey } });
  if (name && address)
    or.push({
      client_name: { equals: name, mode: "insensitive" },
      address: { contains: address.slice(0, 60), mode: "insensitive" },
    });
  if (or.length === 0) return { external_clients: [], leads: [] };

  const [externalClients, leads] = await Promise.all([
    prisma.complaintExternalClient.findMany({
      where: { vendor_id: vendorId, OR: or },
      take: 10,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        external_client_code: true,
        client_name: true,
        mobile: true,
        email: true,
        address: true,
        city: true,
        complaints: {
          orderBy: { created_at: "desc" },
          take: 5,
          select: { complaint_code: true, status: true, created_at: true },
        },
      },
    }),
    mobileKey.length === 10
      ? prisma.leadMaster.findMany({
          where: { vendor_id: vendorId, is_deleted: false, contact_no: { contains: mobileKey } },
          take: 5,
          select: { id: true, lead_code: true, firstname: true, lastname: true, site_address: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    external_clients: externalClients,
    leads: leads.map((l) => ({
      lead_id: l.id,
      lead_code: l.lead_code,
      client_name: fullName(l.firstname, l.lastname),
      site_address: l.site_address,
    })),
  };
}

export interface ComplaintUpload {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

function validateUploads(photos: ComplaintUpload[], videos: ComplaintUpload[]) {
  if (photos.length === 0) throw new ComplaintError("Add at least one photo of the issue.");
  if (photos.length > COMPLAINT_MAX_PHOTOS)
    throw new ComplaintError(`Add up to ${COMPLAINT_MAX_PHOTOS} photos.`);
  if (videos.length > COMPLAINT_MAX_VIDEOS)
    throw new ComplaintError(`Add up to ${COMPLAINT_MAX_VIDEOS} videos.`);
  for (const photo of photos) {
    if (!PHOTO_TYPES.includes(photo.mimetype) || photo.size > COMPLAINT_MAX_PHOTO_SIZE)
      throw new ComplaintError(`${photo.originalname}: upload a JPG, PNG, WEBP, GIF or HEIC photo up to 15 MB.`);
    if (!validFMFileSignature(photo.buffer, photo.mimetype))
      throw new ComplaintError(`${photo.originalname}: file contents do not match its format.`);
  }
  for (const video of videos) {
    if (!VIDEO_TYPES.includes(video.mimetype) || video.size > COMPLAINT_MAX_VIDEO_SIZE)
      throw new ComplaintError(`${video.originalname}: upload an MP4, MOV or WEBM video up to 50 MB.`);
    if (!validFMFileSignature(video.buffer, video.mimetype))
      throw new ComplaintError(`${video.originalname}: file contents do not match its format.`);
  }
}

type ClientMode = "CRM_LEAD" | "EXTERNAL";

export async function registerComplaint(
  actor: ComplaintActor,
  body: Record<string, unknown>,
  photos: ComplaintUpload[],
  videos: ComplaintUpload[],
) {
  if (!canRegisterComplaints(actor.role))
    throw new ComplaintError("Only the Complaint Department Head or a super-admin can register complaints.", 403);

  const mode = body.client_mode as ClientMode;
  if (mode !== "CRM_LEAD" && mode !== "EXTERNAL")
    throw new ComplaintError("Choose whether the client has a CRM lead code.");

  const component = body.component as ComplaintComponent;
  if (!Object.values(ComplaintComponent).includes(component))
    throw new ComplaintError("Select the affected component.");
  const categoryId = optionalId(body.category_id, "Complaint category");
  if (!categoryId) throw new ComplaintError("Select a complaint category.");
  const description = text(body.description, "Issue description", 10000, true)!;
  const additionalRemarks = text(body.additional_remarks, "Additional remarks", 10000);
  const preferredVisitDate = parseDate(body.preferred_visit_date, "Preferred visit date");
  validateUploads(photos, videos);

  const category = await prisma.complaintCategoryMaster.findFirst({
    where: { id: categoryId, vendor_id: actor.vendorId, is_active: true },
    select: { id: true },
  });
  if (!category) throw new ComplaintError("The selected complaint category is not available.");

  const vendor = await prisma.vendorMaster.findUniqueOrThrow({
    where: { id: actor.vendorId },
    select: { vendor_code: true },
  });

  // Resolve everything that does not need the transaction first, so a bad request
  // never uploads files.
  let leadContext: Awaited<ReturnType<typeof resolveLeadContext>> | null = null;
  let externalContext: Awaited<ReturnType<typeof resolveExternalContext>> | null = null;
  if (mode === "CRM_LEAD") leadContext = await resolveLeadContext(actor, body, component);
  else externalContext = await resolveExternalContext(actor, body);

  const uploaded: { key: string; file: ComplaintUpload; media: "PHOTO" | "VIDEO" }[] = [];
  try {
    for (const file of photos)
      uploaded.push({ key: await uploadComplaintFile(file.buffer, actor.vendorId, file.mimetype), file, media: "PHOTO" });
    for (const file of videos)
      uploaded.push({ key: await uploadComplaintFile(file.buffer, actor.vendorId, file.mimetype), file, media: "VIDEO" });

    return await prisma.$transaction(async (tx) => {
      let complaintCode: string;
      let sequenceNo: number;
      let externalClientId: number | null = null;

      if (leadContext) {
        await tx.$queryRaw`SELECT id FROM "LeadMaster" WHERE id = ${leadContext.leadId} FOR UPDATE`;
        const last = await tx.complaintMaster.aggregate({
          where: { vendor_id: actor.vendorId, lead_id: leadContext.leadId, client_type: "CRM_LEAD" },
          _max: { sequence_no: true },
        });
        sequenceNo = (last._max.sequence_no ?? 0) + 1;
        complaintCode = `CMP${sequenceNo}-${leadContext.leadCode}`;
      } else {
        const ext = externalContext!;
        if (ext.existingClientId) {
          externalClientId = ext.existingClientId;
        } else {
          await tx.$queryRaw`SELECT id FROM "VendorMaster" WHERE id = ${actor.vendorId} FOR UPDATE`;
          const clientCount = await tx.complaintExternalClient.count({ where: { vendor_id: actor.vendorId } });
          const prefix = (vendor.vendor_code || "SH").trim().toUpperCase();
          const client = await tx.complaintExternalClient.create({
            data: {
              vendor_id: actor.vendorId,
              external_client_code: `${prefix}XT-${clientCount + 1}`,
              client_name: ext.clientName,
              mobile: ext.mobile,
              alternate_mobile: ext.alternateMobile,
              email: ext.email,
              address: ext.siteAddress,
              city: ext.city,
              product_type: ext.productType,
              installation_date: ext.installationDate,
              created_by: actor.actorId,
            },
          });
          externalClientId = client.id;
        }
        await tx.$queryRaw`SELECT id FROM "ComplaintExternalClient" WHERE id = ${externalClientId} FOR UPDATE`;
        const client = await tx.complaintExternalClient.findUniqueOrThrow({
          where: { id: externalClientId },
          select: { external_client_code: true },
        });
        const last = await tx.complaintMaster.aggregate({
          where: { vendor_id: actor.vendorId, external_client_id: externalClientId },
          _max: { sequence_no: true },
        });
        sequenceNo = (last._max.sequence_no ?? 0) + 1;
        complaintCode = `CMP${sequenceNo}-${client.external_client_code}`;
      }

      const snapshot = leadContext ?? externalContext!;
      const assignedSsId = leadContext?.siteSupervisorId ?? null;
      const assignedHssId =
        leadContext?.headSiteSupervisorId ?? (actor.role === "head-site-supervisor" ? actor.actorId : null);

      const complaint = await tx.complaintMaster.create({
        data: {
          vendor_id: actor.vendorId,
          complaint_code: complaintCode,
          sequence_no: sequenceNo,
          registration_channel: "STAFF",
          client_type: mode,
          lead_id: leadContext?.leadId ?? null,
          account_id: leadContext?.accountId ?? null,
          instance_id: leadContext?.instanceId ?? null,
          external_client_id: externalClientId,
          client_name: snapshot.clientName,
          client_mobile: snapshot.mobile,
          client_alternate_mobile: snapshot.alternateMobile,
          client_email: snapshot.email,
          site_address: snapshot.siteAddress,
          city: externalContext?.city ?? null,
          product_type: snapshot.productType,
          component,
          category_id: category.id,
          description,
          additional_remarks: additionalRemarks,
          preferred_visit_date: preferredVisitDate,
          installation_date: externalContext?.installationDate ?? null,
          usable_handover_date: leadContext?.usableHandoverDate ?? null,
          final_handover_date: leadContext?.finalHandoverDate ?? null,
          possible_duplicate: snapshot.possibleDuplicate,
          assigned_ss_id: assignedSsId,
          assigned_hss_id: assignedHssId,
          raised_by_actor_type: "STAFF",
          raised_by_user_id: actor.actorId,
          status: "NEW",
        },
      });

      const cycle = await tx.complaintCycle.create({
        data: {
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_number: 1,
          opened_by_actor_type: "STAFF",
          opened_by_user_id: actor.actorId,
        },
      });
      await tx.complaintMaster.update({
        where: { id: complaint.id },
        data: { current_cycle_id: cycle.id },
      });

      await tx.complaintAttachment.createMany({
        data: uploaded.map(({ key, file, media }) => ({
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_id: cycle.id,
          storage_key: key,
          original_name: file.originalname.slice(0, 255),
          mime_type: file.mimetype,
          size_bytes: file.size,
          media_type: media,
          category: "REGISTRATION" as const,
          actor_type: "STAFF" as const,
          actor_user_id: actor.actorId,
        })),
      });

      const assignments = [
        assignedSsId && { role: "SITE_SUPERVISOR" as const, new_user_id: assignedSsId },
        assignedHssId && { role: "DEPARTMENT_HEAD" as const, new_user_id: assignedHssId },
      ].filter(Boolean) as { role: "SITE_SUPERVISOR" | "DEPARTMENT_HEAD"; new_user_id: number }[];
      if (assignments.length)
        await tx.complaintAssignment.createMany({
          data: assignments.map((a) => ({
            vendor_id: actor.vendorId,
            complaint_id: complaint.id,
            cycle_id: cycle.id,
            role: a.role,
            new_user_id: a.new_user_id,
            assigned_by_actor_type: "STAFF" as const,
            assigned_by: actor.actorId,
          })),
        });

      await tx.complaintActivityLog.create({
        data: {
          vendor_id: actor.vendorId,
          complaint_id: complaint.id,
          cycle_id: cycle.id,
          action: "COMPLAINT_REGISTERED",
          to_status: "NEW",
          actor_type: "STAFF",
          actor_user_id: actor.actorId,
          metadata: {
            photos: photos.length,
            videos: videos.length,
            possible_duplicate: snapshot.possibleDuplicate,
          },
        },
      });

      return {
        id: complaint.id,
        complaint_code: complaintCode,
        status: complaint.status,
        possible_duplicate: snapshot.possibleDuplicate,
      };
    });
  } catch (error) {
    await deleteWasabiObjects(uploaded.map((u) => u.key));
    throw error;
  }
}

async function resolveLeadContext(
  actor: ComplaintActor,
  body: Record<string, unknown>,
  component: ComplaintComponent,
) {
  const leadCode = text(body.lead_code, "Lead code", 100, true)!;
  const lead = await leadForComplaintQuery(actor.vendorId, leadCode);
  if (!lead) throw new ComplaintError("No CRM lead matches this lead code. Registration was not allowed.");
  if (!lead.account_id)
    throw new ComplaintError("This lead has no client account yet, so a complaint cannot be raised against it.");

  const instanceId = optionalId(body.instance_id, "Product");
  const products = await prisma.leadProductStructureInstance.findMany({
    where: { vendor_id: actor.vendorId, lead_id: lead.id, is_archived: false },
    select: { id: true, title: true, productType: { select: { type: true } } },
  });
  if (products.length > 0 && !instanceId) throw new ComplaintError("Select the affected product.");
  const product = instanceId ? products.find((p) => p.id === instanceId) : null;
  if (instanceId && !product) throw new ComplaintError("The selected product does not belong to this lead.");

  // Lead dates are authoritative; staff fill them only when the CRM has none.
  const usableHandoverDate =
    lead.usable_handover_completed_at ?? parseDate(body.usable_handover_date, "Usable handover date", true);
  const finalHandoverDate =
    lead.final_handover_marked_at ?? parseDate(body.final_handover_date, "Final handover date", true);

  const siteAddress = lead.site_address?.trim() || text(body.site_address, "Site address", 2000, true)!;
  const assignees = await complaintAssigneeOptions(actor.vendorId, lead);
  const siteSupervisorId = pickAssignee(assignees.siteSupervisors, body.site_supervisor_id, "Site supervisor");
  const headSiteSupervisorId = pickAssignee(
    assignees.headSiteSupervisors,
    body.head_site_supervisor_id,
    "Head site supervisor",
  );

  const openForSameProduct = await prisma.complaintMaster.count({
    where: {
      vendor_id: actor.vendorId,
      lead_id: lead.id,
      status: { notIn: FINISHED_STATUSES },
      ...(product ? { instance_id: product.id } : { component }),
    },
  });

  return {
    leadId: lead.id,
    leadCode: lead.lead_code,
    accountId: lead.account_id,
    instanceId: product?.id ?? null,
    clientName: fullName(lead.firstname, lead.lastname),
    mobile: leadMobile(lead),
    alternateMobile: lead.alt_contact_no,
    email: lead.email,
    siteAddress,
    productType: product ? `${product.productType.type} – ${product.title}` : null,
    usableHandoverDate,
    finalHandoverDate,
    siteSupervisorId,
    headSiteSupervisorId,
    possibleDuplicate: openForSameProduct > 0,
  };
}

async function resolveExternalContext(actor: ComplaintActor, body: Record<string, unknown>) {
  const existingClientId = optionalId(body.external_client_id, "External client");
  const clientName = text(body.client_name, "Client name", 200, true)!;
  const clientMobile = mobile(body.client_mobile, "Mobile number", true)!;
  const alternateMobile = mobile(body.client_alternate_mobile, "Alternate number");
  const email = text(body.client_email, "Email address", 320);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ComplaintError("Enter a valid email address.");
  const siteAddress = text(body.site_address, "Complete site address", 2000, true)!;
  const city = text(body.city, "City", 120, true)!;
  const productType = text(body.product_type, "Product type", 200, true)!;
  const installationDate = parseDate(body.installation_date, "Installation date");

  if (existingClientId) {
    const existing = await prisma.complaintExternalClient.findFirst({
      where: { id: existingClientId, vendor_id: actor.vendorId },
      select: { id: true },
    });
    if (!existing) throw new ComplaintError("The selected external client was not found.");
  }

  const duplicates = await findPossibleDuplicates(actor.vendorId, {
    mobile: clientMobile,
    name: clientName,
    address: siteAddress,
  });
  // Linking to a verified existing profile is the HO's call, so it is not a duplicate.
  const possibleDuplicate =
    !existingClientId && (duplicates.external_clients.length > 0 || duplicates.leads.length > 0);

  return {
    existingClientId,
    clientName,
    mobile: clientMobile,
    alternateMobile,
    email,
    siteAddress,
    city,
    productType,
    installationDate,
    possibleDuplicate,
  };
}

export async function listComplaints(actor: ComplaintActor, query: Record<string, unknown>) {
  if (!canViewComplaints(actor.role)) throw new ComplaintError("You do not have access to complaints.", 403);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const search = typeof query.search === "string" ? query.search.trim() : "";
  const statuses =
    typeof query.status === "string" && query.status
      ? (query.status.split(",").filter((s) =>
          Object.values(ComplaintStatus).includes(s as ComplaintStatus),
        ) as ComplaintStatus[])
      : [];

  const scope: Prisma.ComplaintMasterWhereInput = {
    vendor_id: actor.vendorId,
    ...(canViewAllComplaints(actor.role) ? {} : { assigned_ss_id: actor.actorId }),
  };
  const where: Prisma.ComplaintMasterWhereInput = {
    ...scope,
    ...(statuses.length ? { status: { in: statuses } } : {}),
    ...(search
      ? {
          OR: [
            { complaint_code: { contains: search, mode: "insensitive" } },
            { client_name: { contains: search, mode: "insensitive" } },
            { client_mobile: { contains: search } },
            { description: { contains: search, mode: "insensitive" } },
            { lead: { lead_code: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, rows, grouped] = await Promise.all([
    prisma.complaintMaster.count({ where }),
    prisma.complaintMaster.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        complaint_code: true,
        registration_channel: true,
        client_type: true,
        client_name: true,
        client_mobile: true,
        client_email: true,
        site_address: true,
        product_type: true,
        component: true,
        description: true,
        priority: true,
        status: true,
        possible_duplicate: true,
        created_at: true,
        lead: { select: { lead_code: true } },
        category: { select: { name: true } },
        assignedSS: { select: { id: true, user_name: true } },
        assignedHSS: { select: { id: true, user_name: true } },
        currentCycle: { select: { cycle_number: true } },
      },
    }),
    prisma.complaintMaster.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
  ]);

  return {
    rows: rows.map(({ lead, category, assignedSS, assignedHSS, currentCycle, ...row }) => ({
      ...row,
      lead_code: lead?.lead_code ?? null,
      category: category.name,
      assigned_ss: assignedSS ? { id: assignedSS.id, name: assignedSS.user_name } : null,
      assigned_hss: assignedHSS ? { id: assignedHSS.id, name: assignedHSS.user_name } : null,
      cycle_number: currentCycle?.cycle_number ?? 1,
    })),
    total,
    page,
    limit,
    status_counts: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
  };
}
