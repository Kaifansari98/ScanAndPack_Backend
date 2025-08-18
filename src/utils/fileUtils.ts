import path from 'path';
import { DocumentType } from '@prisma/client';

export const getDocumentTypeFromFile = (file: Express.Multer.File): DocumentType => {
  // You can extend this logic based on file types, field names, etc.
  const extension = path.extname(file.originalname).toLowerCase();
  
  switch (extension) {
    case '.pdf':
      return DocumentType.site_photo; // or add more document types
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
      return DocumentType.site_photo;
    default:
      return DocumentType.site_photo;
  }
};

export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
};