import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const mapping = await prisma.leadUserMapping.findFirst({
    where: {
      type: "site-supervisor",
      status: "active",
    },
  });
  console.log("Mapping found:", mapping);
}
main().catch(console.error).finally(() => prisma.$disconnect());
