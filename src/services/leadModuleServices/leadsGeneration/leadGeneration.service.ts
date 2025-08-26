import { prisma } from "../../../prisma/client";
import { CreateLeadDTO, UpdateLeadDTO } from "../../../types/leadModule.types";
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
    where: { 
      vendor_id: vendorId, 
      is_deleted: false,
      account: {
        is_deleted: false,
      }
    },
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
    where: { 
      vendor_id: vendorId, 
      created_by: userId, 
      is_deleted: false,
      account: {
        is_deleted: false,
      }
    },
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

export const softDeleteLead = async (leadId: number, deletedBy: number) => {
  // 1. Fetch the lead with its account
  const lead = await prisma.leadMaster.findUnique({
    where: { id: leadId },
    include: { account: true }, // 👈 assumes LeadMaster has `account` relation
  });

  if (!lead) {
    throw new Error("Lead not found");
  }

  if (lead.is_deleted) {
    throw new Error("Lead already deleted");
  }

  // 2. Start transaction for lead + account deletion
  return prisma.$transaction(async (tx) => {
    // Soft delete lead
    const deletedLead = await tx.leadMaster.update({
      where: { id: leadId },
      data: {
        is_deleted: true,
        deleted_by: deletedBy,
        deleted_at: new Date(),
      },
    });

    // If lead has an account, soft delete it too
    if (lead.account) {
      await tx.accountMaster.update({
        where: { id: lead.account.id },
        data: {
          is_deleted: true,
          deleted_by: deletedBy,
          deleted_at: new Date(),
        },
      });
    }

    return deletedLead;
  });
};

