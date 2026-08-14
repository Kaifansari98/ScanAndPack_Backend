import { prisma } from "../src/prisma/client";

async function main() {
  const names = [
    "Super Admin",
    "Venkat Raman - sales kochi",
    "Karsan Jain - sales pune",
    "Furqan Khan - arabian darbar",
    "Awais Ghori - sales",
    "Daniyal Shaikh - Admin",
    "Kaif Ansari - admin",
    "Ayan Shaikh - admin",
    "Daniyal Shaikh - admin kashmir",
    "Bhilai - Sales",
    "pune-admin",
    "pune_admin"
  ];

  const users = await prisma.userMaster.findMany({
    where: {
      OR: names.map(name => ({
        user_name: { contains: name, mode: "insensitive" }
      }))
    },
    select: {
      id: true,
      user_name: true,
      vendor_id: true,
      status: true,
      user_type: {
        select: {
          user_type: true
        }
      }
    }
  });

  console.log("Users Found:");
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
