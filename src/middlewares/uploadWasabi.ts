import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import { sanitizeFilename } from "../utils/fileUtils";
import wasabi from "../utils/wasabiClient";

const bucketName = process.env.WASABI_BUCKET_NAME || "furnix";

const storage = multerS3({
  s3: wasabi,
  bucket: bucketName,
  acl: "public-read", // or "private" depending on your needs
  key: (req, file, cb) => {
    const timestamp = Date.now();
    const randomId = Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);

    const sanitizedBaseName = sanitizeFilename(baseName).substring(0, 20);
    const uniqueName = `${timestamp}-${randomId}-${sanitizedBaseName}${ext}`;

    console.log("[DEBUG] Uploading file to Wasabi:", uniqueName);
    cb(null, uniqueName);
  },
});

export const upload = multer({
  storage: multer.memoryStorage(), // ✅ keep file in memory, don't auto-upload
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || "5") * 1024 * 1024, // default 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "application/pdf",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only image files and PDFs are allowed! Received: ${file.mimetype}`));
    }
  },
});