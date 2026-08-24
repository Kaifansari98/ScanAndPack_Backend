import { prisma } from "../src/prisma/client";

async function main() {
  const users = await prisma.userMaster.findMany({
    select: {
      id: true,
      user_name: true,
      user_type: {
        select: {
          user_type: true
        }
      },
      status: true,
      vendor_id: true
    }
  });
  console.log("Current Users in Database:");
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
