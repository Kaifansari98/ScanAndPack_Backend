import { prisma } from '../../prisma/client';
import { Prisma } from '@prisma/client';
import { ProjectMaster, ProjectDetails, ProjectItemsMaster } from '@prisma/client';
import { FullProjectCreateInput } from '../../types/project.types';

export const createProject = async (data: Omit<ProjectMaster, 'id' | 'created_at'>) => {
  return prisma.projectMaster.create({
    data,
  });
};

export const createProjectDetails = async (data: Omit<ProjectDetails, 'id'>) => {
  return prisma.projectDetails.create({
    data,
  });
};

export const createProjectItem = async (data: Omit<ProjectItemsMaster, 'id'>) => {
  // 1. Create the new item
  const newItem = await prisma.projectItemsMaster.create({ data });

  // 2. Recalculate total_items
  const totalQty = await prisma.projectItemsMaster.aggregate({
    _sum: { qty: true },
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
  });

  const total_items = totalQty._sum.qty || 0;

  // 3. Get current packed count from projectDetails
  const existingDetails = await prisma.projectDetails.findFirst({
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
  });

  const total_packed = existingDetails?.total_packed || 0;
  const total_unpacked = Math.max(total_items - total_packed, 0); // prevent negative

  // 4. Update ProjectDetails
  await prisma.projectDetails.updateMany({
    where: {
      project_id: data.project_id,
      vendor_id: data.vendor_id,
      client_id: data.client_id,
    },
    data: {
      total_items,
      total_unpacked,
    },
  });

  return newItem;
};

