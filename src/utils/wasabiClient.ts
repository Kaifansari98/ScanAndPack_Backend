import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { Upload } from "@aws-sdk/lib-storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { sanitizeFilename } from "./sanitizeFilename";

console.log("[DEBUG] WASABI_ENDPOINT:", process.env.WASABI_ENDPOINT);

const wasabi = new S3Client({
  endpoint:
    process.env.WASABI_ENDPOINT || "https://s3.ap-southeast-1.wasabisys.com",
  region: process.env.WASABI_REGION || "ap-southeast-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY || "",
  },
});

export const generateSignedUrl = async (
  key: string,
  expiresIn: number = 3600,
  disposition: "inline" | "attachment" = "inline" // 👈 default inline
) => {
  const command = new GetObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME!,
    Key: key,
    ResponseContentDisposition: disposition, // 👈 this controls browser behavior
  });

  return await getSignedUrl(wasabi, command, { expiresIn });
};

export const uploadToWasabi = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `design_quotation/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName; // relative path
};

export const uploadToWasabiMeetingDocs = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `meeting_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName; // relative path
};

export const uploadToWasabStage1Desings = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `stage_1_design/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName; // relative path
};

export const uploadToWasabStage1DesingsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `stage_1_design/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabClientDocumentation = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string,
  folder: string = "client_documentations",
  instanceFolder?: string
) => {
  const ext = originalName.split(".").pop();
  const folderPath = instanceFolder
    ? `${folder}/${vendorId}/${leadId}/${instanceFolder}`
    : `${folder}/${vendorId}/${leadId}`;
  const sysName = `${folderPath}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName; // relative path
};

export const uploadToWasabClientDocumentationFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string,
  folder: string = "client_documentations",
  instanceFolder?: string
) => {
  const ext = originalName.split(".").pop();
  const folderPath = instanceFolder
    ? `${folder}/${vendorId}/${leadId}/${instanceFolder}`
    : `${folder}/${vendorId}/${leadId}`;
  const sysName = `${folderPath}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabClientApprovalDocumentation = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `client_approval_documentation/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName; // relative path
};

export const uploadToWasabClientApprovalDocumentationFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `client_approval_documentation/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export default wasabi;

export const uploadToWasabiProductionFiles = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string,
  instanceFolder?: string
) => {
  const ext = originalName.split(".").pop();
  const safeInstanceFolder = instanceFolder
    ? sanitizeFilename(instanceFolder)
    : undefined;
  const folderPath = safeInstanceFolder
    ? `production_files/${vendorId}/${leadId}/${safeInstanceFolder}`
    : `production_files/${vendorId}/${leadId}`;
  const sysName = `${folderPath}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName; // stored path in Wasabi
};

export const uploadToWasabiProductionFilesFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string,
  instanceFolder?: string
) => {
  const ext = originalName.split(".").pop();
  const safeInstanceFolder = instanceFolder
    ? sanitizeFilename(instanceFolder)
    : undefined;
  const folderPath = safeInstanceFolder
    ? `production_files/${vendorId}/${leadId}/${safeInstanceFolder}`
    : `production_files/${vendorId}/${leadId}`;
  const sysName = `${folderPath}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiOrderLoginPoFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  cardName: string,
  originalName: string,
  contentType: string,
  instanceFolder?: string
) => {
  const ext = originalName.split(".").pop();
  const safeCardName = sanitizeFilename(cardName || "card");
  const safeInstanceFolder = instanceFolder
    ? sanitizeFilename(instanceFolder)
    : undefined;
  const folderPath = safeInstanceFolder
    ? `order_login_po/${vendorId}/${leadId}/${safeInstanceFolder}/${safeCardName}`
    : `order_login_po/${vendorId}/${leadId}/${safeCardName}`;
  const sysName = `${folderPath}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiProductionFilesQcPhotos = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `production_files_qc_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName; // stored path in Wasabi
};

