import Joi from 'joi';
import { LeadPriority } from '@prisma/client';

export const createLeadSchema = Joi.object({
  firstname: Joi.string().trim().min(2).max(50).required(),
  lastname: Joi.string().trim().min(2).max(50).required(),
  country_code: Joi.string().pattern(/^\+\d{1,4}$/).required(),
  contact_no: Joi.string().pattern(/^\d{10,15}$/).required(),
  alt_contact_no: Joi.string().pattern(/^\d{10,15}$/).optional(),
  email: Joi.string().email().optional(),
  site_address: Joi.string().trim().min(10).max(500).required(),
  site_type_id: Joi.number().integer().positive().optional(),
  priority: Joi.string().valid(...Object.values(LeadPriority)).required(),
  billing_name: Joi.string().trim().max(100).optional(),
  source_id: Joi.number().integer().positive().required(),
  archetech_name: Joi.string().trim().max(100).optional(),
  designer_remark: Joi.string().trim().max(1000).optional(),
  vendor_id: Joi.number().integer().positive().required(),
  created_by: Joi.number().integer().positive().required(),
  product_types: Joi.array().items(Joi.string().trim()).optional(),
  product_structures: Joi.array().items(Joi.string().trim()).optional(),
});