import { prisma } from "../../../prisma/client";
import { generateSignedUrl } from "../../../utils/wasabiClient";
import { Prisma } from "../../../prisma/generated";
import logger from "../../../utils/logger";

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
}

export class ClientDocumentationService {
  public async createClientDocumentationStage(data: ClientDocumentationDto) {
    // ✅ Step 1: Run DB operations inside a short transaction
    return await prisma.$transaction(async (tx) => {
      const response: any = {
        documents: [],
        message: "Client documentation uploaded successfully",
      };

      // Insert lead documents
      for (const doc of data.documents) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: doc.docTypeTag },
        });

        if (!docType) {
          throw new Error(
            `Document type ${doc.docTypeTag} not found for vendor ${data.vendor_id}`
          );
        }

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            created_by: data.created_by,
            doc_type_id: docType.id,
            account_id: data.account_id,
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
        data.documents.find((doc) => doc.productStructureInstanceId)?.productStructureInstanceId ??
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
      const actionMessage = `Client Documentation stage completed successfully — ${docCount} Client Documentation ${plural} been uploaded successfully.`;

      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          action: actionMessage,
          action_type: "CREATE",
          created_by: data.created_by,
          created_at: new Date(),
        },
      });

      if (response.documents.length > 0) {
        const docLogsData = response.documents.map((doc: any) => ({
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
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

  public async moveToClientApproval(data: {
    lead_id: number;
    vendor_id: number;
    updated_by: number;
  }) {
    return prisma.$transaction(async (tx) => {
      const lead = await tx.leadMaster.findFirst({
        where: { id: data.lead_id, vendor_id: data.vendor_id, is_deleted: false },
        select: { id: true, account_id: true },
      });
      if (!lead) {
        throw new Error("Lead not found");
      }
      if (!lead.account_id) {
        throw new Error("Lead account is missing");
      }

      const [clientApprovalStatus, pptType, pythaType, instances, selections] =
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
            orderBy: [{ product_structure_id: "asc" }, { quantity_index: "asc" }],
          }),
          tx.leadDesignSelection.findMany({
            where: {
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
              type: { in: ["Carcas", "Shutter", "Handles"] },
            },
            select: { type: true, desc: true, product_structure_instance_id: true },
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

      if (instances.length > 1) {
        for (const instance of instances) {
          const rows = selections.filter(
            (row) => row.product_structure_instance_id === instance.id
          );

          const hasValueByType = {
            Carcas: rows.some((row) => row.type === "Carcas" && hasFilledValue(row.desc)),
            Shutter: rows.some((row) => row.type === "Shutter" && hasFilledValue(row.desc)),
            Handles: rows.some((row) => row.type === "Handles" && hasFilledValue(row.desc)),
          };

          if (!hasValueByType.Carcas || !hasValueByType.Shutter || !hasValueByType.Handles) {
            throw new Error(
              `Carcas, Shutter and Handles must be filled for ${instance.title}`
            );
          }
        }
      } else {
        const hasValueByType = {
          Carcas: selections.some((row) => row.type === "Carcas" && hasFilledValue(row.desc)),
          Shutter: selections.some((row) => row.type === "Shutter" && hasFilledValue(row.desc)),
          Handles: selections.some((row) => row.type === "Handles" && hasFilledValue(row.desc)),
        };
        if (!hasValueByType.Carcas || !hasValueByType.Shutter || !hasValueByType.Handles) {
          throw new Error("Carcas, Shutter and Handles must be filled");
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

      if (instances.length > 1) {
        for (const instance of instances) {
          const pptCount = docs.filter(
            (d) =>
              d.product_structure_instance_id === instance.id &&
              d.doc_type_id === pptType.id
          ).length;
          const pythaCount = docs.filter(
            (d) =>
              d.product_structure_instance_id === instance.id &&
              d.doc_type_id === pythaType.id
          ).length;
          if (pptCount === 0 || pythaCount === 0) {
            throw new Error(
              `Both Project Files and Pytha Design Files are required for ${instance.title}`
            );
          }
        }
      } else {
        const pptCount = docs.filter((d) => d.doc_type_id === pptType.id).length;
        const pythaCount = docs.filter((d) => d.doc_type_id === pythaType.id).length;
        if (pptCount === 0 || pythaCount === 0) {
          throw new Error(
            "Both Project Files and Pytha Design Files are required before moving stage"
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

      await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: lead.account_id,
          action: "Lead has been moved to Client Approval stage.",
          action_type: "UPDATE",
          created_by: data.updated_by,
          created_at: new Date(),
        },
      });

      return { moved: true, status_id: clientApprovalStatus.id };
    });
  }

  public async getClientDocumentation(vendorId: number, leadId: number) {
    // 1️⃣ Validate vendor & lead
    if (!vendorId || !leadId) {
      throw new Error("vendorId and leadId are required");
    }

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
            productStructure: { select: { id: true, type: true } },
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
      throw new Error("Lead not found or not in Client Documentation stage");
    }

    if (!pptDocType && !pythaDocType) {
      throw new Error(
        "Document types (Client Documentation PPT / PYTHA) not found for this vendor"
      );
    }

    // 4️⃣ Separate PPT and PYTHA documents by doc_type_id
    const pptDocs = lead.documents.filter(
      (d) => d.doc_type_id === pptDocType?.id
    );
    const pythaDocs = lead.documents.filter(
      (d) => d.doc_type_id === pythaDocType?.id
    );

    // 5️⃣ Generate signed URLs for both sets
    const [pptDocsWithUrls, pythaDocsWithUrls] = await Promise.all([
      Promise.all(
        pptDocs.map(async (doc: any) => ({
          ...doc,
          signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        }))
      ),
      Promise.all(
        pythaDocs.map(async (doc: any) => ({
          ...doc,
          signed_url: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        }))
      ),
    ]);

    const documentsByInstance: any[] = productStructureInstances.map((instance) => ({
      instance_id: instance.id,
      instance_title: instance.title,
      quantity_index: instance.quantity_index,
      product_structure: instance.productStructure,
      documents: {
        ppt: pptDocsWithUrls.filter(
          (doc: any) => doc.product_structure_instance_id === instance.id
        ),
        pytha: pythaDocsWithUrls.filter(
          (doc: any) => doc.product_structure_instance_id === instance.id
        ),
      },
    }));

    const unassignedPpt = pptDocsWithUrls.filter(
      (doc: any) => !doc.product_structure_instance_id
    );
    const unassignedPytha = pythaDocsWithUrls.filter(
      (doc: any) => !doc.product_structure_instance_id
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

    // 6️⃣ Return structured response
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

  public async addMoreClientDocumentation(data: ClientDocumentationDto) {
    // Upload outside transaction
    const uploadedDocs: {
      originalname: string;
      sysName: string;
      docTypeTag: "Type 11" | "Type 12";
    }[] = [];

    // DB Transaction
    return await prisma.$transaction(async (tx) => {
      const response: any = {
        documents: [],
        message: "Additional client documentation uploaded successfully",
      };

      for (const doc of data.documents) {
        const docType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: doc.docTypeTag },
        });

        const docEntry = await tx.leadDocuments.create({
          data: {
            doc_og_name: doc.originalName,
            doc_sys_name: doc.sysName,
            created_by: data.created_by,
            doc_type_id: docType?.id!,
            account_id: data.account_id,
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
      const resolvedInstanceId =
        data.product_structure_instance_id ??
        data.documents.find((doc) => doc.productStructureInstanceId)?.productStructureInstanceId ??
        null;
      const plural = docCount > 1 ? "documents have" : "document has";
      const actionMessage = `${docCount} additional Client Documentation ${plural} been uploaded successfully.`;

      const detailedLog = await tx.leadDetailedLogs.create({
        data: {
          vendor_id: data.vendor_id,
          lead_id: data.lead_id,
          account_id: data.account_id,
          action: actionMessage,
          action_type: "CREATE",
          created_by: data.created_by,
          created_at: new Date(),
        },
      });

      const docLogsData = response.documents.map((doc: any) => ({
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        account_id: data.account_id,
        doc_id: doc.id,
        lead_logs_id: detailedLog.id,
        created_by: data.created_by,
        created_at: new Date(),
      }));

      await tx.leadDocumentLogs.createMany({ data: docLogsData });

      logger.info("✅ Additional Client Documentation uploaded", {
        vendor_id: data.vendor_id,
        lead_id: data.lead_id,
        docCount,
        actionMessage,
      });

      return response;
    });
  }

  public async getLeadsWithStatusClientDocumentation(
    vendorId: number,
    userId: number
  ) {
    // 1. Resolve status ID dynamically for Type 6
    const clientDocStatus = await prisma.statusTypeMaster.findFirst({
      where: { vendor_id: vendorId, tag: "Type 6" },
      select: { id: true },
    });

    if (!clientDocStatus) {
      throw new Error(
        `Client Documentation status (Type 6) not found for vendor ${vendorId}`
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
}
