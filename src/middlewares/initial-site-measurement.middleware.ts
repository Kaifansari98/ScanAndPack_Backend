import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

// Validation middleware
export const validatePaymentUpload = [
  body('lead_id')
    .isInt({ min: 1 })
    .withMessage('lead_id must be a valid positive integer'),
  
  body('account_id')
    .isInt({ min: 1 })
    .withMessage('account_id must be a valid positive integer'),
  
  body('vendor_id')
    .isInt({ min: 1 })
    .withMessage('vendor_id must be a valid positive integer'),
  
  body('created_by')
    .isInt({ min: 1 })
    .withMessage('created_by must be a valid positive integer'),
  
  body('client_id')
    .isInt({ min: 1 })
    .withMessage('client_id must be a valid positive integer'),
  
  body('amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('amount must be a valid positive number'),
  
  body('payment_date')
    .optional()
    .isISO8601()
    .withMessage('payment_date must be a valid ISO 8601 date'),
  
  body('payment_text')
    .optional()
    .isLength({ max: 2000 })
    .withMessage('payment_text cannot exceed 2000 characters'),

  // Custom validation for conditional fields
  body('payment_date').custom((value, { req }) => {
    if (req.body.amount && !value) {
      throw new Error('payment_date is required when amount is provided');
    }
    return true;
  }),

  // Handle validation errors
  (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }
    next();
  }
];

// File validation middleware
export const validateFiles = (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    // Check if PDF file is provided (mandatory)
    if (!files?.upload_pdf || files.upload_pdf.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'PDF file upload is mandatory'
      });
    }

    // Validate payment image and payment text dependency
    const paymentImage = files?.payment_image?.[0];
    const paymentText = req.body.payment_text;

    if (paymentImage && !paymentText) {
      return res.status(400).json({
        success: false,
        message: 'payment_text is mandatory when payment image is uploaded'
      });
    }

    // Validate file sizes
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const allFiles = [
      ...(files.current_site_photos || []),
      ...(files.upload_pdf || []),
      ...(files.payment_image || [])
    ];

    for (const file of allFiles) {
      if (file.size > maxFileSize) {
        return res.status(400).json({
          success: false,
          message: `File ${file.originalname} exceeds maximum size of 10MB`
        });
      }
    }

    next();
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'File validation error',
      error: error.message
    });
  }
};

// Error handling middleware for multer
export const handleMulterError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds limit of 10MB'
      });
    }
    
    if (err.message === 'Invalid file type. Only PDF and image files are allowed.') {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }

    return res.status(400).json({
      success: false,
      message: 'File upload error',
      error: err.message
    });
  }
  next();
};