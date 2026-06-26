const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const superAdmins = await prisma.userTypeMaster.findMany({
    where: {
      user_type: { contains: "super", mode: "insensitive" }
    }
  });
  console.log("Super Admin Types:", superAdmins);

  const activeSuperAdmins = await prisma.userMaster.findMany({
    where: {
      status: "active",
      user_type: {
        user_type: { contains: "super", mode: "insensitive" }
      }
    },
    select: {
      id: true,
      user_name: true,
      user_type: { select: { user_type: true } },
      vendor_id: true,
      status: true
    }
  });
  console.log("Active Super Admins:", activeSuperAdmins);
}

main().catch(console.error).finally(() => prisma.$disconnect());
