import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { NotificationType, Prisma } from "../../../prisma/generated";
import logger from "../../../utils/logger";
import { NotificationService } from "../../../../src/services/notification/notification.service";
import { getFranchiseAdminRecipients } from "../../../../src/services/notification/adminRecipients.service";
import {
  sendOrderLoginEnabledEmail,
  sendRevisedDocumentsUploadedEmail,
} from "../../../../src/services/email/brevoEmail.service";
import { resolveLeadCode } from "../../../../src/utils/fileUtils";
import { STAGE_PATH_BY_TAG } from "../leadsGeneration/leadActivityStatus.service";
import { ensureLeadStatusLog } from "../../../utils/leadStatusLog";
import { createLeadLog } from "../../../utils/leadDetailedLog";

export type DocTypeTag = "Type 11" | "Type 12";

export interface CustomMulterFile {
  originalName: string;
  sysName: string;
  docTypeTag: DocTypeTag;
  productStructureInstanceId?: number;
}

export interface ClientDocumentationDto {
  lead_id: number;
  vendor_id: number;
  account_id: number;
  created_by: number;
  product_structure_instance_id?: number;
  documents: CustomMulterFile[];
  baseUrl: string;
}

export class ClientDocumentationService {
  public async createClientDocumentationStage(data: ClientDocumentationDto) {
    // ✅ Step 1: Run DB operations inside a short transaction
    const result = await prisma.$transaction(async (tx) => {
      const response: any = {
        documents: [],
        message: "Client documentation uploaded successfully",
      };

      const lead = await tx.leadMaster.findFirst({
        where: { id: data.lead_id, vendor_id: data.vendor_id },
        select: { account_id: true },
      });

      const effectiveAccountId =
        Number(data.account_id) > 0
          ? Number(data.account_id)
          : Number(lead?.account_id);

      if (!effectiveAccountId || effectiveAccountId <= 0) {
        throw new Error(
          `Account ID is missing or invalid for lead ${data.lead_id}`,
        );
      }

      // Insert lead documents
      for (const doc of data.documents) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: doc.docTypeTag },
        });

