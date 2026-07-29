import { prisma } from "./prisma/client";

async function run() {
  console.log("=== Broadcast Master ===");
  const broadcasts = await prisma.broadcastMaster.findMany({
    orderBy: { id: "desc" },
    take: 5,
    include: { audiences: true },
  });
  console.dir(broadcasts, { depth: null });

  console.log("\n=== Notification Queue ===");
  const queue = await prisma.notificationQueue.findMany({
    orderBy: { id: "desc" },
    take: 5,
  });
  console.dir(queue, { depth: null });

  console.log("\n=== Notifications ===");
  const notifs = await prisma.notification.findMany({
    where: { entity_type: "broadcast" },
    orderBy: { id: "desc" },
    take: 10,
    select: { id: true, user_id: true, entity_id: true, title: true },
  });
  console.dir(notifs, { depth: null });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
