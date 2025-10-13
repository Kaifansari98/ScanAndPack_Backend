import Joi from "joi";
import { prisma } from "../prisma/client";
import { UserRoleInfo } from "../types/leadModule.types";

// 🧩 Reusable helper for numeric fields (accepts number or numeric string)
const numberLike = Joi.alternatives()
  .try(Joi.number().integer().positive(), Joi.string().regex(/^\d+$/))
  .messages({
    "alternatives.match": "This field must be a valid number",
  });

// 🗓️ Optional date constraint for today or future
const today = new Date();
today.setHours(0, 0, 0, 0);

export const createLeadSchema = Joi.object({
  firstname: Joi.string().trim().min(2).max(50).required(),
  lastname: Joi.string().trim().min(2).max(50).required(),

  country_code: Joi.string()
    .pattern(/^\+\d{1,4}$/)
    .required(),

  contact_no: Joi.string()
    .pattern(/^\d{10,15}$/)
    .required(),

  alt_contact_no: Joi.string()
    .pattern(/^\d{10,15}$/)
    .optional()
    .allow("", null),

  email: Joi.string().email().optional().allow("", null),

  site_address: Joi.string().trim().min(1).max(2000).required(),
  site_map_link: Joi.string().uri().optional().allow("", null, ""),

  site_type_id: numberLike.optional().allow(null),
  source_id: numberLike.required().messages({
    "alternatives.match": '"source_id" must be a valid number',
  }),

  archetech_name: Joi.string().trim().max(100).optional().allow("", null),
  designer_remark: Joi.string().trim().max(1000).optional().allow("", null),

  vendor_id: numberLike.required(),
  created_by: numberLike.required(),
  assign_to: numberLike.optional().allow(null),
  assigned_by: numberLike.optional().allow(null),

  status_id: numberLike.required(),

  product_types: Joi.array().items(numberLike).min(1).required().messages({
    "any.required": "At least one product type is required",
    "array.min": "At least one product type must be selected",
  }),

  product_structures: Joi.array().items(numberLike).min(1).required().messages({
    "any.required": "At least one product structure is required",
    "array.min": "At least one product structure must be selected",
  }),

  initial_site_measurement_date: Joi.date().min(today).optional().messages({
    "date.min": "Initial site measurement date cannot be in the past",
  }),

  is_draft: Joi.boolean().optional(),
});

export const createLeadDraftSchema = Joi.object({
  firstname: Joi.string().trim().min(1).max(50).required(),
  lastname: Joi.string().trim().max(50).optional().allow("", null),

  country_code: Joi.string()
    .pattern(/^\+\d{1,4}$/)
    .required(),

  contact_no: Joi.string()
    .pattern(/^\d{10,15}$/)
    .required(),

  alt_contact_no: Joi.string()
    .pattern(/^\d{10,15}$/)
    .optional()
    .allow("", null),

  email: Joi.string().email().optional().allow("", null),

  site_address: Joi.string().max(2000).optional().allow("", null),
  site_map_link: Joi.string().uri().optional().allow("", null, ""),

  site_type_id: numberLike.optional().allow(null),
  source_id: numberLike.optional().allow(null), // ✅ Drafts don't require this
  archetech_name: Joi.string().trim().max(100).optional().allow("", null),
  designer_remark: Joi.string().trim().max(1000).optional().allow("", null),

  vendor_id: numberLike.required(),
  created_by: numberLike.required(),
  assign_to: numberLike.optional().allow(null),
  assigned_by: numberLike.optional().allow(null),

  status_id: numberLike.optional(), // ✅ allow missing
  product_types: Joi.array().items(numberLike).optional(),
  product_structures: Joi.array().items(numberLike).optional(),
  initial_site_measurement_date: Joi.date().optional().allow(null),

  is_draft: Joi.boolean().optional(),
});

/**
 * Checks if a lead has all mandatory fields filled
 * Returns true if the lead should no longer be a draft
 */
export const isLeadComplete = (lead: any): boolean => {
  const requiredFields = {
    firstname: lead.firstname,
    lastname: lead.lastname,
    contact_no: lead.contact_no,
    site_type_id: lead.site_type_id,
    site_address: lead.site_address,
    source_id: lead.source_id,
  };

  // Check if all required fields are filled
  const allFieldsFilled = Object.values(requiredFields).every(
    (value) => value !== null && value !== undefined && value !== ""
  );

  if (!allFieldsFilled) return false;

  // Check product types (at least one required)
  const hasProductTypes =
    lead.productMappings && lead.productMappings.length > 0;

  // Check product structures (at least one required)
  const hasProductStructures =
    lead.leadProductStructureMapping &&
    lead.leadProductStructureMapping.length > 0;

  return hasProductTypes && hasProductStructures;
};

interface UpdateLeadValidationResult {
  isValid: boolean;
  errors: string[];
}

interface UpdateLeadInput {
  firstname?: string;
  lastname?: string;
  country_code?: string;
  contact_no?: string;
  alt_contact_no?: string;
  email?: string;
  site_address?: string;
  site_type_id?: number;
  source_id?: number;
  archetech_name?: string;
  designer_remark?: string;
  updated_by?: number;
  product_types?: number[];
  product_structures?: number[];
}

