import { prisma } from "../src/prisma/client";
import { metaLeadsWebhookController } from "../src/controllers/leadModuleControllers/metaLeadsWebhook.controller";
import axios from "axios";

// Mock axios.get to return a sample Facebook lead
const originalGet = axios.get;
axios.get = async (url: string, config?: any): Promise<any> => {
  if (url.includes("777888999_leadgen_id")) {
    return {
      status: 200,
      data: {
        id: "777888999_leadgen_id",
        created_time: "2026-08-14T12:00:00+0000",
        platform: "fb",
        form_name: "Meta Leads Form",
        field_data: [
          { name: "full_name", values: ["Alex Mercer"] },
          { name: "email", values: ["alex.mercer@prototype.com"] },
          { name: "phone_number", values: ["+14155552671"] },
          { name: "package_type", values: ["Standard Package"] },
          { name: "urgency_level", values: ["Immediate"] }
        ]
      }
    };
  }
  return originalGet(url, config);
};

async function main() {
  console.log("=== Starting Meta Leads Webhook Integration Test ===");

  // Set necessary environment variables temporarily for the test run
  process.env.META_ACCESS_TOKEN = "mock_meta_access_token_xyz987";
  
  // 1. Check duplicate prevention & ingestion
  console.log("Ingesting mock lead first time...");
  
  const mockReq = {
    headers: {},
    body: {
      object: "page",
      entry: [
        {
          id: "page_id_123",
          time: 1445827047,
          changes: [
            {
              field: "leadgen",
              value: {
                form_id: "form_id_123",
                leadgen_id: "777888999_leadgen_id",
                created_time: 1445827047,
                page_id: "page_id_123"
              }
            }
          ]
        }
      ]
    }
  } as any;

  let responseStatus = 200;
  let responseData: any = null;

  const mockRes = {
    status: (code: number) => {
      responseStatus = code;
      return mockRes;
    },
    json: (data: any) => {
      responseData = data;
      return mockRes;
    }
  } as any;

  // Run handleWebhook
  await metaLeadsWebhookController.handleWebhook(mockReq, mockRes);
  console.log(`First run response: Status ${responseStatus}`, responseData);

  // 2. Query DB to verify insertion
  const createdLead = await prisma.metaLead.findUnique({
    where: { meta_lead_id: "777888999_leadgen_id" }
  });

  if (createdLead) {
    console.log("✅ SUCCESS! Lead was successfully inserted into meta_leads table.");
    console.log(`Lead Details:`);
    console.log(`  - Meta Lead ID: ${createdLead.meta_lead_id}`);
    console.log(`  - Name: ${createdLead.name}`);
    console.log(`  - Email: ${createdLead.email}`);
    console.log(`  - Phone: ${createdLead.phone}`);
    console.log(`  - Form: ${createdLead.form_name} (ID: ${createdLead.form_id})`);
    console.log(`  - Source: ${createdLead.lead_source}`);
    console.log(`  - Status: ${createdLead.status}`);
    console.log(`  - Custom Fields:`, JSON.stringify(createdLead.custom_fields, null, 2));

    // 3. Test duplicate protection
    console.log("\nIngesting mock lead second time (should be skipped)...");
    responseStatus = 200;
    responseData = null;
    await metaLeadsWebhookController.handleWebhook(mockReq, mockRes);
    console.log(`Second run response: Status ${responseStatus}`, responseData);

    const checkCount = await prisma.metaLead.count({
      where: { meta_lead_id: "777888999_leadgen_id" }
    });

    if (checkCount === 1) {
      console.log("✅ SUCCESS! Duplicate protection working. Database contains exactly 1 copy of this Meta Lead.");
    } else {
      console.error(`❌ FAILED! Duplicate protection failed. Found ${checkCount} records.`);
    }

    // 4. Clean up
    await prisma.metaLead.delete({
      where: { id: createdLead.id }
    });
    console.log("\n🧹 Cleaned up test lead records.");

  } else {
    console.error("❌ FAILED! Lead was not found in the meta_leads table.");
  }

  console.log("=== Integration Test Complete ===");
}

main()
  .catch(console.error)
  .finally(() => {
    axios.get = originalGet;
    prisma.$disconnect();
  });
