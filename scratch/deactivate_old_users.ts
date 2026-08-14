import { prisma } from "../src/prisma/client";

async function main() {
  console.log("Deactivating old user accounts for Vendor 1...");

  // Get all active users under vendor_id 1
  const activeUsers = await prisma.userMaster.findMany({
    where: {
      vendor_id: 1,
      status: "active"
    },
    select: {
      id: true,
      user_name: true,
      user_email: true
    }
  });

  const idsToKeep = [11, 62]; // Keep core "Super Admin" and "Vloq Master" active

  let deactivatedCount = 0;

  for (const user of activeUsers) {
    const isNewTestUser = user.user_name.toLowerCase().includes("test");
    const isCoreUser = idsToKeep.includes(user.id);

    if (!isNewTestUser && !isCoreUser) {
      await prisma.userMaster.update({
        where: { id: user.id },
        data: { status: "inactive" }
      });
      console.log(`Deactivated User: ${user.user_name} (ID: ${user.id})`);
      deactivatedCount++;
    } else {
      console.log(`Keeping Active: ${user.user_name} (ID: ${user.id})`);
    }
  }

  console.log(`\nDone! Deactivated ${deactivatedCount} old users.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
