import { prisma } from "../../prisma/client";
import type { ClientTokenPayload } from "./auth.service";

type ServiceResponse = { status: number; body: Record<string, unknown> };

// Looked up live by email (not the token's lead_ids) so leads added after sign-in show up.
export const clientLeadsWhere = (client: ClientTokenPayload) => ({
  email: { equals: client.email, mode: "insensitive" as const },
  is_deleted: false,
  vendor: { is_furnixcrm_app_enabled: true, status: "active" },
});

const activeInstances = { is_archived: false };

export class MobileProjectsService {
  /** The client's leads, each with its product types and instance count. */
  async listProjects(client: ClientTokenPayload): Promise<ServiceResponse> {
    const leads = await prisma.leadMaster.findMany({
      where: clientLeadsWhere(client),
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        site_address: true,
        vendor: { select: { id: true, vendor_name: true } },
        statusType: { select: { type: true } },
        productMappings: {
          where: { is_archived: false },
          select: { productType: { select: { id: true, type: true } } },
          orderBy: { id: "asc" },
        },
        _count: { select: { productStructureInstances: { where: activeInstances } } },
      },
      orderBy: { created_at: "desc" },
    });

    return {
      status: 200,
      body: {
        projects: leads.map((lead) => ({
          id: lead.id,
          lead_code: lead.lead_code,
          name: `${lead.firstname} ${lead.lastname}`.trim(),
          site_address: lead.site_address,
          vendor: lead.vendor,
          stage: lead.statusType?.type ?? null,
          product_types: lead.productMappings.map((m) => m.productType),
          instance_count: lead._count.productStructureInstances,
        })),
      },
    };
  }

  /** Instances (product structures) of one of the client's leads. */
  async listInstances(client: ClientTokenPayload, leadId: number): Promise<ServiceResponse> {
    if (!Number.isInteger(leadId) || leadId <= 0) {
      return { status: 400, body: { message: "Invalid project." } };
    }

    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, ...clientLeadsWhere(client) },
      select: { id: true, statusType: { select: { type: true } } },
    });
    if (!lead) return { status: 404, body: { message: "Project not found." } };

    const instances = await prisma.leadProductStructureInstance.findMany({
      where: { lead_id: lead.id, ...activeInstances },
      select: {
        id: true,
        title: true,
        quantity_index: true,
        status: true,
        productType: { select: { id: true, type: true } },
        productStructure: { select: { id: true, type: true } },
        stageStatus: { select: { type: true } },
      },
      orderBy: [{ product_type_id: "asc" }, { product_structure_id: "asc" }, { quantity_index: "asc" }],
    });

    return {
      status: 200,
      body: {
        instances: instances.map((instance) => ({
          id: instance.id,
          title: instance.title,
          quantity_index: instance.quantity_index,
          status: instance.status,
          product_type: instance.productType,
          product_structure: instance.productStructure,
          // Regular vendors track the stage on the lead; large-scale ones per instance.
          stage: instance.stageStatus?.type ?? lead.statusType?.type ?? null,
        })),
      },
    };
  }
}
