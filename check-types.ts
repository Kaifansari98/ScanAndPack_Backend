import { prisma } from './src/prisma/client';

async function main() {
  const types = await prisma.productTypeMaster.findMany();
  console.log('Existing product types:', types);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