export const validateUpdateLeadInput = (
  input: UpdateLeadInput
): UpdateLeadValidationResult => {
  const errors: string[] = [];

  // Only validate fields that are provided (partial update support)
  if (input.firstname !== undefined) {
    if (
      typeof input.firstname !== "string" ||
      input.firstname.trim().length === 0
    ) {
      errors.push("firstname must be a non-empty string if provided");
    }
  }

  if (input.lastname !== undefined) {
    if (
      typeof input.lastname !== "string" ||
      input.lastname.trim().length === 0
    ) {
      errors.push("lastname must be a non-empty string if provided");
    }
  }

  if (input.country_code !== undefined) {
    if (
      typeof input.country_code !== "string" ||
      input.country_code.trim().length === 0
    ) {
      errors.push("country_code must be a non-empty string if provided");
    }
  }

  if (input.contact_no !== undefined) {
    if (
      typeof input.contact_no !== "string" ||
      input.contact_no.trim().length === 0
    ) {
      errors.push("contact_no must be a non-empty string if provided");
    }
  }

  if (input.site_address !== undefined) {
    if (
      typeof input.site_address !== "string" ||
      input.site_address.trim().length === 0
    ) {
      errors.push("site_address must be a non-empty string if provided");
    }
  }

  if (input.source_id !== undefined) {
    if (typeof input.source_id !== "number") {
      errors.push("source_id must be a number if provided");
    }
  }

  // updated_by is required for audit trail
  if (
    input.updated_by === undefined ||
    input.updated_by === null ||
    typeof input.updated_by !== "number"
  ) {
    errors.push("updated_by is required and must be a number");
  }

  // Optional fields validation (if provided)
  if (
    input.alt_contact_no !== undefined &&
    input.alt_contact_no !== null &&
    typeof input.alt_contact_no !== "string"
  ) {
    errors.push("alt_contact_no must be a string if provided");
  }

  if (input.email !== undefined && input.email !== null) {
    if (typeof input.email !== "string") {
      errors.push("email must be a string if provided");
    } else if (input.email.trim().length > 0 && !isValidEmail(input.email)) {
      errors.push("email must be a valid email address if provided");
    }
  }

  if (
    input.site_type_id !== undefined &&
    input.site_type_id !== null &&
    typeof input.site_type_id !== "number"
  ) {
    errors.push("site_type_id must be a number if provided");
  }

  if (
    input.archetech_name !== undefined &&
    input.archetech_name !== null &&
    typeof input.archetech_name !== "string"
  ) {
    errors.push("archetech_name must be a string if provided");
  }

  if (
    input.designer_remark !== undefined &&
    input.designer_remark !== null &&
    typeof input.designer_remark !== "string"
  ) {
    errors.push("designer_remark must be a string if provided");
  }

  // Validate arrays
  if (input.product_types !== undefined) {
    if (!Array.isArray(input.product_types)) {
      errors.push("product_types must be an array if provided");
    } else {
      for (let i = 0; i < input.product_types.length; i++) {
        if (typeof input.product_types[i] !== "number") {
          errors.push(`product_types[${i}] must be a number`);
        }
      }
    }
  }

  if (input.product_structures !== undefined) {
    if (!Array.isArray(input.product_structures)) {
      errors.push("product_structures must be an array if provided");
    } else {
      for (let i = 0; i < input.product_structures.length; i++) {
        if (typeof input.product_structures[i] !== "number") {
          errors.push(`product_structures[${i}] must be a number`);
        }
      }
    }
  }

  // Contact number validation (basic)
  if (input.contact_no && typeof input.contact_no === "string") {
    if (input.contact_no.length < 7 || input.contact_no.length > 15) {
      errors.push("contact_no must be between 7 and 15 characters");
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Helper function to validate email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validation schema for lead assignment
 */
export const assignLeadSchema = Joi.object({
  assign_to: Joi.number().integer().positive().required().messages({
    "number.base": "assign_to must be a number",
    "number.integer": "assign_to must be an integer",
    "number.positive": "assign_to must be a positive number",
    "any.required": "assign_to is required",
  }),

  assign_by: Joi.number().integer().positive().required().messages({
    "number.base": "assign_by must be a number",
    "number.integer": "assign_by must be an integer",
    "number.positive": "assign_by must be a positive number",
    "any.required": "assign_by is required",
  }),

  // Optional: Add reason for assignment
  assignment_reason: Joi.string().min(3).max(500).optional().messages({
    "string.min": "Assignment reason must be at least 3 characters",
    "string.max": "Assignment reason cannot exceed 500 characters",
  }),
});

/**
 * Validate lead assignment input
 * @param data - The request data to validate
 * @returns Validation result with isValid flag and errors
 */
export const validateLeadAssignmentInput = (data: any) => {
  const { error, value } = assignLeadSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join("."),
      message: detail.message,
      value: detail.context?.value,
    }));

    return {
      isValid: false,
      errors,
      data: null,
    };
  }

  return {
    isValid: true,
    errors: null,
    data: value,
  };
};