export const uploadToWasabiProductionFilesQcPhotosFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string,
  instanceFolder?: string
) => {
  const ext = originalName.split(".").pop();
  const safeInstanceFolder = instanceFolder
    ? sanitizeFilename(instanceFolder)
    : undefined;
  const folderPath = safeInstanceFolder
    ? `production_files_qc_photos/${vendorId}/${leadId}/${safeInstanceFolder}`
    : `production_files_qc_photos/${vendorId}/${leadId}`;
  const sysName = `${folderPath}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiProductionFilesHardwarePackingDocs = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `production_files_hardware_packing_details_docs/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiProductionFilesHardwarePackingDocsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string,
  instanceFolder?: string
) => {
  const ext = originalName.split(".").pop();
  const safeInstanceFolder = instanceFolder
    ? sanitizeFilename(instanceFolder)
    : undefined;
  const folderPath = safeInstanceFolder
    ? `production_files_hardware_packing_details_docs/${vendorId}/${leadId}/${safeInstanceFolder}`
    : `production_files_hardware_packing_details_docs/${vendorId}/${leadId}`;
  const sysName = `${folderPath}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiProductionFilesWoodworkPackingDocs = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `production_files_woodwork_packing_details_docs/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiProductionFilesWoodworkPackingDocsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string,
  instanceFolder?: string
) => {
  const ext = originalName.split(".").pop();
  const safeInstanceFolder = instanceFolder
    ? sanitizeFilename(instanceFolder)
    : undefined;
  const folderPath = safeInstanceFolder
    ? `production_files_woodwork_packing_details_docs/${vendorId}/${leadId}/${safeInstanceFolder}`
    : `production_files_woodwork_packing_details_docs/${vendorId}/${leadId}`;
  const sysName = `${folderPath}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiCurrentSitePhotosReadyToDispatch = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `ready_to_dispatch/current_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiCurrentSitePhotosReadyToDispatchFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `ready_to_dispatch/current_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiCurrentSitePhotosSiteReadiness = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `site_readiness/current_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiCurrentSitePhotosSiteReadinessFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `site_readiness/current_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiPaymentProffDispatchPlanning = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `site_readiness/current_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiPaymentProffDispatchPlanningFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `dispatch_planning/payment_proof/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiDispatchDocuments = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `dispatch/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiDispatchDocumentsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `dispatch/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiPostDispatchDocuments = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `post_dispatch/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiPostDispatchDocumentsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `post_dispatch/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiUnderInstallationDayWiseDocuments = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `under_installation_day_wise_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiUnderInstallationDayWiseDocumentsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `under_installation_day_wise_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiUnderInstallationMiscellaneousDocuments = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `under_installation_miscellaneous_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiUnderInstallationMiscellaneousDocumentsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `under_installation_miscellaneous_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiUnderInstallationUsableHandoverFinalSitePhotos = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `under_installation_usable_handover/final_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiUnderInstallationUsableHandoverFinalSitePhotosFile =
  async (
    filePath: string,
    vendorId: number,
    leadId: number,
    originalName: string,
    contentType: string
  ) => {
    const ext = originalName.split(".").pop();
    const sysName = `under_installation_usable_handover/final_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

    const upload = new Upload({
      client: wasabi,
      params: {
        Bucket: process.env.WASABI_BUCKET_NAME!,
        Key: sysName,
        Body: fs.createReadStream(filePath),
        ContentType: contentType,
      },
      partSize: 10 * 1024 * 1024,
      queueSize: 4,
    });

    await upload.done();

    return sysName;
  };

export const uploadToWasabiUnderInstallationUsableHandoverDocuments = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `under_installation_usable_handover/handover_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiUnderInstallationUsableHandoverDocumentsFile =
  async (
    filePath: string,
    vendorId: number,
    leadId: number,
    originalName: string,
    contentType: string
  ) => {
    const ext = originalName.split(".").pop();
    const sysName = `under_installation_usable_handover/handover_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

    const upload = new Upload({
      client: wasabi,
      params: {
        Bucket: process.env.WASABI_BUCKET_NAME!,
        Key: sysName,
        Body: fs.createReadStream(filePath),
        ContentType: contentType,
      },
      partSize: 10 * 1024 * 1024,
      queueSize: 4,
    });

    await upload.done();

    return sysName;
  };

export const uploadToWasabiFinalHandoverFinalSitePhotos = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/final_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiFinalHandoverFinalSitePhotosFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/final_site_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiFinalHandoverWarrantyCardPhotos = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/warranty_card_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiFinalHandoverWarrantyCardPhotosFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/warranty_card_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiFinalHandoverBookletPhoto = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/booklet_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiFinalHandoverBookletPhotoFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/booklet_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiFinalHandoverFormPhoto = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/form_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiFinalHandoverFormPhotoFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/form_photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiFinalHandoverQCDocument = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/qc_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  await wasabi.send(
    new PutObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: buffer,
      ContentType: "application/octet-stream",
    })
  );

  return sysName;
};

export const uploadToWasabiFinalHandoverQCDocumentFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `final_handover/qc_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

// export const uploadToWasabiLeadChatAttachment = async (
//   buffer: Buffer,
//   vendorId: number,
//   leadId: number,
//   originalName: string,
//   contentType: string = "application/octet-stream"
// ) => {
//   const ext = originalName.split(".").pop();
//   const sysName = `lead_chat/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

//   await wasabi.send(
//     new PutObjectCommand({
//       Bucket: process.env.WASABI_BUCKET_NAME!,
//       Key: sysName,
//       Body: buffer,
//       ContentType: contentType,
//     })
//   );

//   return sysName;
// };

export const uploadChatAttachments = multer({
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

export const uploadLeadSitePhotos = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/lead_site_photos";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB
    files: 10,
  },
});

export const uploadDesignQuotationFiles = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/design_quotations";
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200 MB
    files: 10,
  },
});