export const updateLeadService = async (leadId: number, payload: UpdateLeadDTO) => {
  
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
    updated_by,
    product_types = [],
    product_structures = []
  } = payload;

  // Validate priority only if provided
  let leadPriority: LeadPriority | undefined;
  if (priority !== undefined) {
    leadPriority = priority.toLowerCase() as LeadPriority;
    if (!Object.values(LeadPriority).includes(leadPriority)) {
      throw new Error(`Invalid priority value: ${priority}. Must be one of: ${Object.values(LeadPriority).join(', ')}`);
    }
  }

  return prisma.$transaction(async (tx) => {
    // 1. Check if lead exists and get current data
    const existingLead = await tx.leadMaster.findFirst({
      where: {
        id: leadId,
        is_deleted: false
      },
      include: {
        account: true
      }
    });

    if (!existingLead) {
      throw new Error(`Lead with ID ${leadId} not found or has been deleted`);
    }

    const vendor_id = existingLead.vendor_id;

    // 2. Check for duplicate contact_no (exclude current lead) - only if contact_no is being updated
    if (contact_no !== undefined) {
      const existingContactLead = await tx.leadMaster.findFirst({
        where: {
          contact_no,
          vendor_id,
          id: { not: leadId },
          is_deleted: false
        }
      });

      if (existingContactLead) {
        throw new Error(`Contact number ${contact_no} already exists for this vendor`);
      }
    }

    // 3. Check for duplicate email (exclude current lead) - only if email is being updated
    if (email !== undefined && email !== null && email.trim() !== '') {
      const existingEmailLead = await tx.leadMaster.findFirst({
        where: {
          email,
          vendor_id,
          id: { not: leadId },
          is_deleted: false
        }
      });

      if (existingEmailLead) {
        throw new Error(`Email ${email} already exists for this vendor`);
      }
    }

    // 4. Check for duplicate contact_no in AccountMaster (exclude current account) - only if contact_no is being updated
    if (contact_no !== undefined) {
      const existingContactAccount = await tx.accountMaster.findFirst({
        where: {
          contact_no,
          vendor_id,
          id: { not: existingLead.account_id },
          is_deleted: false
        }
      });

      if (existingContactAccount) {
        throw new Error(`Contact number ${contact_no} already exists in accounts for this vendor`);
      }
    }

    // 5. Check for duplicate email in AccountMaster (exclude current account) - only if email is being updated
    if (email !== undefined && email !== null && email.trim() !== '') {
      const existingEmailAccount = await tx.accountMaster.findFirst({
        where: {
          email,
          vendor_id,
          id: { not: existingLead.account_id },
          is_deleted: false
        }
      });

      if (existingEmailAccount) {
        throw new Error(`Email ${email} already exists in accounts for this vendor`);
      }
    }

    // 6. Build dynamic update data for AccountMaster
    const accountUpdateData: any = {
      updated_by,
      updated_at: new Date()
    };

    // Only update account fields if lead contact info is being updated
    if (firstname !== undefined || lastname !== undefined) {
      accountUpdateData.name = `${firstname || existingLead.firstname} ${lastname || existingLead.lastname}`;
    }
    if (country_code !== undefined) accountUpdateData.country_code = country_code;
    if (contact_no !== undefined) accountUpdateData.contact_no = contact_no;
    if (alt_contact_no !== undefined) accountUpdateData.alt_contact_no = alt_contact_no;
    if (email !== undefined) accountUpdateData.email = email;

    const updatedAccount = await tx.accountMaster.update({
      where: { id: existingLead.account_id },
      data: accountUpdateData
    });

    // 7. Build dynamic update data for LeadMaster
    const leadUpdateData: any = {
      updated_by,
      updated_at: new Date()
    };

    // Only include fields that are actually being updated
    if (firstname !== undefined) leadUpdateData.firstname = firstname;
    if (lastname !== undefined) leadUpdateData.lastname = lastname;
    if (country_code !== undefined) leadUpdateData.country_code = country_code;
    if (contact_no !== undefined) leadUpdateData.contact_no = contact_no;
    if (alt_contact_no !== undefined) leadUpdateData.alt_contact_no = alt_contact_no;
    if (email !== undefined) leadUpdateData.email = email;
    if (site_address !== undefined) leadUpdateData.site_address = site_address;
    if (site_type_id !== undefined) leadUpdateData.site_type_id = site_type_id;
    if (priority !== undefined) leadUpdateData.priority = leadPriority;
    if (billing_name !== undefined) leadUpdateData.billing_name = billing_name;
    if (source_id !== undefined) leadUpdateData.source_id = source_id;
    if (archetech_name !== undefined) leadUpdateData.archetech_name = archetech_name;
    if (designer_remark !== undefined) leadUpdateData.designer_remark = designer_remark;

    const updatedLead = await tx.leadMaster.update({
      where: { id: leadId },
      data: leadUpdateData
    });

    // 8. Handle product_types updates (only if provided)
    if (product_types !== undefined) {
      console.log("[DEBUG] Updating product types for lead ID:", leadId);
      
      // Delete existing product type mappings
      await tx.leadProductMapping.deleteMany({
        where: {
          lead_id: leadId,
          vendor_id
        }
      });

      // Create new mappings
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
            lead_id: leadId,
            account_id: existingLead.account_id,
            product_type_id: productTypeId,
            created_by: updated_by
          }
        });
        console.log("[DEBUG] ✅ Product mapping created for type ID:", productTypeId);
      }
    }

    // 9. Handle product_structures updates (only if provided)
    if (product_structures !== undefined) {
      console.log("[DEBUG] Updating product structures for lead ID:", leadId);
      
      // Delete existing product structure mappings
      await tx.leadProductStructureMapping.deleteMany({
        where: {
          lead_id: leadId,
          vendor_id
        }
      });

      // Create new mappings
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
            lead_id: leadId,
            account_id: existingLead.account_id,
            product_structure_id: productStructureId,
            created_by: updated_by
          }
        });
        console.log("[DEBUG] ✅ Product structure mapping created for structure ID:", productStructureId);
      }
    }

    console.log("[INFO] Lead updated successfully:", {
      leadId,
      accountId: updatedAccount.id,
      productTypesCount: product_types.length,
      productStructuresCount: product_structures.length
    });

    return { 
      lead: updatedLead, 
      account: updatedAccount,
      productTypesUpdated: product_types !== undefined ? product_types.length : 'not updated',
      productStructuresUpdated: product_structures !== undefined ? product_structures.length : 'not updated'
    };
  });
};