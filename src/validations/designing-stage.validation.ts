import { body, param } from "express-validator";

export const updateLeadStatusValidation = [
  body("lead_id").isInt().withMessage("lead_id must be an integer"),
  body("user_id").isInt().withMessage("user_id must be an integer"),
  body("vendor_id").isInt().withMessage("vendor_id must be an integer"),
];

export const editDesignMeetingValidation = [
    param("meetingId")
      .notEmpty()
      .withMessage("Meeting ID is required")
      .isNumeric()
      .withMessage("Meeting ID must be a number"),
      
    body("vendorId")
      .notEmpty()
      .withMessage("Vendor ID is required")
      .isNumeric()
      .withMessage("Vendor ID must be a number"),
      
    body("userId")
      .notEmpty()
      .withMessage("User ID is required")
      .isNumeric()
      .withMessage("User ID must be a number"),
      
    body("date")
      .optional()
      .isISO8601()
      .withMessage("Date must be a valid ISO 8601 date"),
      
    body("desc")
      .optional()
      .isString()
      .withMessage("Description must be a string")
      .isLength({ max: 2000 })
      .withMessage("Description cannot exceed 2000 characters")
];