import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const mappings = await prisma.leadUserMapping.findMany({
    where: {
      type: 'site-supervisor',
      status: 'active'
    },
    take: 5,
    orderBy: { created_at: 'desc' },
    include: {
      lead: { select: { lead_code: true, id: true } },
      user: { select: { user_name: true, id: true } }
    }
  });
  console.log("Recent Site Supervisor Mappings:");
  mappings.forEach(m => {
    console.log(`Lead ID: ${m.lead_id} (${m.lead?.lead_code}) | Supervisor: ${m.user?.user_name} (ID: ${m.user_id}) | Date: ${m.created_at}`);
  });
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
