import { prisma } from "../../../prisma/client";
import { CreateLeadDTO } from "../../../types/leadModule.types";
import { LeadPriority, DocumentType } from "@prisma/client";
import { getDocumentTypeFromFile } from "../../../utils/fileUtils";
import fs from "fs";

export const createLeadService = async (payload: CreateLeadDTO, files: Express.Multer.File[]) => {
    console.log("[DEBUG] Service called with", files.length, "files");
    
    // Debug file information
    if (files && files.length > 0) {
      files.forEach((file, index) => {
        console.log(`[DEBUG] File ${index + 1}:`, {
          originalname: file.originalname,
          filename: file.filename,
          size: file.size,
          mimetype: file.mimetype,
          path: file.path,
          destination: file.destination
        });
        
        // Check if file actually exists
        if (fs.existsSync(file.path)) {
          console.log(`[DEBUG] ✅ File ${index + 1} exists at:`, file.path);
          const stats = fs.statSync(file.path);
          console.log(`[DEBUG] File size on disk:`, stats.size, "bytes");
        } else {
          console.log(`[DEBUG] ❌ File ${index + 1} NOT found at:`, file.path);
        }
      });
    }

    const {
      firstname,
      lastname,
      country_code,
      contact_no,
      alt_contact_no,
      email,
      site_address,
      site_type_id,
      priority,
      billing_name,
      source_id,
      archetech_name,
      designer_remark,
      vendor_id,
      created_by,
      product_types = [],
      product_structures = []
    } = payload;
  
    const leadPriority = priority.toLowerCase() as LeadPriority;
    
    // Validate priority
    if (!Object.values(LeadPriority).includes(leadPriority)) {
      throw new Error(`Invalid priority value: ${priority}. Must be one of: ${Object.values(LeadPriority).join(', ')}`);
    }
  
    return prisma.$transaction(async (tx) => {
      // Check for duplicate contact_no and email for the same vendor
      const existingContactLead = await tx.leadMaster.findFirst({
        where: {
          contact_no,
          vendor_id
        }
      });

      if (existingContactLead) {
        throw new Error(`Contact number ${contact_no} already exists for this vendor`);
      }

      if (email) {
        const existingEmailLead = await tx.leadMaster.findFirst({
          where: {
            email,
            vendor_id
          }
        });

        if (existingEmailLead) {
          throw new Error(`Email ${email} already exists for this vendor`);
        }
      }

      // Check for duplicate contact_no and email in AccountMaster for the same vendor
      const existingContactAccount = await tx.accountMaster.findFirst({
        where: {
          contact_no,
          vendor_id
        }
      });

      if (existingContactAccount) {
        throw new Error(`Contact number ${contact_no} already exists in accounts for this vendor`);
      }

      if (email) {
        const existingEmailAccount = await tx.accountMaster.findFirst({
          where: {
            email,
            vendor_id
          }
        });

        if (existingEmailAccount) {
          throw new Error(`Email ${email} already exists in accounts for this vendor`);
        }
      }

      // 1. AccountMaster (create first to get account_id)
      const account = await tx.accountMaster.create({
        data: {
          name: `${firstname} ${lastname}`,
          country_code,
          contact_no,
          alt_contact_no,
          email,
          vendor_id,
          created_by
        }
      });

      // 2. LeadMaster (now with account_id reference)
      const lead = await tx.leadMaster.create({
        data: {
          firstname,
          lastname,
          country_code,
          contact_no,
          alt_contact_no,
          email,
          site_address,
          site_type_id,
          priority: leadPriority,
          billing_name,
          source_id,
          archetech_name,
          designer_remark,
          vendor_id,
          created_by,
          account_id: account.id // Add account_id reference
        }
      });
  
      // 3. Validate and create mappings for product types using IDs
      for (const productTypeId of product_types) {
        console.log("[DEBUG] Processing product type ID:", productTypeId);
        
        // Validate that the product type exists and belongs to the vendor
        const productType = await tx.productTypeMaster.findFirst({
          where: { 
            id: productTypeId, 
            vendor_id 
          }
        });

        if (!productType) {
          throw new Error(`Product type with ID ${productTypeId} not found for vendor ${vendor_id}`);
        }

        await tx.leadProductMapping.create({
          data: {
            vendor_id,
            lead_id: lead.id,
            account_id: account.id,
            product_type_id: productTypeId,
            created_by
          }
        });
        console.log("[DEBUG] ✅ Product mapping created for type ID:", productTypeId);
      }

      // 4. Validate and create mappings for product structures using IDs
      for (const productStructureId of product_structures) {
        console.log("[DEBUG] Processing product structure ID:", productStructureId);
        
        // Validate that the product structure exists and belongs to the vendor
        const structure = await tx.productStructure.findFirst({
          where: { 
            id: productStructureId, 
            vendor_id 
          }
        });

        if (!structure) {
          throw new Error(`Product structure with ID ${productStructureId} not found for vendor ${vendor_id}`);
        }

        await tx.leadProductStructureMapping.create({
          data: {
            vendor_id,
            lead_id: lead.id,
            account_id: account.id,
            product_structure_id: productStructureId,
            created_by
          }
        });
        console.log("[DEBUG] ✅ Product structure mapping created for structure ID:", productStructureId);
      }
  
      // 5. Documents (only if files are provided) with enhanced debugging
      let uploadedFiles: any[] = [];
      
      if (files && files.length > 0) {
        console.log(`[INFO] Processing ${files.length} document(s)`);
        
        for (const file of files) {
          // Double-check file exists before saving to DB
          const fileExists = fs.existsSync(file.path);
          console.log(`[DEBUG] File ${file.filename} exists: ${fileExists}`);
          
          const document = await tx.leadDocuments.create({
            data: {
              doc_og_name: file.originalname,
              doc_sys_name: file.filename,
              doc_type: getDocumentTypeFromFile(file),
              vendor_id,
              lead_id: lead.id,
              created_by
            }
          });
          
          uploadedFiles.push({
            id: document.id,
            originalName: file.originalname,
            systemName: file.filename,
            path: file.path,
            exists: fileExists,
            size: file.size
          });
        }
        
        console.log("[DEBUG] Files saved to database:", uploadedFiles.length);
      } else {
        console.log("[INFO] No documents to process - files are optional");
      }
  
      return { 
        lead, 
        account,
        documentsProcessed: files ? files.length : 0,
        uploadedFiles: uploadedFiles // Add this for debugging
      };
    });
};

export const getLeadsByVendor = async (vendorId: number) => {
  return prisma.leadMaster.findMany({
    where: { vendor_id: vendorId },
    include: {
      account: true,
      leadProductStructureMapping: {
        include: { productStructure: true },
      },
      productMappings: {
        include: { productType: true },
      },
      documents: true,
      source: true,
      siteType: true,
      createdBy: true,
    },
    orderBy: { created_at: "desc" },
  });
};

export const getLeadsByVendorAndUser = async (vendorId: number, userId: number) => {
  return prisma.leadMaster.findMany({
    where: { vendor_id: vendorId, created_by: userId },
    include: {
      account: true,
      leadProductStructureMapping: {
        include: { productStructure: true },
      },
      productMappings: {
        include: { productType: true },
      },
      documents: true,
      source: true,
      siteType: true,
      createdBy: true,
    },
    orderBy: { created_at: "desc" },
  });
};