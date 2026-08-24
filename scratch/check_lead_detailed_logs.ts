import { prisma } from "../src/prisma/client";

async function main() {
  const leadId = 455; // Vipul Udani
  console.log(`=== Detailed Logs for Lead ID ${leadId} ===`);
  const logs = await prisma.leadDetailedLogs.findMany({
    where: { lead_id: leadId },
    include: {
      user: {
        select: {
          user_name: true,
          user_email: true
        }
      },
      stage: {
        select: {
          type: true
        }
      }
    },
    orderBy: { created_at: "asc" }
  });

  console.log("Logs found:", logs.map(l => ({
    id: l.id,
    action: l.action,
    action_type: l.action_type,
    history_type: l.history_type,
    stage: l.stage?.type,
    created_by: l.user?.user_name,
    created_at: l.created_at
  })));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
