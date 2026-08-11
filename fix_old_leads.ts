import { prisma } from './src/prisma/client';

async function fixOldLeads() {
  console.log("Starting script to fix old lead mappings...");

  // Get all active site-supervisor mappings
  const mappings = await prisma.leadUserMapping.findMany({
    where: {
      type: 'site-supervisor',
    },
    include: {
      user: {
        include: {
          user_type: true
        }
      }
    }
  });

  let fixedCount = 0;

  for (const mapping of mappings) {
    const actualRole = mapping.user?.user_type?.user_type?.toLowerCase();
    
    // If actual role exists and is NOT 'site-supervisor', we need to fix it
    if (actualRole && actualRole !== 'site-supervisor') {
      await prisma.leadUserMapping.update({
        where: { id: mapping.id },
        data: { type: actualRole as any }
      });
      console.log(`Fixed Lead ID: ${mapping.lead_id} | User ID: ${mapping.user_id} | Changed from 'site-supervisor' to '${actualRole}'`);
      fixedCount++;
    }
  }

  console.log(`\nScript finished! Successfully fixed ${fixedCount} old records.`);
}

fixOldLeads()
  .catch(e => {
    console.error("Error running script:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
