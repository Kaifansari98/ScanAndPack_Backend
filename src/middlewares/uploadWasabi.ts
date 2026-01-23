import multer from "multer";
import multerS3 from "multer-s3";
import path from "path";
import { sanitizeFilename } from "../utils/fileUtils";
import wasabi from "../utils/wasabiClient";
import fs from 'fs'

const bucketName = process.env.WASABI_BUCKET_NAME || "vloq-furnix";

// 🔒 Ensure env variable exists
const MAX_FILE_SIZE_MB = process.env.MAX_FILE_SIZE_MB;
if (!MAX_FILE_SIZE_MB) {
  throw new Error("❌ Missing environment variable: MAX_FILE_SIZE_MB");
}

const MAX_FILE_SIZE = parseInt(MAX_FILE_SIZE_MB, 10) * 1024 * 1024; // Convert MB → bytes

// ✅ shared limits object
const fileLimits = {
  fileSize: MAX_FILE_SIZE,
};

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
  limits: fileLimits,
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",

      // PDF & ZIP
      "application/pdf",
      "application/zip",
      "application/x-zip-compressed",

      // Videos
      "video/mp4",
      "video/mpeg",
      "video/ogg",
      "video/webm",
      "video/x-msvideo", // AVI
      "video/quicktime", // MOV
      "video/x-matroska", // MKV
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only image files and PDFs and ZIP archives are allowed! Received: ${file.mimetype}`
        )
      );
    }
  },
});

export const uploadDesignMeetingFiles = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/design_meeting_docs";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",

      // PDF & ZIP
      "application/pdf",
      "application/zip",
      "application/x-zip-compressed",

      // Videos
      "video/mp4",
      "video/mpeg",
      "video/ogg",
      "video/webm",
      "video/x-msvideo", // AVI
      "video/quicktime", // MOV
      "video/x-matroska", // MKV
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only image files and PDFs and ZIP archives are allowed! Received: ${file.mimetype}`
        )
      );
    }
  },
});

export const uploadFinalMeasurement = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/final_measurement";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 100 },
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
      cb(
        new Error(
          `Only image files and PDFs are allowed! Received: ${file.mimetype}`
        )
      );
    }
  },
});

export const uploadClientApproval = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/client_approval";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 15 },
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
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/client_documentations";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 20 },
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

    const allowedExtensions = [".pyo", ".zip"]; // ✅ custom extension

    const ext = file.originalname
      .slice(file.originalname.lastIndexOf("."))
      .toLowerCase();

    if (
      allowedMimeTypes.includes(file.mimetype) ||
      allowedExtensions.includes(ext)
    ) {
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
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/design_stage1";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    // ✅ Allowed formats: CAD + PDF
    const allowedExtensions = [
      ".pdf", // ⬅️ added
      ".pyo",
      ".pytha", // custom
      ".dwg",
      ".dxf",
      ".stl",
      ".step",
      ".stp",
      ".iges",
      ".igs",
      ".3ds",
      ".obj",
      ".skp",
      ".sldprt",
      ".sldasm",
      ".prt",
      ".catpart",
      ".catproduct",
      ".zip",
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".tif",
      ".tiff",
    ];

    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          `Only design or image files are allowed! Supported extensions: ${allowedExtensions.join(
            ", "
          )}. Received: ${ext}`
        )
      );
    }
  },
});

export const uploadProductionFiles = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/production_files";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    // ✅ Allowed formats: CAD + PDF
    const allowedExtensions = [
      ".pdf", // ⬅️ added
      ".pyo",
      ".pytha", // custom
      ".dwg",
      ".dxf",
      ".stl",
      ".step",
      ".stp",
      ".iges",
      ".igs",
      ".3ds",
      ".obj",
      ".skp",
      ".sldprt",
      ".sldasm",
      ".prt",
      ".catpart",
      ".catproduct",
      ".zip",
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

export const uploadPostProductionFiles = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/post_production";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
});

export const uploadReadyToDispatchPhotos = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/ready_to_dispatch";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
});

export const uploadSiteReadinessPhotos = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/site_readiness";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
});

export const uploadDispatchPlanningPayment = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/dispatch_planning_payment";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
});

export const uploadDispatchStageDocuments = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/dispatch_stage";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
});

export const uploadUnderInstallationFiles = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/under_installation";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
});

export const uploadFinalHandoverFiles = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/final_handover";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 40 },
});

export const uploadMeetingDocs = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/design_meeting_docs";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  },
});

export const uploadBookingStageFiles = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/booking_stage";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 11 },
});

export const uploadCSPBookingFiles = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/csp_booking";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB
    files: 10,
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

const CHAT_MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB per file

const uploadChatAttachments = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/chat_uploads";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB
  },
});

export const uploadToWasabiUnderInstallationDayWiseDocs = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10 },
  fileFilter: (req, file, cb) => {
    const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".mp4"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}`));
  },
});
