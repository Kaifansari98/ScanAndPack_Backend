import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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

export default wasabi;