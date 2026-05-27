import { Request, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";

const MAX_FILES = parseInt(process.env.UPLOAD_MAX_FILES || "40");
const MAX_TOTAL_SIZE_MB = parseInt(process.env.UPLOAD_MAX_SIZE_MB || "400");
const MAX_FILE_SIZE_MB = parseInt(process.env.UPLOAD_SINGLE_FILE_SIZE_MB || "20");

function cleanupFiles(files: Express.Multer.File[]) {
  files.forEach((file) => {
    if (file?.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  });
}

export const handleMulterUpload = (uploadMiddleware: any) => {
  return (req: Request, res: Response, next: NextFunction) => {
    uploadMiddleware(req, res, (err: any) => {
      const files = (req.files as Express.Multer.File[]) || [];

      try {
        // Multer built-in errors
        if (err instanceof multer.MulterError) {
          cleanupFiles(files);

          switch (err.code) {
            case "LIMIT_FILE_SIZE":
              return res.status(400).json({
                success: false,
                error: `Single file size exceeded. Max ${MAX_FILE_SIZE_MB}MB allowed`,
              });

            case "LIMIT_FILE_COUNT":
              return res.status(400).json({
                success: false,
                error: `Maximum ${MAX_FILES} files allowed`,
              });

            case "LIMIT_UNEXPECTED_FILE":
              return res.status(400).json({
                success: false,
                error: "Unexpected file uploaded",
              });

            default:
              return res.status(400).json({
                success: false,
                error: err.message,
              });
          }
        }

        // Other / unknown errors
        if (err) {
          cleanupFiles(files);
          return res.status(500).json({
            success: false,
            error: err.message,
          });
        }

        // Manual file count validation
        if (files.length > MAX_FILES) {
          cleanupFiles(files);
          return res.status(400).json({
            success: false,
            error: `Maximum ${MAX_FILES} files allowed`,
          });
        }

        // Total upload size validation
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const maxTotalBytes = MAX_TOTAL_SIZE_MB * 1024 * 1024;

        if (totalSize > maxTotalBytes) {
          cleanupFiles(files);
          return res.status(400).json({
            success: false,
            error: `Total upload size exceeded. Maximum ${MAX_TOTAL_SIZE_MB}MB allowed`,
          });
        }

        next();
      } catch (error: any) {
        cleanupFiles(files);
        return res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });
  };
};
