import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

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

export const uploadToWasabClientDocumentation = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string,
  folder: string = "client_documentations"
) => {
  const ext = originalName.split(".").pop();
  const sysName = `${folder}/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

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

export default wasabi;

export const uploadToWasabiProductionFiles = async (
  buffer: Buffer,
  vendorId: number,
  leadId: number,
  originalName: string
) => {
  const ext = originalName.split(".").pop();
  const sysName = `production_files/${vendorId}/${leadId}/${uuidv4()}.${ext}`;

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
