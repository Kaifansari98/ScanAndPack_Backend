import { prisma } from './prisma/client';

async function main() {
  const notifs = await prisma.notification.findMany({
    where: {
      user_id: 11, // super admin ID
      type: "LEAD_ASSIGNED"
    },
    orderBy: { created_at: 'desc' },
    take: 5
  });
  console.log("Recent notifications for Super Admin (id=11):", notifs);
}

main().catch(console.error).finally(() => process.exit(0));