export const uploadInitialSiteMeasurement = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = "/tmp/initial_site_measurement";
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
  fileFilter: (_req, file, cb) => {
    const isImage = file.mimetype.startsWith("image/");
    const isPdf = file.mimetype === "application/pdf";
    const ext = path.extname(file.originalname || "").toLowerCase();
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".bmp",
      ".tif",
      ".tiff",
      ".heic",
      ".heif",
      ".avif",
      ".svg",
      ".jfif",
    ];

    if (isImage || isPdf || imageExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF and image files are allowed."));
    }
  },
});

export const uploadToWasabiLeadChatAttachment = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `lead_chat/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024, // 10 MB chunks
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiDesignQuotationFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `design_quotation/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiBookingFinalDocumentFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const sanitizedName = sanitizeFilename(originalName);
  const sysName = `final-documents-booking/${vendorId}/${leadId}/${Date.now()}-${sanitizedName}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiBookingPaymentDetailsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const sanitizedName = sanitizeFilename(originalName);
  const sysName = `booking-amount-payment-details/${vendorId}/${leadId}/${Date.now()}-${sanitizedName}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiFinalMeasurementDocFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const sanitizedName = sanitizeFilename(originalName);
  const sysName = `final-measurement-documents/${vendorId}/${leadId}/${Date.now()}-${sanitizedName}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiFinalMeasurementSitePhotoFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const sanitizedName = sanitizeFilename(originalName);
  const sysName = `final-current-site-photos/${vendorId}/${leadId}/${Date.now()}-${sanitizedName}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiAdditionalPaymentFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const sanitizedName = sanitizeFilename(originalName);
  const sysName = `additional-payments/${vendorId}/${leadId}/${Date.now()}-${sanitizedName}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiCSPBookingPhotoFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const sanitizedName = sanitizeFilename(originalName);
  const sysName = `current-site-photos-at-booking-stage/${vendorId}/${leadId}/${Date.now()}-${sanitizedName}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiMeetingDocsFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `meeting_documents/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiInitialSiteMeasurementFile = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string,
  folder: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `${folder}/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiLeadSitePhoto = async (
  filePath: string,
  vendorId: number,
  leadId: number,
  originalName: string,
  contentType: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `site-photos/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: sysName,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  return sysName;
};

export const uploadToWasabiMachineImage = async (
  filePath: string,
  vendorId: number,
  originalName: string,
  contentType: string,
): Promise<string> => {
  const sanitizedName = sanitizeFilename(originalName);

  const key = `machine-images/${vendorId}/${Date.now()}-${sanitizedName}`;

  // 1️⃣ Upload file
  const upload = new Upload({
    client: wasabi,
    params: {
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: contentType,
    },
    partSize: 10 * 1024 * 1024,
    queueSize: 4,
  });

  await upload.done();

  // 2️⃣ Generate signed URL
  const command = new GetObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME!,
    Key: key,
    ResponseContentDisposition: "inline",
  });

  const signedUrl = await getSignedUrl(wasabi, command, {
    expiresIn: 60 * 60, // 1 hour
  });

  // 3️⃣ return signed URL
  return signedUrl;
};

export const uploadToWasabiProjectExcel = async (
  filePath: string,
  vendorId: number,
  originalName: string,
  contentType: string,
): Promise<{ key: string; url: string }> => {
  try {
    const ext = path.extname(originalName);
    const baseName = path
      .basename(originalName, ext)
      .replace(/[^a-zA-Z0-9-_]/g, "_");

    const safeName = `${baseName}${ext}`;
    const key = `project-excels/${vendorId}/${Date.now()}-${safeName}`;
    const upload = new Upload({
      client: wasabi,
      params: {
        Bucket: process.env.WASABI_BUCKET_NAME!,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentType: contentType,
      },
      partSize: 10 * 1024 * 1024,
      queueSize: 4,
    });

    await upload.done();

    const command = new GetObjectCommand({
      Bucket: process.env.WASABI_BUCKET_NAME!,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    });

    const signedUrl = await getSignedUrl(wasabi, command, {
      expiresIn: 60 * 60 * 24, // 24 hours
    });

    return {
      key,
      url: signedUrl,
    };
  } catch (error: any) {
    throw error;
  }
};