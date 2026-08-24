import { prisma } from "../src/prisma/client";

async function main() {
  const statuses = await prisma.onlineLeadFollowupStatus.findMany({
    orderBy: { id: "asc" }
  });

  console.log("Online Lead Followup Statuses:", statuses);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
