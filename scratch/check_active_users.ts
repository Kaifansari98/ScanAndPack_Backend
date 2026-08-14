import { prisma } from "../src/prisma/client";

async function main() {
  const users = await prisma.userMaster.findMany({
    where: { status: "active" },
    select: {
      id: true,
      user_name: true,
      vendor_id: true,
      user_type: {
        select: {
          user_type: true
        }
      }
    }
  });

  console.log("Total Active Users:", users.length);
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
