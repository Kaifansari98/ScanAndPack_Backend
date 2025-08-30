import { prisma } from "../../../prisma/client";
import { CreateLeadDTO, UpdateLeadDTO } from "../../../types/leadModule.types";
import { LeadPriority, DocumentType } from "@prisma/client";
import { getDocumentTypeFromFile } from "../../../utils/fileUtils";
import fs from "fs";
import { SalesExecutiveData } from "../../../types/leadModule.types";
import { AssignLeadPayload, LeadAssignmentResult } from "../../../types/leadModule.types";
import { 
  validateAdminUser, 
  validateSalesExecutiveUser, 
  validateLeadOwnership, 
  getUserRole 
} from "../../../validations/leadValidation";

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
          path: (file as any).path,
          destination: (file as any).destination,
          key: (file as any).key,
          location: (file as any).location
        });
        
        // Check if file actually exists
        const diskPath = (file as any).path as string | undefined;
        if (diskPath && fs.existsSync(diskPath)) {
          console.log(`[DEBUG] ✅ File ${index + 1} exists at:`, diskPath);
          const stats = fs.statSync(diskPath);
          console.log(`[DEBUG] File size on disk:`, stats.size, "bytes");
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
      status_id,
      priority,
      billing_name,
      source_id,
      archetech_name,
      designer_remark,
      vendor_id,
      created_by,
      assign_to,
      assigned_by,
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
          status_id,
          priority: leadPriority,
          billing_name,
          source_id,
          archetech_name,
          designer_remark,
          vendor_id,
          created_by,
          account_id: account.id, // Add account_id reference
          assign_to,
          assigned_by,
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
          const fileKey = (file as any).key as string | undefined;
          const fileLocation = (file as any).location as string | undefined;
          const diskPath = (file as any).path as string | undefined;
          const fileExists = diskPath ? fs.existsSync(diskPath) : false;
          console.log(`[DEBUG] File key: ${fileKey}, location: ${fileLocation}, disk exists: ${fileExists}`);

          // const resolvedDocType = getDocumentTypeFromFile(file) as unknown as string;
          // let docTypeRecord = await tx.documentTypeMaster.findFirst({
          //   where: { type: resolvedDocType, vendor_id }
          // });
          // if (!docTypeRecord) {
          //   docTypeRecord = await tx.documentTypeMaster.create({
          //     data: { type: resolvedDocType, vendor_id }
          //   });
          // }
          
          const document = await tx.leadDocuments.create({
            data: {
              doc_og_name: file.originalname,
              doc_sys_name: file.filename || fileKey || file.originalname,
              doc_type_id: 1,
              vendor_id,
              lead_id: lead.id,
              created_by
            }
          });
          
          uploadedFiles.push({
            id: document.id,
            originalName: file.originalname,
            systemName: file.filename || fileKey,
            path: diskPath || fileLocation,
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

/**
 * Get leads by vendor and user with role-based filtering
 * @param vendorId - Vendor ID
 * @param userId - User ID
 * @returns Promise<Lead[]>
 */
export const getLeadsByVendorAndUser = async (vendorId: number, userId: number) => {
  try {
    console.log(`[SERVICE] Fetching leads for vendor ${vendorId} and user ${userId}`);

    // First, get user role information
    const userInfo = await getUserRole(userId, vendorId);
    
    if (!userInfo.isValid) {
      throw new Error("User not found or inactive");
    }

    console.log(`[SERVICE] User role: ${userInfo.userType}`);

    const userType = userInfo.userType ?? "";

    let whereCondition: any = {
      vendor_id: vendorId,
      is_deleted: false,
      account: {
        is_deleted: false,
      },
    };

    // Role-based filtering
    if (userType === "sales-executive") {
      // Sales executives can only see leads they created OR leads assigned to them
      whereCondition.OR = [
        { created_by: userId },  // Leads created by them
        { assign_to: userId },   // Leads assigned to them
      ];
      
      console.log(`[SERVICE] Applied sales-executive filter for user ${userId}`);
    } else if (["admin", "super-admin"].includes(userType)) {
      // Admins and super-admins can see all leads for their vendor
      // No additional filtering needed beyond vendor_id
      console.log(`[SERVICE] Admin/Super-admin access - showing all vendor leads`);
    } else {
      // Other roles (if any) - restrict to only their created leads
      whereCondition.created_by = userId;
      console.log(`[SERVICE] Restricted access for role ${userType} - only created leads`);
    }

    const leads = await prisma.leadMaster.findMany({
      where: whereCondition,
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
        statusType: true,
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    console.log(`[SERVICE] Found ${leads.length} leads for user ${userId} (${userInfo.userType})`);

    return {
      leads,
      userInfo: {
        role: userType,
        canViewAllLeads: ["admin", "super-admin"].includes(userType),
        userData: userInfo.userData,
      },
    };
  } catch (error: any) {
    console.error("[SERVICE] Error fetching leads:", error);
    throw error;
  }
};

// Service function to get a single lead by ID with role-based access control
export const getLeadById = async (leadId: number, userId: number, vendorId: number) => {
  try {
    console.log(`[SERVICE] Fetching lead ${leadId} for user ${userId} in vendor ${vendorId}`);

    // First, get user role information
    const userInfo = await getUserRole(userId, vendorId);
    
    if (!userInfo.isValid) {
      throw new Error("User not found or inactive");
    }

    console.log(`[SERVICE] User role: ${userInfo.userType}`);

    const userType = userInfo.userType ?? "";

    // Base condition - lead must exist, belong to vendor, and not be deleted
    let whereCondition: any = {
      id: leadId,
      vendor_id: vendorId,
      is_deleted: false,
      account: {
        is_deleted: false,
      },
    };

    // Role-based filtering - same logic as the list API
    if (userType === "sales-executive") {
      // Sales executives can only see leads they created OR leads assigned to them
      whereCondition.OR = [
        { created_by: userId },  // Leads created by them
        { assign_to: userId },   // Leads assigned to them
      ];
      
      console.log(`[SERVICE] Applied sales-executive filter for user ${userId}`);
    } else if (["admin", "super-admin"].includes(userType)) {
      // Admins and super-admins can see all leads for their vendor
      // No additional filtering needed beyond vendor_id and leadId
      console.log(`[SERVICE] Admin/Super-admin access - can view any vendor lead`);
    } else {
      // Other roles (if any) - restrict to only their created leads
      whereCondition.created_by = userId;
      console.log(`[SERVICE] Restricted access for role ${userType} - only created leads`);
    }

    const lead = await prisma.leadMaster.findFirst({
      where: whereCondition,
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
        createdBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            user_name: true,
            user_email: true,
            user_contact: true,
          },
        },
      },
    });

    if (!lead) {
      throw new Error("Lead not found or access denied");
    }

    console.log(`[SERVICE] Found lead ${leadId} for user ${userId} (${userInfo.userType})`);

    return {
      lead,
      userInfo: {
        role: userType,
        canViewAllLeads: ["admin", "super-admin"].includes(userType),
        userData: userInfo.userData,
      },
    };
  } catch (error: any) {
    console.error("[SERVICE] Error fetching lead:", error);
    throw error;
  }
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

export const getSalesExecutivesByVendor = async (vendorId: number): Promise<SalesExecutiveData[]> => {
  try {
    console.log(`[SERVICE] Fetching sales executives for vendor ID: ${vendorId}`);

    // First, find the user type ID for 'sales-executive'
    const salesExecutiveType = await prisma.userTypeMaster.findFirst({
      where: {
        user_type: {
          equals: "sales-executive",
          mode: "insensitive", // Case insensitive search
        },
      },
    });

    if (!salesExecutiveType) {
      console.log("[SERVICE] Sales executive user type not found");
      return [];
    }

    console.log(`[SERVICE] Found sales executive type ID: ${salesExecutiveType.id}`);

    // Fetch all users with sales-executive role for the specified vendor
    const salesExecutives = await prisma.userMaster.findMany({
      where: {
        vendor_id: vendorId,
        user_type_id: salesExecutiveType.id,
        // Optionally filter only active users
        status: "active",
      },
      include: {
        user_type: true,
        documents: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    console.log(`[SERVICE] Found ${salesExecutives.length} sales executives`);

    // Transform the data to match our interface
    const transformedData: SalesExecutiveData[] = salesExecutives.map((executive) => ({
      id: executive.id,
      vendor_id: executive.vendor_id,
      user_name: executive.user_name,
      user_contact: executive.user_contact,
      user_email: executive.user_email,
      user_timezone: executive.user_timezone,
      status: executive.status,
      created_at: executive.created_at,
      updated_at: executive.updated_at,
      user_type: {
        id: executive.user_type.id,
        user_type: executive.user_type.user_type,
      },
      documents: executive.documents.map((doc) => ({
        id: doc.id,
        document_name: doc.document_name,
        document_number: doc.document_number,
        filename: doc.filename,
      })),
    }));

    return transformedData;
  } catch (error: any) {
    console.error("[SERVICE] Error fetching sales executives:", error);
    throw new Error(`Failed to fetch sales executives: ${error.message}`);
  }
};

/**
 * Get a specific sales executive by ID within a vendor
 * @param vendorId - The vendor ID
 * @param userId - The user ID of the sales executive
 * @returns Promise<SalesExecutiveData | null>
 */
export const getSalesExecutiveById = async (
  vendorId: number,
  userId: number
): Promise<SalesExecutiveData | null> => {
  try {
    console.log(`[SERVICE] Fetching sales executive ID: ${userId} for vendor: ${vendorId}`);

    // First, find the user type ID for 'sales-executive'
    const salesExecutiveType = await prisma.userTypeMaster.findFirst({
      where: {
        user_type: {
          equals: "sales-executive",
          mode: "insensitive",
        },
      },
    });

    if (!salesExecutiveType) {
      console.log("[SERVICE] Sales executive user type not found");
      return null;
    }

    // Fetch the specific sales executive
    const salesExecutive = await prisma.userMaster.findFirst({
      where: {
        id: userId,
        vendor_id: vendorId,
        user_type_id: salesExecutiveType.id,
      },
      include: {
        user_type: true,
        documents: true,
      },
    });

    if (!salesExecutive) {
      console.log(`[SERVICE] Sales executive not found with ID: ${userId}`);
      return null;
    }

    // Transform the data
    const transformedData: SalesExecutiveData = {
      id: salesExecutive.id,
      vendor_id: salesExecutive.vendor_id,
      user_name: salesExecutive.user_name,
      user_contact: salesExecutive.user_contact,
      user_email: salesExecutive.user_email,
      user_timezone: salesExecutive.user_timezone,
      status: salesExecutive.status,
      created_at: salesExecutive.created_at,
      updated_at: salesExecutive.updated_at,
      user_type: {
        id: salesExecutive.user_type.id,
        user_type: salesExecutive.user_type.user_type,
      },
      documents: salesExecutive.documents.map((doc) => ({
        id: doc.id,
        document_name: doc.document_name,
        document_number: doc.document_number,
        filename: doc.filename,
      })),
    };

    return transformedData;
  } catch (error: any) {
    console.error("[SERVICE] Error fetching sales executive by ID:", error);
    throw new Error(`Failed to fetch sales executive: ${error.message}`);
  }
};

/**
 * Assign lead to a sales executive
 * @param leadId - Lead ID to assign
 * @param vendorId - Vendor ID
 * @param payload - Assignment payload with assign_to and assign_by
 * @returns Promise<LeadAssignmentResult>
 */
export const assignLeadToUser = async (
  leadId: number,
  vendorId: number,
  payload: AssignLeadPayload
): Promise<LeadAssignmentResult> => {
  try {
    console.log(`[SERVICE] Starting lead assignment process`);
    console.log(`[SERVICE] Lead ID: ${leadId}, Vendor ID: ${vendorId}`);
    console.log(`[SERVICE] Assign to: ${payload.assign_to}, Assign by: ${payload.assign_by}`);

    // Step 1: Validate admin user (assign_by)
    const adminUser = await validateAdminUser(payload.assign_by, vendorId);
    if (!adminUser) {
      throw new Error("Invalid admin user or insufficient permissions");
    }

    // Step 2: Validate sales executive user (assign_to)
    const salesExecutiveUser = await validateSalesExecutiveUser(payload.assign_to, vendorId);
    if (!salesExecutiveUser) {
      throw new Error("Invalid sales executive user or user is not active");
    }

    // Step 3: Validate lead ownership
    const isValidLead = await validateLeadOwnership(leadId, vendorId);
    if (!isValidLead) {
      throw new Error("Lead not found or doesn't belong to this vendor");
    }

    // Step 4: Check if lead is already assigned to the same user
    const currentLead = await prisma.leadMaster.findUnique({
      where: { id: leadId },
      select: { assign_to: true, firstname: true, lastname: true },
    });

    if (currentLead?.assign_to === payload.assign_to) {
      throw new Error(`Lead is already assigned to ${salesExecutiveUser.user_name}`);
    }

    // Step 5: Update the lead assignment
    const updatedLead = await prisma.leadMaster.update({
      where: {
        id: leadId,
      },
      data: {
        assign_to: payload.assign_to,
        assigned_by: payload.assign_by,
        updated_by: payload.assign_by,
        updated_at: new Date(),
      },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        contact_no: true,
        email: true,
        assign_to: true,
        assigned_by: true,
        updated_at: true,
      },
    });

    console.log(`[SERVICE] Lead assignment successful`);
    console.log(`[SERVICE] Lead ${leadId} assigned to ${salesExecutiveUser.user_name} by ${adminUser.user_name}`);

    // Step 6: Prepare response data
    const result: LeadAssignmentResult = {
      lead: updatedLead,
      assignedTo: {
        id: salesExecutiveUser.id,
        user_name: salesExecutiveUser.user_name,
        user_contact: "", // Will be fetched separately if needed
        user_email: "", // Will be fetched separately if needed
      },
      assignedBy: {
        id: adminUser.id,
        user_name: adminUser.user_name,
        user_contact: "", // Will be fetched separately if needed
        user_email: "", // Will be fetched separately if needed
      },
    };

    // Optionally fetch full user details
    const [assignedToDetails, assignedByDetails] = await Promise.all([
      prisma.userMaster.findUnique({
        where: { id: payload.assign_to },
        select: { user_contact: true, user_email: true },
      }),
      prisma.userMaster.findUnique({
        where: { id: payload.assign_by },
        select: { user_contact: true, user_email: true },
      }),
    ]);

    if (assignedToDetails) {
      result.assignedTo.user_contact = assignedToDetails.user_contact;
      result.assignedTo.user_email = assignedToDetails.user_email;
    }

    if (assignedByDetails) {
      result.assignedBy.user_contact = assignedByDetails.user_contact;
      result.assignedBy.user_email = assignedByDetails.user_email;
    }

    return result;
  } catch (error: any) {
    console.error("[SERVICE] Error assigning lead:", error);
    throw error;
  }
};