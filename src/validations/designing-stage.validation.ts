import { body } from "express-validator";

export const updateLeadStatusValidation = [
  body("lead_id").isInt().withMessage("lead_id must be an integer"),
  body("user_id").isInt().withMessage("user_id must be an integer"),
  body("vendor_id").isInt().withMessage("vendor_id must be an integer"),
];