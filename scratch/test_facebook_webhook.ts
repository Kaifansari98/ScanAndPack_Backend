import { prisma } from "../src/prisma/client";
import { facebookWebhookController } from "../src/controllers/leadModuleControllers/facebookWebhook.controller";
import axios from "axios";

// Mock axios.get to return a sample Facebook lead
const originalGet = axios.get;
axios.get = async (url: string, config?: any): Promise<any> => {
  if (url.includes("111222333_lead_id")) {
    return {
      status: 200,
      data: {
        id: "111222333_lead_id",
        created_time: "2026-08-14T12:00:00+0000",
        platform: "fb",
        form_name: "Mock Facebook Lead Form",
        field_data: [
          { name: "full_name", values: ["Jane Doe Webhook Test"] },
          { name: "email", values: ["janedoe@vloq.com"] },
          { name: "phone_number", values: ["+919876543210"] },
          { name: "preferred_color", values: ["Blue"] }
        ]
      }
    };
  }
  return originalGet(url, config);
};

async function main() {
  console.log("=== Starting Facebook Webhook Integration Test ===");

  // 1. Find the first vendor in the database to link the integration
  const vendor = await prisma.vendorMaster.findFirst();
  if (!vendor) {
    console.error("❌ No vendor found in database. Cannot run test. Please seed a vendor first.");
    return;
  }
  console.log(`Found vendor: ID ${vendor.id}, Name: ${vendor.vendor_name}`);

  // 2. Setup External Platform Master (FACEBOOK)
  const facebookPlatform = await prisma.externalPlatformMaster.upsert({
    where: { type: "FACEBOOK" },
    update: {},
    create: {
      external_platform_name: "Facebook",
      type: "FACEBOOK",
      active: "Yes",
    },
  });
  console.log(`Upserted ExternalPlatformMaster: ID ${facebookPlatform.id}, Type: ${facebookPlatform.type}`);

  // 3. Setup Mock External Platform Token for the Facebook Page
  const pageId = "123456789_page_id";
  const tokenRecord = await prisma.externalPlatformToken.upsert({
    where: {
      id: 99999, // use a high ID for testing
    },
    update: {
      company_id: pageId,
      token: "mock_facebook_page_access_token_abc123",
      active: "Yes",
      vendor_id: vendor.id,
    },
    create: {
      id: 99999,
      external_platform_id: facebookPlatform.id,
      token: "mock_facebook_page_access_token_abc123",
      email: "facebook-integration@vloq.com",
      name: "Facebook Integration Test",
      user_id: "test_user_fb_id",
      company_id: pageId,
      vendor_id: vendor.id,
      created_by: 1,
      updated_by: 1,
      active: "Yes",
    },
  });
  console.log(`Upserted mock ExternalPlatformToken: Page ID ${tokenRecord.company_id}, ID ${tokenRecord.id}`);

  // 4. Construct Mock Webhook POST Request
  const mockReq = {
    body: {
      object: "page",
      entry: [
        {
          id: pageId,
          time: 1445827047,
          changes: [
            {
              field: "leadgen",
              value: {
                form_id: "987654321_form_id",
                leadgen_id: "111222333_lead_id",
                created_time: 1445827047,
                page_id: pageId
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

  // 5. Invoke controller handleWebhook
  console.log("Invoking facebookWebhookController.handleWebhook with mock request...");
  await facebookWebhookController.handleWebhook(mockReq, mockRes);

  console.log(`Response Status: ${responseStatus}`);
  console.log(`Response Data:`, responseData);

  // 6. Verify lead exists in the database
  const createdLead = await prisma.onlineLead.findFirst({
    where: {
      leads_name: "Jane Doe Webhook Test",
      email: "janedoe@vloq.com",
      vendor_id: vendor.id,
    },
    include: {
      online_lead_history: true
    }
  });

  if (createdLead) {
    console.log("✅ SUCCESS! Lead was successfully created in the online_leads table.");
    console.log(`Lead details:`);
    console.log(`  - Name: ${createdLead.leads_name}`);
    console.log(`  - Email: ${createdLead.email}`);
    console.log(`  - Contact: ${createdLead.contact}`);
    console.log(`  - Source: ${createdLead.source}`);
    console.log(`  - Remark:`);
    console.log(createdLead.remark);
    console.log(`  - Created At: ${createdLead.created_at}`);
    console.log(`  - History Logs Count: ${createdLead.online_lead_history.length}`);

    // Clean up created test lead & history
    await prisma.onlineLeadHistory.deleteMany({
      where: { online_lead_id: createdLead.id }
    });
    await prisma.onlineLead.delete({
      where: { id: createdLead.id }
    });
    console.log("🧹 Cleaned up created test lead and its history logs.");
  } else {
    console.error("❌ FAILED! Lead was not found in the online_leads table.");
  }

  // Clean up mock token record
  await prisma.externalPlatformToken.delete({
    where: { id: tokenRecord.id }
  });
  console.log("🧹 Cleaned up mock ExternalPlatformToken.");

  console.log("=== Test Complete ===");
}

main()
  .catch(console.error)
  .finally(() => {
    // Restore axios.get
    axios.get = originalGet;
    prisma.$disconnect();
  });