/**
 * Validate if user has admin or super-admin role
 * @param userId - User ID to check
 * @param vendorId - Vendor ID to verify user belongs to
 * @returns Promise<UserRoleInfo | null>
 */
export const validateAdminUser = async (
  userId: number,
  vendorId: number
): Promise<UserRoleInfo | null> => {
  try {
    console.log(
      `[SERVICE] Validating admin user ID: ${userId} for vendor: ${vendorId}`
    );

    const user = await prisma.userMaster.findFirst({
      where: {
        id: userId,
        vendor_id: vendorId,
        status: "active", // Only active users can perform assignments
      },
      include: {
        user_type: true,
      },
    });

    if (!user) {
      console.log(`[SERVICE] User not found or not active: ${userId}`);
      return null;
    }

    // Check if user has admin or super-admin role
    const allowedRoles = ["admin", "super-admin"];
    const userRole = user.user_type.user_type.toLowerCase();

    if (!allowedRoles.includes(userRole)) {
      console.log(
        `[SERVICE] User ${userId} has insufficient permissions. Role: ${userRole}`
      );
      return null;
    }

    console.log(
      `[SERVICE] Admin validation successful. User: ${user.user_name}, Role: ${userRole}`
    );

    return {
      id: user.id,
      vendor_id: user.vendor_id,
      user_name: user.user_name,
      status: user.status,
      user_type: {
        id: user.user_type.id,
        user_type: user.user_type.user_type,
      },
    };
  } catch (error: any) {
    console.error("[SERVICE] Error validating admin user:", error);
    throw new Error(`Failed to validate admin user: ${error.message}`);
  }
};

/**
 * Validate if user has sales-executive role
 * @param userId - User ID to check
 * @param vendorId - Vendor ID to verify user belongs to
 * @returns Promise<UserRoleInfo | null>
 */
export const validateSalesExecutiveUser = async (
  userId: number,
  vendorId: number
): Promise<UserRoleInfo | null> => {
  try {
    console.log(
      `[SERVICE] Validating sales executive user ID: ${userId} for vendor: ${vendorId}`
    );

    const user = await prisma.userMaster.findFirst({
      where: {
        id: userId,
        vendor_id: vendorId,
        status: "active", // Only active users can be assigned leads
      },
      include: {
        user_type: true,
      },
    });

    if (!user) {
      console.log(
        `[SERVICE] Sales executive not found or not active: ${userId}`
      );
      return null;
    }

    // Check if user has sales-executive role
    const userRole = user.user_type.user_type.toLowerCase();
    if (userRole !== "sales-executive") {
      console.log(
        `[SERVICE] User ${userId} is not a sales executive. Role: ${userRole}`
      );
      return null;
    }

    console.log(
      `[SERVICE] Sales executive validation successful. User: ${user.user_name}`
    );

    return {
      id: user.id,
      vendor_id: user.vendor_id,
      user_name: user.user_name,
      status: user.status,
      user_type: {
        id: user.user_type.id,
        user_type: user.user_type.user_type,
      },
    };
  } catch (error: any) {
    console.error("[SERVICE] Error validating sales executive user:", error);
    throw new Error(
      `Failed to validate sales executive user: ${error.message}`
    );
  }
};

/**
 * Check if lead exists and belongs to the vendor
 * @param leadId - Lead ID to check
 * @param vendorId - Vendor ID to verify lead belongs to
 * @returns Promise<boolean>
 */
export const validateLeadOwnership = async (
  leadId: number,
  vendorId: number
): Promise<boolean> => {
  try {
    console.log(
      `[SERVICE] Validating lead ownership. Lead ID: ${leadId}, Vendor ID: ${vendorId}`
    );

    const lead = await prisma.leadMaster.findFirst({
      where: {
        id: leadId,
        vendor_id: vendorId,
        is_deleted: false, // Only non-deleted leads can be assigned
      },
    });

    if (!lead) {
      console.log(
        `[SERVICE] Lead not found or doesn't belong to vendor: ${leadId}`
      );
      return false;
    }

    console.log(`[SERVICE] Lead ownership validation successful`);
    return true;
  } catch (error: any) {
    console.error("[SERVICE] Error validating lead ownership:", error);
    throw new Error(`Failed to validate lead ownership: ${error.message}`);
  }
};

/**
 * Get user role information
 * @param userId - User ID to check
 * @param vendorId - Vendor ID for additional validation
 * @returns Promise<{userType: string, isValid: boolean}>
 */
export const getUserRole = async (userId: number, vendorId: number) => {
  try {
    const user = await prisma.userMaster.findFirst({
      where: {
        id: userId,
        vendor_id: vendorId,
        status: "active",
      },
      include: {
        user_type: true,
      },
    });

    if (!user) {
      return { userType: null, isValid: false };
    }

    return {
      userType: user.user_type.user_type.toLowerCase(),
      isValid: true,
      userData: {
        id: user.id,
        name: user.user_name,
        email: user.user_email,
        contact: user.user_contact,
      },
    };
  } catch (error: any) {
    console.error("[SERVICE] Error fetching user role:", error);
    throw new Error(`Failed to fetch user role: ${error.message}`);
  }
};
