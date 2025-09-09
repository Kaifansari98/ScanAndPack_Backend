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

export const createDesignSelectionValidation = [
  body("lead_id")
    .notEmpty()
    .withMessage("lead_id is required")
    .isNumeric({ no_symbols: true })
    .withMessage("lead_id must be a valid number")
    .toInt(), // Convert string to integer

  body("account_id")
    .notEmpty()
    .withMessage("account_id is required")
    .isNumeric({ no_symbols: true })
    .withMessage("account_id must be a valid number")
    .toInt(), // Convert string to integer

  body("vendor_id")
    .notEmpty()
    .withMessage("vendor_id is required")
    .isNumeric({ no_symbols: true })
    .withMessage("vendor_id must be a valid number")
    .toInt(), // Convert string to integer

  body("type")
    .notEmpty()
    .withMessage("type is required")
    .isLength({ min: 1, max: 1000 })
    .withMessage("type must be between 1 and 1000 characters")
    .trim(), // Remove whitespace

  body("desc")
    .notEmpty()
    .withMessage("desc is required")
    .isLength({ min: 1, max: 2000 })
    .withMessage("desc must be between 1 and 2000 characters")
    .trim(), // Remove whitespace

  body("created_by")
    .notEmpty()
    .withMessage("created_by is required")
    .isNumeric({ no_symbols: true })
    .withMessage("created_by must be a valid number")
    .toInt(), // Convert string to integer
];