import { getFranchiseAdminRecipients } from './services/notification/adminRecipients.service';

async function main() {
  console.log("Testing getFranchiseAdminRecipients for vendor=1, franchise=6...");
  const result = await getFranchiseAdminRecipients({
    vendorId: 1, 
    franchiseId: 6,
    excludeUserId: null
  });
  console.log("Result:", result);
}

main().catch(console.error).finally(() => process.exit(0));
