const { PrismaClient } = require('./generated/prisma_client');
const prisma = new PrismaClient();

async function main() {
  const categories = await prisma.projectCategoriesMaster.findMany();
  console.log("Existing Categories:", JSON.stringify(categories, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
