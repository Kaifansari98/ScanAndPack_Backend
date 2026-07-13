import { prisma } from '../../prisma/client';
import { BoxStatus } from '../../prisma/generated';
import { CreateBoxInput } from '../../types/boxTypes';

import QRCode from "qrcode";

import fs from "fs";
import path from "path";
// import htmlPdfNode from "html-pdf-node";
import puppeteer from "puppeteer";

import { validationResponse } from '../../../src/utils/validationResponse';
import { generateSignedUrl, uploadPdfAndGetSignedUrl, uploadPdfToWasabi } from '../../../src/utils/wasabiClient';

// ─── Output directory ─────────────────────────────────────────────────────────
const PDF_OUTPUT_DIR = path.join(process.cwd(), "public", "pdfs", "boxes");

// Ensure directory exists on startup
if (!fs.existsSync(PDF_OUTPUT_DIR)) {
  fs.mkdirSync(PDF_OUTPUT_DIR, { recursive: true });
}

export const createBox = async (data: CreateBoxInput) => {
  const { vendor_id, project_id, lead_id, box_name } = data;

  const existingBox = await prisma.boxMaster.findFirst({
    where: {
      vendor_id,
      project_id,
      lead_id,
      box_name,
      is_deleted: false, // also respect soft delete
    },
  });

  if (existingBox) {
    throw new Error('Box already exists');
  }

  return prisma.boxMaster.create({
    data,
    select: { id: true, box_name: true, project_id: true, vendor_id: true, lead_id: true, box_status: true }
  });
};

export const updateBoxName = async (
  id: number,
  vendor_id: number,
  project_id: number,
  lead_id: number,
  newBoxName: string
) => {
  // Check if box exists with these fields
  const existingBox = await prisma.boxMaster.findFirst({
    where: {
      id,
      vendor_id,
      project_id,
      lead_id,
      is_deleted: false,
    },
  });

  if (!existingBox) {
    throw new Error('Box not found');
  }

  // Check if the new box_name already exists for this vendor/project/client
  const duplicate = await prisma.boxMaster.findFirst({
    where: {
      vendor_id,
      project_id,
      lead_id,
      box_name: newBoxName,
      is_deleted: false,
      NOT: {
        id, // exclude the current box
      },
    },
  });

  if (duplicate) {
    throw new Error('Another box with the same name already exists');
  }

  // Proceed to update
  return prisma.boxMaster.update({
    where: { id },
    data: {
      box_name: newBoxName,
    },
  });
};

export const getAllBoxes = async () => {
  return await prisma.boxMaster.findMany({
    where: {
      is_deleted: false,
    },
    include: {
      project: true,
      vendor: true,
      details: true,
    },
  });
};

export const getBoxesByVendorAndProject = async (vendorId: number, projectId: number) => {
  const boxes = await prisma.boxMaster.findMany({
    where: {
      vendor_id: vendorId,
      project_id: projectId,
      is_deleted: false,
    },
    include: {
      details: true,
    },
  });

  // ── Enrich each box with item count from CutListMachineMapping ─────────────
  const enriched = await Promise.all(
    boxes.map(async (box) => {
      const items_count = await prisma.cutListMachineMapping.count({
        where: {
          box_id: box.id,
          project_id: projectId,
          vendor_id: vendorId,
          actual_in_at: { not: null },
        },
      });

      return {
        ...box,
        items_count,
      };
    })
  );

  return enriched;
};

export const getBoxDetailsWithItems = async (
  vendorId: number,
  projectId: number,
  clientId: number,
  boxId: number
) => {
  const vendor = await prisma.vendorMaster.findUnique({
    where: { id: vendorId },
  });

  const box = await prisma.boxMaster.findFirst({
    where: {
      id: boxId,
      project_id: projectId,
    },
    include: {
      details: true,
      project: {
        include: {
          client: true,
        },
      },
    },
  });

  const items = await prisma.scanAndPackItem.findMany({
    where: {
      vendor_id: vendorId,
      project_id: projectId,
      client_id: clientId,
      box_id: boxId,
      is_deleted: false,
    },
    include: {
      user: true,
      details: true,
    },
  });

  // 🔥 Enrich each item with its ProjectItemsMaster record
  const enrichedItems = await Promise.all(
    items.map(async (item) => {
      const projectItem = await prisma.projectItemsMaster.findFirst({
        where: {
          project_id: item.project_id,
          vendor_id: item.vendor_id,
          unique_id: item.unique_id,
        },
      });

      return {
        ...item,
        projectItem,
      };
    })
  );

  return {
    vendor,
    box,
    client: box?.project?.client,
    items: enrichedItems,
  };
};

export const getAllBoxesWithItemCountService = async (
  vendorId: number,
  projectId: number,
  clientId: number
) => {
  const [vendor, project] = await Promise.all([
    prisma.vendorMaster.findUnique({
      where: { id: vendorId },
    }),
    prisma.projectMaster.findUnique({
      where: { id: projectId },
      include: {
        client: true,
      },
    }),
  ]);

  if (!vendor || !project) {
    throw new Error('Vendor or Project not found');
  }

  const boxes = await prisma.boxMaster.findMany({
    where: {
      project_id: projectId,
      vendor_id: vendorId,
      lead_id: clientId,
      is_deleted: false,
    },
  });

  const enrichedBoxes = await Promise.all(
    boxes.map(async (box) => {
      const items = await prisma.scanAndPackItem.findMany({
        where: {
          vendor_id: vendorId,
          project_id: projectId,
          client_id: clientId,
          box_id: box.id,
          is_deleted: false,
        },
      });

      return {
        box_id: box.id,
        box_name: box.box_name,
        total_items: items.length,
      };
    })
  );

  return {
    vendor,
    project,
    client: project.client,
    boxes: enrichedBoxes,
  };
};

export const updateBoxStatus = async (
  boxId: number,
  newStatus: BoxStatus
) => {
  const box = await prisma.boxMaster.findFirst({
    where: {
      id: boxId,
      is_deleted: false,
    },
  });

  if (!box) {
    throw new Error('Box not found or is deleted');
  }

  return await prisma.boxMaster.update({
    where: { id: boxId },
    data: { box_status: newStatus },
  });
};

// export const softDeleteBoxWithScanItems = async (
//   boxId: number,
//   deletedBy: number
// ) => {
//   // Step 1: Check if box exists and is not deleted
//   const box = await prisma.boxMaster.findFirst({
//     where: { id: boxId, is_deleted: false },
//   });

//   if (!box) throw new Error('Box not found or already deleted');

//   // Step 2: Soft delete all scan items linked to this box
//   await prisma.scanAndPackItem.updateMany({
//     where: {
//       box_id: boxId,
//       is_deleted: false,
//     },
//     data: {
//       is_deleted: true,
//     },
//   });

//   // Step 3: Get all ProjectDetails (rooms) for this project
//   const allProjectDetails = await prisma.projectDetails.findMany({
//     where: {
//       project_id: box.project_id,
//       vendor_id: box.vendor_id,
//       client_id: box.client_id,
//     },
//   });

//   if (!allProjectDetails || allProjectDetails.length === 0) {
//     throw new Error('ProjectDetails not found');
//   }

//   // Step 4: Recalculate counts for each room and update them
//   const updatedRooms = [];

//   for (const projectDetail of allProjectDetails) {
//     // Get packed count for this specific room
//     const packedCountForRoom = await prisma.scanAndPackItem.count({
//       where: {
//         project_details_id: projectDetail.id,
//         project_id: box.project_id,
//         vendor_id: box.vendor_id,
//         client_id: box.client_id,
//         is_deleted: false,
//       },
//     });

//     // Calculate totals for this room
//     const total_items = projectDetail.total_items;
//     const total_packed = packedCountForRoom;
//     const total_unpacked = Math.max(total_items - total_packed, 0);

//     // Update this room's counts
//     await prisma.projectDetails.update({
//       where: {
//         id: projectDetail.id,
//       },
//       data: {
//         total_packed,
//         total_unpacked,
//       },
//     });

//     updatedRooms.push({
//       project_details_id: projectDetail.id,
//       room_name: projectDetail.room_name,
//       total_items,
//       total_packed,
//       total_unpacked,
//     });
//   }

//   // Step 5: Soft delete the box
//   const deletedBox = await prisma.boxMaster.update({
//     where: { id: boxId },
//     data: {
//       is_deleted: true,
//       deleted_by: deletedBy,
//       deleted_at: new Date(),
//     },
//   });

//   return {
//     message: 'Box and scan items soft-deleted successfully',
//     deletedBoxId: deletedBox.id,
//     updatedProjectDetails: updatedRooms,
//   };
// };

// export const getGroupedItemInfoByBoxId = async (boxId: number) => {
//   const groupedItem = await prisma.scanAndPackItem.findFirst({
//     where: {
//       box_id: boxId,
//       is_deleted: false,
//       details: {
//         is_grouping: true,
//       },
//     },
//     include: {
//       details: true,
//       project: false,
//       vendor: false,
//       client: false,
//     },
//   });

//   if (!groupedItem) return null;

//   const item = await prisma.projectItemsMaster.findFirst({
//     where: {
//       unique_id: groupedItem.unique_id,
//       project_id: groupedItem.project_id,
//       client_id: groupedItem.client_id,
//       vendor_id: groupedItem.vendor_id,
//       project_details_id: groupedItem.project_details_id,
//     },
//   });

//   return item ? {
//     group: item.group,
//     roomName: groupedItem.details.room_name,
//   } : null;
// };


// boxPdf.service.ts
// Generates a box label PDF and returns a downloadable URL path.
//
// Dependencies: npm install html-pdf-node
// Types:        npm install --save-dev @types/html-pdf-node
//
// Place generated PDFs in:  /public/pdfs/boxes/  (served as static files)
// Expose static dir in Express:  app.use('/pdfs', express.static('public/pdfs'))



// ─── Helpers ──────────────────────────────────────────────────────────────────

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9-_]/g, "_");

const escapeHtml = (str: string) =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// ─── Main service ─────────────────────────────────────────────────────────────