export const getAllProjects = () => {
    return prisma.projectMaster.findMany({
      include: {
        vendor: true,
        createdByUser: true,
        details: true,
        items: true,
      },
    });
  };
  
  export const getAllProjectDetails = () => {
    return prisma.projectDetails.findMany({
      include: {
        project: true,
        vendor: true,
      },
    });
  };
  
  export const getAllProjectItems = () => {
    return prisma.projectItemsMaster.findMany({
      include: {
        project: true,
        vendor: true,
        details: true,
      },
    });
  };
  
  export const getProjectById = (id: number) => {
    return prisma.projectMaster.findUnique({
      where: { id },
      include: {
        vendor: true,
        createdByUser: true,
        details: true,
        items: true,
      },
    });
  };
  
  export const getProjectDetailsById = (id: number) => {
    return prisma.projectDetails.findUnique({
      where: { id },
      include: {
        project: true,
        vendor: true,
      },
    });
  };
  
  export const getProjectItemById = (id: number) => {
    return prisma.projectItemsMaster.findUnique({
      where: { id },
      include: {
        project: true,
        vendor: true,
        details: true,
      },
    });
  };
  
  export const getProjectsByVendorIdService = async (vendorId: number) => {
    return prisma.projectMaster.findMany({
      where: {
        vendor_id: vendorId,
      },
      select: {
        id: true,
        project_name: true,
        vendor_id: true,
        client_id: true,
        created_by: true,
        project_status: true,
        created_at: true,
        createdByUser: {
          select: {
            id: true,
            vendor_id: true,
            user_name: true,
            user_type_id: true,
          },
        },
        details: {
          select: {
            id: true,
            project_id: true,
            vendor_id: true,
            client_id: true,
            total_items: true,
            total_packed: true,
            total_unpacked: true,
            start_date: true,
            estimated_completion_date: true,
            actual_completion_date: true,
          },
        },
      },
    });
  };

  export const getProjectItemByFields = async (params: {
    project_id: number;
    vendor_id: number;
    client_id: number;
    unique_id: string;
  }) => {
    return prisma.projectItemsMaster.findFirst({
      where: {
        project_id: params.project_id,
        vendor_id: params.vendor_id,
        client_id: params.client_id,
        unique_id: {
          equals: params.unique_id.trim(),
          mode: 'insensitive',
        },
      },
      include: {
        project: true,
        vendor: true,
        details: true,
      },
    });
  };
  
  export const getProjectItemCounts = async ({
    project_id,
    vendor_id,
    client_id,
  }: {
    project_id: number;
    vendor_id: number;
    client_id: number;
  }) => {
    // 1. Total qty from ProjectItemsMaster
    const totalQty = await prisma.projectItemsMaster.aggregate({
      _sum: { qty: true },
      where: {
        project_id,
        vendor_id,
        client_id,
      },
    });
  
    // 2. Total packed qty from ScanAndPackItem (SUM qty, not just COUNT)
    const packedQty = await prisma.scanAndPackItem.aggregate({
      _sum: { qty: true },
      where: {
        project_id,
        vendor_id,
        client_id,
        status: 'packed',
      },
    });
  
    const total_items = totalQty._sum.qty || 0;
    const total_packed = packedQty._sum.qty || 0;
    const total_unpacked = total_items - total_packed;
  
    // 3. Update ProjectDetails here (optional step)
    await prisma.projectDetails.updateMany({
      where: {
        project_id,
        vendor_id,
        client_id,
      },
      data: {
        total_items,
        total_packed,
        total_unpacked,
      },
    });
  
    return {
      total_items,
      total_packed,
      total_unpacked,
    };
  };

  export const createOrUpdateFullProject = async (
    vendorToken: string,
    payload: FullProjectCreateInput
  ) => {
    const vendorTokenEntry = await prisma.vendorTokens.findUnique({
      where: { token: vendorToken },
      include: { vendor: true }
    });
  
    if (!vendorTokenEntry) {
      throw new Error("Invalid or expired vendor token");
    }
  
    const vendor = vendorTokenEntry.vendor;
    console.log("Vendor resolved:", vendor.id);
  
    // ✅ Step 1: Resolve the user to use in created_by
    const adminUser = await prisma.userMaster.findFirst({
      where: {
        vendor_id: vendor.id,
        user_type_id: 1
      },
      orderBy: { created_at: "asc" }
    });
  
    if (!adminUser) {
      throw new Error("No admin user found for this vendor");
    }
  
    const createdByUserId = adminUser.id;
    console.log("Admin user resolved:", createdByUserId);
  
    // ✅ Step 2: Check or create client
    const orConditions: Prisma.ClientMasterWhereInput[] = [];
  
    if (payload.client.contact) {
      orConditions.push({ contact: payload.client.contact });
    }
    if (payload.client.id) {
      orConditions.push({ id: payload.client.id });
    }
  
    let client = await prisma.clientMaster.findFirst({
      where: {
        OR: orConditions
      }
    });
  
    if (!client) {
      client = await prisma.clientMaster.create({
        data: {
          name: payload.client.name,
          contact: payload.client.contact,
          alt_contact: payload.client.alt_contact || "",
          email: payload.client.email || "",
          address: payload.client.address.address || "",
          city: payload.client.address.city || "",
          state: payload.client.address.state || "",
          country: payload.client.address.country || "",
          pincode: payload.client.address.pincode || "",
          clientCode: payload.client.contact
        }
      });
      console.log("Client created:", client.id);
    } else {
      console.log("Client found:", client.id);
    }
  
    // ✅ Step 3: Check if project exists
    let project = await prisma.projectMaster.findFirst({
      where: {
        unique_project_id: payload.project.unique_project_id,
        vendor_id: vendor.id,
        client_id: client.id
      }
    });
  
    if (!project) {
      project = await prisma.projectMaster.create({
        data: {
          project_name: payload.project.project_name,
          unique_project_id: payload.project.unique_project_id,
          vendor_id: vendor.id,
          client_id: client.id,
          created_by: createdByUserId,
          project_status: "Initiated"
        }
      });
      console.log("Project created:", project.id);
  
      await prisma.projectDetails.create({
        data: {
          project_id: project.id,
          vendor_id: vendor.id,
          client_id: client.id,
          estimated_completion_date: payload.project.estimated_completion_date
            ? new Date(payload.project.estimated_completion_date)
            : new Date(),
          total_items: 0,
          total_packed: 0,
          total_unpacked: 0
        }
      });
      console.log("Project details created");
    } else {
      await prisma.projectMaster.update({
        where: { id: project.id },
        data: { project_status: "in-progress" }
      });
      console.log("Project already exists, status updated");
    }
  
    const projectDetails = await prisma.projectDetails.findFirst({
      where: { project_id: project.id }
    });
  
    if (!projectDetails) {
      throw new Error("Project details not found");
    }
  
// ✅ Step 4: Validate and add project items
const invalidItems: string[] = [];

// 🚫 Validate required fields in each item
for (const [index, item] of payload.items.entries()) {
  const missingFields: string[] = [];

  if (!item.category) missingFields.push("category");
  if (!item.item_name) missingFields.push("item_name");
  if (item.qty === undefined || item.qty === null) missingFields.push("qty");
  if (!item.L1) missingFields.push("L1");
  if (!item.L2) missingFields.push("L2");
  if (!item.L3) missingFields.push("L3");
  if (!item.unique_id) missingFields.push("unique_id");

  if (missingFields.length > 0) {
    invalidItems.push(
      `Item at index ${index} is missing required fields: ${missingFields.join(", ")}`
    );
  }
}

if (invalidItems.length > 0) {
  throw new Error(`Validation failed:\n${invalidItems.join("\n")}`);
}

// 🚫 Check for duplicates within the payload itself
const seenInPayload = new Set<string>();
const duplicatesInPayload = new Set<string>();

for (const item of payload.items) {
  if (seenInPayload.has(item.unique_id)) {
    duplicatesInPayload.add(item.unique_id);
  } else {
    seenInPayload.add(item.unique_id);
  }
}

if (duplicatesInPayload.size > 0) {
  throw new Error(
    `Duplicate unique_id(s) found in request payload:\n${Array.from(duplicatesInPayload).join(", ")}`
  );
}


if (duplicatesInPayload.size > 0) {
  throw new Error(
    `Duplicate unique_id(s) found in request payload:\n${Array.from(duplicatesInPayload).join(", ")}`
  );
}

// ✅ Now check if any of these unique_ids already exist in DB for this project
const existingItems = await prisma.projectItemsMaster.findMany({
  where: {
    project_id: project.id
  },
  select: {
    unique_id: true
  }
});

const existingUniqueIds = new Set(existingItems.map(item => item.unique_id));

const validItems = payload.items.filter(item => {
  if (existingUniqueIds.has(item.unique_id)) {
    invalidItems.push(
      `Duplicate unique_id "${item.unique_id}" already exists in database for this project`
    );
    return false;
  }
  return true;
});

if (invalidItems.length > 0) {
  throw new Error(`Some items have duplicate unique_ids:\n${invalidItems.join("\n")}`);
}

  
    if (invalidItems.length > 0) {
      console.warn("Validation failed for some items:", invalidItems);
      throw new Error(`Some items have duplicate unique_ids:\n${invalidItems.join("\n")}`);
    }
  
    const totalQty = validItems.reduce((acc, item) => acc + Number(item.qty), 0);
  
    await prisma.$transaction([
      ...validItems.map(item =>
        prisma.projectItemsMaster.create({
          data: {
            project_id: project.id,
            vendor_id: vendor.id,
            client_id: client.id,
            category: item.category,
            item_name: item.item_name,
            qty: Number(item.qty),
            L1: item.L1,
            L2: item.L2,
            L3: item.L3,
            unique_id: item.unique_id,
            project_details_id: projectDetails.id
          }
        })
      ),
      prisma.projectDetails.update({
        where: { id: projectDetails.id },
        data: {
          total_items: { increment: totalQty },
          total_unpacked: { increment: totalQty }
        }
      })
    ]);
  
    console.log("Project items added successfully:", validItems.length);
  
    return {
      message: "Project data processed successfully",
      project_id: project.id,
      client_id: client.id,
      items_inserted: validItems.length,
      items_skipped: payload.items.length - validItems.length
    };
  };