import { prisma } from "../src/prisma/client";

async function main() {
  const userTypes = await prisma.userTypeMaster.findMany();
  console.log("Current User Types in Database:");
  console.log(JSON.stringify(userTypes, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