export const generateBoxPdfServiceWeb = async (
  box_id: number,
  project_id: string,
  vendor_id: number
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Find project using unique project ID
    |--------------------------------------------------------------------------
    */

    const project =
      await prisma.projectMaster.findFirst({
        where: {
          unique_project_id:
            project_id,

          vendor_id,
        },

        select: {
          id:
            true,
        },
      });

    if (!project) {
      return validationResponse(
        0,
        "Project not found"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Generate single-box 4 x 6 PDF
    |--------------------------------------------------------------------------
    */

    return await generateBoxPdfService(
      box_id,
      project.id,
      vendor_id
    );
  } catch (error) {
    console.error(
      "generateBoxPdfServiceWeb:",
      error
    );

    return validationResponse(
      0,
      "Failed to generate box PDF"
    );
  }
};



export const generateBoxPdfService = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {
  const tempDir = path.join(
    process.cwd(),
    "tmp"
  );

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, {
      recursive: true,
    });
  }

  let tempFilePath: string | null =
    null;

  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Fetch project, box, vendor and packaging machine
    |--------------------------------------------------------------------------
    */

    const [
      project,
      box,
      vendor,
      packagingMachine,
      totalBoxes,
    ] = await Promise.all([
      prisma.projectMaster.findFirst({
        where: {
          id: project_id,
          vendor_id,
        },

        select: {
          id: true,
          project_name: true,
          lead_id: true,
          order_no: true,
          client_name: true,
          client_address: true,
          client_contact_no: true,
        },
      }),

      prisma.boxMaster.findFirst({
        where: {
          id: box_id,
          project_id,
          vendor_id,
          is_deleted: false,
        },

        select: {
          id: true,
          box_name: true,
          box_status: true,
          created_date: true,
          packed_at: true,
          packed_by: true,

          packedByUser: {
            select: {
              id: true,
              user_name: true,
            },
          },

          details: {
            select: {
              room_name: true,
            },
          },
        },
      }),

      prisma.vendorMaster.findUnique({
        where: {
          id: vendor_id,
        },

        select: {
          vendor_name: true,
          primary_contact_number: true,
          primary_contact_email: true,
          logo: true,
        },
      }),

      prisma.machineMaster.findFirst({
        where: {
          vendor_id,
          machine_type_id: 18,
        },

        select: {
          id: true,
        },

        orderBy: {
          id: "asc",
        },
      }),

      prisma.boxMaster.count({
        where: {
          project_id,
          vendor_id,
          is_deleted: false,
        },
      }),
    ]);

    if (!project) {
      return validationResponse(
        0,
        "Project not found"
      );
    }

    if (!box) {
      return validationResponse(
        0,
        "Box not found"
      );
    }

    if (!vendor) {
      return validationResponse(
        0,
        "Vendor not found"
      );
    }

    if (!packagingMachine) {
      return validationResponse(
        0,
        "Packaging machine not configured"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Vendor logo
    |--------------------------------------------------------------------------
    */

    let logoUrl = "";

    if (vendor.logo) {
      try {
        logoUrl =
          await generateSignedUrl(
            vendor.logo
          );
      } catch (error) {
        console.error(
          "Error generating logo signed URL:",
          error
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 3. Lead fallback
    |--------------------------------------------------------------------------
    */

    const lead =
      project.lead_id
        ? await prisma.leadMaster.findUnique({
            where: {
              id: project.lead_id,
            },

            select: {
              firstname: true,
              lastname: true,
              contact_no: true,
              email: true,
              site_address: true,
            },
          })
        : null;

    /*
    |--------------------------------------------------------------------------
    | 4. Client details
    |--------------------------------------------------------------------------
    */

    const clientName =
      project.client_name ||
      (
        lead
          ? `${lead.firstname || ""} ${
              lead.lastname || ""
            }`.trim()
          : ""
      ) ||
      "N/A";

    const clientContact =
      project.client_contact_no ||
      lead?.contact_no ||
      "N/A";

    const deliveryAddress =
      project.client_address ||
      lead?.site_address ||
      "N/A";

    const orderNumber =
      project.order_no ||
      "N/A";

    /*
    |--------------------------------------------------------------------------
    | 5. Find current box number
    |--------------------------------------------------------------------------
    */

    const projectBoxes =
      await prisma.boxMaster.findMany({
        where: {
          project_id,
          vendor_id,
          is_deleted: false,
        },

        select: {
          id: true,
        },

        orderBy: {
          created_date: "asc",
        },
      });

    const boxIndex =
      projectBoxes.findIndex(
        (
          currentBox
        ) =>
          currentBox.id ===
          box.id
      );

    const currentBoxNumber =
      boxIndex >= 0
        ? boxIndex + 1
        : 1;

    /*
    |--------------------------------------------------------------------------
    | 6. Fetch packed items
    |--------------------------------------------------------------------------
    */

    const mappingRows =
      await prisma.cutListMachineMapping.findMany({
        where: {
          box_id,
          project_id,
          vendor_id,

          machine_id:
            packagingMachine.id,

          expected_in:
            true,
        },

        select: {
          id: true,

          cut_list: {
            select: {
              id: true,
              item_name: true,
              category_name: true,
              group_name: true,
              unique_code: true,
              weight: true,
            },
          },
        },

        orderBy: {
          created_at: "asc",
        },
      });

    /*
    |--------------------------------------------------------------------------
    | 7. Group repeated products
    |--------------------------------------------------------------------------
    */

    const itemMap =
      new Map<
        number,
        {
          id: number;

          item_name:
            string;

          category_name:
            string | null;

          group_name:
            string | null;

          unique_code:
            string | null;

          unit_weight:
            number;

          quantity:
            number;

          total_weight:
            number;
        }
      >();

    for (
      const mapping
      of mappingRows
    ) {
      const cutList =
        mapping.cut_list;

      if (!cutList) {
        continue;
      }

      const weight =
        Number(
          cutList.weight ||
          0
        );

      const existing =
        itemMap.get(
          cutList.id
        );

      if (existing) {
        existing.quantity +=
          1;

        existing.total_weight +=
          weight;
      } else {
        itemMap.set(
          cutList.id,
          {
            id:
              cutList.id,

            item_name:
              cutList.item_name,

            category_name:
              cutList.category_name,

            group_name:
              cutList.group_name,

            unique_code:
              cutList.unique_code,

            unit_weight:
              weight,

            quantity:
              1,

            total_weight:
              weight,
          }
        );
      }
    }

    const items =
      Array.from(
        itemMap.values()
      ).map(
        (
          item
        ) => ({
          ...item,

          unit_weight:
            Number(
              item.unit_weight.toFixed(
                2
              )
            ),

          total_weight:
            Number(
              item.total_weight.toFixed(
                2
              )
            ),
        })
      );

    /*
    |--------------------------------------------------------------------------
    | 8. Totals
    |--------------------------------------------------------------------------
    */

    const totalQuantity =
      items.reduce(
        (
          total,
          item
        ) =>
          total +
          item.quantity,
        0
      );

    const totalWeight =
      items.reduce(
        (
          total,
          item
        ) =>
          total +
          item.total_weight,
        0
      );

    /*
    |--------------------------------------------------------------------------
    | 9. Package date
    |--------------------------------------------------------------------------
    */

    const packageDate =
      formatReportDate(
        box.packed_at ||
        box.created_date
      );

    /*
    |--------------------------------------------------------------------------
    | 10. Embedded QR
    |--------------------------------------------------------------------------
    */

    const qrValue =
      `vendor:${vendor_id},project:${project_id},box:${box_id}`;

    const qrImage =
      await QRCode.toDataURL(
        qrValue,
        {
          width: 250,

          margin: 1,

          errorCorrectionLevel:
            "M",

          color: {
            dark:
              "#000000",

            light:
              "#FFFFFF",
          },
        }
      );

    /*
    |--------------------------------------------------------------------------
    | 11. Logo
    |--------------------------------------------------------------------------
    */

    const logoHtml =
      logoUrl
        ? `
          <img
            src="${logoUrl}"
            class="company-logo"
            alt="Logo"
          />
        `
        : `
          <div
            class="company-logo-text"
          >
            ${escapeHtml(
              vendor.vendor_name
            )}
          </div>
        `;

    /*
    |--------------------------------------------------------------------------
    | 12. Product rows
    |--------------------------------------------------------------------------
    */

    const visibleItems =
      items.slice(
        0,
        10
      );

    const hiddenItemsCount =
      items.length -
      visibleItems.length;

    const itemRows =
      visibleItems
        .map(
          (
            item,
            index
          ) => `
            <tr>

              <td>
                ${
                  index +
                  1
                }
              </td>

              <td>
                ${escapeHtml(
                  item.item_name
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.category_name ||
                  "—"
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.group_name ||
                  "—"
                )}
              </td>

              <td>
                ${
                  item.quantity
                }
              </td>

              <td>
                ${item.total_weight.toFixed(
                  2
                )}
                kg
              </td>

            </tr>
          `
        )
        .join("");

    const hiddenItemsRow =
      hiddenItemsCount >
      0
        ? `
          <tr>

            <td
              colspan="6"

              class="more-items"
            >
              +
              ${hiddenItemsCount}

              more item${
                hiddenItemsCount >
                1
                  ? "s"
                  : ""
              }
            </td>

          </tr>
        `
        : "";

    /*
    |--------------------------------------------------------------------------
    | 13. HTML
    |--------------------------------------------------------------------------
    */

    const html = `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8"/>

<style>

@page {
  size: 3in 6in;
  margin: 0;
}


* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}


html,
body {
  width: 3in;
  height: 6in;

  margin: 0;
  padding: 0;
}


body {
  color: #172033;

  background: #FFFFFF;

  font-family:
    Arial,
    sans-serif;

  font-size: 11px;
}


.page {
  width: 3in;
  height: 6in;

  padding: 14px;

  overflow: hidden;
}


/*
|--------------------------------------------------------------------------
| Company header
|--------------------------------------------------------------------------
*/

.main-header {
  display: flex;

  justify-content:
    space-between;

  align-items:
    flex-start;

  min-height: 38px;

  padding-bottom: 6px;

  border-bottom:
    1px solid
    #172033;
}


.company-logo {
  display: block;

  max-width: 92px;

  max-height: 30px;

  object-fit: contain;
}


.company-logo-text {
  font-size: 14px;

  font-weight: 800;
}


.company-information {
  color: #667085;

  font-size: 6.5px;

  line-height: 1.35;

  text-align: right;
}


.company-name {
  color: #172033;

  font-size: 8.5px;

  font-weight: 800;
}


/*
|--------------------------------------------------------------------------
| Project header
|--------------------------------------------------------------------------
*/

.project-heading {
  display: flex;

  justify-content:
    space-between;

  align-items:
    center;

  min-height: 37px;

  padding: 6px 0;

  border-bottom:
    1px solid
    #D9DEE7;
}


.project-heading-left {
  width: 64%;
}


.project-name {
  max-width: 220px;

  overflow: hidden;

  color: #172033;

  font-size: 10.5px;

  line-height: 1.15;

  font-weight: 900;

  white-space: nowrap;

  text-overflow:
    ellipsis;
}


.project-subtitle {
  margin-top: 2px;

  color: #667085;

  font-size: 6.5px;
}


.project-client {
  width: 34%;

  color: #667085;

  font-size: 6.5px;

  line-height: 1.3;

  text-align: right;
}


.project-client strong {
  display: block;

  overflow: hidden;

  color: #172033;

  white-space: nowrap;

  text-overflow:
    ellipsis;
}


/*
|--------------------------------------------------------------------------
| Box
|--------------------------------------------------------------------------
*/

.box-header {
  padding: 7px 0;

  border-bottom:
    2px solid
    #172033;
}


/*
|--------------------------------------------------------------------------
| 75% details + 25% QR
|--------------------------------------------------------------------------
*/

.box-main-row {
  display: grid;

  grid-template-columns:
    minmax(
      0,
      75%
    )
    minmax(
      0,
      25%
    );

  width: 100%;
}


/*
|--------------------------------------------------------------------------
| Left section
|--------------------------------------------------------------------------
*/

.box-left-section {
  min-width: 0;

  padding-right: 10px;
}


.box-title-area {
  padding-bottom: 6px;

  margin-bottom: 7px;

  border-bottom:
    1px solid
    #E1E5EB;
}


.box-title {
  overflow: hidden;

  color: #172033;

  font-size: 13px;

  line-height: 1.15;

  font-weight: 900;

  white-space: nowrap;

  text-overflow:
    ellipsis;
}


.room-name {
  margin-top: 2px;

  overflow: hidden;

  color: #667085;

  font-size: 6.5px;

  line-height: 1.2;

  white-space: nowrap;

  text-overflow:
    ellipsis;
}


/*
|--------------------------------------------------------------------------
| Details
|--------------------------------------------------------------------------
*/

.box-details-grid {
  display: grid;

  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );

  column-gap: 10px;

  row-gap: 9px;
}


.box-detail {
  min-width: 0;
}


.box-detail span {
  display: block;

  color: #667085;

  font-size: 5.7px;

  line-height: 1.1;

  font-weight: 800;

  letter-spacing:
    0.1px;
}


.box-detail strong {
  display: block;

  margin-top: 2px;

  overflow-wrap:
    anywhere;

  color: #172033;

  font-size: 7.7px;

  line-height: 1.15;

  font-weight: 800;
}


.total-weight-value {
  font-size:
    8.7px !important;
}


/*
|--------------------------------------------------------------------------
| QR
|--------------------------------------------------------------------------
*/

.box-qr-section {
  display: flex;

  flex-direction:
    column;

  justify-content:
    center;

  align-items:
    center;

  min-width: 0;

  padding-left: 8px;

  border-left:
    1px solid
    #D9DEE7;
}


.box-qr-code {
  display: block;

  width: 78px;

  height: 78px;

  object-fit: contain;
}


.box-qr-label {
  margin-top: 4px;

  color: #667085;

  font-size: 5.5px;

  line-height: 1;

  font-weight: 900;

  letter-spacing:
    0.35px;
}


/*
|--------------------------------------------------------------------------
| Address
|--------------------------------------------------------------------------
*/

.box-address {
  margin-top: 8px;

  padding-top: 6px;

  border-top:
    1px solid
    #D9DEE7;
}


.box-address span {
  display: block;

  color: #667085;

  font-size: 5.8px;

  font-weight: 800;
}


.box-address strong {
  display: block;

  max-height: 27px;

  margin-top: 3px;

  overflow: hidden;

  color: #172033;

  font-size: 7.2px;

  line-height: 1.28;

  font-weight: 700;
}


/*
|--------------------------------------------------------------------------
| Products heading
|--------------------------------------------------------------------------
*/

.products-title-row {
  display: flex;

  justify-content:
    space-between;

  align-items:
    center;

  margin:
    6px 0 4px;
}


.section-title {
  font-size: 8.5px;

  font-weight: 900;
}


.products-count {
  color: #667085;

  font-size: 5.8px;

  font-weight: 700;
}


/*
|--------------------------------------------------------------------------
| Product table
|--------------------------------------------------------------------------
*/

.report-table {
  width: 100%;

  border-collapse:
    collapse;

  table-layout:
    fixed;
}


.report-table thead {
  color: #FFFFFF;

  background: #172033;
}


.report-table th {
  padding:
    4px 3px;

  font-size: 5.5px;

  font-weight: 700;

  text-align: left;
}


.report-table td {
  padding:
    4px 3px;

  border-bottom:
    1px solid
    #E4E7EC;

  font-size: 6px;

  line-height: 1.15;

  overflow-wrap:
    anywhere;

  vertical-align: top;
}


.report-table tbody tr:nth-child(even) {
  background: #F8FAFC;
}


.report-table tfoot {
  background: #F1F5F9;

  font-weight: 800;
}


.sr-column {
  width: 7%;
}


.item-column {
  width: 29%;
}


.category-column {
  width: 18%;
}


.group-column {
  width: 25%;
}


.qty-column {
  width: 8%;

  text-align:
    center !important;
}


.weight-column {
  width: 13%;

  text-align:
    right !important;
}


.no-products {
  padding:
    14px !important;

  color: #667085;

  text-align: center;
}


.more-items {
  color: #667085;

  text-align: center;

  font-weight: 700;
}

</style>

</head>


<body>

<section
  class="page"
>

  <!--
  ==============================================================
  COMPANY
  ==============================================================
  -->

  <div
    class="main-header"
  >

    <div>

      ${logoHtml}

    </div>


    <div
      class="company-information"
    >

      <div
        class="company-name"
      >
        ${escapeHtml(
          vendor.vendor_name
        )}
      </div>


      <div>
        ${escapeHtml(
          vendor.primary_contact_number ||
          ""
        )}
      </div>


      <div>
        ${escapeHtml(
          vendor.primary_contact_email ||
          ""
        )}
      </div>

    </div>

  </div>


  <!--
  ==============================================================
  PROJECT
  ==============================================================
  -->

  <div
    class="project-heading"
  >

    <div
      class="project-heading-left"
    >

      <div
        class="project-name"
      >
        ${escapeHtml(
          project.project_name
        )}
      </div>


      <div
        class="project-subtitle"
      >
        Order Number:

        ${escapeHtml(
          orderNumber
        )}
      </div>

    </div>


    <div
      class="project-client"
    >

      <strong>
        ${escapeHtml(
          clientName
        )}
      </strong>


      <div>
        ${escapeHtml(
          clientContact
        )}
      </div>

    </div>

  </div>


  <!--
  ==============================================================
  BOX
  ==============================================================
  -->

  <div
    class="box-header"
  >

    <div
      class="box-main-row"
    >

      <!-- LEFT 75% -->

      <div
        class="box-left-section"
      >

        <div
          class="box-title-area"
        >

          <div
            class="box-title"
          >
            ${escapeHtml(
              box.box_name
            )}
          </div>


          ${
            box.details
              ?.room_name
              ? `
                <div
                  class="room-name"
                >
                  ${escapeHtml(
                    box.details
                      .room_name
                  )}
                </div>
              `
              : ""
          }

        </div>


        <div
          class="box-details-grid"
        >

          <div
            class="box-detail"
          >

            <span>
              ORDER NUMBER
            </span>

            <strong>
              ${escapeHtml(
                orderNumber
              )}
            </strong>

          </div>


          <div
            class="box-detail"
          >

            <span>
              PACKED BY
            </span>

            <strong>
              ${escapeHtml(
                box
                  .packedByUser
                  ?.user_name ||
                "N/A"
              )}
            </strong>

          </div>


          <div
            class="box-detail"
          >

            <span>
              PACKET NO.
            </span>

            <strong>
              ${escapeHtml(
                box.box_name
              )}
            </strong>

          </div>


          <div
            class="box-detail"
          >

            <span>
              PACKAGE DATE
            </span>

            <strong>
              ${packageDate}
            </strong>

          </div>


          <div
            class="box-detail"
          >

            <span>
              PRODUCT BOX COUNT
            </span>

            <strong>
              ${currentBoxNumber}

              of

              ${totalBoxes}
            </strong>

          </div>


          <div
            class="box-detail"
          >

            <span>
              TOTAL WEIGHT
            </span>

            <strong
              class="total-weight-value"
            >
              ${totalWeight.toFixed(
                2
              )}
              kg
            </strong>

          </div>

        </div>

      </div>


      <!-- RIGHT 25% -->

      <div
        class="box-qr-section"
      >

        <img
          src="${qrImage}"

          class="box-qr-code"

          alt="Box QR Code"
        />


        <div
          class="box-qr-label"
        >
          SCAN BOX
        </div>

      </div>

    </div>


    <!-- FULL WIDTH ADDRESS -->

    <div
      class="box-address"
    >

      <span>
        DELIVERY ADDRESS
      </span>


      <strong>
        ${escapeHtml(
          deliveryAddress
        )}
      </strong>

    </div>

  </div>


  <!--
  ==============================================================
  PRODUCTS
  ==============================================================
  -->

  <div
    class="products-title-row"
  >

    <h3
      class="section-title"
    >
      PRODUCTS
    </h3>


    <div
      class="products-count"
    >
      ${
        items.length
      }

      products

      ·

      ${totalQuantity}

      qty
    </div>

  </div>


  <table
    class="report-table"
  >

    <thead>

      <tr>

        <th
          class="sr-column"
        >
          #
        </th>

        <th
          class="item-column"
        >
          Product
        </th>

        <th
          class="category-column"
        >
          Category
        </th>

        <th
          class="group-column"
        >
          Group
        </th>

        <th
          class="qty-column"
        >
          Qty
        </th>

        <th
          class="weight-column"
        >
          Weight
        </th>

      </tr>

    </thead>


    <tbody>

      ${
        itemRows ||
        `
          <tr>

            <td
              colspan="6"

              class="no-products"
            >
              No products found
            </td>

          </tr>
        `
      }

      ${hiddenItemsRow}

    </tbody>


    <tfoot>

      <tr>

        <td
          colspan="4"
        >
          TOTAL
        </td>

        <td>
          ${totalQuantity}
        </td>

        <td>
          ${totalWeight.toFixed(
            2
          )}
          kg
        </td>

      </tr>

    </tfoot>

  </table>

</section>

</body>

</html>
`;

    /*
    |--------------------------------------------------------------------------
    | 14. Generate PDF
    |--------------------------------------------------------------------------
    */

    const fileName =
      `box_${sanitizeFileName(
        project.project_name
      )}_${sanitizeFileName(
        box.box_name
      )}_${Date.now()}.pdf`;

    tempFilePath =
      path.join(
        tempDir,
        fileName
      );

    await generateCustomSizePdf(
      html,

      tempFilePath,

      {
        width:
          "3in",

        height:
          "6in",

        printBackground:
          true,

        margin: {
          top:
            "0",

          bottom:
            "0",

          left:
            "0",

          right:
            "0",
        },
      }
    );

    if (
      !fs.existsSync(
        tempFilePath
      )
    ) {
      throw new Error(
        "PDF generation failed. File was not created."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 15. Upload
    |--------------------------------------------------------------------------
    */

    const {
      signedUrl,
      wasabiKey,
    } =
      await uploadPdfAndGetSignedUrl(
        tempFilePath,

        vendor_id,

        project_id,

        fileName
      );

    tempFilePath =
      null;

    return validationResponse(
      1,

      "Box PDF generated successfully",

      {
        download_url:
          signedUrl,

        file_name:
          fileName,

        wasabi_key:
          wasabiKey,

        box_id:
          box.id,

        total_quantity:
          totalQuantity,

        total_weight:
          Number(
            totalWeight.toFixed(
              2
            )
          ),
      }
    );
  } catch (error) {
    console.error(
      "generateBoxPdfService:",
      error
    );

    if (
      tempFilePath &&
      fs.existsSync(
        tempFilePath
      )
    ) {
      fs.unlinkSync(
        tempFilePath
      );
    }

    return validationResponse(
      0,
      "Failed to generate box PDF"
    );
  }
};

// import { randomUUID } from "crypto";


// export async function generatePdfAndUploadToWasabi({
//   html,
//   vendorId,
//   fileNamePrefix = "box-pdf",
// }: {
//   html: string;
//   vendorId: number;
//   fileNamePrefix?: string;
// }) {
//   let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
//   let tempFilePath = "";

//   try {
//     const tempDir = path.join(process.cwd(), "tmp", "pdfs");

//     if (!fs.existsSync(tempDir)) {
//       fs.mkdirSync(tempDir, { recursive: true });
//     }

//     const safeFileName = `${fileNamePrefix}-${Date.now()}-${randomUUID()}.pdf`;
//     tempFilePath = path.join(tempDir, safeFileName);

//     browser = await puppeteer.launch({
//       headless: true,
//       args: ["--no-sandbox", "--disable-setuid-sandbox"],

//       // Use this only if you are using puppeteer-core or local Chrome path is needed:
//       // executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
//     });

//     const page = await browser.newPage();

//     await page.setContent(html, {
//       waitUntil: "networkidle0",
//     });

//     const pdfBuffer = await page.pdf({
//       format: "A4",
//       printBackground: true,
//       margin: {
//         top: "10mm",
//         bottom: "10mm",
//         left: "10mm",
//         right: "10mm",
//       },
//     });

//     fs.writeFileSync(tempFilePath, pdfBuffer);

//     const uploaded = await uploadPdfToWasabi({
//       filePath: tempFilePath,
//       vendorId,
//       fileName: safeFileName,
//       mimeType: "application/pdf",
//     });

//     return {
//       success: true,
//       file_name: safeFileName,
//       pdf_url: uploaded.url,
//       storage_key: uploaded.key,
//       buffer: Buffer.from(pdfBuffer),
//     };
//   } catch (error) {
//     console.error("generatePdfAndUploadToWasabi error:", error);
//     throw error;
//   } finally {
//     if (browser) {
//       await browser.close();
//     }

//     if (tempFilePath && fs.existsSync(tempFilePath)) {
//       fs.unlinkSync(tempFilePath);
//     }
//   }
// }

export async function generatePdf(html: string, filePath: string) {
  let browser;

  try {
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],

      // Only use this on local Mac if puppeteer-core cannot find Chrome:
      // executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    });

    const page = await browser.newPage();

    await page.setContent(html, {
      waitUntil: "networkidle0",
    });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        bottom: "10mm",
        left: "10mm",
        right: "10mm",
      },
    });

    fs.writeFileSync(filePath, Buffer.from(pdfBuffer));

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error("generatePdf error:", error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export const generateProjectBoxPdfService = async (
  project_id: number,
  vendor_id: number
) => {
  const tempDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  let tempFilePath: string | null = null;

  try {

    // ── 1. Fetch project, vendor ─────────────────────────────────────────────
    const [project, vendor] = await Promise.all([
      prisma.projectMaster.findFirst({
        where: { id: project_id, vendor_id },
        select: {
          id: true,
          project_name: true,
          lead_id: true,
          project_status: true,
        },
      }),
      prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
        select: {
          vendor_name: true,
          primary_contact_number: true,
          primary_contact_email: true,
          logo: true,
        },
      }),
    ]);

    if (!project) return validationResponse(0, "Project not found");
    if (!vendor) return validationResponse(0, "Vendor not found");

    // ── 2. Fetch lead ────────────────────────────────────────────────────────
    let lead: {
      firstname: string;
      lastname: string;
      contact_no: string;
      email: string | null;
      site_address: string | null;
    } | null = null;

    if (project.lead_id) {
      lead = await prisma.leadMaster.findUnique({
        where: { id: project.lead_id },
        select: {
          firstname: true,
          lastname: true,
          contact_no: true,
          email: true,
          site_address: true,
        },
      });
    }

    // ── 3. Fetch boxes + item counts from CutListMachineMapping ─────────────
    const packagingMachine = await prisma.machineMaster.findFirst({
      where: { vendor_id, machine_type_id: 18 },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    const boxes = await prisma.boxMaster.findMany({
      where: { project_id, vendor_id, is_deleted: false },
      select: { id: true, box_name: true, box_status: true },
      orderBy: { created_date: "asc" },
    });

    const boxesWithCounts = await Promise.all(
      boxes.map(async (box) => {
        const items_count = packagingMachine
          ? await prisma.cutListMachineMapping.count({
            where: {
              box_id: box.id,
              project_id,
              vendor_id,
              machine_id: packagingMachine.id,
              expected_in: true,
              actual_in_at: { not: null },
            },
          })
          : 0;
        return { ...box, items_count };
      })
    );

    const totalBoxes = boxes.length;
    const packedBoxes = boxes.filter((b) => b.box_status === "packed").length;

    // ── 4. Build QR + logo URLs ──────────────────────────────────────────────
    const qrValue = encodeURIComponent(
      `vendor:${vendor_id},project:${project_id}`
    );
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${qrValue}&size=120x120`;
    const logoUrl = vendor.logo
      ? `${process.env.STORAGE_BASE_URL ?? ""}/${vendor.logo}`
      : null;

    // ── 5. Build HTML ────────────────────────────────────────────────────────
    const boxRows = boxesWithCounts
      .map(
        (box, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding:7px 10px;color:#555;font-size:13px;">${i + 1}</td>
          <td style="padding:7px 10px;font-size:13px;">${escapeHtml(box.box_name)}</td>
          <td style="padding:7px 10px;font-size:13px;">${box.items_count}</td>
          <td style="padding:7px 10px;font-size:13px;">
            <span style="
              background:${box.box_status === "packed" ? "#DCFCE7" : "#FFEDD5"};
              color:${box.box_status === "packed" ? "#15803D" : "#92400E"};
              padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600;
            ">${box.box_status}</span>
          </td>
        </tr>`
      )
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Arial,sans-serif; margin:28px; color:#333; font-size:14px; }
    p { margin:0; }
    strong { font-weight:600; }
  </style>
</head>
<body>
 
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
    ${logoUrl
        ? `<img src="${logoUrl}" style="height:44px;object-fit:contain;" alt="Logo"/>`
        : `<div style="width:80px;height:36px;background:#1a1a2e;border-radius:4px;display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:13px;">LOGO</span></div>`
      }
    <div style="text-align:right;">
      <p style="font-size:16px;font-weight:600;color:#111;">${escapeHtml(vendor.vendor_name)}</p>
      <p style="font-size:12px;color:#555;margin-top:3px;">Contact: ${escapeHtml(vendor.primary_contact_number)}</p>
      <p style="font-size:12px;color:#555;">Email: ${escapeHtml(vendor.primary_contact_email)}</p>
      <p style="font-size:12px;color:#555;">Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
    </div>
  </div>
 
  <!-- Lead + QR -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;">
    <div>
      ${lead ? `
        <p style="font-size:13px;margin-bottom:3px;"><strong>Client Name:</strong> ${escapeHtml(`${lead.firstname} ${lead.lastname}`)}</p>
        <p style="font-size:13px;margin-bottom:3px;"><strong>Contact:</strong> ${escapeHtml(lead.contact_no)}</p>
        ${lead.email ? `<p style="font-size:13px;margin-bottom:3px;"><strong>Email:</strong> ${escapeHtml(lead.email)}</p>` : ""}
        ${lead.site_address ? `<p style="font-size:13px;"><strong>Address:</strong> ${escapeHtml(lead.site_address)}</p>` : ""}
      ` : `<p style="font-size:13px;color:#888;">No client information available</p>`}
    </div>
    <div style="width:70px;height:70px;border:1px solid #ccc;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
      <img src="${qrUrl}" style="width:60px;height:60px;" alt="QR"/>
    </div>
  </div>
 
  <!-- Divider -->
  <div style="height:1px;background:#222;margin:12px 0;"></div>
 
  <!-- Project summary -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <div>
      <p style="font-size:15px;font-weight:600;color:#111;">${escapeHtml(project.project_name)}</p>
      <p style="font-size:12px;color:#666;margin-top:2px;text-transform:capitalize;">Status: ${project.project_status}</p>
    </div>
    <div style="text-align:right;">
      <p style="font-size:13px;"><strong>Total Boxes:</strong> ${totalBoxes}</p>
      <p style="font-size:13px;"><strong>Packed:</strong> ${packedBoxes} / ${totalBoxes}</p>
    </div>
  </div>
 
  <!-- Boxes table -->
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#2d2d2d;color:white;">
        <th style="padding:8px 10px;text-align:left;font-size:13px;font-weight:500;width:8%;">Sr.</th>
        <th style="padding:8px 10px;text-align:left;font-size:13px;font-weight:500;width:52%;">Box Name</th>
        <th style="padding:8px 10px;text-align:left;font-size:13px;font-weight:500;width:20%;">Items</th>
        <th style="padding:8px 10px;text-align:left;font-size:13px;font-weight:500;width:20%;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${boxRows || `<tr><td colspan="4" style="padding:16px 10px;text-align:center;color:#9CA3AF;font-size:13px;">No boxes found</td></tr>`}
    </tbody>
    <tfoot>
      <tr style="border-top:2px solid #ddd;background:#f3f4f6;">
        <td colspan="2" style="padding:8px 10px;font-weight:600;font-size:13px;">Total Boxes</td>
        <td colspan="2" style="padding:8px 10px;font-weight:600;font-size:13px;">${totalBoxes}</td>
      </tr>
    </tfoot>
  </table>
 
  <!-- Footer -->
  <div style="margin-top:20px;padding-top:10px;border-top:0.5px solid #e5e7eb;display:flex;justify-content:space-between;">
    <p style="font-size:11px;color:#9CA3AF;">Generated by ${escapeHtml(vendor.vendor_name)}</p>
    <p style="font-size:11px;color:#9CA3AF;">Project ID: ${project_id}</p>
  </div>
 
</body>
</html>`;

    // ── 6. Write PDF to temp file ────────────────────────────────────────────
    const fileName = `project_${sanitizeFileName(project.project_name)}_${Date.now()}.pdf`;
    tempFilePath = path.join(tempDir, fileName);


    const pdfBuffer = await generatePdf(html, tempFilePath);
    // const pdfBuffer = await htmlPdfNode.generatePdf(
    //   { content: html },
    //   {
    //     format: "A4",
    //     margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    //     printBackground: true,
    //   }
    // ) as unknown as Buffer;

    // const pdfBuffer = await htmlPdfNode.generatePdf(
    //   { content: html },
    //   {
    //     format: "A4",
    //     margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    //     printBackground: true,
    //   }
    // ) as Buffer;

    fs.writeFileSync(tempFilePath, pdfBuffer);

    // ── 7. Upload to Wasabi + get signed URL + delete temp file ──────────────
    const { signedUrl, wasabiKey } = await uploadPdfAndGetSignedUrl(
      tempFilePath,
      vendor_id,
      project_id,
      fileName
    );
    tempFilePath = null; // already deleted inside uploadPdfAndGetSignedUrl

    return validationResponse(1, "Project PDF generated successfully", {
      download_url: signedUrl,
      file_name: fileName,
      wasabi_key: wasabiKey,
    });

  } catch (error) {
    console.error("Error generating project PDF:", error);

    // Safety net — delete temp file if still exists after error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return validationResponse(0, "Failed to generate project PDF");
  }
};

//For App
export const generateAllBoxesPdfService = async (
  project_id: number,
  vendor_id: number
) => {
  const tempDir = path.join(
    process.cwd(),
    "tmp"
  );

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, {
      recursive: true,
    });
  }

  let tempFilePath: string | null =
    null;

  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Fetch project, vendor and packaging machine
    |--------------------------------------------------------------------------
    */

    const [
      project,
      vendor,
      packagingMachine,
    ] = await Promise.all([
      prisma.projectMaster.findFirst({
        where: {
          id:
            project_id,

          vendor_id,
        },

        select: {
          id:
            true,

          project_name:
            true,

          project_status:
            true,

          lead_id:
            true,

          order_no:
            true,

          client_name:
            true,

          client_address:
            true,

          client_contact_no:
            true,
        },
      }),

      prisma.vendorMaster.findUnique({
        where: {
          id:
            vendor_id,
        },

        select: {
          vendor_name:
            true,

          primary_contact_number:
            true,

          primary_contact_email:
            true,

          logo:
            true,
        },
      }),

      prisma.machineMaster.findFirst({
        where: {
          vendor_id,

          machine_type_id:
            18,
        },

        select: {
          id:
            true,
        },

        orderBy: {
          id:
            "asc",
        },
      }),
    ]);

    if (!project) {
      return validationResponse(
        0,
        "Project not found"
      );
    }

    if (!vendor) {
      return validationResponse(
        0,
        "Vendor not found"
      );
    }

    if (!packagingMachine) {
      return validationResponse(
        0,
        "Packaging machine not configured"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Vendor logo
    |--------------------------------------------------------------------------
    */

    let logoUrl =
      "";

    if (
      vendor.logo
    ) {
      try {
        logoUrl =
          await generateSignedUrl(
            vendor.logo
          );
      } catch (
        error
      ) {
        console.error(
          "Error generating logo signed URL:",
          error
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 3. Lead fallback
    |--------------------------------------------------------------------------
    */

    const lead =
      project.lead_id
        ? await prisma.leadMaster.findUnique({
            where: {
              id:
                project.lead_id,
            },

            select: {
              firstname:
                true,

              lastname:
                true,

              contact_no:
                true,

              email:
                true,

              site_address:
                true,
            },
          })
        : null;

    /*
    |--------------------------------------------------------------------------
    | 4. Client details
    |--------------------------------------------------------------------------
    */

    const clientName =
      project.client_name ||
      (
        lead
          ? `${lead.firstname || ""} ${
              lead.lastname || ""
            }`.trim()
          : ""
      ) ||
      "N/A";

    const clientContact =
      project.client_contact_no ||
      lead?.contact_no ||
      "N/A";

    const deliveryAddress =
      project.client_address ||
      lead?.site_address ||
      "N/A";

    const orderNumber =
      project.order_no ||
      "N/A";

    /*
    |--------------------------------------------------------------------------
    | 5. Fetch all boxes
    |--------------------------------------------------------------------------
    */

    const boxes =
      await prisma.boxMaster.findMany({
        where: {
          project_id,

          vendor_id,

          is_deleted:
            false,
        },

        select: {
          id:
            true,

          box_name:
            true,

          box_status:
            true,

          created_date:
            true,

          packed_at:
            true,

          packed_by:
            true,

          packedByUser: {
            select: {
              id:
                true,

              user_name:
                true,
            },
          },

          details: {
            select: {
              room_name:
                true,
            },
          },
        },

        orderBy: {
          created_date:
            "asc",
        },
      });

    if (
      boxes.length ===
      0
    ) {
      return validationResponse(
        0,
        "No boxes found for this project"
      );
    }

    const totalBoxes =
      boxes.length;

    /*
    |--------------------------------------------------------------------------
    | 6. Fetch and group products
    |--------------------------------------------------------------------------
    */

    const boxesWithItems =
      await Promise.all(
        boxes.map(
          async (
            box,
            boxIndex
          ) => {
            const mappingRows =
              await prisma.cutListMachineMapping.findMany({
                where: {
                  box_id:
                    box.id,

                  project_id,

                  vendor_id,

                  machine_id:
                    packagingMachine.id,

                  expected_in:
                    true,
                },

                select: {
                  id:
                    true,

                  cut_list: {
                    select: {
                      id:
                        true,

                      item_name:
                        true,

                      category_name:
                        true,

                      group_name:
                        true,

                      unique_code:
                        true,

                      weight:
                        true,
                    },
                  },
                },

                orderBy: {
                  created_at:
                    "asc",
                },
              });

            const itemMap =
              new Map<
                number,
                {
                  id:
                    number;

                  item_name:
                    string;

                  category_name:
                    string | null;

                  group_name:
                    string | null;

                  unique_code:
                    string | null;

                  unit_weight:
                    number;

                  quantity:
                    number;

                  total_weight:
                    number;
                }
              >();

            for (
              const mapping
              of mappingRows
            ) {
              const cutList =
                mapping.cut_list;

              if (
                !cutList
              ) {
                continue;
              }

              const weight =
                Number(
                  cutList.weight ||
                  0
                );

              const existing =
                itemMap.get(
                  cutList.id
                );

              if (
                existing
              ) {
                existing.quantity +=
                  1;

                existing.total_weight +=
                  weight;
              } else {
                itemMap.set(
                  cutList.id,
                  {
                    id:
                      cutList.id,

                    item_name:
                      cutList.item_name,

                    category_name:
                      cutList.category_name,

                    group_name:
                      cutList.group_name,

                    unique_code:
                      cutList.unique_code,

                    unit_weight:
                      weight,

                    quantity:
                      1,

                    total_weight:
                      weight,
                  }
                );
              }
            }

            const items =
              Array.from(
                itemMap.values()
              ).map(
                (
                  item
                ) => ({
                  ...item,

                  unit_weight:
                    Number(
                      item.unit_weight.toFixed(
                        2
                      )
                    ),

                  total_weight:
                    Number(
                      item.total_weight.toFixed(
                        2
                      )
                    ),
                })
              );

            const totalQuantity =
              items.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.quantity,
                0
              );

            const totalWeight =
              items.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.total_weight,
                0
              );

            return {
              ...box,

              items,

              packet_no:
                box.box_name,

              packed_by_name:
                box
                  .packedByUser
                  ?.user_name ||
                "N/A",

              package_date:
                box.packed_at ||
                box.created_date,

              product_box_count:
                `${
                  boxIndex +
                  1
                } of ${totalBoxes}`,

              total_quantity:
                totalQuantity,

              total_weight:
                Number(
                  totalWeight.toFixed(
                    2
                  )
                ),
            };
          }
        )
      );

    /*
    |--------------------------------------------------------------------------
    | 7. Logo HTML
    |--------------------------------------------------------------------------
    */

    const logoHtml =
      logoUrl
        ? `
          <img
            src="${logoUrl}"

            class="company-logo"

            alt="Logo"
          />
        `
        : `
          <div
            class="company-logo-text"
          >
            ${escapeHtml(
              vendor.vendor_name
            )}
          </div>
        `;

    /*
    |--------------------------------------------------------------------------
    | 8. Common project header
    |--------------------------------------------------------------------------
    */

    const projectHeader = `
      <div
        class="main-header"
      >

        <div>

          ${logoHtml}

        </div>


        <div
          class="company-information"
        >

          <div
            class="company-name"
          >
            ${escapeHtml(
              vendor.vendor_name
            )}
          </div>


          <div>
            ${escapeHtml(
              vendor.primary_contact_number ||
              ""
            )}
          </div>


          <div>
            ${escapeHtml(
              vendor.primary_contact_email ||
              ""
            )}
          </div>

        </div>

      </div>


      <div
        class="project-heading"
      >

        <div
          class="project-heading-left"
        >

          <div
            class="project-name"
          >
            ${escapeHtml(
              project.project_name
            )}
          </div>


          <div
            class="project-subtitle"
          >
            Order Number:

            ${escapeHtml(
              orderNumber
            )}
          </div>

        </div>


        <div
          class="project-client"
        >

          <strong>
            ${escapeHtml(
              clientName
            )}
          </strong>


          <div>
            ${escapeHtml(
              clientContact
            )}
          </div>

        </div>

      </div>
    `;

    /*
    |--------------------------------------------------------------------------
    | 9. Generate every box page
    |--------------------------------------------------------------------------
    */

    const boxPagesArray =
      await Promise.all(
        boxesWithItems.map(
          async (
            box
          ) => {
            const packageDate =
              formatReportDate(
                box.package_date
              );

            /*
            |--------------------------------------------------------------------------
            | Embedded QR
            |--------------------------------------------------------------------------
            */

            const qrValue =
              `vendor:${vendor_id},project:${project_id},box:${box.id}`;

            const qrImage =
              await QRCode.toDataURL(
                qrValue,
                {
                  width:
                    250,

                  margin:
                    1,

                  errorCorrectionLevel:
                    "M",

                  color: {
                    dark:
                      "#000000",

                    light:
                      "#FFFFFF",
                  },
                }
              );

            /*
            |--------------------------------------------------------------------------
            | Product rows
            |--------------------------------------------------------------------------
            */

            const visibleItems =
              box.items.slice(
                0,
                10
              );

            const hiddenItemsCount =
              box.items.length -
              visibleItems.length;

            const itemRows =
              visibleItems
                .map(
                  (
                    item,
                    index
                  ) => `
                    <tr>

                      <td>
                        ${
                          index +
                          1
                        }
                      </td>


                      <td>
                        ${escapeHtml(
                          item.item_name
                        )}
                      </td>


                      <td>
                        ${escapeHtml(
                          item.category_name ||
                          "—"
                        )}
                      </td>


                      <td>
                        ${escapeHtml(
                          item.group_name ||
                          "—"
                        )}
                      </td>


                      <td>
                        ${
                          item.quantity
                        }
                      </td>


                      <td>
                        ${item.total_weight.toFixed(
                          2
                        )}
                        kg
                      </td>

                    </tr>
                  `
                )
                .join("");

            const hiddenItemsRow =
              hiddenItemsCount >
              0
                ? `
                  <tr>

                    <td
                      colspan="6"

                      class="more-items"
                    >
                      +

                      ${hiddenItemsCount}

                      more item${
                        hiddenItemsCount >
                        1
                          ? "s"
                          : ""
                      }
                    </td>

                  </tr>
                `
                : "";

            /*
            |--------------------------------------------------------------------------
            | Box page
            |--------------------------------------------------------------------------
            */

            return `
              <section
                class="page"
              >

                ${projectHeader}


                <!--
                ==============================================================
                BOX
                ==============================================================
                -->

                <div
                  class="box-header"
                >

                  <div
                    class="box-main-row"
                  >

                    <!-- LEFT 75% -->

                    <div
                      class="box-left-section"
                    >

                      <div
                        class="box-title-area"
                      >

                        <div
                          class="box-title"
                        >
                          ${escapeHtml(
                            box.packet_no
                          )}
                        </div>


                        ${
                          box.details
                            ?.room_name
                            ? `
                              <div
                                class="room-name"
                              >
                                ${escapeHtml(
                                  box.details
                                    .room_name
                                )}
                              </div>
                            `
                            : ""
                        }

                      </div>


                      <div
                        class="box-details-grid"
                      >

                        <div
                          class="box-detail"
                        >

                          <span>
                            ORDER NUMBER
                          </span>


                          <strong>
                            ${escapeHtml(
                              orderNumber
                            )}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            PACKED BY
                          </span>


                          <strong>
                            ${escapeHtml(
                              box.packed_by_name
                            )}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            PACKET NO.
                          </span>


                          <strong>
                            ${escapeHtml(
                              box.packet_no
                            )}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            PACKAGE DATE
                          </span>


                          <strong>
                            ${packageDate}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            PRODUCT BOX COUNT
                          </span>


                          <strong>
                            ${escapeHtml(
                              box.product_box_count
                            )}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            TOTAL WEIGHT
                          </span>


                          <strong
                            class="total-weight-value"
                          >
                            ${box.total_weight.toFixed(
                              2
                            )}

                            kg
                          </strong>

                        </div>

                      </div>

                    </div>


                    <!-- RIGHT 25% -->

                    <div
                      class="box-qr-section"
                    >

                      <img
                        src="${qrImage}"

                        class="box-qr-code"

                        alt="Box QR Code"
                      />


                      <div
                        class="box-qr-label"
                      >
                        SCAN BOX
                      </div>

                    </div>

                  </div>


                  <!-- DELIVERY ADDRESS -->

                  <div
                    class="box-address"
                  >

                    <span>
                      DELIVERY ADDRESS
                    </span>


                    <strong>
                      ${escapeHtml(
                        deliveryAddress
                      )}
                    </strong>

                  </div>

                </div>


                <!--
                ==============================================================
                PRODUCTS
                ==============================================================
                -->

                <div
                  class="products-title-row"
                >

                  <h3
                    class="section-title"
                  >
                    PRODUCTS
                  </h3>


                  <div
                    class="products-count"
                  >
                    ${
                      box.items.length
                    }

                    products

                    ·

                    ${
                      box.total_quantity
                    }

                    qty
                  </div>

                </div>


                <table
                  class="report-table"
                >

                  <thead>

                    <tr>

                      <th
                        class="sr-column"
                      >
                        #
                      </th>


                      <th
                        class="item-column"
                      >
                        Product
                      </th>


                      <th
                        class="category-column"
                      >
                        Category
                      </th>


                      <th
                        class="group-column"
                      >
                        Group
                      </th>


                      <th
                        class="qty-column"
                      >
                        Qty
                      </th>


                      <th
                        class="weight-column"
                      >
                        Weight
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    ${
                      itemRows ||
                      `
                        <tr>

                          <td
                            colspan="6"

                            class="no-products"
                          >
                            No products found
                          </td>

                        </tr>
                      `
                    }

                    ${hiddenItemsRow}

                  </tbody>


                  <tfoot>

                    <tr>

                      <td
                        colspan="4"
                      >
                        TOTAL
                      </td>


                      <td>
                        ${
                          box.total_quantity
                        }
                      </td>


                      <td>
                        ${box.total_weight.toFixed(
                          2
                        )}

                        kg
                      </td>

                    </tr>

                  </tfoot>

                </table>

              </section>
            `;
          }
        )
      );

    const boxPages =
      boxPagesArray.join(
        ""
      );

    /*
    |--------------------------------------------------------------------------
    | 10. Final HTML
    |--------------------------------------------------------------------------
    */

    const html = `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8"/>

<style>

@page {

  size:
    3in 6in;

  margin:
    0;

}


* {

  box-sizing:
    border-box;

  margin:
    0;

  padding:
    0;

}


html,
body {

  width:
    3in;

  margin:
    0;

  padding:
    0;

}


body {

  color:
    #172033;

  background:
    #FFFFFF;

  font-family:
    Arial,
    sans-serif;

  font-size:
    11px;

}


.page {

  width:
    3in;

  height:
    6in;

  padding:
    14px;

  overflow:
    hidden;

  page-break-after:
    always;

}


.page:last-child {

  page-break-after:
    auto;

}


/*
|--------------------------------------------------------------------------
| Company header
|--------------------------------------------------------------------------
*/


.main-header {

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    flex-start;

  min-height:
    38px;

  padding-bottom:
    6px;

  border-bottom:
    1px solid
    #172033;

}


.company-logo {

  display:
    block;

  max-width:
    92px;

  max-height:
    30px;

  object-fit:
    contain;

}


.company-logo-text {

  font-size:
    14px;

  font-weight:
    800;

}


.company-information {

  color:
    #667085;

  font-size:
    6.5px;

  line-height:
    1.35;

  text-align:
    right;

}


.company-name {

  color:
    #172033;

  font-size:
    8.5px;

  font-weight:
    800;

}


/*
|--------------------------------------------------------------------------
| Project
|--------------------------------------------------------------------------
*/


.project-heading {

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    center;

  min-height:
    37px;

  padding:
    6px 0;

  border-bottom:
    1px solid
    #D9DEE7;

}


.project-heading-left {

  width:
    64%;

}


.project-name {

  max-width:
    220px;

  overflow:
    hidden;

  color:
    #172033;

  font-size:
    10.5px;

  line-height:
    1.15;

  font-weight:
    900;

  white-space:
    nowrap;

  text-overflow:
    ellipsis;

}


.project-subtitle {

  margin-top:
    2px;

  color:
    #667085;

  font-size:
    6.5px;

}


.project-client {

  width:
    34%;

  color:
    #667085;

  font-size:
    6.5px;

  line-height:
    1.3;

  text-align:
    right;

}


.project-client strong {

  display:
    block;

  overflow:
    hidden;

  color:
    #172033;

  white-space:
    nowrap;

  text-overflow:
    ellipsis;

}


/*
|--------------------------------------------------------------------------
| Box
|--------------------------------------------------------------------------
*/


.box-header {

  padding:
    7px 0;

  border-bottom:
    2px solid
    #172033;

}


/*
|--------------------------------------------------------------------------
| Left 75% + QR 25%
|--------------------------------------------------------------------------
*/


.box-main-row {

  display:
    grid;

  grid-template-columns:
    minmax(
      0,
      75%
    )
    minmax(
      0,
      25%
    );

  width:
    100%;

}


/*
|--------------------------------------------------------------------------
| Left
|--------------------------------------------------------------------------
*/


.box-left-section {

  min-width:
    0;

  padding-right:
    10px;

}


.box-title-area {

  padding-bottom:
    6px;

  margin-bottom:
    7px;

  border-bottom:
    1px solid
    #E1E5EB;

}


.box-title {

  overflow:
    hidden;

  color:
    #172033;

  font-size:
    13px;

  line-height:
    1.15;

  font-weight:
    900;

  white-space:
    nowrap;

  text-overflow:
    ellipsis;

}


.room-name {

  margin-top:
    2px;

  overflow:
    hidden;

  color:
    #667085;

  font-size:
    6.5px;

  line-height:
    1.2;

  white-space:
    nowrap;

  text-overflow:
    ellipsis;

}


/*
|--------------------------------------------------------------------------
| Details
|--------------------------------------------------------------------------
*/


.box-details-grid {

  display:
    grid;

  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );

  column-gap:
    10px;

  row-gap:
    9px;

}


.box-detail {

  min-width:
    0;

}


.box-detail span {

  display:
    block;

  color:
    #667085;

  font-size:
    5.7px;

  line-height:
    1.1;

  font-weight:
    800;

  letter-spacing:
    0.1px;

}


.box-detail strong {

  display:
    block;

  margin-top:
    2px;

  overflow-wrap:
    anywhere;

  color:
    #172033;

  font-size:
    7.7px;

  line-height:
    1.15;

  font-weight:
    800;

}


.total-weight-value {

  font-size:
    8.7px !important;

}


/*
|--------------------------------------------------------------------------
| QR
|--------------------------------------------------------------------------
*/


.box-qr-section {

  display:
    flex;

  flex-direction:
    column;

  justify-content:
    center;

  align-items:
    center;

  min-width:
    0;

  padding-left:
    8px;

  border-left:
    1px solid
    #D9DEE7;

}


.box-qr-code {

  display:
    block;

  width:
    78px;

  height:
    78px;

  object-fit:
    contain;

}


.box-qr-label {

  margin-top:
    4px;

  color:
    #667085;

  font-size:
    5.5px;

  line-height:
    1;

  font-weight:
    900;

  letter-spacing:
    0.35px;

}


/*
|--------------------------------------------------------------------------
| Address
|--------------------------------------------------------------------------
*/


.box-address {

  margin-top:
    8px;

  padding-top:
    6px;

  border-top:
    1px solid
    #D9DEE7;

}


.box-address span {

  display:
    block;

  color:
    #667085;

  font-size:
    5.8px;

  font-weight:
    800;

}


.box-address strong {

  display:
    block;

  max-height:
    27px;

  margin-top:
    3px;

  overflow:
    hidden;

  color:
    #172033;

  font-size:
    7.2px;

  line-height:
    1.28;

  font-weight:
    700;

}


/*
|--------------------------------------------------------------------------
| Product title
|--------------------------------------------------------------------------
*/


.products-title-row {

  display:
    flex;

  justify-content:
    space-between;

  align-items:
    center;

  margin:
    6px 0 4px;

}


.section-title {

  font-size:
    8.5px;

  font-weight:
    900;

}


.products-count {

  color:
    #667085;

  font-size:
    5.8px;

  font-weight:
    700;

}


/*
|--------------------------------------------------------------------------
| Product table
|--------------------------------------------------------------------------
*/


.report-table {

  width:
    100%;

  border-collapse:
    collapse;

  table-layout:
    fixed;

}


.report-table thead {

  color:
    #FFFFFF;

  background:
    #172033;

}


.report-table th {

  padding:
    4px 3px;

  font-size:
    5.5px;

  font-weight:
    700;

  text-align:
    left;

}


.report-table td {

  padding:
    4px 3px;

  border-bottom:
    1px solid
    #E4E7EC;

  font-size:
    6px;

  line-height:
    1.15;

  overflow-wrap:
    anywhere;

  vertical-align:
    top;

}


.report-table tbody tr:nth-child(even) {

  background:
    #F8FAFC;

}


.report-table tfoot {

  background:
    #F1F5F9;

  font-weight:
    800;

}


.sr-column {

  width:
    7%;

}


.item-column {

  width:
    29%;

}


.category-column {

  width:
    18%;

}


.group-column {

  width:
    25%;

}


.qty-column {

  width:
    8%;

  text-align:
    center !important;

}


.weight-column {

  width:
    13%;

  text-align:
    right !important;

}


.no-products {

  padding:
    14px !important;

  color:
    #667085;

  text-align:
    center;

}


.more-items {

  color:
    #667085;

  text-align:
    center;

  font-weight:
    700;

}

</style>

</head>


<body>

${boxPages}

</body>

</html>
`;

    /*
    |--------------------------------------------------------------------------
    | 11. Generate PDF
    |--------------------------------------------------------------------------
    */

    const fileName =
      `all_boxes_${sanitizeFileName(
        project.project_name
      )}_${Date.now()}.pdf`;

    tempFilePath =
      path.join(
        tempDir,
        fileName
      );

    await generateCustomSizePdf(
      html,

      tempFilePath,

      {
        width:
          "3in",

        height:
          "6in",

        printBackground:
          true,

        margin: {
          top:
            "0",

          bottom:
            "0",

          left:
            "0",

          right:
            "0",
        },
      }
    );

    /*
    |--------------------------------------------------------------------------
    | 12. Upload
    |--------------------------------------------------------------------------
    */

    const {
      signedUrl,
      wasabiKey,
    } =
      await uploadPdfAndGetSignedUrl(
        tempFilePath,

        vendor_id,

        project_id,

        fileName
      );

    tempFilePath =
      null;

    return validationResponse(
      1,

      "All boxes PDF generated successfully",

      {
        download_url:
          signedUrl,

        file_name:
          fileName,

        wasabi_key:
          wasabiKey,

        total_boxes:
          totalBoxes,
      }
    );
  } catch (
    error
  ) {
    console.error(
      "generateAllBoxesPdfService:",
      error
    );

    if (
      tempFilePath &&
      fs.existsSync(
        tempFilePath
      )
    ) {
      fs.unlinkSync(
        tempFilePath
      );
    }

    return validationResponse(
      0,
      "Failed to generate all boxes PDF"
    );
  }
};

export const generateProjectFullReportServiceWeb = async (
  project_id: string,
  vendor_id: number
) => {
  const project = await prisma.projectMaster.findFirst({
    where: {
      unique_project_id: project_id,
      vendor_id: vendor_id,
    },
    select: {
      id: true,
    },
  });
  

  if (!project) {
    return validationResponse(0, "Project not found");
  }

  return await generateProjectFullReportService(    
    project.id,
    vendor_id
  );
};

export const generateProjectFullReportService_old = async (
  project_id: number,
  vendor_id: number
) => {
  const tempDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  let tempFilePath: string | null = null;

  try {

    // ── 1. Fetch project, vendor, packaging machine ──────────────────────────
    const [project, vendor, packagingMachine] = await Promise.all([
      prisma.projectMaster.findFirst({
        where: { id: project_id, vendor_id },
        select: {
          id: true,
          project_name: true,
          lead_id: true,
          project_status: true,
          details: {
            select: {
              estimated_completion_date: true,
              room_name: true,
            },
          },
        },
      }),
      prisma.vendorMaster.findUnique({
        where: { id: vendor_id },
        select: {
          vendor_name: true,
          primary_contact_number: true,
          primary_contact_email: true,
          logo: true,
        },
      }),
      prisma.machineMaster.findFirst({
        where: { vendor_id, machine_type_id: 18 },
        select: { id: true },
        orderBy: { id: "asc" },
      }),
    ]);

    if (!project) return validationResponse(0, "Project not found");
    if (!vendor) return validationResponse(0, "Vendor not found");

    // ── 2. Fetch lead ────────────────────────────────────────────────────────
    let lead: {
      firstname: string;
      lastname: string;
      contact_no: string;
      email: string | null;
      site_address: string | null;
    } | null = null;

    if (project.lead_id) {
      lead = await prisma.leadMaster.findUnique({
        where: { id: project.lead_id },
        select: {
          firstname: true,
          lastname: true,
          contact_no: true,
          email: true,
          site_address: true,
        },
      });
    }

    // ── 3. Fetch all boxes + items ───────────────────────────────────────────
    const boxes = await prisma.boxMaster.findMany({
      where: { project_id, vendor_id, is_deleted: false },
      select: {
        id: true,
        box_name: true,
        box_status: true,
        details: { select: { room_name: true } },
      },
      orderBy: { created_date: "asc" },
    });

    if (boxes.length === 0) return validationResponse(0, "No boxes found for this project");

    const boxesWithItems = await Promise.all(
      boxes.map(async (box) => {
        const mappingRows = packagingMachine
          ? await prisma.cutListMachineMapping.findMany({
            where: {
              box_id: box.id,
              project_id,
              vendor_id,
              machine_id: packagingMachine.id,
              expected_in: true,
            },
            select: {
              cut_list: {
                select: {
                  item_name: true,
                  category_name: true,
                  group_name: true,
                  qty: true,
                  unique_code: true,
                },
              },
            },
            orderBy: { created_at: "asc" },
          })
          : [];

        const items = mappingRows
          .map((r) => r.cut_list)
          .filter(Boolean) as {
            item_name: string;
            category_name: string | null;
            group_name: string | null;
            qty: number;
            unique_code: string | null;
          }[];

        return { ...box, items };
      })
    );

    // ── 4. Computed totals ───────────────────────────────────────────────────
    const totalBoxes = boxes.length;
    const packedBoxes = boxes.filter((b) => b.box_status === "packed").length;
    const totalItems = boxesWithItems.reduce((s, b) => s + b.items.length, 0);
    const totalQtyAll = boxesWithItems.reduce((s, b) => s + b.items.reduce((ss, i) => ss + i.qty, 0), 0);
    const estimatedDate = project.details[0]?.estimated_completion_date
      ? new Date(project.details[0].estimated_completion_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      : "N/A";

    // ── 5. Shared header / footer ────────────────────────────────────────────
    const logoUrl = vendor.logo
      ? `${process.env.STORAGE_BASE_URL ?? ""}/${vendor.logo}`
      : null;

    const logoHtml = logoUrl
      ? `<img src="${logoUrl}" style="height:44px;object-fit:contain;" alt="Logo"/>`
      : `<div style="width:80px;height:36px;background:#1a1a2e;border-radius:4px;display:flex;align-items:center;justify-content:center;"><span style="color:white;font-size:13px;">LOGO</span></div>`;

    const leadHtml = lead
      ? `
        <p style="font-size:13px;margin-bottom:3px;"><strong>Client:</strong> ${escapeHtml(`${lead.firstname} ${lead.lastname}`)}</p>
        <p style="font-size:13px;margin-bottom:3px;"><strong>Contact:</strong> ${escapeHtml(lead.contact_no)}</p>
        ${lead.email ? `<p style="font-size:13px;margin-bottom:3px;"><strong>Email:</strong> ${escapeHtml(lead.email)}</p>` : ""}
        ${lead.site_address ? `<p style="font-size:13px;"><strong>Address:</strong> ${escapeHtml(lead.site_address)}</p>` : ""}
      `
      : `<p style="font-size:13px;color:#888;">No client information available</p>`;

    const pageHeader = (pageLabel: string) => `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
        ${logoHtml}
        <div style="text-align:right;">
          <p style="font-size:15px;font-weight:600;color:#111;">${escapeHtml(vendor.vendor_name)}</p>
          <p style="font-size:11px;color:#555;margin-top:2px;">Contact: ${escapeHtml(vendor.primary_contact_number)}</p>
          <p style="font-size:11px;color:#555;">Email: ${escapeHtml(vendor.primary_contact_email)}</p>
          <p style="font-size:11px;color:#555;">Date: ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:10px;">
        <div>${leadHtml}</div>
        <div style="text-align:right;">
          <p style="font-size:13px;font-weight:600;color:#111;">${escapeHtml(project.project_name)}</p>
          <p style="font-size:11px;color:#666;margin-top:2px;">${pageLabel}</p>
        </div>
      </div>
      <div style="height:1px;background:#222;margin:10px 0 14px;"></div>
    `;

    const pageFooter = `
      <div style="margin-top:20px;padding-top:8px;border-top:0.5px solid #e5e7eb;display:flex;justify-content:space-between;">
        <p style="font-size:10px;color:#9CA3AF;">Generated by ${escapeHtml(vendor.vendor_name)}</p>
        <p style="font-size:10px;color:#9CA3AF;">Project ID: ${project_id}</p>
      </div>
    `;

    // ── 6. PAGE 1: Project summary + boxes overview ──────────────────────────
    const boxOverviewRows = boxesWithItems
      .map((box, i) => {
        const boxQty = box.items.reduce((s, item) => s + item.qty, 0);
        const isPacked = box.box_status === "packed";
        return `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding:7px 10px;color:#555;font-size:12px;">${i + 1}</td>
          <td style="padding:7px 10px;font-size:12px;font-weight:600;">${escapeHtml(box.box_name)}</td>
          <td style="padding:7px 10px;font-size:12px;">${escapeHtml(box.details?.room_name ?? "—")}</td>
          <td style="padding:7px 10px;font-size:12px;">${box.items.length}</td>
          <td style="padding:7px 10px;font-size:12px;">${boxQty}</td>
          <td style="padding:7px 10px;font-size:12px;">
            <span style="
              background:${isPacked ? "#DCFCE7" : "#FFEDD5"};
              color:${isPacked ? "#15803D" : "#92400E"};
              padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700;
            ">${box.box_status}</span>
          </td>
        </tr>`;
      })
      .join("");

    const summaryPage = `
      <div>
        ${pageHeader("Project Summary")}
 
        <!-- Project stats chips -->
        <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
          <div style="background:#F3F4F6;border:1px solid #E5E7EB;border-radius:10px;padding:10px 16px;">
            <p style="font-size:10px;color:#9CA3AF;font-weight:600;">STATUS</p>
            <p style="font-size:14px;font-weight:700;color:#111;margin-top:2px;text-transform:capitalize;">${project.project_status}</p>
          </div>
          <div style="background:#F3F4F6;border:1px solid #E5E7EB;border-radius:10px;padding:10px 16px;">
            <p style="font-size:10px;color:#9CA3AF;font-weight:600;">EST. DATE</p>
            <p style="font-size:14px;font-weight:700;color:#111;margin-top:2px;">${estimatedDate}</p>
          </div>
          <div style="background:#E6F7F5;border:1px solid #2A9D8F;border-radius:10px;padding:10px 16px;">
            <p style="font-size:10px;color:#1A7A70;font-weight:600;">PACKED BOXES</p>
            <p style="font-size:14px;font-weight:700;color:#1A7A70;margin-top:2px;">${packedBoxes} / ${totalBoxes}</p>
          </div>
          <div style="background:#F3F4F6;border:1px solid #E5E7EB;border-radius:10px;padding:10px 16px;">
            <p style="font-size:10px;color:#9CA3AF;font-weight:600;">TOTAL ITEMS</p>
            <p style="font-size:14px;font-weight:700;color:#111;margin-top:2px;">${totalItems}</p>
          </div>
          <div style="background:#F3F4F6;border:1px solid #E5E7EB;border-radius:10px;padding:10px 16px;">
            <p style="font-size:10px;color:#9CA3AF;font-weight:600;">TOTAL QTY</p>
            <p style="font-size:14px;font-weight:700;color:#111;margin-top:2px;">${totalQtyAll}</p>
          </div>
        </div>
 
        <!-- Boxes overview table -->
        <p style="font-size:13px;font-weight:700;color:#111;margin-bottom:10px;">Box Overview</p>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#2d2d2d;color:white;">
              <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:6%;">Sr.</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:26%;">Box Name</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:26%;">Room</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:14%;">Items</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:14%;">Qty</th>
              <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:14%;">Status</th>
            </tr>
          </thead>
          <tbody>${boxOverviewRows}</tbody>
          <tfoot>
            <tr style="border-top:2px solid #ddd;background:#f3f4f6;">
              <td colspan="3" style="padding:7px 10px;font-weight:600;font-size:12px;">Total</td>
              <td style="padding:7px 10px;font-weight:600;font-size:12px;">${totalItems}</td>
              <td style="padding:7px 10px;font-weight:600;font-size:12px;">${totalQtyAll}</td>
              <td style="padding:7px 10px;font-weight:600;font-size:12px;">${packedBoxes} packed</td>
            </tr>
          </tfoot>
        </table>
 
        ${pageFooter}
      </div>
    `;

    // ── 7. PAGE 2+: One page per box with full item details ──────────────────
    const boxDetailPages = boxesWithItems
      .map((box) => {
        const totalQty = box.items.reduce((s, i) => s + i.qty, 0);
        const isPacked = box.box_status === "packed";

        const qrValue = encodeURIComponent(
          `vendor:${vendor_id},project:${project_id},box:${box.id}`
        );
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${qrValue}&size=80x80`;

        const itemRows = box.items
          .map(
            (item, i) => `
            <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
              <td style="padding:6px 8px;color:#555;font-size:11px;">${i + 1}</td>
              <td style="padding:6px 8px;font-size:11px;">${escapeHtml(item.item_name)}</td>
              <td style="padding:6px 8px;font-size:11px;color:#555;">${escapeHtml(item.category_name ?? "—")}</td>
              <td style="padding:6px 8px;font-size:11px;color:#555;">${escapeHtml(item.group_name ?? "—")}</td>
              <td style="padding:6px 8px;font-size:11px;">${item.qty}</td>
            </tr>`
          )
          .join("");

        return `
          <div style="page-break-before: always;">
            ${pageHeader(`Box Details · ${escapeHtml(box.box_name)}`)}
 
            <!-- Box summary bar -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="
                  background:${isPacked ? "#E6F7F5" : "#FFF8EE"};
                  color:${isPacked ? "#1A7A70" : "#C15C0A"};
                  padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;
                ">${box.box_status}</span>
                <p style="font-size:14px;font-weight:700;color:#111;">${escapeHtml(box.box_name)}</p>
                ${box.details?.room_name ? `<p style="font-size:11px;color:#666;">· ${escapeHtml(box.details.room_name)}</p>` : ""}
              </div>
              <div style="display:flex;align-items:center;gap:12px;">
                <p style="font-size:11px;color:#555;"><strong>Items:</strong> ${box.items.length} &nbsp; <strong>Qty:</strong> ${totalQty}</p>
                <img src="${qrUrl}" style="width:48px;height:48px;" alt="QR"/>
              </div>
            </div>
 
            <!-- Items table -->
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#2d2d2d;color:white;">
                  <th style="padding:7px 8px;text-align:left;font-size:11px;font-weight:500;width:6%;">Sr.</th>
                  <th style="padding:7px 8px;text-align:left;font-size:11px;font-weight:500;width:32%;">Item Name</th>
                  <th style="padding:7px 8px;text-align:left;font-size:11px;font-weight:500;width:22%;">Category</th>
                  <th style="padding:7px 8px;text-align:left;font-size:11px;font-weight:500;width:30%;">Group</th>
                  <th style="padding:7px 8px;text-align:left;font-size:11px;font-weight:500;width:10%;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows || `<tr><td colspan="5" style="padding:12px 8px;text-align:center;color:#9CA3AF;font-size:11px;">No items in this box</td></tr>`}
              </tbody>
              <tfoot>
                <tr style="border-top:2px solid #ddd;background:#f3f4f6;">
                  <td colspan="4" style="padding:6px 8px;font-weight:600;font-size:11px;">Total</td>
                  <td style="padding:6px 8px;font-weight:600;font-size:11px;">${totalQty}</td>
                </tr>
              </tfoot>
            </table>
 
            ${pageFooter}
          </div>
        `;
      })
      .join("");

    // ── 8. Assemble full HTML ────────────────────────────────────────────────
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:Arial,sans-serif; margin:28px; color:#333; font-size:14px; }
    p { margin:0; }
    strong { font-weight:600; }
  </style>
</head>
<body>
  ${summaryPage}
  ${boxDetailPages}
</body>
</html>`;

    // ── 9. Generate PDF ──────────────────────────────────────────────────────
    const fileName = `report_${sanitizeFileName(project.project_name)}_${Date.now()}.pdf`;
    tempFilePath = path.join(tempDir, fileName);

    const pdfBuffer = await generatePdf(html, tempFilePath);

    // const pdfBuffer = await htmlPdfNode.generatePdf(
    //   { content: html },
    //   {
    //     format: "A4",
    //     margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    //     printBackground: true,
    //   }
    // ) as unknown as Buffer;

    // fs.writeFileSync(tempFilePath, pdfBuffer);

    // ── 10. Upload to Wasabi + signed URL + delete temp ──────────────────────
    const { signedUrl, wasabiKey } = await uploadPdfAndGetSignedUrl(
      tempFilePath,
      vendor_id,
      project_id,
      fileName
    );
    tempFilePath = null;

    return validationResponse(1, "Project full report generated successfully", {
      download_url: signedUrl,
      file_name: fileName,
      wasabi_key: wasabiKey,
      total_boxes: totalBoxes,
    });

  } catch (error) {
    console.error("Error generating project full report:", error);

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return validationResponse(0, "Failed to generate project report111");
  }
};

export const generateProjectFullReportService = async (
  project_id: number,
  vendor_id: number
) => {
  const tempDir = path.join(
    process.cwd(),
    "tmp"
  );

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, {
      recursive: true,
    });
  }

  let tempFilePath: string | null =
    null;

  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Project, vendor and packaging machine
    |--------------------------------------------------------------------------
    */

    const [
      project,
      vendor,
      packagingMachine,
    ] = await Promise.all([
      prisma.projectMaster.findFirst({
        where: {
          id: project_id,
          vendor_id,
        },

        select: {
          id: true,
          project_name: true,
          project_status: true,
          lead_id: true,
          order_no: true,
          client_name: true,
          client_address: true,
          client_contact_no: true,
        },
      }),

      prisma.vendorMaster.findUnique({
        where: {
          id: vendor_id,
        },

        select: {
          vendor_name: true,
          primary_contact_number: true,
          primary_contact_email: true,
          logo: true,
        },
      }),

      prisma.machineMaster.findFirst({
        where: {
          vendor_id,
          machine_type_id: 18,
        },

        select: {
          id: true,
        },

        orderBy: {
          id: "asc",
        },
      }),
    ]);

    if (!project) {
      return validationResponse(
        0,
        "Project not found"
      );
    }

    if (!vendor) {
      return validationResponse(
        0,
        "Vendor not found"
      );
    }

    if (!packagingMachine) {
      return validationResponse(
        0,
        "Packaging machine not configured"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Vendor logo
    |--------------------------------------------------------------------------
    */

    let logoUrl = "";

    if (vendor.logo) {
      try {
        logoUrl =
          await generateSignedUrl(
            vendor.logo
          );
      } catch (error) {
        console.error(
          "Error generating logo signed URL:",
          error
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 3. Lead
    |--------------------------------------------------------------------------
    */

    const lead =
      project.lead_id
        ? await prisma.leadMaster.findUnique({
            where: {
              id:
                project.lead_id,
            },

            select: {
              firstname:
                true,

              lastname:
                true,

              contact_no:
                true,

              email:
                true,

              site_address:
                true,
            },
          })
        : null;

    /*
    |--------------------------------------------------------------------------
    | 4. Client details
    |--------------------------------------------------------------------------
    */

    const clientName =
      project.client_name ||
      (
        lead
          ? `${lead.firstname || ""} ${
              lead.lastname || ""
            }`.trim()
          : ""
      ) ||
      "N/A";

    const clientContact =
      project.client_contact_no ||
      lead?.contact_no ||
      "N/A";

    const clientAddress =
      project.client_address ||
      lead?.site_address ||
      "N/A";

    const orderNumber =
      project.order_no ||
      "N/A";

    /*
    |--------------------------------------------------------------------------
    | 5. Boxes
    |--------------------------------------------------------------------------
    */

    const boxes =
      await prisma.boxMaster.findMany({
        where: {
          project_id,
          vendor_id,
          is_deleted:
            false,
        },

        select: {
          id:
            true,

          box_name:
            true,

          box_status:
            true,

          created_date:
            true,

          packed_at:
            true,

          packed_by:
            true,

          packedByUser: {
            select: {
              id:
                true,

              user_name:
                true,
            },
          },

          details: {
            select: {
              room_name:
                true,
            },
          },
        },

        orderBy: {
          created_date:
            "asc",
        },
      });

    if (!boxes.length) {
      return validationResponse(
        0,
        "No boxes found"
      );
    }

    const totalBoxes =
      boxes.length;

    /*
    |--------------------------------------------------------------------------
    | 6. Box products
    |--------------------------------------------------------------------------
    */

    const boxesWithItems =
      await Promise.all(
        boxes.map(
          async (
            box,
            boxIndex
          ) => {
            const mappings =
              await prisma.cutListMachineMapping.findMany({
                where: {
                  box_id:
                    box.id,

                  project_id,

                  vendor_id,

                  machine_id:
                    packagingMachine.id,

                  expected_in:
                    true,
                },

                select: {
                  id:
                    true,

                  cut_list: {
                    select: {
                      id:
                        true,

                      item_name:
                        true,

                      category_name:
                        true,

                      group_name:
                        true,

                      unique_code:
                        true,

                      weight:
                        true,
                    },
                  },
                },

                orderBy: {
                  created_at:
                    "asc",
                },
              });

            const itemMap =
              new Map<
                number,
                {
                  id:
                    number;

                  item_name:
                    string;

                  category_name:
                    string | null;

                  group_name:
                    string | null;

                  unique_code:
                    string | null;

                  unit_weight:
                    number;

                  quantity:
                    number;

                  total_weight:
                    number;
                }
              >();

            for (
              const mapping
              of mappings
            ) {
              const cutList =
                mapping.cut_list;

              if (!cutList) {
                continue;
              }

              const weight =
                Number(
                  cutList.weight ||
                  0
                );

              const existing =
                itemMap.get(
                  cutList.id
                );

              if (existing) {
                existing.quantity +=
                  1;

                existing.total_weight +=
                  weight;
              } else {
                itemMap.set(
                  cutList.id,
                  {
                    id:
                      cutList.id,

                    item_name:
                      cutList.item_name,

                    category_name:
                      cutList.category_name,

                    group_name:
                      cutList.group_name,

                    unique_code:
                      cutList.unique_code,

                    unit_weight:
                      weight,

                    quantity:
                      1,

                    total_weight:
                      weight,
                  }
                );
              }
            }

            const items =
              Array.from(
                itemMap.values()
              ).map(
                (
                  item
                ) => ({
                  ...item,

                  unit_weight:
                    Number(
                      item.unit_weight.toFixed(
                        2
                      )
                    ),

                  total_weight:
                    Number(
                      item.total_weight.toFixed(
                        2
                      )
                    ),
                })
              );

            const totalQuantity =
              items.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.quantity,
                0
              );

            const totalWeight =
              items.reduce(
                (
                  total,
                  item
                ) =>
                  total +
                  item.total_weight,
                0
              );

            return {
              ...box,

              items,

              order_no:
                orderNumber,

              packed_by_name:
                box
                  .packedByUser
                  ?.user_name ||
                "N/A",

              packet_no:
                box.box_name,

              package_date:
                box.packed_at ||
                box.created_date,

              product_box_count:
                `${
                  boxIndex +
                  1
                } of ${totalBoxes}`,

              address:
                clientAddress,

              total_quantity:
                totalQuantity,

              total_weight:
                Number(
                  totalWeight.toFixed(
                    2
                  )
                ),
            };
          }
        )
      );

    /*
    |--------------------------------------------------------------------------
    | 7. Project totals
    |--------------------------------------------------------------------------
    */

    const packedBoxes =
      boxes.filter(
        (
          box
        ) =>
          String(
            box.box_status
          ).toLowerCase() ===
          "packed"
      ).length;

    const totalProducts =
      boxesWithItems.reduce(
        (
          total,
          box
        ) =>
          total +
          box.items.length,
        0
      );

    const totalQuantity =
      boxesWithItems.reduce(
        (
          total,
          box
        ) =>
          total +
          box.total_quantity,
        0
      );

    const totalWeight =
      boxesWithItems.reduce(
        (
          total,
          box
        ) =>
          total +
          box.total_weight,
        0
      );

    /*
    |--------------------------------------------------------------------------
    | 8. Logo
    |--------------------------------------------------------------------------
    */

    const logoHtml =
      logoUrl
        ? `
          <img
            src="${logoUrl}"
            class="company-logo"
            alt="Logo"
          />
        `
        : `
          <div
            class="company-logo-text"
          >
            ${escapeHtml(
              vendor.vendor_name
            )}
          </div>
        `;

    /*
    |--------------------------------------------------------------------------
    | 9. Shared project header
    |--------------------------------------------------------------------------
    */

    const projectHeader = `
      <div
        class="main-header"
      >

        <div>
          ${logoHtml}
        </div>


        <div
          class="company-information"
        >

          <div
            class="company-name"
          >
            ${escapeHtml(
              vendor.vendor_name
            )}
          </div>

          <div>
            ${escapeHtml(
              vendor.primary_contact_number ||
              ""
            )}
          </div>

          <div>
            ${escapeHtml(
              vendor.primary_contact_email ||
              ""
            )}
          </div>

        </div>

      </div>


      <div
        class="project-heading"
      >

        <div
          class="project-heading-left"
        >

          <div
            class="project-name"
          >
            ${escapeHtml(
              project.project_name
            )}
          </div>

          <div
            class="project-subtitle"
          >
            Order Number:

            ${escapeHtml(
              orderNumber
            )}
          </div>

        </div>


        <div
          class="project-client"
        >

          <strong>
            ${escapeHtml(
              clientName
            )}
          </strong>

          <div>
            ${escapeHtml(
              clientContact
            )}
          </div>

        </div>

      </div>
    `;

    /*
    |--------------------------------------------------------------------------
    | 10. Summary rows
    |--------------------------------------------------------------------------
    */

    const summaryRows =
      boxesWithItems
        .map(
          (
            box,
            index
          ) => `
            <tr>

              <td>
                ${
                  index +
                  1
                }
              </td>

              <td>
                ${escapeHtml(
                  box.packet_no
                )}
              </td>

              <td>
                ${escapeHtml(
                  box.packed_by_name
                )}
              </td>

              <td>
                ${formatReportDate(
                  box.package_date
                )}
              </td>

              <td>
                ${escapeHtml(
                  box.product_box_count
                )}
              </td>

              <td>
                ${
                  box.items.length
                }
              </td>

              <td>
                ${
                  box.total_quantity
                }
              </td>

              <td>
                ${box.total_weight.toFixed(
                  2
                )}
                kg
              </td>

              <td>
                ${escapeHtml(
                  String(
                    box.box_status
                  )
                )}
              </td>

            </tr>
          `
        )
        .join("");

    /*
    |--------------------------------------------------------------------------
    | 11. Summary page
    |--------------------------------------------------------------------------
    */

    const summaryPage = `
      <section
        class="page"
      >

        ${projectHeader}


        <div
          class="summary-line"
        >

          <div>

            <span>
              BOXES
            </span>

            <strong>
              ${packedBoxes}
            </strong>

          </div>


          <div>

            <span>
              PRODUCTS
            </span>

            <strong>
              ${totalProducts}
            </strong>

          </div>


          <div>

            <span>
              TOTAL QTY
            </span>

            <strong>
              ${totalQuantity}
            </strong>

          </div>


          <div>

            <span>
              TOTAL WEIGHT
            </span>

            <strong>
              ${totalWeight.toFixed(
                2
              )}
              kg
            </strong>

          </div>

        </div>


        <div
          class="summary-address"
        >

          <strong>
            DELIVERY ADDRESS:
          </strong>

          ${escapeHtml(
            clientAddress
          )}

        </div>


        <h3
          class="section-title"
        >
          BOX OVERVIEW
        </h3>


        <table
          class="
            report-table
            summary-table
          "
        >

          <thead>

            <tr>

              <th>
                #
              </th>

              <th>
                Packet
              </th>

              <th>
                Packed By
              </th>

              <th>
                Date
              </th>

              <th>
                Count
              </th>

              <th>
                Products
              </th>

              <th>
                Qty
              </th>

              <th>
                Weight
              </th>

              <th>
                Status
              </th>

            </tr>

          </thead>


          <tbody>

            ${summaryRows}

          </tbody>


          <tfoot>

            <tr>

              <td
                colspan="5"
              >
                TOTAL
              </td>

              <td>
                ${totalProducts}
              </td>

              <td>
                ${totalQuantity}
              </td>

              <td>
                ${totalWeight.toFixed(
                  2
                )}
                kg
              </td>

              <td>
                ${packedBoxes}
              </td>

            </tr>

          </tfoot>

        </table>

      </section>
    `;

    /*
    |--------------------------------------------------------------------------
    | 12. Box pages
    |--------------------------------------------------------------------------
    */

    const boxPagesArray =
      await Promise.all(
        boxesWithItems.map(
          async (
            box
          ) => {
            const packageDate =
              formatReportDate(
                box.package_date
              );

            const qrValue =
              `vendor:${vendor_id},project:${project_id},box:${box.id}`;

            const qrImage =
              await QRCode.toDataURL(
                qrValue,
                {
                  width:
                    250,

                  margin:
                    1,

                  errorCorrectionLevel:
                    "M",

                  color: {
                    dark:
                      "#000000",

                    light:
                      "#FFFFFF",
                  },
                }
              );

            const itemRows =
              box.items
                .map(
                  (
                    item,
                    index
                  ) => `
                    <tr>

                      <td>
                        ${
                          index +
                          1
                        }
                      </td>

                      <td>
                        ${escapeHtml(
                          item.item_name
                        )}
                      </td>

                      <td>
                        ${
                          item.quantity
                        }
                      </td>

                      <td>
                        ${item.unit_weight.toFixed(
                          2
                        )}
                        kg
                      </td>

                      <td>
                        ${item.total_weight.toFixed(
                          2
                        )}
                        kg
                      </td>

                    </tr>
                  `
                )
                .join("");

            return `
              <section
                class="
                  page
                  box-page
                "
              >

                ${projectHeader}


                <div
                  class="box-header"
                >

                  <div
                    class="box-main-row"
                  >

                    <!-- LEFT 75% -->

                    <div
                      class="box-left-section"
                    >

                      <div
                        class="box-title-area"
                      >

                        <div
                          class="box-title"
                        >
                          ${escapeHtml(
                            box.packet_no
                          )}
                        </div>


                        ${
                          box.details
                            ?.room_name
                            ? `
                              <div
                                class="room-name"
                              >
                                ${escapeHtml(
                                  box.details
                                    .room_name
                                )}
                              </div>
                            `
                            : ""
                        }

                      </div>


                      <div
                        class="box-details-grid"
                      >

                        <div
                          class="box-detail"
                        >

                          <span>
                            ORDER NUMBER
                          </span>

                          <strong>
                            ${escapeHtml(
                              box.order_no
                            )}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            PACKED BY
                          </span>

                          <strong>
                            ${escapeHtml(
                              box.packed_by_name
                            )}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            PACKET NO.
                          </span>

                          <strong>
                            ${escapeHtml(
                              box.packet_no
                            )}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            PACKAGE DATE
                          </span>

                          <strong>
                            ${packageDate}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            PRODUCT BOX COUNT
                          </span>

                          <strong>
                            ${escapeHtml(
                              box.product_box_count
                            )}
                          </strong>

                        </div>


                        <div
                          class="box-detail"
                        >

                          <span>
                            TOTAL WEIGHT
                          </span>

                          <strong
                            class="total-weight-value"
                          >
                            ${box.total_weight.toFixed(
                              2
                            )}
                            kg
                          </strong>

                        </div>

                      </div>

                    </div>


                    <!-- RIGHT 25% -->

                    <div
                      class="box-qr-section"
                    >

                      <img
                        src="${qrImage}"

                        class="box-qr-code"

                        alt="Box QR Code"
                      />


                      <div
                        class="box-qr-label"
                      >
                        SCAN BOX
                      </div>

                    </div>

                  </div>


                  <div
                    class="box-address"
                  >

                    <span>
                      DELIVERY ADDRESS
                    </span>

                    <strong>
                      ${escapeHtml(
                        box.address
                      )}
                    </strong>

                  </div>

                </div>


                <div
                  class="products-title-row"
                >

                  <h3
                    class="section-title"
                  >
                    PRODUCTS
                  </h3>


                  <div
                    class="products-count"
                  >
                    ${
                      box.items.length
                    }

                    products

                    ·

                    ${
                      box.total_quantity
                    }

                    qty
                  </div>

                </div>


                <table
                  class="report-table"
                >

                  <thead>

                    <tr>

                      <th
                        class="sr-column"
                      >
                        #
                      </th>

                      <th
                        class="product-column"
                      >
                        Product
                      </th>

                      <th
                        class="qty-column"
                      >
                        Qty
                      </th>

                      <th
                        class="unit-column"
                      >
                        Unit Weight
                      </th>

                      <th
                        class="total-column"
                      >
                        Total Weight
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    ${
                      itemRows ||
                      `
                        <tr>

                          <td
                            colspan="5"

                            class="no-products"
                          >
                            No products found
                          </td>

                        </tr>
                      `
                    }

                  </tbody>


                  <tfoot>

                    <tr>

                      <td
                        colspan="2"
                      >
                        TOTAL
                      </td>

                      <td>
                        ${
                          box.total_quantity
                        }
                      </td>

                      <td>
                        —
                      </td>

                      <td>
                        ${box.total_weight.toFixed(
                          2
                        )}
                        kg
                      </td>

                    </tr>

                  </tfoot>

                </table>

              </section>
            `;
          }
        )
      );

    const boxPages =
      boxPagesArray.join("");

    /*
    |--------------------------------------------------------------------------
    | 13. HTML
    |--------------------------------------------------------------------------
    */

    const html = `
<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8"/>

<style>

@page {
  size: 3in 6in;
  margin: 0;
}


* {
  box-sizing: border-box;

  margin: 0;

  padding: 0;
}


html,
body {
  width: 4in;

  margin: 0;

  padding: 0;
}


body {
  color: #172033;

  background: #FFFFFF;

  font-family:
    Arial,
    sans-serif;

  font-size: 11px;
}


.page {
  width: 4in;

  height: 6in;

  padding: 14px;

  overflow: hidden;

  page-break-after:
    always;
}


.page:last-child {
  page-break-after:
    auto;
}


/*
|--------------------------------------------------------------------------
| Company
|--------------------------------------------------------------------------
*/

.main-header {
  display: flex;

  justify-content:
    space-between;

  align-items:
    flex-start;

  min-height: 38px;

  padding-bottom: 6px;

  border-bottom:
    1px solid
    #172033;
}


.company-logo {
  display: block;

  max-width: 92px;

  max-height: 30px;

  object-fit:
    contain;
}


.company-logo-text {
  font-size: 14px;

  font-weight: 800;
}


.company-information {
  color: #667085;

  font-size: 6.5px;

  line-height: 1.35;

  text-align: right;
}


.company-name {
  color: #172033;

  font-size: 8.5px;

  font-weight: 800;
}


/*
|--------------------------------------------------------------------------
| Project
|--------------------------------------------------------------------------
*/

.project-heading {
  display: flex;

  justify-content:
    space-between;

  align-items:
    center;

  min-height: 37px;

  padding: 6px 0;

  border-bottom:
    1px solid
    #D9DEE7;
}


.project-heading-left {
  width: 64%;
}


.project-name {
  max-width: 220px;

  overflow: hidden;

  font-size: 10.5px;

  font-weight: 900;

  white-space: nowrap;

  text-overflow:
    ellipsis;
}


.project-subtitle {
  margin-top: 2px;

  color: #667085;

  font-size: 6.5px;
}


.project-client {
  width: 34%;

  color: #667085;

  font-size: 6.5px;

  line-height: 1.3;

  text-align: right;
}


.project-client strong {
  display: block;

  overflow: hidden;

  color: #172033;

  white-space: nowrap;

  text-overflow:
    ellipsis;
}


/*
|--------------------------------------------------------------------------
| Summary
|--------------------------------------------------------------------------
*/

.summary-line {
  display: grid;

  grid-template-columns:
    repeat(
      4,
      1fr
    );

  gap: 8px;

  padding: 9px 0;

  border-bottom:
    1px solid
    #D9DEE7;
}


.summary-line span {
  display: block;

  color: #667085;

  font-size: 6px;

  font-weight: 700;
}


.summary-line strong {
  display: block;

  margin-top: 2px;

  font-size: 10px;
}


.summary-address {
  padding: 7px 0;

  border-bottom:
    1px solid
    #D9DEE7;

  font-size: 7px;
}


/*
|--------------------------------------------------------------------------
| Box
|--------------------------------------------------------------------------
*/

.box-header {
  padding: 7px 0;

  border-bottom:
    2px solid
    #172033;
}


.box-main-row {
  display: grid;

  grid-template-columns:
    minmax(
      0,
      75%
    )
    minmax(
      0,
      25%
    );
}


.box-left-section {
  min-width: 0;

  padding-right: 10px;
}


.box-title-area {
  padding-bottom: 6px;

  margin-bottom: 7px;

  border-bottom:
    1px solid
    #E1E5EB;
}


.box-title {
  overflow: hidden;

  font-size: 13px;

  font-weight: 900;

  white-space: nowrap;

  text-overflow:
    ellipsis;
}


.room-name {
  margin-top: 2px;

  color: #667085;

  font-size: 6.5px;
}


.box-details-grid {
  display: grid;

  grid-template-columns:
    repeat(
      3,
      minmax(
        0,
        1fr
      )
    );

  column-gap: 10px;

  row-gap: 9px;
}


.box-detail span {
  display: block;

  color: #667085;

  font-size: 5.7px;

  font-weight: 800;
}


.box-detail strong {
  display: block;

  margin-top: 2px;

  overflow-wrap:
    anywhere;

  font-size: 7.7px;

  font-weight: 800;
}


.total-weight-value {
  font-size:
    8.7px !important;
}


/*
|--------------------------------------------------------------------------
| QR
|--------------------------------------------------------------------------
*/

.box-qr-section {
  display: flex;

  flex-direction:
    column;

  justify-content:
    center;

  align-items:
    center;

  padding-left: 8px;

  border-left:
    1px solid
    #D9DEE7;
}


.box-qr-code {
  width: 78px;

  height: 78px;

  object-fit:
    contain;
}


.box-qr-label {
  margin-top: 4px;

  color: #667085;

  font-size: 5.5px;

  font-weight: 900;
}


/*
|--------------------------------------------------------------------------
| Address
|--------------------------------------------------------------------------
*/

.box-address {
  margin-top: 8px;

  padding-top: 6px;

  border-top:
    1px solid
    #D9DEE7;
}


.box-address span {
  display: block;

  color: #667085;

  font-size: 5.8px;

  font-weight: 800;
}


.box-address strong {
  display: block;

  max-height: 27px;

  margin-top: 3px;

  overflow: hidden;

  font-size: 7.2px;

  line-height: 1.28;
}


/*
|--------------------------------------------------------------------------
| Products
|--------------------------------------------------------------------------
*/

.products-title-row {
  display: flex;

  justify-content:
    space-between;

  align-items:
    center;

  margin:
    6px 0 4px;
}


.section-title {
  font-size: 8.5px;

  font-weight: 900;
}


.products-count {
  color: #667085;

  font-size: 5.8px;

  font-weight: 700;
}


/*
|--------------------------------------------------------------------------
| Table
|--------------------------------------------------------------------------
*/

.report-table {
  width: 100%;

  border-collapse:
    collapse;

  table-layout:
    fixed;
}


.report-table thead {
  color: #FFFFFF;

  background: #172033;
}


.report-table th {
  padding:
    4px 3px;

  font-size: 5.5px;

  text-align: left;
}


.report-table td {
  padding:
    4px 3px;

  border-bottom:
    1px solid
    #E4E7EC;

  font-size: 6px;

  line-height: 1.15;

  overflow-wrap:
    anywhere;
}


.report-table tbody tr:nth-child(even) {
  background: #F8FAFC;
}


.report-table tfoot {
  background: #F1F5F9;

  font-weight: 800;
}


.sr-column {
  width: 7%;
}


.product-column {
  width: 45%;
}


.qty-column {
  width: 10%;
}


.unit-column {
  width: 18%;
}


.total-column {
  width: 20%;
}


.no-products {
  padding:
    14px !important;

  text-align: center;
}

</style>

</head>


<body>

${summaryPage}

${boxPages}

</body>

</html>
`;

    /*
    |--------------------------------------------------------------------------
    | 14. PDF
    |--------------------------------------------------------------------------
    */

    const fileName =
      `report_${sanitizeFileName(
        project.project_name
      )}_${Date.now()}.pdf`;

    tempFilePath =
      path.join(
        tempDir,
        fileName
      );

    await generateCustomSizePdf(
      html,

      tempFilePath,

      {
        width:
          "4in",

        height:
          "6in",

        printBackground:
          true,

        margin: {
          top:
            "0",

          bottom:
            "0",

          left:
            "0",

          right:
            "0",
        },
      }
    );

    /*
    |--------------------------------------------------------------------------
    | 15. Upload
    |--------------------------------------------------------------------------
    */

    const {
      signedUrl,
      wasabiKey,
    } =
      await uploadPdfAndGetSignedUrl(
        tempFilePath,

        vendor_id,

        project_id,

        fileName
      );

    tempFilePath =
      null;

    return validationResponse(
      1,

      "Project full report generated successfully",

      {
        download_url:
          signedUrl,

        file_name:
          fileName,

        wasabi_key:
          wasabiKey,

        total_boxes:
          totalBoxes,

        total_weight:
          Number(
            totalWeight.toFixed(
              2
            )
          ),
      }
    );
  } catch (error) {
    console.error(
      "generateProjectFullReportService:",
      error
    );

    if (
      tempFilePath &&
      fs.existsSync(
        tempFilePath
      )
    ) {
      fs.unlinkSync(
        tempFilePath
      );
    }

    return validationResponse(
      0,
      "Failed to generate project report"
    );
  }
};

const formatReportDate = (
  value:
    | string
    | Date
    | null
    | undefined
) => {
  if (!value) {
    return "N/A";
  }

  return new Date(
    value
  ).toLocaleDateString(
    "en-GB",
    {
      day:
        "2-digit",

      month:
        "short",

      year:
        "numeric",
    }
  );
};





type CustomPdfOptions = {
  width: string;

  height: string;

  printBackground?: boolean;

  margin?: {
    top?: string;

    bottom?: string;

    left?: string;

    right?: string;
  };
};


export const markItemSiteInService = async (
  unique_code: string,
  box_id: number,
  project_id: number,
  vendor_id: number,
  user_id: number
) => {
  try {

    // ── 1. Verify the box exists and is marked site_in ───────────────────────
    const box = await prisma.boxMaster.findFirst({
      where: {
        id: box_id,
        project_id,
        vendor_id,
        is_deleted: false,
        box_status: "packed",
      },
      select: { id: true, site_in_at: true },
    });

    if (!box) return validationResponse(0, "Box not found");
    if (!box.site_in_at) return validationResponse(0, "Box has not been marked as site in yet");

    // ── 2. Look up cut_list by unique_code scoped to project + vendor ────────
    const cutList = await prisma.cutList.findFirst({
      where: {
        unique_code,
        project_id,
        vendor_id,
      },
      select: { id: true, item_name: true, unique_code: true },
    });

    if (!cutList) return validationResponse(0, "Item not found for this QR code");

    // ── 3. Find the packaging machine ────────────────────────────────────────
    const packagingMachine = await prisma.machineMaster.findFirst({
      where: { vendor_id, machine_type_id: 18 },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    if (!packagingMachine) return validationResponse(0, "Packaging machine not configured");

    // ── 4. Find the mapping row for this item IN THIS SPECIFIC BOX ──────────
    // A cut_list with qty > 1 creates multiple mapping rows — one per unit.
    // Some units may be in different boxes. We find the one assigned to box_id
    // that hasn't been marked site_in yet (so scanning marks them one by one).
    const mapping = await prisma.cutListMachineMapping.findFirst({
      where: {
        cut_list_id: cutList.id,
        box_id: box_id,       // ← scoped to this box
        project_id,
        vendor_id,
        machine_id: packagingMachine.id,
        expected_in: true,
        actual_in_at: { not: null }, // must have been scanned in
        site_in_at: null,          // not yet received at site
      },
      select: {
        id: true,
        box_id: true,
        actual_in_at: true,
        site_in_at: true,
      },
    });

    if (!mapping) {
      // Distinguish between "wrong box" and "all units already received"
      const anyInBox = await prisma.cutListMachineMapping.findFirst({
        where: {
          cut_list_id: cutList.id,
          box_id: box_id,
          project_id,
          vendor_id,
          machine_id: packagingMachine.id,
          expected_in: true,
        },
        select: { id: true, site_in_at: true, actual_in_at: true },
      });

      if (!anyInBox) {
        return validationResponse(0, "Item is not packed in this box");
      }
      if (!anyInBox.actual_in_at) {
        return validationResponse(0, "Item has not been scanned into the box yet");
      }
      // All units of this item in this box are already received
      return validationResponse(0, "All units of this item are already marked as received at site");
    }

    // ── 5. Mark site_in on this mapping row ──────────────────────────────────
    const updated = await prisma.cutListMachineMapping.update({
      where: { id: mapping.id },
      data: {
        site_in_at: new Date(),
        site_in_by: user_id,
      },
      select: {
        id: true,
        site_in_at: true,
        site_in_by: true,
        cut_list: { select: { item_name: true, unique_code: true } },
      },
    });

    // Count remaining units of this item in this box not yet received
    const remaining = await prisma.cutListMachineMapping.count({
      where: {
        cut_list_id: cutList.id,
        box_id: box_id,
        project_id,
        vendor_id,
        machine_id: packagingMachine.id,
        expected_in: true,
        actual_in_at: { not: null },
        site_in_at: null,
      },
    });

    const message = remaining > 0
      ? `Item received. ${remaining} more unit${remaining > 1 ? "s" : ""} of this item pending`
      : "Item marked as received at site";

    return validationResponse(1, message, { ...updated, remaining_units: remaining });

  } catch (error) {
    console.error("Error in markItemSiteInService:", error);
    return validationResponse(0, "Failed to mark item as received at site");
  }
};

// ── Get all items in a box with their site_in status ─────────────────────────
export const getBoxSiteInStatusService = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {
  try {
    const box = await prisma.boxMaster.findFirst({
      where: { id: box_id, project_id, vendor_id, is_deleted: false },
      select: {
        id: true,
        box_name: true,
        box_status: true,
        site_in_at: true,
        factory_out_at: true,
      },
    });

    if (!box) return validationResponse(0, "Box not found");

    const packagingMachine = await prisma.machineMaster.findFirst({
      where: { vendor_id, machine_type_id: 18 },
      select: { id: true },
      orderBy: { id: "asc" },
    });

    if (!packagingMachine) return validationResponse(0, "Packaging machine not configured");

    const items = await prisma.cutListMachineMapping.findMany({
      where: {
        box_id,
        project_id,
        vendor_id,
        machine_id: packagingMachine.id,
        expected_in: true,
      },
      select: {
        id: true,
        site_in_at: true,
        site_in_by: true,
        cut_list: {
          select: {
            id: true,
            item_name: true,
            category_name: true,
            group_name: true,
            unique_code: true,
            qty: true,
          },
        },
      },
      orderBy: { id: "asc" },
    });

    const totalItems = items.length;
    const receivedItems = items.filter((i) => i.site_in_at !== null).length;

    return validationResponse(1, "Box site in status fetched", {
      box,
      total_items: totalItems,
      received_items: receivedItems,
      pending_items: totalItems - receivedItems,
      items: items.map((i) => ({
        mapping_id: i.id,
        cut_list_id: i.cut_list.id,
        item_name: i.cut_list.item_name,
        category_name: i.cut_list.category_name,
        group_name: i.cut_list.group_name,
        unique_code: i.cut_list.unique_code,
        qty: i.cut_list.qty,
        site_in_at: i.site_in_at,
        site_in_by: i.site_in_by,
        is_received: i.site_in_at !== null,
      })),
    });

  } catch (error) {
    console.error("Error in getBoxSiteInStatusService:", error);
    return validationResponse(0, "Failed to fetch box site in status");
  }
};

const generateCustomSizePdf = async (
  html: string,
  outputPath: string,
  options: CustomPdfOptions
) => {
  const browser =
    await puppeteer.launch({
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

  try {
    const page =
      await browser.newPage();

    await page.setContent(
      html,
      {
        waitUntil:
          "networkidle0",
      }
    );

    await page.pdf({
      path:
        outputPath,

      width:
        options.width,

      height:
        options.height,

      printBackground:
        options
          .printBackground ??
        true,

      margin: {
        top:
          options.margin
            ?.top ??
          "0",

        bottom:
          options.margin
            ?.bottom ??
          "0",

        left:
          options.margin
            ?.left ??
          "0",

        right:
          options.margin
            ?.right ??
          "0",
      },

      preferCSSPageSize:
        true,
    });
  } finally {
    await browser.close();
  }
};