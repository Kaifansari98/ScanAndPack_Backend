import { prisma } from "../../../prisma/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import wasabi, { generateSignedUrl } from "../../../utils/wasabiClient"; // your existing Wasabi config
import { sanitizeFilename } from "../../../utils/sanitizeFilename";
// import { SupervisorStatus } from "@prisma/client";

interface FinalMeasurementDto {
  lead_id: number;
  account_id: number;
  vendor_id: number;
  created_by: number;
  critical_discussion_notes?: string | null;
  finalMeasurementDoc: Express.Multer.File;
  sitePhotos: Express.Multer.File[];
}

export class FinalMeasurementService {
  public async createFinalMeasurementStage(data: FinalMeasurementDto) {
    return await prisma.$transaction(async (tx: any) => {
      const response: any = {
        measurementDoc: null,
        sitePhotos: [],
        message: "Final measurement stage completed successfully",
      };

      // 1. Upload Final Measurement Document (Type 9)
      const measurementDocType = await tx.documentTypeMaster.findFirst({
        where: { vendor_id: data.vendor_id, tag: "Type 9" },
      });
      if (!measurementDocType) {
        throw new Error("Document type (Final Measurement) not found for this vendor");
      }

      const sanitizedDocName = sanitizeFilename(data.finalMeasurementDoc.originalname);
      const docKey = `final-measurement-documents/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedDocName}`;

      await wasabi.send(new PutObjectCommand({
        Bucket: process.env.WASABI_BUCKET_NAME!,
        Key: docKey,
        Body: data.finalMeasurementDoc.buffer,
        ContentType: data.finalMeasurementDoc.mimetype,
      }));

      const measurementDoc = await tx.leadDocuments.create({
        data: {
          doc_og_name: data.finalMeasurementDoc.originalname,
          doc_sys_name: docKey,
          created_by: data.created_by,
          doc_type_id: measurementDocType.id,
          account_id: data.account_id,
          lead_id: data.lead_id,
          vendor_id: data.vendor_id,
        }
      });
      response.measurementDoc = measurementDoc;

      // 2. Upload Site Photos (Type 10)
      const sitePhotoType = await tx.documentTypeMaster.findFirst({
        where: { vendor_id: data.vendor_id, tag: "Type 10" },
      });
      if (!sitePhotoType) {
        throw new Error("Document type (Site Photos) not found for this vendor");
      }

      for (const photo of data.sitePhotos) {
        const sanitizedPhotoName = sanitizeFilename(photo.originalname);
        const photoKey = `final-current-site-photos/${data.vendor_id}/${data.lead_id}/${Date.now()}-${sanitizedPhotoName}`;

        await wasabi.send(new PutObjectCommand({
          Bucket: process.env.WASABI_BUCKET_NAME!,
          Key: photoKey,
          Body: photo.buffer,
          ContentType: photo.mimetype,
        }));

        const siteDoc = await tx.leadDocuments.create({
          data: {
            doc_og_name: photo.originalname,
            doc_sys_name: photoKey,
            created_by: data.created_by,
            doc_type_id: sitePhotoType.id,
            account_id: data.account_id,
            lead_id: data.lead_id,
            vendor_id: data.vendor_id,
          }
        });

        response.sitePhotos.push(siteDoc);
      }

      // Resolve the vendor's Open status ID dynamically
      const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
        where: {
          vendor_id: data.vendor_id,
          tag: "Type 5", // ✅ Open status
        },
        select: { id: true },
      });

      if (!finalMeasurementStatus) {
        throw new Error(`Open status (Type 1) not found for vendor ${data.vendor_id}`);
      }

      // 3. Save critical discussion notes + update stage
      await tx.leadMaster.update({
        where: { id: data.lead_id },
        data: {
          final_desc_note: data.critical_discussion_notes,
          status_id: finalMeasurementStatus.id, // Assuming status 5 = Final Measurement stage
        },
      });

      return response;
    }, {
        timeout: 20000 // 20 seconds
    });
  }

  public async getAllFinalMeasurementLeadsByVendorId(vendorId: number) {

    // Resolve the vendor's Open status ID dynamically
    const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 5", // ✅ Open status
      },
      select: { id: true },
    });

    if (!finalMeasurementStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    return await prisma.leadMaster.findMany({
      where: {
        vendor_id: vendorId,
        status_id: finalMeasurementStatus.id, // ✅ Final Measurement stage
      },
      include: {
        documents: {
          where: {
            doc_type_id: {
              in: await prisma.documentTypeMaster.findMany({
                where: {
                  vendor_id: vendorId,
                  tag: { in: ["Type 9", "Type 10"] }, // measurement + site photos
                },
                select: { id: true },
              }).then((docs: any) => docs.map((d: any) => d.id)),
            },
          },
        },
      },
      orderBy: { id: "desc" },
    });
  }

  public async getFinalMeasurementLead(vendorId: number, leadId: number) {

    // Resolve the vendor's Open status ID dynamically
    const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 5", // ✅ Open status
      },
      select: { id: true },
    });

    if (!finalMeasurementStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    // Find the lead in Final Measurement stage
    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        status_id: finalMeasurementStatus.id, // ✅ Final Measurement stage
      },
      include: {
        documents: true, // we'll filter after fetch
      },
    });
  
    if (!lead) {
      throw new Error("Lead not found or not in Final Measurement stage");
    }
  
    // Get doc type ids
    const docTypes = await prisma.documentTypeMaster.findMany({
      where: {
        vendor_id: vendorId,
        tag: { in: ["Type 9", "Type 10"] }, // Final Measurement + Site Photos
      },
    });
  
    const measurementDocType = docTypes.find((d: any) => d.tag === "Type 9");
    const sitePhotoType = docTypes.find((d: any) => d.tag === "Type 10");

    // Measurement doc (single)
    const measurementDoc = lead.documents.find(
      (d: any) => d.doc_type_id === measurementDocType?.id
    );

    let measurementDocWithUrl = null;
    if (measurementDoc) {
      measurementDocWithUrl = {
        ...measurementDoc,
        signedUrl: await generateSignedUrl(measurementDoc.doc_sys_name, 3600, "inline"),
      };
    }

    // Site photos (multiple)
    const sitePhotos = await Promise.all(
      lead.documents
        .filter((d: any) => d.doc_type_id === sitePhotoType?.id)
        .map(async (doc: any) => ({
          ...doc,
          signedUrl: await generateSignedUrl(doc.doc_sys_name, 3600, "inline"),
        }))
    );
  
    return {
      id: lead.id,
      vendor_id: lead.vendor_id,
      final_desc_note: lead.final_desc_note,
      status_id: lead.status_id,
      measurementDoc: measurementDocWithUrl,
      sitePhotos,
    };    
  }

  public async updateCriticalDiscussionNotes(vendorId: number, leadId: number, notes: string) {

    // Resolve the vendor's Open status ID dynamically
    const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 5", // ✅ Open status
      },
      select: { id: true },
    });

    if (!finalMeasurementStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    const lead = await prisma.leadMaster.findFirst({
      where: { id: leadId, vendor_id: vendorId, status_id: finalMeasurementStatus.id },
    });
  
    if (!lead) {
      throw new Error("Lead not found or not in Final Measurement stage");
    }
  
    return await prisma.leadMaster.update({
      where: { id: lead.id },
      data: { final_desc_note: notes },
    });
  }

  public async addMoreFinalMeasurementFiles(data: {
    lead_id: number;
    vendor_id: number;
    account_id: number;
    created_by: number;
    sitePhotos?: Express.Multer.File[];
  }) {
    return await prisma.$transaction(async (tx: any) => {
      const response: any = {
        sitePhotos: [],
      };
  
      // Upload Additional Site Photos (Type 10)
      if (data.sitePhotos && data.sitePhotos.length > 0) {
        const sitePhotoType = await tx.documentTypeMaster.findFirst({
          where: { vendor_id: data.vendor_id, tag: "Type 10" },
        });
        if (!sitePhotoType) {
          throw new Error("Document type (Site Photos) not found for this vendor");
        }
  
        for (const file of data.sitePhotos) {
          const s3Key = `final-current-site-photos/${data.vendor_id}/${data.lead_id}/${Date.now()}-${file.originalname}`;
  
          await wasabi.send(
            new PutObjectCommand({
              Bucket: process.env.WASABI_BUCKET_NAME!,
              Key: s3Key,
              Body: file.buffer,
              ContentType: file.mimetype,
            })
          );
  
          const doc = await tx.leadDocuments.create({
            data: {
              doc_og_name: file.originalname,
              doc_sys_name: s3Key,
              created_by: data.created_by,
              doc_type_id: sitePhotoType.id,
              account_id: data.account_id,
              lead_id: data.lead_id,
              vendor_id: data.vendor_id,
            },
          });
  
          response.sitePhotos.push(doc);
        }
      }
  
      return response;
    }, { timeout: 15000 });
  }

  public async getLeadsWithStatusFinalMeasurement(vendorId: number, userId: number) {
    // ✅ Get user role
    const user = await prisma.userMaster.findUnique({
      where: { id: userId },
      include: { user_type: true },
    });

    if (!user) throw new Error("User not found");

    const role = user.user_type.user_type.toLowerCase();

    // Resolve the vendor's Open status ID dynamically
    const finalMeasurementStatus = await prisma.statusTypeMaster.findFirst({
      where: {
        vendor_id: vendorId,
        tag: "Type 5", // ✅ Open status
      },
      select: { id: true },
    });

    if (!finalMeasurementStatus) {
      throw new Error(`Open status (Type 1) not found for vendor ${vendorId}`);
    }

    // ✅ Base where clause
    const whereClause: any = {
      status_id: finalMeasurementStatus.id,
      is_deleted: false,
      vendor_id: vendorId,
    };

    // ✅ Restrict based on role
    if (role === "sales-executive") {
      whereClause.OR = [
        { created_by: userId },
        { assign_to: userId },
      ];
    } else if (role === "site-supervisor") {
      // supervisor mapping table is LeadSiteSupervisorMapping
      whereClause.siteSupervisors = {
        some: { user_id: userId, status: "active" },
      };
    }
    // ✅ Admin can see all → no extra filter

    const leads = await prisma.leadMaster.findMany({
      where: whereClause,
      include: {
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
          select: {
            productStructure: { select: { id: true, type: true } },
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return leads;
  }
}