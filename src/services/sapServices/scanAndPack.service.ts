import { prisma } from '../../prisma/client';
import { ItemStatus } from '../../prisma/generated'; // assuming status enum is defined there

interface ScanPackPayload {
  project_id: number;
  vendor_id: number;
  client_id: number;
  unique_id: string;
  box_id: number;
  created_by: number;
  status: ItemStatus;
}

export const getProjectItemAndInsertScanPack = async (payload: ScanPackPayload) => {
  const { project_id, vendor_id, client_id, unique_id, box_id, created_by, status } = payload;

  // Step 1: Get the item
  const item = await prisma.projectItemsMaster.findFirst({
    where: {
      project_id,
      vendor_id,
      client_id,
      unique_id
    },
    include: {
      project: true,
      vendor: true,
      details: true // This gives us the specific ProjectDetails row
    }
  });

  if (!item) throw new Error('Item not found');

  // Get the specific project_details_id for this item
  const project_details_id = item.project_details_id;

  // Step 2: Check scan count for this specific item
  const currentScanCount = await prisma.scanAndPackItem.count({
    where: {
      project_id,
      vendor_id,
      client_id,
      unique_id,
      is_deleted: false,
    }
  });

  if (currentScanCount >= item.qty) {
    throw new Error(`Scan limit exceeded for this item.`);
  }

  // Step 3: Get the specific ProjectDetails row (room)
  const projectDetails = await prisma.projectDetails.findUnique({
    where: {
      id: project_details_id
    }
  });

  if (!projectDetails) throw new Error('Project details not found');

  const isGrouping = projectDetails.is_grouping ?? false;

  // Step 4: Check box restrictions based on existing items' grouping status
  const allItemsInBox = await prisma.scanAndPackItem.findMany({
    where: {
      project_id,
      vendor_id,
      client_id,
      box_id,
      is_deleted: false
    },
    select: {
      unique_id: true,
      project_details_id: true
    }
  });

  console.log(`📦 Total items in box: ${allItemsInBox.length}`);
  
  if (allItemsInBox.length > 0) {
    // Get unique room IDs from existing items in box
    const existingRoomIds = [...new Set(allItemsInBox.map(item => item.project_details_id))];
    console.log(`📦 Existing rooms in box: ${existingRoomIds.join(', ')}`);
    
    // Check if any existing room has is_grouping = true
    const existingRoomsDetails = await prisma.projectDetails.findMany({
      where: {
        id: { in: existingRoomIds }
      },
      select: {
        id: true,
        is_grouping: true
      }
    });
    
    const hasGroupingEnabledRooms = existingRoomsDetails.some(room => room.is_grouping === true);
    
    if (hasGroupingEnabledRooms) {
      console.log(`🔒 Box contains items from grouping-enabled rooms - applying strict validation`);
      
      // Find the grouping-enabled room in the box
      const groupingEnabledRoom = existingRoomsDetails.find(room => room.is_grouping === true);
      const existingGroupingRoomId = groupingEnabledRoom?.id;
      
      console.log(`🏠 Grouping-enabled room in box: ${existingGroupingRoomId}`);
      console.log(`🏠 Incoming item room: ${project_details_id}`);
      
      // Check room restriction
      if (project_details_id !== existingGroupingRoomId) {
        throw new Error(`❌ Room mismatch! This box contains items from grouping-enabled room ${existingGroupingRoomId}. Cannot add items from room ${project_details_id}.`);
      }
      
      console.log(`✅ Room validation passed`);
      
      // Check group restriction
      console.log(`📦 Incoming item group: "${item.group}"`);
      
      // Get first item from the grouping-enabled room
      const firstItemFromGroupingRoom = allItemsInBox.find(boxItem => boxItem.project_details_id === existingGroupingRoomId);
      
      if (firstItemFromGroupingRoom) {
        const firstItem = await prisma.projectItemsMaster.findFirst({
          where: {
            project_id,
            vendor_id,
            client_id,
            unique_id: firstItemFromGroupingRoom.unique_id,
            project_details_id: existingGroupingRoomId
          },
          select: {
            group: true
          }
        });

        if (!firstItem) {
          throw new Error("First item in box not found in master table");
        }

        console.log(`📦 Existing item group in box: "${firstItem.group}"`);

        // Normalize groups for comparison
        const existingItemGroup = (firstItem.group || '').toString().trim();
        const incomingItemGroup = (item.group || '').toString().trim();

        console.log(`🔍 Comparing groups: "${existingItemGroup}" vs "${incomingItemGroup}"`);

        if (existingItemGroup !== incomingItemGroup) {
          throw new Error(`❌ Group mismatch! This box already contains items of group '${existingItemGroup}' from grouping-enabled room. Cannot add group '${incomingItemGroup}'.`);
        }

        console.log(`✅ Group validation passed!`);
      }
    } else {
      console.log(`🔓 Box contains only items from non-grouping rooms`);
      
      if (isGrouping) {
        console.log(`🔒 But incoming item is from grouping-enabled room ${project_details_id}`);
        throw new Error(`❌ Cannot add items from grouping-enabled room ${project_details_id} to a box that already contains items from non-grouping rooms.`);
      } else {
        console.log(`✅ Incoming item is also from non-grouping room - no restrictions`);
      }
    }
  } else {
    console.log(`📦 This is the first item in the box. Room: ${project_details_id}, Group: "${item.group}", Grouping: ${isGrouping ? 'ENABLED' : 'DISABLED'}`);
  }

  // Step 5: Insert scan
  const newScan = await prisma.scanAndPackItem.create({
    data: {
      project_id: item.project_id,
      vendor_id: item.vendor_id,
      client_id: item.client_id,
      box_id,
      project_details_id: item.project_details_id,
      unique_id: item.unique_id,
      weight: item.weight,
      qty: 1,
      created_by,
      status
    }
  });

  // Step 6: Recalculate totals for the specific room (ProjectDetails)
  // Get total_items for this specific project_details_id
  const totalItemsForRoom = await prisma.projectItemsMaster.aggregate({
    where: {
      project_details_id: project_details_id,
      project_id,
      vendor_id,
      client_id
    },
    _sum: {
      qty: true
    }
  });

  // Get packed count for this specific project_details_id
  const packedCountForRoom = await prisma.scanAndPackItem.count({
    where: {
      project_details_id: project_details_id,
      project_id,
      vendor_id,
      client_id,
      is_deleted: false,
    }
  });

  const total_items = totalItemsForRoom._sum.qty || 0;
  const total_packed = packedCountForRoom;
  const total_unpacked = Math.max(total_items - total_packed, 0);

  // Step 7: Update only the specific ProjectDetails row (room)
  await prisma.projectDetails.update({
    where: {
      id: project_details_id
    },
    data: {
      total_packed,
      total_unpacked,
      total_items // Update this too in case it wasn't set correctly before
    }
  });

  return newScan;
};