        if (!docType) {
          throw new Error(
            `Document type ${doc.docTypeTag} not found for vendor ${data.vendor_id}`,
          );
        }

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            created_by: data.created_by,
            doc_type_id: docType.id,
            account_id: effectiveAccountId,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
            product_structure_instance_id:
              doc.productStructureInstanceId ??
              data.product_structure_instance_id ??
              null,
          },
        });

        response.documents.push(docEntry);
      }

      // ✅ Update uploaded-doc count (instance-wise when available) ONLY for Client Documentation stage
      const resolvedInstanceId =
        data.product_structure_instance_id ??
        data.documents.find((doc) => doc.productStructureInstanceId)
          ?.productStructureInstanceId ??
        null;

      const [clientDocStatus, leadSnapshot, instanceSnapshot] =
        await Promise.all([
          tx.statusTypeMaster.findFirst({
            where: { vendor_id: data.vendor_id, tag: "Type 6" },
            select: { id: true },
          }),
          tx.leadMaster.findFirst({
            where: { id: data.lead_id, vendor_id: data.vendor_id },
            select: {
              id: true,
              status_id: true,
              no_of_client_documents_initially_submitted: true,
            },
          }),
          resolvedInstanceId
            ? tx.leadProductStructureInstance.findFirst({
                where: {
                  id: resolvedInstanceId,
                  lead_id: data.lead_id,
                  vendor_id: data.vendor_id,
                },
                select: {
                  id: true,
                  no_of_client_documents_initially_submitted: true,
                },
              })
            : Promise.resolve(null),
        ]);

      const isClientDocStage =
        !!clientDocStatus && leadSnapshot?.status_id === clientDocStatus.id;

      if (isClientDocStage) {
        if (!leadSnapshot?.no_of_client_documents_initially_submitted) {
          const currentDocCount = await tx.leadDocuments.count({
            where: {
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
              is_deleted: false,
              documentType: { tag: { in: ["Type 11", "Type 12"] } },
            },
          });

          await tx.leadMaster.update({
            where: { id: data.lead_id },
            data: {
              updated_at: new Date(),
              updated_by: data.created_by,
              no_of_client_documents_initially_submitted: currentDocCount,
            },
          });
        }

        if (
          resolvedInstanceId &&
          !instanceSnapshot?.no_of_client_documents_initially_submitted
        ) {
          const instanceDocCount = await tx.leadDocuments.count({
            where: {
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
              is_deleted: false,
              documentType: { tag: { in: ["Type 11", "Type 12"] } },
              product_structure_instance_id: resolvedInstanceId,
            },
          });

          await tx.leadProductStructureInstance.update({
            where: { id: resolvedInstanceId },
            data: {
              no_of_client_documents_initially_submitted: instanceDocCount,
              updated_at: new Date(),
              updated_by: data.created_by,
            },
          });
        }
      }

      // Add logs
      const docCount = response.documents.length;
      const plural = docCount > 1 ? "documents have" : "document has";
      const actionMessage = `Client Documentation Done Successfully and Lead Moved to Client Approval`;

      const detailedLog = await createLeadLog(tx, {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: effectiveAccountId,
        action: actionMessage,
        action_type: "CREATE",
        created_by: data.created_by,
        created_at: new Date(),
      });

      if (response.documents.length > 0) {
        const docLogsData = response.documents.map((doc: any) => ({
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: effectiveAccountId,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: data.created_by,
          created_at: new Date(),
        }));

        await tx.leadDocumentLogs.createMany({ data: docLogsData });
      }

      logger.info("✅ Client Documentation uploaded", {
        lead_id: data.lead_id,
        vendor_id: data.vendor_id,
        document_count: docCount,
        actionMessage,
      });

      return response;
    });
  }

  public async checkMoveToClientApprovalEligibility(params: {
    lead_id: number;
    vendor_id: number;
  }) {
    const { lead_id, vendor_id } = params;

    const lead = await prisma.leadMaster.findFirst({
      where: { id: lead_id, vendor_id, is_deleted: false },
      select: {
        id: true,
        is_blocked: true,
        lead_blocked_at: true,
        is_fast_production: true,
        createdBy: {
          select: {
            vendor: {
              select: { handlesLargeScaleProjects: true },
            },
          },
        },
        assignedTo: {
          select: {
            vendor: {
              select: { handlesLargeScaleProjects: true },
            },
          },
        },
      },
    });

    if (!lead) {
      throw new Error("Lead not found");
    }

    const vendor = await prisma.vendorMaster.findUnique({
      where: { id: vendor_id },
      select: { handlesLargeScaleProjects: true },
    });

    const handlesLargeScaleProjects =
      vendor?.handlesLargeScaleProjects === true ||
      lead.createdBy?.vendor?.handlesLargeScaleProjects === true ||
      lead.assignedTo?.vendor?.handlesLargeScaleProjects === true;

    const isFastProduction = lead.is_fast_production === true;
    const missing_requirements: string[] = [];

    if (lead.is_blocked) {
      missing_requirements.push(
        lead.lead_blocked_at
          ? `This lead has been blocked at ${lead.lead_blocked_at}`
          : "Lead is blocked",
      );
    }

    const [pptType, pythaType, instances, selections, fastProductionRequests, specifications] =
      await Promise.all([
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id, tag: "Type 11" },
          select: { id: true },
        }),
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id, tag: "Type 12" },
          select: { id: true },
        }),
        prisma.leadProductStructureInstance.findMany({
          where: { lead_id, vendor_id },
          select: {
            id: true,
            title: true,
            productType: { select: { id: true, type: true } },
            productStructure: { select: { id: true, type: true } },
            productItemCode: {
              select: {
                id: true,
                item_code: true,
                productStructure: {
                  select: { productType: { select: { id: true, type: true } } },
                },
              },
            },
          },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
        prisma.leadDesignSelection.findMany({
          where: {
            lead_id,
            vendor_id,
            type: { in: ["Carcas", "Shutter", "Handles"] },
          },
          select: {
            type: true,
            desc: true,
            product_structure_instance_id: true,
          },
        }),
        prisma.fastProductionRequest.findMany({
          where: { lead_id, vendor_id },
          select: {
            instance_id: true,
            finishes: {
              where: { component: "CARCASS" },
              select: { finish_description: true },
            },
          },
        }),
        prisma.leadSpecificationsMaster.findMany({
          where: { lead_id, vendor_id },
          select: {
            id: true,
            created_at: true,
            is_completed: true,
            item_code_id: true,
          },
          orderBy: { created_at: "asc" },
        }),
      ]);

    // 1. Large Scale Specifications Check (when handlesLargeScaleProjects is true)
    if (handlesLargeScaleProjects) {
      const itemCodeGroupMap = new Map<number, string>(
        instances
          .filter((inst) => inst.productItemCode)
          .map((inst) => [
            inst.productItemCode!.id,
            inst.productType?.type ||
              inst.productItemCode?.productStructure?.productType?.type ||
              "Other Specifications",
          ]),
      );

      const groupedDisplayMap = new Map<string, string>();
      instances.forEach((inst: any) => {
        const title =
          inst.productType?.type ||
          inst.productItemCode?.productStructure?.productType?.type ||
          inst.productItemCode?.item_code ||
          inst.title ||
          "Item Group";
        const key = title.trim().toLowerCase();
        if (!groupedDisplayMap.has(key)) {
          groupedDisplayMap.set(key, title);
        }
      });

      const latestSpecByGroup = new Map<string, any>();
      for (const spec of specifications) {
        const title =
          (spec.item_code_id ? itemCodeGroupMap.get(spec.item_code_id) : null) ||
          "Other Specifications";
        const key = title.trim().toLowerCase();
        const existing = latestSpecByGroup.get(key);
        if (!existing) {
          latestSpecByGroup.set(key, spec);
          continue;
        }
        const existingTime = new Date(existing.created_at).getTime();
        const currentTime = new Date(spec.created_at).getTime();
        if (
          currentTime > existingTime ||
          (currentTime === existingTime && spec.id > existing.id)
        ) {
          latestSpecByGroup.set(key, spec);
        }
      }

      const missingGroups: string[] = [];
      groupedDisplayMap.forEach((displayTitle, key) => {
        const latestSpec = latestSpecByGroup.get(key);
        if (latestSpec && !latestSpec.is_completed) {
          missingGroups.push(displayTitle);
        }
      });

      if (missingGroups.length > 0) {
        const prefix =
          missingGroups.length === 1
            ? "Complete specification review for"
            : "Complete specification review for all item groups:";
        const suffix =
          missingGroups.length === 1
            ? `${missingGroups[0]}. Approve, amend, or delete every row and mark the specification as completed.`
            : `${missingGroups.join(", ")}. Approve, amend, or delete every row and mark each latest specification as completed.`;
        missing_requirements.push(`${prefix} ${suffix}`);
      }
    }

    // 2. Design Selections Check (ONLY when handlesLargeScaleProjects is false)
    if (!handlesLargeScaleProjects) {
      const hasFilledValue = (value?: string | null) => {
        const normalized = (value || "").trim();
        return normalized.length > 0 && normalized.toUpperCase() !== "NULL";
      };

      const hasFastProductionCarcassByInstance = new Map(
        fastProductionRequests.map((request) => [
          request.instance_id,
          request.finishes.some((finish) =>
            hasFilledValue(finish.finish_description),
          ),
        ]),
      );

      let selectionsReady = true;
      if (instances.length > 1) {
        const leadLevelSelections = selections.filter(
          (row) => row.product_structure_instance_id === null,
        );

        for (const instance of instances) {
          let rows = selections.filter(
            (row) => row.product_structure_instance_id === instance.id,
          );
          if (rows.length === 0) {
            rows = leadLevelSelections;
          }

          const hasValueByType = {
            Carcas: rows.some(
              (row) => row.type === "Carcas" && hasFilledValue(row.desc),
            ),
            Shutter: rows.some(
              (row) => row.type === "Shutter" && hasFilledValue(row.desc),
            ),
          };

          if (isFastProduction) {
            if (!hasFastProductionCarcassByInstance.get(instance.id)) {
              selectionsReady = false;
              break;
            }
          } else {
            if (!hasValueByType.Carcas || !hasValueByType.Shutter) {
              selectionsReady = false;
              break;
            }
          }
        }
      } else {
        const hasValueByType = {
          Carcas: selections.some(
            (row) => row.type === "Carcas" && hasFilledValue(row.desc),
          ),
          Shutter: selections.some(
            (row) => row.type === "Shutter" && hasFilledValue(row.desc),
          ),
        };
        if (isFastProduction) {
          const instanceId = instances[0]?.id;
          if (!instanceId || !hasFastProductionCarcassByInstance.get(instanceId)) {
            selectionsReady = false;
          }
        } else {
          if (!hasValueByType.Carcas || !hasValueByType.Shutter) {
            selectionsReady = false;
          }
        }
      }

      if (!selectionsReady) {
        if (isFastProduction) {
          missing_requirements.push("Save Carcas for all instances");
        } else {
          missing_requirements.push("Save Carcas & Shutter for all instances");
        }
      }
    }

    // 3. Documents Check (PPT & Pytha)
    if (pptType && pythaType) {
      const docs = await prisma.leadDocuments.findMany({
        where: {
          lead_id,
          vendor_id,
          is_deleted: false,
          doc_type_id: { in: [pptType.id, pythaType.id] },
        },
        select: {
          doc_type_id: true,
          product_structure_instance_id: true,
        },
      });

      let docsReady = true;
      const missingDocGroups: string[] = [];

      if (handlesLargeScaleProjects && instances.length > 0) {
        const groupedMap = new Map<string, any[]>();
        instances.forEach((inst: any) => {
          const groupTitle =
            inst.productType?.type ||
            inst.productItemCode?.productStructure?.productType?.type ||
            inst.productItemCode?.item_code ||
            inst.title ||
            "Item Group";
          if (!groupedMap.has(groupTitle)) {
            groupedMap.set(groupTitle, []);
          }
          groupedMap.get(groupTitle)!.push(inst);
        });

        groupedMap.forEach((groupInsts, groupTitle) => {
          let pptCount = 0;
          let pythaCount = 0;
          groupInsts.forEach((inst) => {
            pptCount += docs.filter(
              (d) =>
                (d.product_structure_instance_id === inst.id ||
                  d.product_structure_instance_id === null) &&
                d.doc_type_id === pptType.id,
            ).length;
            pythaCount += docs.filter(
              (d) =>
                (d.product_structure_instance_id === inst.id ||
                  d.product_structure_instance_id === null) &&
                d.doc_type_id === pythaType.id,
            ).length;
          });

          if (pptCount === 0 || pythaCount === 0) {
            docsReady = false;
            missingDocGroups.push(groupTitle);
          }
        });

        if (!docsReady) {
          missing_requirements.push(
            `Please upload required files for item group(s): ${missingDocGroups.join(", ")}`,
          );
        }
      } else if (instances.length > 0) {
        for (const instance of instances) {
          const instanceTitle = (instance as any).title || (instance as any).productType?.type || "Item Group";
          const pptCount = docs.filter(
            (d) =>
              (d.product_structure_instance_id === instance.id ||
                d.product_structure_instance_id === null) &&
              d.doc_type_id === pptType.id,
          ).length;
          const pythaCount = docs.filter(
            (d) =>
              (d.product_structure_instance_id === instance.id ||
                d.product_structure_instance_id === null) &&
              d.doc_type_id === pythaType.id,
          ).length;
          if (pptCount === 0 || pythaCount === 0) {
            docsReady = false;
            missingDocGroups.push(instanceTitle);
          }
        }

        if (!docsReady) {
          missing_requirements.push(
            `Upload Project Files & Pytha Files for: ${missingDocGroups.join(", ")}`,
          );
        }
      } else {
        const pptCount = docs.filter((d) => d.doc_type_id === pptType.id).length;
        const pythaCount = docs.filter((d) => d.doc_type_id === pythaType.id).length;
        if (pptCount === 0 || pythaCount === 0) {
          docsReady = false;
          missing_requirements.push("Upload Project Files & Pytha Files for all instances");
        }
      }
    }

    return {
      can_move: missing_requirements.length === 0,
      missing_requirements,
      handlesLargeScaleProjects,
      isFastProduction,
    };
  }

  public async moveToClientApproval(data: {
    lead_id: number;
    vendor_id: number;
    updated_by: number;
    baseUrl: string;
  }) {
    const eligibility = await this.checkMoveToClientApprovalEligibility({
      lead_id: data.lead_id,
      vendor_id: data.vendor_id,
    });

    if (!eligibility.can_move) {
      throw new Error(
        eligibility.missing_requirements[0] ||
          "Lead cannot be moved to Client Approval due to incomplete requirements",
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.leadMaster.findFirst({
        where: {
          id: data.lead_id,

          vendor_id: data.vendor_id,
          is_deleted: false,
        },
        select: { id: true, account_id: true, is_fast_production: true },
      });
      if (!lead) {
        throw new Error("Lead not found");
      }
      if (!lead.account_id) {
        throw new Error("Lead account is missing");
      }

      const [
        clientApprovalStatus,
        pptType,
        pythaType,
        instances,
        selections,
        fastProductionRequests,
      ] =
        await Promise.all([
          tx.statusTypeMaster.findFirst({
            where: { vendor_id: data.vendor_id, tag: "Type 7" },
            select: { id: true },
          }),
          tx.documentTypeMaster.findFirst({
            where: { vendor_id: data.vendor_id, tag: "Type 11" },
            select: { id: true },
          }),
          tx.documentTypeMaster.findFirst({
            where: { vendor_id: data.vendor_id, tag: "Type 12" },
            select: { id: true },
          }),
          tx.leadProductStructureInstance.findMany({
            where: { lead_id: data.lead_id, vendor_id: data.vendor_id },
            select: { id: true, title: true },
            orderBy: [
              { product_structure_id: "asc" },
              { quantity_index: "asc" },
            ],
          }),

          
          tx.leadDesignSelection.findMany({
            where: {
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
              type: { in: ["Carcas", "Shutter", "Handles"] },
            },
            select: {
              type: true,
              desc: true,
              product_structure_instance_id: true,
            },
          }),
          tx.fastProductionRequest.findMany({
            where: {
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
            select: {
              instance_id: true,
              finishes: {
                where: { component: "CARCASS" },
                select: { finish_description: true },
              },
            },
          }),
        ]);

      if (!clientApprovalStatus) {
        throw new Error("Client Approval status (Type 7) not found");
      }
      if (!pptType || !pythaType) {
        throw new Error("Client documentation document types not configured");
      }

      const hasFilledValue = (value?: string | null) => {
        const normalized = (value || "").trim();
        return normalized.length > 0 && normalized.toUpperCase() !== "NULL";
      };

      const isFastProduction = lead.is_fast_production === true;

      // Fast-production finish remarks are submitted with the fast-production
      // request, not with the client-documentation design selections.
      const hasFastProductionCarcassByInstance = new Map(
        fastProductionRequests.map((request) => [
          request.instance_id,
          request.finishes.some((finish) =>
            hasFilledValue(finish.finish_description),
          ),
        ]),
      );

      if (!eligibility.handlesLargeScaleProjects) {
        if (instances.length > 1) {
          const leadLevelSelections = selections.filter(
            (row) => row.product_structure_instance_id === null,
          );

          for (const instance of instances) {
            let rows = selections.filter(
              (row) => row.product_structure_instance_id === instance.id,
            );

            // Fall back to lead-level selections if no instance-specific rows exist
            if (rows.length === 0) {
              rows = leadLevelSelections;
            }

            const hasValueByType = {
              Carcas: rows.some(
                (row) => row.type === "Carcas" && hasFilledValue(row.desc),
              ),
              Shutter: rows.some(
                (row) => row.type === "Shutter" && hasFilledValue(row.desc),
              ),
            };

            if (isFastProduction) {
              if (!hasFastProductionCarcassByInstance.get(instance.id)) {
                throw new Error(
                  `Carcas must be filled for ${instance.title}`,
                );
              }
            } else {
              if (!hasValueByType.Carcas || !hasValueByType.Shutter) {
                throw new Error(
                  `Carcas and Shutter must be filled for ${instance.title}`,
                );
              }
            }
          }
        } else {
          const hasValueByType = {
            Carcas: selections.some(
              (row) => row.type === "Carcas" && hasFilledValue(row.desc),
            ),
            Shutter: selections.some(
              (row) => row.type === "Shutter" && hasFilledValue(row.desc),
            ),
          };
          if (isFastProduction) {
            const instanceId = instances[0]?.id;
            if (
              !instanceId ||
              !hasFastProductionCarcassByInstance.get(instanceId)
            ) {
              throw new Error("Carcas must be filled");
            }
          } else {
            if (!hasValueByType.Carcas || !hasValueByType.Shutter) {
              throw new Error("Carcas and Shutter must be filled");
            }
          }
        }
      }

      const docs = await tx.leadDocuments.findMany({
        where: {
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
          is_deleted: false,
          doc_type_id: { in: [pptType.id, pythaType.id] },
        },
        select: {
          doc_type_id: true,
          product_structure_instance_id: true,
        },
      });

      if (eligibility.handlesLargeScaleProjects) {
        const hasPpt = docs.some((d) => d.doc_type_id === pptType.id);
        const hasPytha = docs.some((d) => d.doc_type_id === pythaType.id);
        if (!hasPpt || !hasPytha) {
          throw new Error(
            "Both Project Files and Pytha Design Files are required before moving stage",
          );
        }
      } else if (instances.length > 1) {
        for (const instance of instances) {
          const pptCount = docs.filter(
            (d) =>
              (d.product_structure_instance_id === instance.id ||
                d.product_structure_instance_id === null) &&
              d.doc_type_id === pptType.id,
          ).length;
          const pythaCount = docs.filter(
            (d) =>
              (d.product_structure_instance_id === instance.id ||
                d.product_structure_instance_id === null) &&
              d.doc_type_id === pythaType.id,
          ).length;
          if (pptCount === 0 || pythaCount === 0) {
            throw new Error(
              `Both Project Files and Pytha Design Files are required for ${instance.title}`,
            );
          }
        }
      } else {
        const pptCount = docs.filter(
          (d) => d.doc_type_id === pptType.id,
        ).length;
        const pythaCount = docs.filter(
          (d) => d.doc_type_id === pythaType.id,
        ).length;
        if (pptCount === 0 || pythaCount === 0) {
          throw new Error(
            "Both Project Files and Pytha Design Files are required before moving stage",
          );
        }
      }

      await tx.leadMaster.update({
        where: { id: data.lead_id },
        data: {
          status_id: clientApprovalStatus.id,
          updated_by: data.updated_by,
          updated_at: new Date(),
        },
      });

      await ensureLeadStatusLog(tx, {
        vendorId: data.vendor_id,
        leadId: data.lead_id,
        accountId: lead.account_id,
        statusId: clientApprovalStatus.id,
        createdBy: data.updated_by,
      });

      await createLeadLog(tx, {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: lead.account_id,
        action: `Lead has been moved to Client Approval stage.`,
        action_type: "UPDATE",
        created_by: data.updated_by,
        created_at: new Date(),
      });

      return { moved: true, status_id: clientApprovalStatus.id };
    });

    // ===============================
    // CLIENT APPROVAL STAGE → ADMIN NOTIFICATION ✅
    // ===============================
    try {
      const leadInfo = await prisma.leadMaster.findUnique({
        where: { id: data.lead_id },
        select: {
          firstname: true,
          lastname: true,
          lead_code: true,
          vendor_id: true,
          account_id: true,
          franchise_id: true,
        },
      });

      if (!leadInfo) return result;

      const actor = await prisma.userMaster.findUnique({
        where: { id: data.updated_by },
        select: { user_name: true },
      });

      const leadName =
        `${leadInfo.firstname ?? ""} ${leadInfo.lastname ?? ""}`.trim();
      const leadCode =
        leadInfo.lead_code ?? `LEAD-${String(data.lead_id).padStart(4, "0")}`;
      const movedBy = actor?.user_name ?? "System";

      // ✅ Correct route
      const redirectPath = `/dashboard/leads/deails/${data.lead_id}?accountId=${leadInfo.account_id}`;

      // Fetch active admins
      const { recipients: admins, isSuperAdminFallback } = await getFranchiseAdminRecipients({
        vendorId: leadInfo.vendor_id,
        franchiseId: leadInfo.franchise_id ?? null,
        excludeUserId: data.updated_by,
      });

      for (const admin of admins) {
        // 🔔 In-App Notification
        await NotificationService.createAndSend({
          vendor_id: leadInfo.vendor_id,
          user_id: admin.id,
          sender_id: data.updated_by,
          type: NotificationType.LEAD_MILESTONE,
          title: "Lead Moved to Client Approval",
          message: `${leadCode} - ${leadName} moved to Client Approval stage by ${movedBy}.`,
          entity_type: "lead",
          entity_id: data.lead_id,
          redirect_url: redirectPath,
        });

      }

      logger.info("✅ Client Approval admin notifications sent", {
        vendor_id: leadInfo.vendor_id,
        lead_id: data.lead_id,
        admin_count: admins.length,
      });
    } catch (notifyErr: any) {
      logger.warn("⚠️ Client Approval admin notification failed", {
        lead_id: data.lead_id,
        error: notifyErr?.message,
      });
    }

    return result;
  }

  public async canMoveToOrderLoginButtonEnabled(
    vendorId: number,
    leadId: number,
  ) {
    if (!vendorId || !leadId) {
      throw new Error("vendorId and leadId are required");
    }

    // 1️⃣ Fetch vendor and lead with documents
    const [vendor, lead, productStructureInstances] = await Promise.all([
      prisma.vendorMaster.findUnique({
        where: { id: vendorId },
        select: { handlesLargeScaleProjects: true },
      }),
      prisma.leadMaster.findFirst({
        where: {
          id: leadId,
          vendor_id: vendorId,
          is_deleted: false,
        },
        include: {
          documents: {
            where: { is_deleted: false },
            include: {
              documentType: true, // Type 11 (PPT) / Type 12 (PYTHA)
            },
          },
        },
      }),
      prisma.leadProductStructureInstance.findMany({
        where: { lead_id: leadId, vendor_id: vendorId },
        select: {
          id: true,
          title: true,
          product_type_id: true,
          productType: { select: { id: true, type: true } },
          productStructure: { select: { id: true, type: true, product_type_id: true } },
        },
      }),
    ]);

    if (!lead) {
      throw new Error("Lead not found");
    }

    const handlesLargeScaleProjects = vendor?.handlesLargeScaleProjects === true;
    const docs = lead.documents ?? [];
    const requiredCount = lead.no_of_client_documents_initially_submitted ?? 0;

    // =====================================================
    // ✅ STATUS-BASED CLASSIFICATION
    // =====================================================
    const approvedDocs = docs.filter((d) => d.tech_check_status === "APPROVED");
    const pendingDocs = docs.filter(
      (d) =>
        !d.tech_check_status ||
        d.tech_check_status === "PENDING" ||
        d.tech_check_status === "REVISED",
    );

    // =====================================================
    // 🏢 LARGE SCALE PROJECTS FLOW (ALL ITEM GROUPS MUST BE APPROVED)
    // =====================================================
    if (handlesLargeScaleProjects) {
      const instanceToProductTypeMap = new Map<number, number>();
      const productTypeMap = new Map<number, string>();

      productStructureInstances.forEach((inst: any) => {
        const pTypeId =
          inst.product_type_id ||
          inst.productType?.id ||
          inst.productStructure?.product_type_id;

        if (pTypeId) {
          const typeName =
            inst.productType?.type ||
            inst.productStructure?.type ||
            inst.title ||
            `Item Group #${pTypeId}`;

          if (!productTypeMap.has(Number(pTypeId))) {
            productTypeMap.set(Number(pTypeId), typeName);
          }

          if (inst.id) {
            instanceToProductTypeMap.set(Number(inst.id), Number(pTypeId));
          }
        }
      });

      // ❌ Check 1: If there are unapproved / pending documents across any item group
      if (pendingDocs.length > 0) {
        return {
          allowed: false,
          reason:
            "You have pending/unapproved client documents. Please review and approve all documents across all item groups before moving to Order Login.",
        };
      }

      // ❌ Check 2: Verify each unique Product Type (Item Group) has approved PPT & Pytha
      for (const [pTypeId, typeName] of productTypeMap.entries()) {
        const groupDocs = docs.filter((d: any) => {
          if (d.product_type_id && Number(d.product_type_id) === pTypeId) {
            return true;
          }
          if (
            d.product_structure_instance_id &&
            instanceToProductTypeMap.get(Number(d.product_structure_instance_id)) === pTypeId
          ) {
            return true;
          }
          return false;
        });

        const groupApprovedPPT = groupDocs.filter(
          (d: any) =>
            d.tech_check_status === "APPROVED" && d.documentType?.tag === "Type 11",
        ).length;

        const groupApprovedPytha = groupDocs.filter(
          (d: any) =>
            d.tech_check_status === "APPROVED" && d.documentType?.tag === "Type 12",
        ).length;

        if (groupApprovedPPT === 0) {
          return {
            allowed: false,
            reason: `Item group "${typeName}" requires at least one approved PPT file before moving to Order Login.`,
          };
        }

        if (groupApprovedPytha === 0) {
          return {
            allowed: false,
            reason: `Item group "${typeName}" requires at least one approved Pytha file before moving to Order Login.`,
          };
        }
      }

      return {
        allowed: true,
        reason: null,
      };
    }

    // =====================================================
    // ⚙️ NORMAL SINGLE/MULTI-INSTANCE FLOW
    // =====================================================
    const approvedPPT = approvedDocs.filter(
      (d) => d.documentType?.tag === "Type 11", // PPT
    ).length;

    const approvedPytha = approvedDocs.filter(
      (d) => d.documentType?.tag === "Type 12", // PYTHA
    ).length;

    if (requiredCount && approvedDocs.length < requiredCount) {
      return {
        allowed: false,
        reason: `You must approve all initially submitted client documents (${requiredCount}) before moving to Order Login.`,
      };
    }

    if (approvedPPT === 0) {
      return {
        allowed: false,
        reason:
          "At least one PPT file must be approved before moving to Order Login.",
      };
    }

    if (approvedPytha === 0) {
      return {
        allowed: false,
        reason:
          "At least one Pytha file must be approved before moving to Order Login.",
      };
    }

    if (pendingDocs.length > 0) {
      return {
        allowed: false,
        reason:
          "You still have pending documents. Please review all before proceeding.",
      };
    }

    return {
      allowed: true,
      reason: null,
    };
  }

  public async triggerOrderLoginEnabledNotification(
    vendorId: number,
    leadId: number,
    triggeredByUserId: number,
    baseUrl: string,
    instanceId?: number, // ✅ optional — instance ke basis pe leadCode aur redirectPath banenge
  ) {
    // 1️⃣ Eligibility check
    const eligibility = await this.canMoveToOrderLoginButtonEnabled(
      vendorId,
      leadId,
    );

    if (!eligibility.allowed) return;

    // 2️⃣ Fetch Order Login stage (Type 8)
    const orderLoginStage = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 8",
      },
      select: { id: true },
    });

    if (!orderLoginStage) return;

    // 3️⃣ Fetch lead (WITH status)
    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId },
      select: {
        lead_code: true,
        firstname: true,
        lastname: true,
        status_id: true,
        account_id: true,
      },
    });

    if (!lead) return;

    // 🔒 HARD GUARD — ONLY TYPE 8
    if (lead.status_id !== orderLoginStage.id) {
      return;
    }

    const leadCode = await resolveLeadCode(vendorId, leadId, instanceId);

    const leadName = `${lead.firstname ?? ""} ${lead.lastname ?? ""}`.trim();

    // 5️⃣ Triggered-by user name
    const triggeredByUser = await prisma.userMaster.findFirst({
      where: { id: triggeredByUserId },
      select: { user_name: true },
    });

    const approvedBy = triggeredByUser?.user_name ?? "System";

    // 6️⃣ Target user (sales-executive)
    const mapping = await prisma.leadUserMapping.findFirst({
      where: {
        vendor_id: vendorId,
        lead_id: leadId,
        status: "active",
        user: {
          user_type: {
            user_type: {
              equals: "sales-executive",
              mode: "insensitive",
            },
          },
        },
      },
      select: {
        user: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
          },
        },
      },
    });

    if (!mapping?.user) return;

    const targetUser = mapping.user;

    // 4️⃣ Duplicate protection (per recipient)
    const alreadySent = await prisma.notification.findFirst({
      where: {
        vendor_id: vendorId,
        entity_type: "lead",
        entity_id: leadId,
        type: NotificationType.LEAD_ACTION,
        title: "Order Login Enabled",
        user_id: targetUser.id,
      },
    });

    if (alreadySent) return;

    // ✅ redirectPath — accountId + instance_id (optional) dono include
    const queryParams = new URLSearchParams();
    if (lead.account_id && lead.account_id > 0) {
      queryParams.set("accountId", String(lead.account_id));
    }
    if (instanceId) {
      queryParams.set("instance_id", String(instanceId));
    }
    const queryString = queryParams.toString();
    const redirectPath = `/dashboard/leads/details/${leadId}${queryString ? `?${queryString}` : ""}`;

    const projectUrl = `${baseUrl}${redirectPath}`;

    // 7️⃣ In-app notification
    await NotificationService.createAndSend({
      vendor_id: vendorId,
      user_id: targetUser.id,
      sender_id: triggeredByUserId,
      type: NotificationType.LEAD_ACTION,
      title: "Order Login Enabled",
      message: `${leadCode} - Order Login is now enabled`,
      entity_type: "lead",
      entity_id: leadId,
      redirect_url: redirectPath,
    });

    // 8️⃣ Email
    if (targetUser.user_email) {
      await sendOrderLoginEnabledEmail({
        vendor_id: vendorId,
        toEmail: targetUser.user_email,
        toName: targetUser.user_name,
        leadCode, // ✅ vloq-46.1 ya vloq-46
        leadName,
        approvedBy,
        approvedAt: new Date().toLocaleString("en-IN"),
        projectUrl, // ✅ instance_id included
      });
    }

    logger.info("ORDER LOGIN ENABLED NOTIFICATION SENT", {
      vendorId,
      leadId,
      approvedBy,
    });
  }

  public async getClientDocumentation(
    vendorId: number,
    leadId: number,
    userId: number,
    baseUrl: string,
    instanceId?: number,
    productTypeId?: number,
  ) {
    if (!vendorId || !leadId) {
      throw new Error("vendorId and leadId are required");
    }

    logger.info("[ClientDocumentation:getClientDocumentation] START", {
      leadId,
      vendorId,
      userId,
      instanceId: instanceId ?? null,
      productTypeId: productTypeId ?? null,
    });

    const [pptDocType, pythaDocType, productStructureInstances, lead] =
      await Promise.all([
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id: vendorId, tag: "Type 11" }, // PPT
        }),
        prisma.documentTypeMaster.findFirst({
          where: { vendor_id: vendorId, tag: "Type 12" }, // PYTHA
        }),
        prisma.leadProductStructureInstance.findMany({
          where: { lead_id: leadId, vendor_id: vendorId },
          select: {
            id: true,
            title: true,
            quantity_index: true,
            no_of_client_documents_initially_submitted: true,
            product_type_id: true,
            productType: { select: { id: true, type: true } },
            productStructure: { select: { id: true, type: true, product_type_id: true } },
          },
          orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
        }),
        prisma.leadMaster.findFirst({
          where: {
            id: leadId,
            vendor_id: vendorId,
          },
          include: {
            documents: {
              include: {
                documentType: true, // To easily identify Type 11 / Type 12
              },
              where: {
                is_deleted: false,
              },
            },
          },
        }),
      ]);

    if (!lead) {
      logger.error("[ClientDocumentation:getClientDocumentation] Lead not found", { leadId, vendorId });
      throw new Error("Lead not found");
    }

    logger.info("[ClientDocumentation:getClientDocumentation] Lead fetched", {
      leadId,
      vendorId,
      leadStatus: lead.status_id,
      totalDocuments: lead.documents.length,
      pptDocTypeId: pptDocType?.id ?? null,
      pythaDocTypeId: pythaDocType?.id ?? null,
      instanceCount: productStructureInstances.length,
      instanceIds: productStructureInstances.map((i) => i.id),
      productTypeId: productTypeId ?? null,
    });

    const instanceToProductTypeMap = new Map<number, number>();
    productStructureInstances.forEach((inst: any) => {
      const pTypeId =
        inst.product_type_id ||
        inst.productType?.id ||
        inst.productStructure?.product_type_id;
      if (inst.id && pTypeId) {
        instanceToProductTypeMap.set(inst.id, Number(pTypeId));
      }
    });

    const isDocMatchProductType = (doc: any) => {
      if (!productTypeId) return true;
      if (doc.product_type_id && Number(doc.product_type_id) === Number(productTypeId)) {
        return true;
      }
      if (doc.product_structure_instance_id) {
        const instPTypeId = instanceToProductTypeMap.get(doc.product_structure_instance_id);
        if (instPTypeId && Number(instPTypeId) === Number(productTypeId)) {
          return true;
        }
      }
      return false;
    };

    const pptDocs = lead.documents.filter(
      (d) => d.doc_type_id === pptDocType?.id && isDocMatchProductType(d),
    );

    const pythaDocs = lead.documents.filter(
      (d) => d.doc_type_id === pythaDocType?.id && isDocMatchProductType(d),
    );

    const [pptDocsWithUrls, pythaDocsWithUrls] = await Promise.all([
      Promise.all(
        pptDocs.map(async (doc: any) => ({
          ...doc,
          signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        })),
      ),
      Promise.all(
        pythaDocs.map(async (doc: any) => ({
          ...doc,
          signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        })),
      ),
    ]);

    const documentsByInstance: any[] = productStructureInstances.map(
      (instance) => ({
        instance_id: instance.id,
        instance_title: instance.title,
        quantity_index: instance.quantity_index,
        product_structure: instance.productStructure,
        documents: {
          ppt: pptDocsWithUrls.filter(
            (doc: any) => doc.product_structure_instance_id === instance.id,
          ),
          pytha: pythaDocsWithUrls.filter(
            (doc: any) => doc.product_structure_instance_id === instance.id,
          ),
        },
      }),
    );

    const unassignedPpt = pptDocsWithUrls.filter(
      (doc: any) => !doc.product_structure_instance_id,
    );
    const unassignedPytha = pythaDocsWithUrls.filter(
      (doc: any) => !doc.product_structure_instance_id,
    );
    if (unassignedPpt.length || unassignedPytha.length) {
      documentsByInstance.push({
        instance_id: null,
        instance_title: "General",
        quantity_index: null,
        product_structure: null,
        documents: {
          ppt: unassignedPpt,
          pytha: unassignedPytha,
        },
      });
    }

    // const sectionCardsByInstance = documentsByInstance.map((group: any) => {
    //   const projectCount = group.documents?.ppt?.length || 0;
    //   const pythaCount = group.documents?.pytha?.length || 0;
    //   return {
    //     instance_id: group.instance_id,
    //     instance_title: group.instance_title,
    //     sections: [
    //       {
    //         key: "project",
    //         title: "Client Documentation - Project Files",
    //         total_files: projectCount,
    //         can_view: projectCount > 0,
    //         status: projectCount > 0 ? "uploaded" : "pending",
    //       },
    //       {
    //         key: "pytha",
    //         title: "Client Documentation - Pytha Design Files",
    //         total_files: pythaCount,
    //         can_view: pythaCount > 0,
    //         status: pythaCount > 0 ? "uploaded" : "pending",
    //       },
    //     ],
    //   };
    // });

    logger.info("[ClientDocumentation:getClientDocumentation] documents_by_instance built", {
      leadId,
      vendorId,
      instanceCount: productStructureInstances.length,
      totalPptDocs: pptDocsWithUrls.length,
      totalPythaDocs: pythaDocsWithUrls.length,
      unassignedPptCount: unassignedPpt.length,
      unassignedPythaCount: unassignedPytha.length,
      documentsByInstanceLength: documentsByInstance.length,
      documentsByInstanceSummary: documentsByInstance.map((g) => ({
        instance_id: g.instance_id,
        instance_title: g.instance_title,
        pptCount: g.documents?.ppt?.length ?? 0,
        pythaCount: g.documents?.pytha?.length ?? 0,
      })),
    });

    const sectionCardsByInstance = documentsByInstance.map((group: any) => {
      const projectCount = group.documents?.ppt?.length || 0;
      const pythaCount = group.documents?.pytha?.length || 0;
      return {
        instance_id: group.instance_id,
        instance_title: group.instance_title,
        sections: [
          {
            key: "project",
            title: "Client Documentation - Project Files",
            total_files: projectCount,
            can_view: projectCount > 0,
            status: projectCount > 0 ? "uploaded" : "pending",
          },
          {
            key: "pytha",
            title: "Client Documentation - Pytha Design Files",
            total_files: pythaCount,
            can_view: pythaCount > 0,
            status: pythaCount > 0 ? "uploaded" : "pending",
          },
        ],
      };
    });

    // 🔔 SAFE TRIGGER (read-through side effect)
    try {
      await this.triggerOrderLoginEnabledNotification(
        vendorId,
        leadId,
        userId,
        baseUrl,
        instanceId,
      );
    } catch (notifyErr: any) {
      logger.warn("[ClientDocumentation:getClientDocumentation] triggerOrderLoginEnabledNotification failed (non-fatal)", {
        leadId,
        vendorId,
        error: notifyErr?.message,
      });
    }

    return {
      id: lead.id,
      vendor_id: lead.vendor_id,
      status_id: lead.status_id,
      instance_count: productStructureInstances.length,
      product_structure_instances: productStructureInstances,
      documents: {
        ppt: pptDocsWithUrls,
        pytha: pythaDocsWithUrls,
      },
      documents_by_instance: documentsByInstance,
      section_cards_by_instance: sectionCardsByInstance,
    };
  }

  public async getLeadsWithStatusClientDocumentation(
    vendorId: number,
    userId: number,
  ) {
    // 1. Resolve status ID dynamically for Type 6
    const clientDocStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 6" },
      select: { id: true },
    });

    if (!clientDocStatus) {
      throw new Error(
        `Client Documentation status (Type 6) not found for vendor ${vendorId}`,
      );
    }

    // 2. Check if user is admin
    const creator = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });
    const isAdmin = creator?.user_type?.user_type?.toLowerCase() === "admin";

    // ============= Admin Flow =============
    if (isAdmin) {
      return prisma.leadMaster.findMany({
        where: {
          vendor_id: vendorId,
          is_deleted: false,
          status_id: clientDocStatus.id,
          activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
        },
        include: this.defaultIncludes(),
        orderBy: { created_at: Prisma.SortOrder.desc },
      });
    }

    // ============= Non-Admin Flow =============
    // Leads via LeadUserMapping
    const mappedLeads = await prisma.leadUserMapping.findMany({
      where: { vendor_id: vendorId, user_id: userId, status: "active" },
      select: { lead_id: true },
    });

    // Leads via UserLeadTask
    const taskLeads = await prisma.userLeadTask.findMany({
      where: {
        vendor_id: vendorId,
        OR: [{ created_by: userId }, { user_id: userId }],
      },
      select: { lead_id: true },
    });

    // ✅ Union
    const leadIds = [
      ...new Set([
        ...mappedLeads.map((m) => m.lead_id),
        ...taskLeads.map((t) => t.lead_id),
      ]),
    ];
    if (!leadIds.length) return [];

    return prisma.leadMaster.findMany({
      where: {
        id: { in: leadIds },
        vendor_id: vendorId,
        is_deleted: false,
        status_id: clientDocStatus.id,
        activity_status: { in: ["onGoing", "lostApproval"] }, // ✅ allow both
      },
      include: this.defaultIncludes(),
      orderBy: { created_at: Prisma.SortOrder.desc },
    });
  }

  // ✅ Common include
  private defaultIncludes() {
    return {
      siteType: true,
      source: true,
      statusType: true,
      createdBy: { select: { id: true, user_name: true } },
      updatedBy: true,
      assignedTo: { select: { id: true, user_name: true } },
      assignedBy: { select: { id: true, user_name: true } },
      productMappings: {
        select: {
          productType: { select: { id: true, type: true, tag: true } },
        },
      },
      leadProductStructureMapping: {
        select: { productStructure: { select: { id: true, type: true } } },
      },
      documents: {
        where: { is_deleted: false },
        include: {
          documentType: { select: { id: true, type: true, tag: true } },
          createdBy: { select: { id: true, user_name: true } },
        },
      },
      tasks: {
        where: { task_type: "Follow Up" },
        select: {
          id: true,
          task_type: true,
          due_date: true,
          remark: true,
          status: true,
          created_at: true,
        },
        orderBy: { created_at: Prisma.SortOrder.desc }, // ✅ fixed typing
      },
    };
  }

  public async addMoreClientDocumentation(data: ClientDocumentationDto) {
    // ==================================================
    // 1️⃣ CORE DB TRANSACTION (UPLOAD + LOGS)
    // ==================================================

    const result = await prisma.$transaction(async (tx) => {
      const response: any = {
        documents: [],
        message: "Additional client documentation uploaded successfully",
      };

      const lead = await tx.leadMaster.findFirst({
        where: { id: data.lead_id, vendor_id: data.vendor_id },
        select: { account_id: true },
      });

      const effectiveAccountId =
        Number(data.account_id) > 0
          ? Number(data.account_id)
          : Number(lead?.account_id);

      if (!effectiveAccountId || effectiveAccountId <= 0) {
        throw new Error(
          `Account ID is missing or invalid for lead ${data.lead_id}`,
        );
      }

      for (const doc of data.documents) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: doc.docTypeTag },
          select: { id: true },
        });

        if (!docType) {
          throw new Error(`Document type ${doc.docTypeTag} not configured`);
        }

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            created_by: data.created_by,
            doc_type_id: docType.id,
            account_id: effectiveAccountId,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
            tech_check_status: "REVISED",
            product_structure_instance_id:
              doc.productStructureInstanceId ??
              data.product_structure_instance_id ??
              null,
          },
        });

        response.documents.push(docEntry);
      }

      const docCount = response.documents.length;

      const detailedLog = await createLeadLog(tx, {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: effectiveAccountId,
        action: `${docCount} additional Client Documentation uploaded.`,
        action_type: "UPLOAD",
        created_by: data.created_by,
      });

      await tx.leadDocumentLogs.createMany({
        data: response.documents.map((doc: any) => ({
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: effectiveAccountId,
          doc_id: doc.id,
          lead_logs_id: detailedLog.id,
          created_by: data.created_by,
        })),
      });

      return { ...response, docCount };
    });

    // ==================================================
    // 2️⃣ LEAD STAGE CHECK → ONLY TECH CHECK (TYPE 8)
    // ==================================================

    const lead = await prisma.leadMaster.findUnique({
      where: { id: data.lead_id },
      select: {
        id: true,
        lead_code: true,
        firstname: true,
        lastname: true,
        account_id: true,
        status_id: true,
      },
    });

    if (!lead) return result;

    const leadStatus = await prisma.statusTypeMaster.findUnique({
      where: { id: lead.status_id ?? 0 },
      select: { tag: true },
    });

    if (leadStatus?.tag !== "Type 8") {
      return result;
    }

    const leadCode = await resolveLeadCode(
      data.vendor_id,
      data.lead_id,
      data.product_structure_instance_id ?? undefined,
    );

    const leadName = `${lead.firstname} ${lead.lastname}`.trim();

    const uploadedBy = await prisma.userMaster.findUnique({
      where: { id: data.created_by },
      select: { user_name: true },
    });

    const uploadedAt = new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    // ==================================================
    // 5️⃣ INSTANCE-AWARE REDIRECT URL (via STAGE_PATH_BY_TAG)
    // ==================================================

    const stagePath = STAGE_PATH_BY_TAG[leadStatus!.tag!] ?? `/dashboard/production/tech-check/details`;

    const queryParams = new URLSearchParams();

    if (lead.account_id) {
      queryParams.set("accountId", String(lead.account_id));
    }

    if (data.product_structure_instance_id) {
      queryParams.set(
        "instance_id",
        String(data.product_structure_instance_id),
      );
    }

    const redirectPath = `${stagePath}/${lead.id}${
      queryParams.toString() ? `?${queryParams.toString()}` : ""
    }`;

    const projectUrl = `${data.baseUrl}${redirectPath}`;

    // ==================================================
    // 6️⃣ GET TECH CHECK USERS
    // ==================================================

    const leadUserMappings = await prisma.leadUserMapping.findMany({
      where: {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        status: "active",
      },
      select: {
        user: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            status: true,
            user_type: {
              select: { user_type: true },
            },
          },
        },
      },
    });

    const techCheckUsersRaw = leadUserMappings
      .map((m) => m.user)
      .filter(
        (u) =>
          u.status === "active" &&
          u.user_type.user_type.toLowerCase() === "tech-check",
      );

    const techCheckUsers = techCheckUsersRaw.filter(
      (u, index, arr) => arr.findIndex((x) => x.id === u.id) === index,
    );

    if (!techCheckUsers.length) return result;

    // ==================================================
    // 7️⃣ SEND NOTIFICATION (PER-USER DEDUP: 5-min window)
    // ==================================================

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Sequential to avoid race-condition duplicates if the frontend double-submits
    for (const user of techCheckUsers) {
      try {
        // Dedup guard: skip if already sent to this user in the last hour
        const alreadySent = await prisma.notification.findFirst({
          where: {
            vendor_id: data.vendor_id,
            entity_type: "lead",
            entity_id: lead.id,
            user_id: user.id,
            type: NotificationType.LEAD_ACTION,
            title: "Revised Documents Uploaded",
            created_at: { gte: oneHourAgo },
          },
        });

        if (alreadySent) continue;

        await NotificationService.createAndSend({
          vendor_id: data.vendor_id,
          user_id: user.id,
          sender_id: data.created_by,
          type: NotificationType.LEAD_ACTION,
          title: "Revised Documents Uploaded",
          message: `Revised documents uploaded for ${leadCode} - ${leadName}.`,
          entity_type: "lead",
          entity_id: lead.id,
          redirect_url: redirectPath,
        });

        if (!user.user_email) continue;

        await sendRevisedDocumentsUploadedEmail({
          vendor_id: data.vendor_id,
          toEmail: user.user_email,
          toName: user.user_name,
          leadCode,
          leadName,
          uploadedBy: uploadedBy?.user_name ?? "Sales Executive",
          uploadedAt,
          projectUrl,
        });
      } catch (err: any) {
        logger.warn("⚠️ Failed to send Revised Documents Uploaded notification", {
          user_id: user.id,
          lead_id: lead.id,
          error: err?.message,
        });
      }
    }

    return result;
  }
}
