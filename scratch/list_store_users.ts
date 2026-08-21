import { prisma } from "../src/prisma/client";

async function main() {
  console.log("Fetching all active users and their stores...");
  const users = await prisma.userMaster.findMany({
    where: { status: "active" },
    include: {
      franchise: true,
      user_type: true
    }
  });

  const storesMap: Record<string, Array<{ name: string; role: string; email: string }>> = {};

  users.forEach((u) => {
    const storeName = u.franchise?.franchise_name || "No Store (Global / Admin)";
    if (!storesMap[storeName]) {
      storesMap[storeName] = [];
    }
    storesMap[storeName].push({
      name: u.user_name,
      role: u.user_type?.user_type || "N/A",
      email: u.user_email
    });
  });

  console.log("\nSTORES AND THEIR ASSIGNED USERS:\n");
  for (const [store, assignedUsers] of Object.entries(storesMap)) {
    console.log(`🏠 Store: ${store}`);
    assignedUsers.forEach((usr) => {
      console.log(`   - ${usr.name} (${usr.role}) - ${usr.email}`);
    });
    console.log("");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