export const getScanItemsByFields = async ({
  project_id,
  vendor_id,
  client_id,
  box_id,
}: {
  project_id: number;
  vendor_id: number;
  client_id: number;
  box_id: number;
}) => {
  const boxDetails = await prisma.boxMaster.findFirst({
    where: {
      id: box_id,
      project_id,
      vendor_id,
      client_id,
      is_deleted: false,
    },
  });

  const scanItems = await prisma.scanAndPackItem.findMany({
    where: {
      project_id,
      vendor_id,
      client_id,
      box_id,
      is_deleted: false,
    },
    include: {
      details: true, // Include ProjectDetails relation
    },
    orderBy: {
      created_date: 'desc',
    },
  });

  const enrichedItems = await Promise.all(
    scanItems.map(async (item) => {
      const projectItems = await prisma.projectItemsMaster.findMany({
        where: {
          project_id: item.project_id,
          vendor_id: item.vendor_id,
          client_id: item.client_id,
          unique_id: item.unique_id,
        },
      });

      return {
        id: item.id, // Include ScanAndPackItem.id
        unique_id: item.unique_id,
        project_id: item.project_id,
        vendor_id: item.vendor_id,
        client_id: item.client_id,
        box_id: item.box_id,
        project_details_id: item.project_details_id,
        status: item.status,
        created_by: item.created_by,
        created_date: item.created_date,
        qty: item.qty,
        weight: item.weight,
        project_details: item.details, // ProjectDetails data
        project_item_details: projectItems.length === 1 ? projectItems[0] : projectItems,
      };      
    })
  );

  return {
    box_details: boxDetails,
    items: enrichedItems,
    total_items: enrichedItems.length,
  };
};

export const deleteScanAndPackItemById = async (id: number) => {
  // Step 1: Find the scan item
  const existing = await prisma.scanAndPackItem.findUnique({ where: { id } });

  if (!existing) {
    throw new Error('Scan item not found');
  }

  // Step 2: Delete the scan item
  await prisma.scanAndPackItem.delete({
    where: { id },
  });

  // Step 3: Recalculate total_packed and total_unpacked for the specific room
  const { project_id, vendor_id, client_id, project_details_id } = existing;

  // Get packed count for this specific project_details_id only
  const packedCountForRoom = await prisma.scanAndPackItem.count({
    where: {
      project_details_id: project_details_id,
      project_id,
      vendor_id,
      client_id,
      is_deleted: false, 
    },
  });

  // Get the specific ProjectDetails row (room)
  const projectDetails = await prisma.projectDetails.findUnique({
    where: {
      id: project_details_id,
    },
  });

  if (!projectDetails) {
    throw new Error('Related projectDetails not found');
  }

  const total_items = projectDetails.total_items || 0;
  const total_packed = packedCountForRoom;
  const total_unpacked = Math.max(total_items - total_packed, 0);

  // Step 4: Update only the specific ProjectDetails row (room)
  await prisma.projectDetails.update({
    where: {
      id: project_details_id,
    },
    data: {
      total_packed,
      total_unpacked,
    },
  });

  return { 
    deletedId: id, 
    updatedProjectDetails: {
      project_details_id: project_details_id,
      room_name: projectDetails.room_name,
      total_items,
      total_packed, 
      total_unpacked 
    }
  };
};
