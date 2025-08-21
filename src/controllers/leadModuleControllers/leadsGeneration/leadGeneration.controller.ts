import { Request, Response } from "express";
import { createLeadService, getLeadsByVendor, getLeadsByVendorAndUser, softDeleteLead } from "../../../services/leadModuleServices/leadsGeneration/leadGeneration.service";
import { createLeadSchema } from "../../../validations/leadValidation";

export const createLead = async (req: Request, res: Response) => {
  console.log("[CONTROLLER] createLead called");
  console.log("[DEBUG] Request files:", req.files ? req.files.length : 0);
  console.log("[DEBUG] Request body keys:", Object.keys(req.body));

  try {
    // Files are optional - empty array if none provided
    const files = (req.files as Express.Multer.File[]) || [];
    console.log("[DEBUG] Processed files array length:", files.length);
    
    const payload = {
      ...req.body,
      site_type_id: req.body.site_type_id ? Number(req.body.site_type_id) : undefined,
      source_id: Number(req.body.source_id),
      vendor_id: Number(req.body.vendor_id),
      created_by: Number(req.body.created_by),
      product_types: req.body.product_types ? [].concat(req.body.product_types) : [],
      product_structures: req.body.product_structures ? [].concat(req.body.product_structures) : [],
    };

    // Basic validation for debugging
    console.log("[DEBUG] Payload validation - firstname:", payload.firstname);
    console.log("[DEBUG] Payload validation - priority:", payload.priority);

    // ✅ Use Joi validation instead of manual checks
    const { error, value } = createLeadSchema.validate(payload);
    if (error) {
      return res.status(400).json({ 
        success: false,
        error: "Validation failed", 
        details: error.details.map(d => ({
          field: d.path.join('.'),
          message: d.message
        }))
      });
    }

    // Optional: Validate file count if files are provided
    if (files.length > 10) {
      return res.status(400).json({ 
        success: false,
        error: "Too many files", 
        details: "Maximum 10 files allowed" 
      });
    }

    const result = await createLeadService(value, files);
    
    console.log("[SUCCESS] Lead created:", result.lead.id);
    console.log("[DEBUG] Documents processed:", result.documentsProcessed);
    return res.status(201).json({ 
      success: true,
      message: "Lead created successfully", 
      data: {
        ...result,
        documentsUploaded: files.length
      }
    });

  } catch (error: any) {
    console.error("[ERROR] createLead:", error);
    console.error("[ERROR] Stack trace:", error.stack);
    
    // Handle known validation errors
    if (error.message.includes('Invalid priority')) {
      return res.status(400).json({
        success: false,
        error: "Invalid priority value",
        details: error.message
      });
    }
    
    return res.status(500).json({ 
      success: false,
      error: "Internal server error", 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const fetchLeadsByVendor = async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    if (isNaN(vendorId)) {
      return res.status(400).json({ error: "Invalid vendorId" });
    }

    const leads = await getLeadsByVendor(vendorId);
    res.json(leads);
  } catch (error: any) {
    console.error("[CONTROLLER] fetchLeadsByVendor error:", error);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
};

export const fetchLeadsByVendorAndUser = async (req: Request, res: Response) => {
  try {
    const vendorId = parseInt(req.params.vendorId);
    const userId = parseInt(req.params.userId);

    if (isNaN(vendorId) || isNaN(userId)) {
      return res.status(400).json({ error: "Invalid vendorId or userId" });
    }

    const leads = await getLeadsByVendorAndUser(vendorId, userId);
    res.json(leads);
  } catch (error: any) {
    console.error("[CONTROLLER] fetchLeadsByVendorAndUser error:", error);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
};

export const deleteLead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { deletedBy } = req.params;

    if (!deletedBy) {
      return res.status(400).json({ message: "deletedBy is required" });
    }

    const lead = await softDeleteLead(Number(id), Number(deletedBy));
      return res.status(200).json({ message: "Lead deleted successfully", lead });
  } catch (error: any) {
    return res.status(400).json({ message: error.message });
  }
}