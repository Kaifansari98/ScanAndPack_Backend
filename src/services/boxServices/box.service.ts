import { prisma } from '../../prisma/client';
import { BoxStatus } from '../../prisma/generated';
import { CreateBoxInput } from '../../types/boxTypes';

import fs from "fs";
import path from "path";
// import htmlPdfNode from "html-pdf-node";
import puppeteer from "puppeteer";

import { validationResponse } from '../../../src/utils/validationResponse';
import { uploadPdfAndGetSignedUrl, uploadPdfToWasabi } from '../../../src/utils/wasabiClient';

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

// export const getBoxDetailsWithItems = async (
//   vendorId: number,
//   projectId: number,
//   clientId: number,
//   boxId: number
// ) => {
//   const vendor = await prisma.vendorMaster.findUnique({
//     where: { id: vendorId },
//   });

//   const box = await prisma.boxMaster.findFirst({
//     where: {
//       id: boxId,
//       project_id: projectId,
//     },
//     include: {
//       details: true,
//       project: {
//         include: {
//           client: true,
//         },
//       },
//     },
//   });

//   const items = await prisma.scanAndPackItem.findMany({
//     where: {
//       vendor_id: vendorId,
//       project_id: projectId,
//       client_id: clientId,
//       box_id: boxId,
//       is_deleted: false,
//     },
//     include: {
//       user: true,
//       details: true,
//     },
//   });

//   // 🔥 Enrich each item with its ProjectItemsMaster record
//   const enrichedItems = await Promise.all(
//     items.map(async (item) => {
//       const projectItem = await prisma.projectItemsMaster.findFirst({
//         where: {
//           project_id: item.project_id,
//           vendor_id: item.vendor_id,
//           lead_id: item.lead_id,
//           unique_id: item.unique_id,
//         },
//       });

//       return {
//         ...item,
//         projectItem,
//       };
//     })
//   );

//   return {
//     vendor,
//     box,
//     client: box?.project?.client,
//     items: enrichedItems,
//   };
// };

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



