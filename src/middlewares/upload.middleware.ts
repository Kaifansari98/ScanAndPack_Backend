import multer from "multer";
import path from "path";
import fs from "fs";
import { sanitizeFilename } from "../utils/fileUtils";

// Debug: Print current directory and resolved path
console.log("[DEBUG] __dirname:", __dirname);
const uploadPath = path.join(__dirname, "..", "assets", "scan-and-pack");
console.log("[DEBUG] Upload path resolved to:", uploadPath);

// Ensure folder exists
if (!fs.existsSync(uploadPath)) {
  console.log("[DEBUG] Creating upload directory:", uploadPath);
  fs.mkdirSync(uploadPath, { recursive: true });
} else {
  console.log("[DEBUG] Upload directory already exists:", uploadPath);
}

// Max size from env
const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || "5") * 1024 * 1024;
console.log("[DEBUG] Max file size set to:", maxSize, "bytes");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log("[DEBUG] Multer destination called for file:", file.originalname);
    console.log("[DEBUG] Saving to directory:", uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    console.log("[DEBUG] Multer filename called for file:", file.originalname);
    
    const timestamp = Date.now();
    const randomId = Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext);
    
    // ✅ Use sanitizeFilename utility to clean the original filename
    const sanitizedBaseName = sanitizeFilename(baseName).substring(0, 20); // Limit length
    const uniqueName = `${timestamp}-${randomId}-${sanitizedBaseName}${ext}`;
    
    console.log("[DEBUG] Generated filename:", uniqueName);
    console.log("[DEBUG] Full path will be:", path.join(uploadPath, uniqueName));
    
    cb(null, uniqueName);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: maxSize },
  fileFilter: (req, file, cb) => {
    console.log("[DEBUG] File filter called for:", file.originalname, "MIME:", file.mimetype);
    
    // Accept only images and PDFs
    const allowedMimeTypes = [
      "image/jpeg",
      "image/jpg", 
      "image/png",
      "image/gif",
      "application/pdf"
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      console.log("[DEBUG] File accepted:", file.originalname);
      cb(null, true);
    } else {
      console.log("[DEBUG] File rejected:", file.originalname, "MIME:", file.mimetype);
      cb(new Error(`Only image files and PDFs are allowed! Received: ${file.mimetype}`));
    }
  },
});