import { prisma } from "../src/prisma/client";
import axios from "axios";

async function main() {
  const args = process.argv.slice(2);
  const leadId = args[0];

  console.log("====================================================");
  console.log("   META LEADS INTEGRATION E2E TEST RUNNER           ");
  console.log("====================================================\n");

  // 1. Verify Backend is Running
  console.log("Step 1: Verifying Backend Server Status...");
  const serverUrl = "http://localhost:7777";
  try {
    const pingRes = await axios.get(serverUrl);
    console.log(`✅ Success: Backend is running! Ping response: "${pingRes.data}"\n`);
  } catch (err: any) {
    console.error(`❌ Error: Backend server is not running on ${serverUrl}.`);
    console.error("Please run the backend using 'pnpm run dev' first.\n");
    process.exit(1);
  }

  // 2. Verify Database Connection
  console.log("Step 2: Verifying PostgreSQL Database Connectivity...");
  try {
    await prisma.$connect();
    const vendorCount = await prisma.vendorMaster.count();
    console.log(`✅ Success: Connected to database! Total vendors: ${vendorCount}\n`);
  } catch (err: any) {
    console.error("❌ Error: Failed to connect to the database.");
    console.error(err.message || err);
    console.error("Please verify that PostgreSQL is running and DATABASE_URL is correct.\n");
    process.exit(1);
  }

  // 3. Verify Meta Credentials in .env
  console.log("Step 3: Checking Meta Credentials in .env...");
  const accessToken = process.env.META_ACCESS_TOKEN;
  const appSecret = process.env.META_APP_SECRET;
  const appId = process.env.META_APP_ID;
  const pageId = process.env.META_PAGE_ID;

  let credentialsOk = true;
  if (!accessToken) {
    console.warn("⚠️ Warning: META_ACCESS_TOKEN is missing or empty.");
    credentialsOk = false;
  }
  if (!appSecret) {
    console.warn("⚠️ Warning: META_APP_SECRET is missing or empty.");
    credentialsOk = false;
  }
  if (!appId) {
    console.warn("⚠️ Warning: META_APP_ID is missing or empty.");
    credentialsOk = false;
  }
  if (!pageId) {
    console.warn("⚠️ Warning: META_PAGE_ID is missing or empty.");
    credentialsOk = false;
  }

  if (!credentialsOk) {
    console.error("\n❌ Error: Missing Meta credentials in backend .env file.");
    console.error("Please populate the following variables in c:/Users/admin/OneDrive/Desktop/furnixcrm/ScanAndPack_Backend/.env:");
    console.error("  - META_ACCESS_TOKEN (Permanent Page/System User Token)");
    console.error("  - META_APP_SECRET");
    console.error("  - META_APP_ID");
    console.error("  - META_PAGE_ID\n");
    process.exit(1);
  } else {
    console.log("✅ Success: Meta credentials configured in .env!\n");
  }

  // 4. Validate Lead ID argument
  if (!leadId) {
    console.error("❌ Error: Meta Lead ID is required to run the Graph API and ingestion tests.");
    console.log("Please create a test lead using Meta's Lead Ads Testing Tool, copy the Lead ID, and execute:");
    console.log("  pnpm exec ts-node-dev -r tsconfig-paths/register scratch/run_e2e_test.ts <YOUR_LEAD_ID>\n");
    process.exit(1);
  }

  // 5. Test Debug Ingestion Endpoint & Graph API Fetch
  console.log(`Step 5: Testing debug ingestion for Lead ID ${leadId}...`);
  console.log("Making POST request to /api/webhooks/meta/leads/debug (hitting real Meta Graph API)...");
  
  let debugResponse;
  try {
    debugResponse = await axios.post(`${serverUrl}/api/meta/leads/debug`, {
      lead_id: leadId
    });
    console.log("✅ Success: Ingestion API call completed successfully!");
    console.log("Response data:", JSON.stringify(debugResponse.data, null, 2));
  } catch (err: any) {
    console.error("\n❌ Error: Debug ingestion API call failed.");
    if (err.response?.data) {
      console.error("Server responded with:", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
    console.error("\nSuggestions to resolve:");
    console.error("1. Double check that your META_ACCESS_TOKEN has the 'leads_retrieval' permission.");
    console.error("2. Ensure that your System User or Developer App is granted 'Leads Access' for the Facebook Page in Business Manager Integrations.");
    console.error(`3. Verify that the Lead ID "${leadId}" belongs to the Page associated with the access token.\n`);
    process.exit(1);
  }

  // 6. Verify Lead in Database
  console.log("\nStep 6: Verifying Lead details stored in PostgreSQL...");
  try {
    const dbLead = await prisma.metaLead.findUnique({
      where: { meta_lead_id: leadId }
    });

    if (!dbLead) {
      console.error(`❌ Error: Lead ID ${leadId} was not found in the meta_leads table.`);
      process.exit(1);
    }

    console.log("✅ Success: Lead successfully verified in database!");
    console.log(`  - Local ID: ${dbLead.id}`);
    console.log(`  - Name: ${dbLead.name}`);
    console.log(`  - Phone: ${dbLead.phone}`);
    console.log(`  - Email: ${dbLead.email}`);
    console.log(`  - Status: ${dbLead.status}`);
    console.log(`  - Source: ${dbLead.lead_source}`);
    console.log(`  - Form: ${dbLead.form_name}\n`);
  } catch (err: any) {
    console.error("❌ Error querying PostgreSQL database:", err.message || err);
    process.exit(1);
  }

  // 7. Verify Lead in Dashboard List API
  console.log("Step 7: Verifying Lead appears in the Dashboard list API...");
  try {
    const listRes = await axios.get(`${serverUrl}/api/meta-leads`, {
      params: { search: leadId }
    });
    const foundLeads = listRes.data?.data?.leads || [];
    const matched = foundLeads.find((l: any) => l.meta_lead_id === leadId);

    if (matched) {
      console.log("✅ Success: Lead found in Dashboard List API response!");
      console.log(`  - Dashboard Link: http://localhost:3000/dashboard/meta-leads/details/${matched.id}`);
      console.log("\n🎉 ALL E2E INTEGRATION CHECKS PASSED SUCCESSFULLY! The Meta Leads Ads integration is production-ready.");
    } else {
      console.error("❌ Error: Lead did not appear in dashboard search results.");
    }
  } catch (err: any) {
    console.error("❌ Error: Failed to call Dashboard list API:", err.message || err);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
