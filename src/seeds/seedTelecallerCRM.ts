import { prisma } from "../prisma/client";

async function main() {
  console.log("Seeding Telecaller CRM Roles...");
  
  const roles = [
    "Sales Admin",
    "Telecaller Team Lead",
    "Telecaller",
    "Store Manager"
  ];
  
  for (const role of roles) {
    const existing = await prisma.userTypeMaster.findFirst({
      where: { user_type: { equals: role, mode: "insensitive" } }
    });
    
    if (!existing) {
      const created = await prisma.userTypeMaster.create({
        data: { user_type: role }
      });
      console.log(`Created role: ${role} (id: ${created.id})`);
    } else {
      console.log(`Role already exists: ${role} (id: ${existing.id})`);
    }
  }
  
  console.log("Seeding Follow-up Statuses for all Vendors...");
  const vendors = await prisma.vendorMaster.findMany();
  
  const statuses = [
    { name: "Call Disconnected", required: true },
    { name: "Callback Required", required: true },
    { name: "No Answer", required: true },
    { name: "Interested", required: true },
    { name: "Not Interested", required: false },
    { name: "Store Visit", required: true },
    { name: "Store Assigned", required: true },
    { name: "Converted", required: false },
    { name: "Closed", required: false },
    { name: "Walk-In Customer", required: true }
  ];
  
  for (const vendor of vendors) {
    console.log(`Seeding statuses for Vendor: ${vendor.vendor_name} (id: ${vendor.id})`);
    for (const status of statuses) {
      const existingStatus = await prisma.onlineLeadFollowupStatus.findFirst({
        where: {
          vendor_id: vendor.id,
          status_name: { equals: status.name, mode: "insensitive" }
        }
      });
      
      if (!existingStatus) {
        await prisma.onlineLeadFollowupStatus.create({
          data: {
            vendor_id: vendor.id,
            status_name: status.name,
            followup_required: status.required,
            is_active: true
          }
        });
        console.log(`  Created status: ${status.name}`);
      } else {
        console.log(`  Status already exists: ${status.name}`);
      }
    }
  }
  
  console.log("Seeding Stores (Franchises) for all Vendors...");
  const storesToSeed = [
    { name: "Mumbai", code: "MUMBAI" },
    { name: "Pune", code: "PUNE" }
  ];
  
  for (const vendor of vendors) {
    console.log(`Seeding stores for Vendor: ${vendor.vendor_name} (id: ${vendor.id})`);
    for (const store of storesToSeed) {
      const existingStore = await prisma.franchiseMaster.findFirst({
        where: {
          vendor_id: vendor.id,
          franchise_name: { equals: store.name, mode: "insensitive" }
        }
      });
      
      if (!existingStore) {
        await prisma.franchiseMaster.create({
          data: {
            vendor_id: vendor.id,
            franchise_name: store.name,
            franchise_code: store.code,
            status: "active"
          }
        });
        console.log(`  Created store: ${store.name}`);
      } else {
        console.log(`  Store already exists: ${store.name}`);
      }
    }
  }
  
  console.log("Seeding finished successfully!");
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
