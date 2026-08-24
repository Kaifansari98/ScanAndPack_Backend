import * as fs from "fs";
import * as path from "path";

const schemaPath = path.join(__dirname, "../prisma/schema.prisma");
const modelStr = `
model MetaLead {
  id            Int      @id @default(autoincrement())
  meta_lead_id  String   @unique
  name          String
  phone         String
  email         String?
  form_name     String?
  form_id       String?
  created_date  DateTime @default(now())
  lead_source   String   @default("Facebook Lead Ads")
  status        String   @default("New")
  custom_fields Json?
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  @@map("meta_leads")
}
`;

fs.appendFileSync(schemaPath, modelStr);
console.log("Successfully appended model to schema.prisma");
