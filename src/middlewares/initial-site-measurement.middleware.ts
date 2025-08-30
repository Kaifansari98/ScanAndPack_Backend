import { Request, Response, NextFunction } from 'express';
import { body, validationResult, query, param  } from 'express-validator';

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

// Validation middleware for GET requests
export const validateGetRequest = [
  // Validate vendor_id in query params
  query('vendor_id')
    .isInt({ min: 1 })
    .withMessage('vendor_id must be a valid positive integer'),
  
  // Validate ID parameters
  param('leadId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('leadId must be a valid positive integer'),
  
  param('accountId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('accountId must be a valid positive integer'),
  
  param('id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('id must be a valid positive integer'),
  
  param('vendorId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('vendorId must be a valid positive integer'),
  
  param('documentId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('documentId must be a valid positive integer'),

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

// Validation middleware for pagination
export const validatePaginationRequest = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
  
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('startDate must be a valid ISO 8601 date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('endDate must be a valid ISO 8601 date'),

  // Custom validation for date range
  query('endDate').custom((endDate, { req }) => {
    if (endDate && req.query?.startDate) {
      const start = new Date(req.query.startDate as string);
      const end = new Date(endDate);
      if (end <= start) {
        throw new Error('endDate must be after startDate');
      }
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

// Error handling middleware
export const handleGetErrors = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[PaymentUploadGetMiddleware] Error:', err);
  
  if (err.name === 'PrismaClientKnownRequestError') {
    return res.status(400).json({
      success: false,
      message: 'Database error',
      error: 'Invalid request parameters'
    });
  }

  return res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: err.message
  });
};