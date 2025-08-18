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
      // 1. LeadMaster
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
          created_by
        }
      });
  
      // 2. AccountMaster
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
  
        // 3. Only create mappings for product types (no ProductTypeMaster creation)
        for (const type of product_types) {
            console.log("[DEBUG] Processing product type:", type);
            
            // Find existing product type
            const productType = await tx.productTypeMaster.findFirst({
            where: { type, vendor_id }
            });

            if (productType) {
            await tx.leadProductMapping.create({
                data: {
                vendor_id,
                lead_id: lead.id,
                account_id: account.id,
                product_type_id: productType.id,
                created_by
                }
            });
            console.log("[DEBUG] ✅ Product mapping created for type:", type);
            } else {
            console.log("[WARNING] Product type not found, skipping mapping for:", type);
            }
        }

        // 4. Only create mappings for product structures (no ProductStructure creation)
        for (const type of product_structures) {
            console.log("[DEBUG] Processing product structure:", type);
            
            // Find existing product structure
            const structure = await tx.productStructure.findFirst({
            where: { type, vendor_id }
            });

            if (structure) {
            await tx.leadProductStructureMapping.create({
                data: {
                vendor_id,
                lead_id: lead.id,
                account_id: account.id,
                product_structure_id: structure.id,
                created_by
                }
            });
            console.log("[DEBUG] ✅ Product structure mapping created for type:", type);
            } else {
            console.log("[WARNING] Product structure not found, skipping mapping for:", type);
            }
        }
  
      // 5. Documents (only if files are provided) with enhanced debugging
      let uploadedFiles: any[] = [];
      
      if (files && files.length > 0) {
        console.log(`[INFO] Processing ${files.length} document(s)`);
        
        for (const file of files) {
          // Double-check file exists before saving to DB
          const fileExists = fs.existsSync(file.path);
          console.log(`[DEBUG] File ${file.filename} exists: ${fileExists}`);
          
          const document = await tx.documentMaster.create({
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