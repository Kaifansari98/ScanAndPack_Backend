import { prisma } from "../src/prisma/client";

async function main() {
  const duplicates = await prisma.onlineLead.groupBy({
    by: ["vendor_id", "contact"],
    _count: {
      id: true,
    },
    having: {
      id: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  console.log("Duplicate count group: ", duplicates.length);
  for (const dup of duplicates) {
    console.log(`Duplicate found: vendor_id=${dup.vendor_id}, contact=${dup.contact}, count=${dup._count.id}`);
    
    // Find all leads matching this dup
    const leads = await prisma.onlineLead.findMany({
      where: {
        vendor_id: dup.vendor_id,
        contact: dup.contact,
      },
      orderBy: {
        id: "asc",
      },
    });

    // Delete all except the first one to make it unique
    const keepId = leads[0].id;
    const deleteIds = leads.slice(1).map(l => l.id);
    console.log(`Keeping lead ID ${keepId}, deleting duplicates: ${deleteIds.join(", ")}`);
    
    // Delete history first due to foreign key constraints
    await prisma.onlineLeadHistory.deleteMany({
      where: { online_lead_id: { in: deleteIds } }
    });
    await prisma.onlineLeadStoreLog.deleteMany({
      where: { online_lead_id: { in: deleteIds } }
    });
    await prisma.onlineLeadCallLog.deleteMany({
      where: { online_lead_id: { in: deleteIds } }
    });
    
    // Delete duplicate online leads
    await prisma.onlineLead.deleteMany({
      where: { id: { in: deleteIds } }
    });
  }
  console.log("Cleanup completed.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