export const generateBoxPdfService = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {
  const tempDir = path.join(process.cwd(), "tmp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  let tempFilePath: string | null = null;

  try {

    // ── 1. Fetch box, vendor, packaging machine ──────────────────────────────
    const [box, vendor, packagingMachine] = await Promise.all([
      prisma.boxMaster.findFirst({
        where: { id: box_id, project_id, vendor_id, is_deleted: false },
        include: {
          project: { select: { project_name: true, id: true, lead_id: true } },
          details: { select: { room_name: true } },
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

    if (!box) return validationResponse(0, "Box not found");
    if (!vendor) return validationResponse(0, "Vendor not found");

    // ── 2. Fetch lead ────────────────────────────────────────────────────────
    let lead: {
      firstname: string;
      lastname: string;
      contact_no: string;
      email: string | null;
      site_address: string | null;
    } | null = null;

    if (box.project.lead_id) {
      lead = await prisma.leadMaster.findUnique({
        where: { id: box.project.lead_id },
        select: {
          firstname: true,
          lastname: true,
          contact_no: true,
          email: true,
          site_address: true,
        },
      });
    }

    // ── 3. Fetch packed items — now includes group_name ──────────────────────
    const mappingRows = packagingMachine
      ? await prisma.cutListMachineMapping.findMany({
        where: {
          box_id,
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
              group_name: true,   // ← added
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
        group_name: string | null;   // ← added
        qty: number;
        unique_code: string | null;
      }[];

    const totalQty = items.reduce((sum, i) => sum + i.qty, 0);

    // ── 4. Build QR + logo URLs ──────────────────────────────────────────────
    const qrValue = encodeURIComponent(
      `vendor:${vendor_id},project:${project_id},box:${box_id}`
    );
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${qrValue}&size=120x120`;
    const logoUrl = vendor.logo
      ? `${process.env.STORAGE_BASE_URL ?? ""}/${vendor.logo}`
      : null;

    // ── 5. Build HTML ────────────────────────────────────────────────────────
    const itemRows = items
      .map(
        (item, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding:7px 10px;color:#555;font-size:12px;">${i + 1}</td>
          <td style="padding:7px 10px;font-size:12px;">${escapeHtml(item.item_name)}</td>
          <td style="padding:7px 10px;font-size:12px;color:#555;">${escapeHtml(item.category_name ?? "—")}</td>
          <td style="padding:7px 10px;font-size:12px;color:#555;">${escapeHtml(item.group_name ?? "—")}</td>
          <td style="padding:7px 10px;font-size:12px;">${item.qty}</td>
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
 
  <!-- Client + QR -->
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
 
  <!-- Project + Box summary -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <div>
      <p style="font-size:15px;font-weight:600;color:#111;">
        ${escapeHtml(box.project.project_name)} — ${escapeHtml(box.box_name)}
      </p>
      ${box.details?.room_name ? `<p style="font-size:12px;color:#666;margin-top:2px;">Room: ${escapeHtml(box.details.room_name)}</p>` : ""}
    </div>
    <div style="text-align:right;">
      <p style="font-size:13px;"><strong>Total Items:</strong> ${items.length}</p>
      <p style="font-size:13px;"><strong>Total Qty:</strong> ${totalQty}</p>
    </div>
  </div>
 
  <!-- Items table -->
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#2d2d2d;color:white;">
        <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:6%;">Sr.</th>
        <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:32%;">Item Name</th>
        <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:22%;">Category</th>
        <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:30%;">Group</th>
        <th style="padding:8px 10px;text-align:left;font-size:12px;font-weight:500;width:10%;">Qty</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows || `<tr><td colspan="5" style="padding:16px 10px;text-align:center;color:#9CA3AF;font-size:13px;">No items in this box</td></tr>`}
    </tbody>
    <tfoot>
      <tr style="border-top:2px solid #ddd;background:#f3f4f6;">
        <td colspan="4" style="padding:8px 10px;font-weight:600;font-size:13px;">Total Items</td>
        <td style="padding:8px 10px;font-weight:600;font-size:13px;">${totalQty}</td>
      </tr>
    </tfoot>
  </table>
 
  <!-- Footer -->
  <div style="margin-top:20px;padding-top:10px;border-top:0.5px solid #e5e7eb;display:flex;justify-content:space-between;">
    <p style="font-size:11px;color:#9CA3AF;">Generated by ${escapeHtml(vendor.vendor_name)}</p>
    <p style="font-size:11px;color:#9CA3AF;">Box ID: ${box_id} · Project ID: ${project_id}</p>
  </div>
 
</body>
</html>`;

    // ── 6. Write PDF to temp file ────────────────────────────────────────────
    const fileName = `box_${sanitizeFileName(box.project.project_name)}_${sanitizeFileName(box.box_name)}_${Date.now()}.pdf`;
    tempFilePath = path.join(tempDir, fileName);

    // const pdfBuffer = await htmlPdfNode.generatePdf(
    //   { content: html },
    //   {
    //     format: "A4",
    //     margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    //     printBackground: true,
    //   }
    // );

    // fs.writeFileSync(tempFilePath, pdfBuffer);


    const pdfBuffer = await generatePdf(html,tempFilePath);

    // const pdfBuffer = await htmlPdfNode.generatePdf(
    //   { content: html },
    //   {
    //     format: "A4",
    //     margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    //     printBackground: true,
    //   }
    // ) as unknown as Buffer;

    // fs.writeFileSync(tempFilePath, pdfBuffer);

    // ── 7. Upload to Wasabi + get signed URL + delete temp file ──────────────
    const { signedUrl, wasabiKey } = await uploadPdfAndGetSignedUrl(
      tempFilePath,
      vendor_id,
      box_id,
      fileName
    );
    tempFilePath = null;

    return validationResponse(1, "PDF generated successfully", {
      download_url: signedUrl,
      file_name: fileName,
      wasabi_key: wasabiKey,
    });

  } catch (error) {
    console.error("Error generating box PDF:", error);

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return validationResponse(0, "Failed to generate PDF");
  }
};



export async function generatePdf(html: string, filePath: string) {
  const browser = await puppeteer.launch({
    headless:true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"], // required on VPS
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

  await browser.close();

  fs.writeFileSync(filePath, pdfBuffer);
  return pdfBuffer;
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


    const pdfBuffer = await generatePdf(html,tempFilePath);
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

export const generateAllBoxesPdfService = async (
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
        select: { id: true, project_name: true, lead_id: true, project_status: true },
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

    // ── 3. Fetch all boxes ───────────────────────────────────────────────────
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

    // ── 4. Fetch items per box from CutListMachineMapping ────────────────────
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

    // ── 5. Build reusable header + footer strings ────────────────────────────
    const logoUrl = vendor.logo
      ? `${process.env.STORAGE_BASE_URL ?? ""}/${vendor.logo}`
      : null;

    const pageHeader = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
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
 
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:12px;">
        <div>
          ${lead ? `
            <p style="font-size:13px;margin-bottom:3px;"><strong>Client Name:</strong> ${escapeHtml(`${lead.firstname} ${lead.lastname}`)}</p>
            <p style="font-size:13px;margin-bottom:3px;"><strong>Contact:</strong> ${escapeHtml(lead.contact_no)}</p>
            ${lead.email ? `<p style="font-size:13px;margin-bottom:3px;"><strong>Email:</strong> ${escapeHtml(lead.email)}</p>` : ""}
            ${lead.site_address ? `<p style="font-size:13px;"><strong>Address:</strong> ${escapeHtml(lead.site_address)}</p>` : ""}
          ` : `<p style="font-size:13px;color:#888;">No client information available</p>`}
        </div>
        <div style="text-align:right;">
          <p style="font-size:13px;font-weight:600;color:#111;">${escapeHtml(project.project_name)}</p>
          <p style="font-size:11px;color:#666;margin-top:2px;">Total Boxes: ${boxes.length}</p>
        </div>
      </div>
 
      <div style="height:1px;background:#222;margin:10px 0 16px;"></div>
    `;

    const pageFooter = `
      <div style="margin-top:20px;padding-top:10px;border-top:0.5px solid #e5e7eb;display:flex;justify-content:space-between;">
        <p style="font-size:11px;color:#9CA3AF;">Generated by ${escapeHtml(vendor.vendor_name)}</p>
        <p style="font-size:11px;color:#9CA3AF;">Project ID: ${project_id} · All Boxes</p>
      </div>
    `;

    // ── 6. Build one full page per box (header + content + footer each) ──────
    const boxSections = boxesWithItems
      .map((box, boxIndex) => {
        const totalQty = box.items.reduce((sum, i) => sum + i.qty, 0);
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
          <div style="${boxIndex > 0 ? "page-break-before: always;" : ""}">
 
            ${pageHeader}
 
            <div style="margin-bottom:32px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="
                    background:${isPacked ? "#E6F7F5" : "#FFF8EE"};
                    color:${isPacked ? "#1A7A70" : "#C15C0A"};
                    padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;
                  ">${box.box_status}</span>
                  <p style="font-size:14px;font-weight:600;color:#111;">${escapeHtml(box.box_name)}</p>
                  ${box.details?.room_name ? `<p style="font-size:11px;color:#666;">· ${escapeHtml(box.details.room_name)}</p>` : ""}
                </div>
                <div style="display:flex;align-items:center;gap:12px;">
                  <div style="text-align:right;">
                    <p style="font-size:11px;color:#555;"><strong>Items:</strong> ${box.items.length} &nbsp; <strong>Qty:</strong> ${totalQty}</p>
                  </div>
                  <img src="${qrUrl}" style="width:48px;height:48px;" alt="QR"/>
                </div>
              </div>
 
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
                    <td colspan="4" style="padding:6px 8px;font-weight:600;font-size:11px;">Total Items</td>
                    <td style="padding:6px 8px;font-weight:600;font-size:11px;">${totalQty}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
 
            ${pageFooter}
 
          </div>
        `;
      })
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
  ${boxSections}
</body>
</html>`;

    // ── 7. Write PDF to temp file ────────────────────────────────────────────
    const fileName = `all_boxes_${sanitizeFileName(project.project_name)}_${Date.now()}.pdf`;
    tempFilePath = path.join(tempDir, fileName);

    const pdfBuffer = await generatePdf(html,tempFilePath);
    // const pdfBuffer = await htmlPdfNode.generatePdf(
    //   { content: html },
    //   {
    //     format: "A4",
    //     margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    //     printBackground: true,
    //   }
    // ) as unknown as Buffer;

    //fs.writeFileSync(tempFilePath, pdfBuffer);

    // ── 8. Upload to Wasabi + signed URL + delete temp ───────────────────────
    const { signedUrl, wasabiKey } = await uploadPdfAndGetSignedUrl(
      tempFilePath,
      vendor_id,
      project_id,
      fileName
    );
    tempFilePath = null;

    return validationResponse(1, "All boxes PDF generated successfully", {
      download_url: signedUrl,
      file_name: fileName,
      wasabi_key: wasabiKey,
      total_boxes: boxes.length,
    });

  } catch (error) {
    console.error("Error generating all boxes PDF:", error);

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return validationResponse(0, "Failed to generate PDF");
  }
};


export const generateProjectFullReportService = async (
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

    const pdfBuffer = await generatePdf(html,tempFilePath);

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

    return validationResponse(0, "Failed to generate project report");
  }
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
