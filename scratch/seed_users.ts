import { prisma } from "../src/prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  console.log("Seeding test users for Vendor 1...");

  // 1. Find Vendor 1
  const vendor = await prisma.vendorMaster.findUnique({ where: { id: 1 } });
  if (!vendor) {
    console.error("Vendor with ID 1 not found!");
    return;
  }

  // 2. Find first Franchise for Vendor 1
  const franchise = await prisma.franchiseMaster.findFirst({ where: { vendor_id: 1 } });
  const franchiseId = franchise ? franchise.id : null;
  console.log(`Using Franchise ID: ${franchiseId} for store/telecaller users.`);

  // 3. User Types we want to ensure exist in UserTypeMaster
  const roles = [
    { type: "super-admin" },
    { type: "admin" },
    { type: "sales-executive" },
    { type: "telecaller" },
    { type: "telecaller-team-lead" },
    { type: "store-manager" },
    { type: "site-supervisor" },
    { type: "head-site-supervisor" },
    { type: "tech-check" },
    { type: "factory" },
    { type: "auditor" },
    { type: "backend" }
  ];

  const roleMap: Record<string, number> = {};

  for (const role of roles) {
    let existing = await prisma.userTypeMaster.findFirst({
      where: { user_type: { equals: role.type, mode: "insensitive" } }
    });

    if (!existing) {
      existing = await prisma.userTypeMaster.create({
        data: { user_type: role.type }
      });
      console.log(`Created role type: ${role.type} (id: ${existing.id})`);
    } else {
      console.log(`Role type already exists: ${existing.user_type} (id: ${existing.id})`);
    }
    roleMap[role.type.toLowerCase()] = existing.id;
  }

  // 4. Test Users data
  const testPassword = "password123";
  const hashedPassword = await bcrypt.hash(testPassword, 10);

  const usersToCreate = [
    {
      user_name: "Super Admin Test",
      user_contact: "9999900001",
      user_email: "superadmin@vloq.com",
      roleKey: "super-admin"
    },
    {
      user_name: "Admin Test",
      user_contact: "9999900002",
      user_email: "admin@vloq.com",
      roleKey: "admin"
    },
    {
      user_name: "Sales Executive Test",
      user_contact: "9999900003",
      user_email: "sales@vloq.com",
      roleKey: "sales-executive"
    },
    {
      user_name: "Telecaller Test",
      user_contact: "9999900004",
      user_email: "telecaller@vloq.com",
      roleKey: "telecaller"
    },
    {
      user_name: "Telecaller Two",
      user_contact: "9999900005",
      user_email: "telecaller2@vloq.com",
      roleKey: "telecaller"
    },
    {
      user_name: "Store Manager Test",
      user_contact: "9999900006",
      user_email: "storemanager@vloq.com",
      roleKey: "store-manager"
    },
    {
      user_name: "Site Supervisor Test",
      user_contact: "9999900007",
      user_email: "supervisor@vloq.com",
      roleKey: "site-supervisor"
    },
    {
      user_name: "Tech Check Test",
      user_contact: "9999900008",
      user_email: "techcheck@vloq.com",
      roleKey: "tech-check"
    },
    {
      user_name: "Auditor Test",
      user_contact: "9999900009",
      user_email: "auditor@vloq.com",
      roleKey: "auditor"
    },
    {
      user_name: "Backend User",
      user_contact: "9999900010",
      user_email: "backend@vloq.com",
      roleKey: "backend"
    },
    {
      user_name: "Factory User",
      user_contact: "9999900011",
      user_email: "factory@vloq.com",
      roleKey: "factory"
    }
  ];

  for (const userData of usersToCreate) {
    const roleId = roleMap[userData.roleKey.toLowerCase()];
    if (!roleId) {
      console.warn(`Role ${userData.roleKey} not found in roleMap! Skipping.`);
      continue;
    }

    const existingUser = await prisma.userMaster.findFirst({
      where: {
        OR: [
          { user_contact: userData.user_contact },
          { user_email: userData.user_email }
        ]
      }
    });

    if (!existingUser) {
      const created = await prisma.userMaster.create({
        data: {
          vendor_id: 1,
          user_name: userData.user_name,
          user_contact: userData.user_contact,
          user_email: userData.user_email,
          user_timezone: "Asia/Kolkata",
          password: hashedPassword,
          user_type_id: roleId,
          status: "active",
          franchise_id: franchiseId
        }
      });
      console.log(`Created User: ${created.user_name} (${userData.roleKey}) - Contact: ${created.user_contact}`);
    } else {
      // Update existing user password and make active
      await prisma.userMaster.update({
        where: { id: existingUser.id },
        data: {
          user_name: userData.user_name,
          user_email: userData.user_email,
          password: hashedPassword,
          status: "active",
          user_type_id: roleId,
          franchise_id: franchiseId
        }
      });
      console.log(`Updated existing User: ${existingUser.user_name} (${userData.roleKey}) to active with new password.`);
    }
  }

  console.log("\n✅ All test users seeded/updated successfully!");
  console.log(`🔑 Login password for all users is: "${testPassword}"`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
