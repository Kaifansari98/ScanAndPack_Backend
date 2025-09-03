import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

console.log("[DEBUG] WASABI_ENDPOINT:", process.env.WASABI_ENDPOINT);

const wasabi = new S3Client({
  endpoint: process.env.WASABI_ENDPOINT || "https://s3.ap-southeast-1.wasabisys.com",
  region: process.env.WASABI_REGION || "ap-southeast-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY || "",
  },
});

export const generateSignedUrl = async (key: string, expiresIn: number = 3600) => {
  const command = new GetObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME!,
    Key: key,
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

  await wasabi.send(new PutObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME!,
    Key: sysName,
    Body: buffer,
    ContentType: "application/octet-stream",
  }));

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

  await wasabi.send(new PutObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME!,
    Key: sysName,
    Body: buffer,
    ContentType: "application/octet-stream",
  }));

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

  await wasabi.send(new PutObjectCommand({
    Bucket: process.env.WASABI_BUCKET_NAME!,
    Key: sysName,
    Body: buffer,
    ContentType: "application/octet-stream",
  }));

  return sysName; // relative path
};

export default wasabi;