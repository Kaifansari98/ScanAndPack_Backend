import { S3Client } from "@aws-sdk/client-s3";

console.log("[DEBUG] WASABI_ENDPOINT:", process.env.WASABI_ENDPOINT);

const wasabi = new S3Client({
  endpoint: process.env.WASABI_ENDPOINT || "https://s3.us-central-1.wasabisys.com",
  region: process.env.WASABI_REGION || "us-central-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.WASABI_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.WASABI_SECRET_ACCESS_KEY || "",
  },
});

export default wasabi;