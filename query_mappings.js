const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const mappings = await prisma.leadUserMapping.findMany({
    where: {
      type: 'site-supervisor',
      status: 'active'
    },
    take: 5,
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      lead_id: true,
      vendor_id: true,
      user_id: true,
      created_at: true
    }
  });
  console.log("Active Site Supervisor Mappings:", JSON.stringify(mappings, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
