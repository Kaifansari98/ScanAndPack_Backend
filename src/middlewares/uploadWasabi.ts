import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import { sanitizeFilename } from "../utils/fileUtils";
import wasabi from "../utils/wasabiClient";

const bucketName = process.env.WASABI_BUCKET_NAME || "vloq-furnix";

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

export const uploadFinalMeasurement = multer({
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

export const uploadClientApproval = multer({
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
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Only image files are allowed! Received: ${file.mimetype}`));
    }
  },
});

export const uploadClientDocumentation = multer({
  storage: multer.memoryStorage(), // ✅ keep file in memory
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || "5") * 1024 * 1024, // default 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",

      // PDF
      "application/pdf",

      // Word
      "application/msword", // .doc
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx

      // PowerPoint
      "application/vnd.ms-powerpoint", // .ppt
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    ];

    const allowedExtensions = [".pyo"]; // ✅ custom extension

    const ext = file.originalname
      .slice(file.originalname.lastIndexOf("."))
      .toLowerCase();

    if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only .ppt, .pptx, .pdf, .jpg, .jpeg, .png, .doc, .docx, .pyo files are allowed! Received: ${file.originalname} (${file.mimetype})`
        )
      );
    }
  },
});

export const uploadDesigns = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || "5") * 1024 * 1024, // default 5MB
    files: 10, // ⬅️ max 10 files at once
  },
  fileFilter: (req, file, cb) => {
    // ✅ Allowed formats: CAD + PDF
    const allowedExtensions = [
      ".pdf", // ⬅️ added
      ".pyo", ".pytha",  // custom
      ".dwg", ".dxf", ".stl", ".step", ".stp", ".iges", ".igs",
      ".3ds", ".obj", ".skp", ".sldprt", ".sldasm",
      ".prt", ".catpart", ".catproduct",
    ];

    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only design files are allowed! Supported extensions: ${allowedExtensions.join(
            ", "
          )}. Received: ${ext}`
        )
      );
    }
  },
});