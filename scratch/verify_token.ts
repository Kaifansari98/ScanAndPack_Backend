import axios from "axios";
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const myEnv = dotenv.config();
dotenvExpand.expand(myEnv);

async function main() {
  const token = process.env.META_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;
  const formId = process.env.META_FORM_ID;

  if (!token) {
    console.error("❌ Error: META_ACCESS_TOKEN is not configured in .env");
    return;
  }

  console.log("====================================================");
  console.log("          META ACCESS TOKEN VERIFIER                ");
  console.log("====================================================\n");

  // 1. Verify Token Validity & Scopes
  console.log("Step 1: Checking token validity and permissions...");
  try {
    const permRes = await axios.get("https://graph.facebook.com/v20.0/me/permissions", {
      params: { access_token: token }
    });
    
    console.log("✅ Success: Token is valid!");
    console.log("Granted Permissions:");
    const permissions = permRes.data?.data || [];
    permissions.forEach((p: any) => {
      console.log(`  - ${p.permission}: ${p.status}`);
    });

    const hasLeadsRetrieval = permissions.some((p: any) => p.permission === "leads_retrieval" && p.status === "granted");
    if (!hasLeadsRetrieval) {
      console.warn("⚠️ Warning: 'leads_retrieval' permission is missing or not granted. This is required to fetch leads.");
    }
  } catch (err: any) {
    console.error("❌ Error: Token check failed.");
    if (err.response?.data?.error) {
      console.error("Meta Graph API error:", JSON.stringify(err.response.data.error, null, 2));
    } else {
      console.error(err.message);
    }
    return;
  }

  // 2. Verify Page Access
  if (pageId) {
    console.log(`\nStep 2: Checking access to Page ID ${pageId}...`);
    try {
      const pageRes = await axios.get(`https://graph.facebook.com/v20.0/${pageId}`, {
        params: {
          access_token: token,
          fields: "name,id,category"
        }
      });
      console.log(`✅ Success: Token has access to page "${pageRes.data?.name}" (ID: ${pageRes.data?.id})`);
    } catch (err: any) {
      console.error(`❌ Error: Page ID ${pageId} is not accessible with this token.`);
      if (err.response?.data?.error) {
        console.error("Meta Graph API error:", JSON.stringify(err.response.data.error, null, 2));
      } else {
        console.error(err.message);
      }
    }
  }

  // 3. Verify Form Access
  if (formId) {
    console.log(`\nStep 3: Checking access to Form ID ${formId}...`);
    try {
      const formRes = await axios.get(`https://graph.facebook.com/v20.0/${formId}`, {
        params: {
          access_token: token,
          fields: "name,id,status,leads_count"
        }
      });
      console.log(`✅ Success: Token has access to lead form "${formRes.data?.name}" (Status: ${formRes.data?.status})`);
      console.log(`  - Total Leads submitted on this form: ${formRes.data?.leads_count ?? 0}`);
    } catch (err: any) {
      console.error(`❌ Error: Form ID ${formId} is not accessible with this token.`);
      if (err.response?.data?.error) {
        console.error("Meta Graph API error:", JSON.stringify(err.response.data.error, null, 2));
      } else {
        console.error(err.message);
      }
    }
  }

  console.log("\n====================================================");
}

main().catch(console.error);
