import { prisma } from '../../prisma/client';
import { BoxStatus, PackingType } from '../../prisma/generated';
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

export const createBox = async (
  data: CreateBoxInput
) => {
  const {
    vendor_id,
    project_id,
    lead_id,
    box_name,
    box_info_values = [],
    created_by,
    ...boxData
  } = data;

  const existingBox =
    await prisma.boxMaster.findFirst({
      where: {
        vendor_id: Number(vendor_id),
        project_id: Number(project_id),
        lead_id: lead_id ? Number(lead_id) : null,
        box_name: box_name.trim(),
        is_deleted: false,
      },
    });

  if (existingBox) {
    throw new Error("Box already exists");
  }

  return await prisma.$transaction(
    async (tx) => {
      const createdBox =
        await tx.boxMaster.create({
          data: {
            ...boxData,
            vendor_id: Number(vendor_id),
            project_id: Number(project_id),
            lead_id: lead_id ? Number(lead_id) : null,
            box_name: box_name.trim(),
            created_by: created_by,
          },

          select: {
            id: true,
            box_name: true,
            project_id: true,
            vendor_id: true,
            lead_id: true,
            box_status: true,
          },
        });

      await saveBoxInfoValuesTx({
        tx,
        box_id: createdBox.id,
        project_id: Number(project_id),
        vendor_id: Number(vendor_id),
        values: box_info_values,
        user_id: created_by,
      });

      const boxInfoValues =
        await getBoxInfoValuesFormatted(
          createdBox.id,
          Number(project_id),
          Number(vendor_id)
        );

      return {
        ...createdBox,
        box_info_values: boxInfoValues,
      };
    }
  );
};

export const updateBoxName = async (
  id: number,
  vendor_id: number,
  project_id: number,
  lead_id: number,
  newBoxName: string,
  box_info_values: BoxInfoValueInput[] = [],
  updated_by?: number | null
) => {
  const existingBox =
    await prisma.boxMaster.findFirst({
      where: {
        id,
        vendor_id,
        project_id,
        lead_id,
        is_deleted: false,
      },
    });

  if (!existingBox) {
    throw new Error("Box not found");
  }

  const duplicate =
    await prisma.boxMaster.findFirst({
      where: {
        vendor_id,
        project_id,
        lead_id,
        box_name: newBoxName.trim(),
        is_deleted: false,
        NOT: {
          id,
        },
      },
    });

  if (duplicate) {
    throw new Error(
      "Another box with the same name already exists"
    );
  }

  return await prisma.$transaction(
    async (tx) => {
      const updatedBox =
        await tx.boxMaster.update({
          where: {
            id,
          },

          data: {
            box_name: newBoxName.trim(),
          },

          select: {
            id: true,
            box_name: true,
            project_id: true,
            vendor_id: true,
            lead_id: true,
            box_status: true,
          },
        });

      await saveBoxInfoValuesTx({
        tx,
        box_id: id,
        project_id,
        vendor_id,
        values: box_info_values,
        user_id: updated_by,
      });

      const boxInfoValues =
        await getBoxInfoValuesFormatted(
          id,
          project_id,
          vendor_id
        );

      return {
        ...updatedBox,
        box_info_values: boxInfoValues,
      };
    }
  );
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

export const getBoxesByVendorAndProject = async (
  vendorId: number,
  projectId: number
) => {
  const boxes =
    await prisma.boxMaster.findMany({
      where: {
        vendor_id: vendorId,
        project_id: projectId,
        is_deleted: false,
      },

      include: {
        details: true,

        box_info_values: {
          include: {
            field: {
              select: {
                id: true,
                field_label: true,
                field_key: true,
                field_type: true,
                is_required: true,
                sort_order: true,
                active: true,
              },
            },
          },
        },
      },

      orderBy: {
        created_date: "asc",
      },
    });

  const enriched =
    await Promise.all(
      boxes.map(
        async (box) => {
          const items_count =
            await prisma.cutListMachineMapping.count({
              where: {
                box_id: box.id,
                project_id: projectId,
                vendor_id: vendorId,
                actual_in_at: {
                  not: null,
                },
              },
            });

          const boxInfoValues =
            box.box_info_values
              .filter(
                (item) =>
                  item.field?.active
              )
              .sort(
                (a, b) =>
                  Number(
                    a.field.sort_order || 0
                  ) -
                  Number(
                    b.field.sort_order || 0
                  )
              )
              .map(
                (item) => ({
                  id: item.id,
                  field_id: item.field_id,
                  field_label:
                    item.field.field_label,
                  field_key:
                    item.field.field_key,
                  field_type:
                    item.field.field_type,
                  is_required:
                    item.field.is_required,
                  sort_order:
                    item.field.sort_order,
                  field_value:
                    item.field_value || "",
                })
              );

          return {
            ...box,
            items_count,
            box_info_values:
              boxInfoValues,
          };
        }
      )
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
  newStatus: BoxStatus,
  user_id: number
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
  const now = new Date();

  return await prisma.boxMaster.update({
    where: { id: boxId },
    data: { box_status: newStatus, packed_at: now, packed_by: user_id },
  });
};


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

/* Vector */


// const fontToBase64 = (relativePath: string) => {
//   const fontPath = path.resolve(process.cwd(), relativePath);

//   if (!fs.existsSync(fontPath)) {
//     throw new Error(`Font file not found: ${fontPath}`);
//   }

//   return fs.readFileSync(fontPath).toString("base64");
// };




const fontToBase64 = (fontPath: string): string => {
  if (!fs.existsSync(fontPath)) {
    throw new Error(`Font file not found: ${fontPath}`);
  }

  return fs.readFileSync(fontPath).toString("base64");
};





export const generateBoxPdfService = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {



  const calibriRegularPath = path.resolve(
    __dirname,
    "../../../assets/fonts/calibri/calibri-regular.ttf"
  );

  const calibriBoldPath = path.resolve(
    __dirname,
    "../../../assets/fonts/calibri/calibri-bold.ttf"
  );

  const calibriItalicPath = path.resolve(
    __dirname,
    "../../../assets/fonts/calibri/calibri-italic.ttf"
  );

  const calibriBoldItalicPath = path.resolve(
    __dirname,
    "../../../assets/fonts/calibri/calibri-bold-italic.ttf"
  );

  console.log("Calibri font path:", calibriRegularPath);

  const calibriRegular = fontToBase64(calibriRegularPath);

  const calibriBold = fontToBase64(
    calibriBoldPath
  );

  const calibriItalic = fontToBase64(
    calibriItalicPath
  );

  const calibriBoldItalic = fontToBase64(
    calibriBoldItalicPath
  );


  // return generateBoxHtmlService(box_id,project_id,vendor_id);
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

  // const hardcodedCompany = {
  //   tollFreeNo: "18002674949",
  //   email: "info@adarshindia.in",
  //   website: "www.adarshindia.in",
  //   addressLine1: "280 & 283, Bilavali,",
  //   addressLine2: "Kudus, Wada, Palghar",
  //   addressLine3: "421312 Maharashtra",
  //   gst: "27AAZFA7533R1ZC",
  //   tagline: "Design. Build. Deliver",
  //   fallbackName: "ADARSH INFRAINTERIO",
  // };

  const toNumber = (
    value: any
  ) => {
    const numberValue = Number(
      String(value ?? "")
        .replace(/[^0-9.]/g, "")
    );

    return Number.isFinite(numberValue)
      ? numberValue
      : 0;
  };

  const formatDimension = (
    value: any
  ) => {
    const numberValue = toNumber(value);

    if (!numberValue) {
      return "0";
    }

    return Number.isInteger(numberValue)
      ? String(numberValue)
      : numberValue.toFixed(2);
  };

  const formatQuantity = (
    value: number
  ) => {
    return String(value || 0).padStart(
      2,
      "0"
    );
  };

  const getItemSizeText = (
    item: {
      length?: any;
      width?: any;
      thickness?: any;
    }
  ) => {
    const length = toNumber(item.length);
    const width = toNumber(item.width);

    if (!length || !width) {
      return "2400 x 1200 mm";
    }

    return `${formatDimension(length)} x ${formatDimension(width)} mm`;
  };

  const getPackageSizeText = (
    items: {
      length?: any;
      width?: any;
    }[]
  ) => {
    const maxLength =
      Math.max(
        0,
        ...items.map((item) =>
          toNumber(item.length)
        )
      );

    const maxWidth =
      Math.max(
        0,
        ...items.map((item) =>
          toNumber(item.width)
        )
      );

    if (!maxLength || !maxWidth) {
      return "2400 x 1200 mm";
    }

    return `${formatDimension(maxLength)} x ${formatDimension(maxWidth)} mm`;
  };

  const findBoxInfoValue = (
    values: {
      field_label: string;
      field_key: string;
      field_value: string;
    }[],
    keywords: string[]
  ) => {
    const normalizedKeywords =
      keywords.map((keyword) =>
        keyword.toLowerCase()
      );

    const matchedValue =
      values.find((item) => {
        const label =
          String(item.field_label || "")
            .toLowerCase();

        const key =
          String(item.field_key || "")
            .toLowerCase();

        return normalizedKeywords.some(
          (keyword) =>
            label.includes(keyword) ||
            key.includes(keyword)
        );
      });

    return matchedValue
      ?.field_value
      ?.trim() || "";
  };

  const resolveProductName = (
    items: {
      category_name?: string | null;
      group_name?: string | null;
      item_name?: string | null;
    }[]
  ) => {
    const firstItem =
      items.find(Boolean);

    return (
      firstItem?.category_name ||
      firstItem?.group_name ||
      firstItem?.item_name ||
      "ELICIT LINEAR WORKSTATION"
    );
  };

  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Fetch project, box, vendor, packaging machine and project boxes
    |--------------------------------------------------------------------------
    */

    const [
      project,
      box,
      vendor,
      packagingMachine,
      projectBoxes,
    ] = await Promise.all([
      prisma.projectMaster.findFirst({
        where: {
          id: project_id,
          vendor_id,
        },

        select: {
          id: true,
          project_name: true,
          packing_type: true,
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

          box_info_values: {
            select: {
              id: true,
              field_id: true,
              field_value: true,

              field: {
                select: {
                  id: true,
                  field_label: true,
                  field_key: true,
                  field_type: true,
                  is_required: true,
                  sort_order: true,
                  active: true,
                },
              },
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
          gst_no: true,
          toll_free_no: true,
          website_link: true,
          tag_line: true,
          address: true,
          pincode: true,
          city: true,
          state: {
            select: {
              id: true,
              name: true,
            },
          },

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

      prisma.boxMaster.findMany({
        where: {
          project_id,
          vendor_id,
          is_deleted: false,
        },

        select: {
          id: true,
          created_date: true,
        },

        orderBy: [
          {
            created_date: "asc",
          },

          {
            id: "asc",
          },
        ],
      }),
    ]);

    /*
    |--------------------------------------------------------------------------
    | 2. Validate records
    |--------------------------------------------------------------------------
    */

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

    const totalBoxes =
      projectBoxes.length;

    /*
    |--------------------------------------------------------------------------
    | 3. Format dynamic box information values
    |--------------------------------------------------------------------------
    */

    const boxInfoValues =
      box.box_info_values
        .filter(
          (item) =>
            item.field &&
            item.field.active
        )
        .sort(
          (
            a,
            b
          ) =>
            Number(
              a.field.sort_order || 0
            ) -
            Number(
              b.field.sort_order || 0
            )
        )
        .map((item) => ({
          id: item.id,
          field_id: item.field_id,
          field_label: item.field.field_label,
          field_key: item.field.field_key,
          field_type: item.field.field_type,
          is_required: item.field.is_required,
          sort_order: item.field.sort_order,
          field_value: item.field_value || "",
        }));

    /*
    |--------------------------------------------------------------------------
    | 4. Vendor logo
    |--------------------------------------------------------------------------
    */

    let logoUrl = "";
    let embeddedLogoUrl = "";


    const hardcodedCompany = {
      tollFreeNo: vendor.toll_free_no,
      email: vendor.primary_contact_email,
      website: vendor.website_link,
      addressLine1: vendor.address,
      addressLine2: vendor.city,
      addressLine3: vendor.pincode + ' ' + vendor.state?.name,
      gst: vendor.gst_no,
      tagline: vendor.tag_line,
      fallbackName: vendor.vendor_name
    };

    if (vendor.logo) {
      try {
        logoUrl =
          await generateSignedUrl(
            vendor.logo
          );

        embeddedLogoUrl =
          await fetchImageAsDataUrl(
            logoUrl
          );
      } catch (error) {
        console.error(
          "Error generating logo signed URL:",
          error
        );

        embeddedLogoUrl = "";
      }
    }

    /*
    |--------------------------------------------------------------------------
    | 5. Lead fallback
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
    | 6. Resolve client information
    |--------------------------------------------------------------------------
    */

    const clientName =
      project.client_name ||
      (
        lead
          ? `${lead.firstname || ""} ${lead.lastname || ""
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
    | 7. Fetch current box items and all box group mappings
    |--------------------------------------------------------------------------
    */

    const [
      mappingRows,
      allBoxGroupMappings,
    ] =
      await Promise.all([
        prisma.cutListMachineMapping.findMany({
          where: {
            box_id,
            project_id,
            vendor_id,
            machine_id: packagingMachine.id,
            expected_in: true,
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
                material_details: true,
                weight: true,
                qty: true,
                length: true,
                width: true,
                thickness: true,
              },
            },
          },

          orderBy: {
            created_at: "asc",
          },
        }),

        prisma.cutListMachineMapping.findMany({
          where: {
            project_id,
            vendor_id,
            machine_id: packagingMachine.id,
            expected_in: true,

            box_id: {
              not: null,
            },
          },

          select: {
            id: true,
            box_id: true,

            cut_list: {
              select: {
                group_name: true,
              },
            },
          },

          orderBy: {
            created_at: "asc",
          },
        }),
      ]);

    /*
    |--------------------------------------------------------------------------
    | 8. Merge repeated cut-list rows
    |--------------------------------------------------------------------------
    */

    const itemMap =
      new Map<
        number,
        {
          id: number;
          item_name: string;
          category_name: string | null;
          group_name: string | null;
          unique_code: string | null;
          material_details: string | null;
          length: any;
          width: any;
          thickness: any;
          unit_weight: number;
          quantity: number;
          total_weight: number;
        }
      >();

      console.log("mappingRows",mappingRows);

    for (const mapping of mappingRows) {
      const cutList =
        mapping.cut_list;

      if (!cutList) {
        continue;
      }

      const cutListWeight =
        Number(
          cutList.weight || 0
        );

      const cutListQuantity =
        Number(
          cutList.qty || 0
        );

      const unitWeight =
        cutListQuantity > 0
          ? cutListWeight /
            cutListQuantity
          : 0;

      const existingItem =
        itemMap.get(
          cutList.id
        );

      if (existingItem) {
        existingItem.quantity += 1;
        existingItem.total_weight =
          unitWeight *
          existingItem.quantity;
      } else {
        itemMap.set(
          cutList.id,
          {
            id: cutList.id,
            item_name: cutList.item_name,
            category_name: cutList.category_name,
            group_name: cutList.group_name,
            unique_code: cutList.unique_code,
            material_details: cutList.material_details,
            length: cutList.length,
            width: cutList.width,
            thickness: cutList.thickness,
            unit_weight: unitWeight,
            quantity: 1,
            total_weight: unitWeight,
          }
        );
      }
    }

    const items =
      Array.from(
        itemMap.values()
      ).map((item) => ({
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
      }));

    /*
    |--------------------------------------------------------------------------
    | 9. Calculate box totals
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
    | 10. Resolve current box group
    |--------------------------------------------------------------------------
    */

    const groupedItem =
      items.find((item) =>
        Boolean(
          item.group_name
            ?.trim()
        )
      );

    const currentBoxGroupName =
      groupedItem
        ?.group_name
        ?.trim() ||
      null;

    const normalizeGroupName = (
      value:
        string |
        null |
        undefined
    ) =>
      value
        ?.trim()
        .toLowerCase() ||
      null;

    const normalizedPackingType =
      String(
        project.packing_type ||
        ""
      )
        .trim()
        .replace(
          /[\s_-]/g,
          ""
        )
        .toUpperCase();

    const isGroupWisePacking =
      project.packing_type ===
      PackingType.GROUPWISE ||
      normalizedPackingType ===
      "GROUPWISE";

    /*
    |--------------------------------------------------------------------------
    | 11. Calculate PRODUCT BOX COUNT
    |--------------------------------------------------------------------------
    */

    let currentProductBoxNumber = 1;

    let productBoxTotal =
      Math.max(
        totalBoxes,
        1
      );

    if (
      isGroupWisePacking
    ) {
      const currentGroupKey =
        normalizeGroupName(
          currentBoxGroupName
        );

      if (currentGroupKey) {
        const currentGroupBoxIds =
          new Set<number>();

        for (const mapping of allBoxGroupMappings) {
          if (!mapping.box_id) {
            continue;
          }

          const mappingGroupKey =
            normalizeGroupName(
              mapping
                .cut_list
                ?.group_name
            );

          if (
            mappingGroupKey ===
            currentGroupKey
          ) {
            currentGroupBoxIds.add(
              mapping.box_id
            );
          }
        }

        const currentGroupBoxes =
          projectBoxes.filter(
            (
              projectBox
            ) =>
              currentGroupBoxIds.has(
                projectBox.id
              )
          );

        const currentGroupBoxIndex =
          currentGroupBoxes.findIndex(
            (
              projectBox
            ) =>
              projectBox.id === box.id
          );

        currentProductBoxNumber =
          currentGroupBoxIndex >= 0
            ? currentGroupBoxIndex + 1
            : 1;

        productBoxTotal =
          Math.max(
            currentGroupBoxes.length,
            1
          );
      } else {
        currentProductBoxNumber = 1;
        productBoxTotal = 1;
      }
    } else {
      const currentBoxIndex =
        projectBoxes.findIndex(
          (
            projectBox
          ) =>
            projectBox.id === box.id
        );

      currentProductBoxNumber =
        currentBoxIndex >= 0
          ? currentBoxIndex + 1
          : 1;

      productBoxTotal =
        Math.max(
          totalBoxes,
          1
        );
    }

    const productBoxCount =
      `${currentProductBoxNumber} of ${productBoxTotal}`;

    /*
    |--------------------------------------------------------------------------
    | 12. Package / product derived values
    |--------------------------------------------------------------------------
    */

    const packageDate =
      formatReportDate(
        box.packed_at ||
        box.created_date
      );

    const packageSize =
      getPackageSizeText(
        items
      );

    const productName =
      resolveProductName(
        items
      );

    const floorName =
      findBoxInfoValue(
        boxInfoValues,
        [
          "floor",
          "floor_name",
          "floor name",
        ]
      ) || "-";

    const itemNo =
      Array.from(
        new Set(
          items
            .map((item) =>
              String(item.material_details || "").trim()
            )
            .filter(Boolean)
        )
      ).join(", ") || "-";

    /*
    |--------------------------------------------------------------------------
    | 13. QR code
    |--------------------------------------------------------------------------
    */

    const qrValue =
      `vendor:${vendor_id},project:${project_id},box:${box_id}`;

    const qrImage =
      await QRCode.toDataURL(
        qrValue,
        {
          width: 400,
          margin: 1,
          errorCorrectionLevel: "M",

          color: {
            dark: "#000000",
            light: "#FFFFFF",
          },
        }
      );

    /*
    |--------------------------------------------------------------------------
    | 14. Vendor logo
    |--------------------------------------------------------------------------
    */

    const packageNo = String(box.box_name || "").trim();

    const packageNoClass =
      packageNo.length >= 4
        ? "package-number package-number-4"
        : packageNo.length === 3
          ? "package-number package-number-3"
          : "package-number";

    const logoHtml =
      embeddedLogoUrl || logoUrl
        ? `
          <img
            src="${embeddedLogoUrl || logoUrl}"
            class="logo-img"
            alt="Adarsh Logo"
          />
        `
        : `
          <div class="fallback-logo-text">
            adarsh
          </div>
        `;

    /*
    |--------------------------------------------------------------------------
    | 15. Component rows
    |--------------------------------------------------------------------------
    */

    const componentRows =
      items
        .map(
          (
            item
          ) => `
            <tr>
              <td class="code-cell">
                ${escapeHtml(
            item.unique_code ||
            "-"
          )}
              </td>

              <td class="component-cell">
                <strong>
                  ${escapeHtml(
            item.item_name ||
            "-"
          )}
                </strong>

                <span>
                  ${escapeHtml(
            getItemSizeText(
              item
            )
          )}
                </span>
              </td>

              <td class="qty-cell">
                ${formatQuantity(
            item.quantity
          )}
              </td>

              <td class="unit-cell">
                ${item.unit_weight.toFixed(
            2
          )}
              </td>

              <td class="total-cell">
                ${item.total_weight.toFixed(
            2
          )}
              </td>
            </tr>
          `
        )
        .join("");

    /*
    |--------------------------------------------------------------------------
    | 16. HTML
    |--------------------------------------------------------------------------
    */

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>



<style>
@font-face {
  font-family: "CalibriPdf";
  src: url("data:font/truetype;base64,${calibriRegular}") format("truetype");
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: "CalibriPdf";
  src: url("data:font/truetype;base64,${calibriBold}") format("truetype");
  font-weight: 700;
  font-style: normal;
}

@font-face {
  font-family: "CalibriPdf";
  src: url("data:font/truetype;base64,${calibriItalic}") format("truetype");
  font-weight: 400;
  font-style: italic;
}

@font-face {
  font-family: "CalibriPdf";
  src: url("data:font/truetype;base64,${calibriBoldItalic}") format("truetype");
  font-weight: 700;
  font-style: italic;
}
@page {  
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
  min-height: 0;
  height: auto;
  margin: 0;
  padding: 0;
  overflow: visible;
}

body {
  color: #111827;
  background: #ffffff;
 font-family: "CalibriPdf", Arial, Helvetica, sans-serif;
  font-size: 7px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 3in;
  height: 100%;
  padding: 1.4mm;
  overflow: hidden;
  page-break-after: always;
  background: #ffffff;
}

.page:last-child {
  page-break-after: auto;
}

/*
|--------------------------------------------------------------------------
| Sticker container - 3 inch x 5 inch
|--------------------------------------------------------------------------
*/

.sticker {
  width: 100%;
  height: 100%;
  border: 1px solid #4b5563;
  padding: 0 1.4mm 1.2mm;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/*
|--------------------------------------------------------------------------
| Header - user provided table format
|--------------------------------------------------------------------------
*/

.label-header {
  width: calc(100% + 6.8mm);
  margin-left: -3.4mm;
  margin-right: -3.4mm;
  min-height: 0.75in;
  border-collapse: collapse;
  table-layout: fixed;
  background: #ffffff;
  flex: 0 0 auto;
}

.label-header td {
  padding: 0;
}

.left-area {
  width: 70%;
}

.right-area {
  width: 30%;
  text-align: center;
  vertical-align: top;
}

.logo-cell {
  height: 20px;
  text-align: center;
  vertical-align: middle !important;
  border-bottom: none !important;
}

.logo-img {
  width: 150px;
  height: auto;
  display: inline-block;
  vertical-align: middle;
}

.fallback-logo-text {
  display: inline-block;
  color: #f58220;
  font-size: 28px;
  line-height: 28px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: -1px;
}

.tagline-cell {
  height: 16px;
  text-align: center;
  vertical-align: middle !important;
  border-top: none !important;
}

.tagline {
  font-size: 7px;
  line-height: 8px;
  font-weight: 800;
  font-style: italic;
  color: #101a4c;
  display: block;
  margin-top: -2px;
}

.company-cell {
  height: 0;
  text-align: center;
}


.company-name {
  font-size: 12px;
  line-height: 15px;
  font-weight: 700;
  color: #172033;
  text-transform: uppercase;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.address-cell,
.contact-cell {
  height: 30px;
  padding: 3px 4px !important;
  vertical-align: top !important;
}

.address-cell {
  width: 45%;
}

.contact-cell {
  width: 55%;
}

.contact-text {
font-family: "CalibriPdf", Arial, Helvetica, sans-serif;
  display: block;
  font-size: 6pt;
  line-height: 7pt;
  font-weight: 500;
  color: #667085;
  white-space: nowrap;
}

.address-text,
.gst-text {
  font-family: "CalibriPdf", Arial, Helvetica, sans-serif;
  font-size: 6pt;
  line-height: 7pt;
  font-weight: 500;
  font-style: normal;
  color: #667085;
}



.email-link {
  color: #173f9f;
  text-decoration: underline;
  font-weight: 800;
}

.package-label-cell {
  height: 24px;
  text-align: center;
  vertical-align: middle !important;
}

.package-label {
  font-size: 9px;
  line-height: 10px;
  font-weight: 700;
  color: #231f20;
  white-space: nowrap;
}

.qr-box {
padding-top:20px;
  width: 100%;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-img {
  width: 50px;
  height: 50px;
  object-fit: contain;
  display: block;
}

.package-number-box {
padding-top:25px;
  width: 100%;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  // padding: 0 2px;
  overflow: visible;
}

.package-number {
  display: block;
  max-width: 100%;
  font-size: 46px;
  line-height: 1;
  font-weight: 700;
  color: #231f20;
  letter-spacing: -2px;
  text-align: center;
  white-space: nowrap;
  font-family: "CalibriPdf", Arial, Helvetica, sans-serif;
}

/* for 3 digit package no */
.package-number-3 {
  font-size: 40px;
  letter-spacing: -2px;
}

/* for 4 digit package no */
.package-number-4 {
  font-size: 32px;
  letter-spacing: -1.5px;
}

/*
|--------------------------------------------------------------------------
| Information rows - CDR final
|--------------------------------------------------------------------------
*/

.info-row {
  display: grid;
  gap: 1.3mm;
  padding: 0.45mm 0;
  flex: 0 0 auto;
}

.row-2col {
  grid-template-columns: 62% 38%;
}

.row-3col {
  grid-template-columns: 30% 40% 30%;
}

.info-cell {
  min-width: 0;
}

.align-right {
  text-align: right;
  padding-right:5px;
}

.field-label {
  color: #64748b;
  font-size: 7.5pt;
  line-height: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05px;
  margin-bottom: 0.8mm;
}

.field-value {
  color: #111827;
  font-size: 8px !important;
  line-height: 8px;
  font-weight: 800;
  overflow-wrap: anywhere;
   margin-bottom: 0.5mm;
}

.filed-value-item-no{
font-size: 18px !important;
line-height: 12px;
}

.section-separator {
  height: 1px;
  background: #4b5563;
  margin: 1.1mm 0 1mm;
  flex: 0 0 auto;
}

/*
|--------------------------------------------------------------------------
| Product title
|--------------------------------------------------------------------------
*/

.product-title {
  color: #64748b;
  font-size: 7.5pt;
  line-height: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05px;
  margin: 0 0 1.1mm;
  flex: 0 0 auto;
}

.project-value{
color: #111827;
  font-size: 12pt;
  line-height: 6px;
  font-weight: 600;
  overflow-wrap: anywhere;
   margin-bottom: 0.5mm;
   text-transform: uppercase;
}




/*
|--------------------------------------------------------------------------
| Components table - CDR final
|--------------------------------------------------------------------------
*/

.component-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid #111827 !important;
  flex: 0 0 auto;
}

.col-code {
  width: 10%;
}

.col-component {
  width: 55%;
}

.col-qty {
  width: 9%;
}

.col-unit {
  width: 12%;
}

.col-total {
  width: 14%;
}

.component-table th {
  background: #ffffff;
  color: #111827;
  border: 1px solid #111827;
  font-size: 4.7px;
  line-height: 5.3px;
  font-weight: 800;
  text-align: center;
  vertical-align: middle;
  padding: 0.9mm 0.45mm;
}

.component-table .table-head-main th {
  height: 3mm;
  border-bottom: 1px solid #374151;
}



.component-table .table-head-sub th {
  height: 4mm;
  font-size: 4.5px;
  line-height: 5px;
}

.blank-head {
  background: #111827;
  color: transparent;
}

.component-table td {
  color: #111827;
  border-left: 1px solid #111827;
  border-right: 1px solid #111827;
  border-bottom: 1px solid #111827;
  font-size: 5.3px;
  line-height: 6.1px;
  font-weight: 600;
  padding: 0.85mm 0.65mm;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.component-table tbody tr:nth-child(odd) {
  background: #fff;
}

.component-table tbody tr:nth-child(even) {
  background: #fff;
}

.code-cell {
  text-align: center;  
  color: #111827;
  font-size: 8px !important;
  line-height: 6.1px;
  font-weight: 800;
}





.component-cell strong {
  display: block;
  color: #111827;
  font-size: 8px !important;
  line-height: 6.1px;
  font-weight: 800;
}

.component-cell span {
  display: block;
  margin-top: 1mm;
  color: #111827;
  font-size: 8px !important;
  line-height: 5.7px;
  font-weight: 800;
}

.qty-cell,
.unit-cell,
.total-cell {
  text-align: center;
  font-weight: 800;
  color: #111827;
  font-size: 8px !important;
  border-left: 1px solid #111827 !important;
  border-right: 1px solid #111827 !important;
  border-bottom: 1px solid #111827;
}

.component-table tfoot td {
  background: #fff;
  border: 1px solid #111827;
  font-size: 8px !important;
  line-height: 5.8px;
  font-weight: 800;
  padding: 1mm 0.65mm;
}

.total-title {
  text-align: left;
}

.empty-row {
  text-align: center;
  padding: 4mm 1mm !important;
  font-weight: 800;
}

/*
|--------------------------------------------------------------------------
| Summary page - 3 inch x 5 inch
|--------------------------------------------------------------------------
*/

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  min-height: 15mm;
  padding-bottom: 2mm;
  border-bottom: 1px solid #172033;
}

.summary-logo-wrap {
  max-width: 45%;
}

.summary-company-info {
  color: #667085;
  font-size: 5px;
  line-height: 1.35;
  text-align: right;
}

.summary-company-name {
  color: #172033;
  font-size: 6.2px;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 0.8mm;
}

.summary-project-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 13mm;
  padding: 2mm 0;
  border-bottom: 1px solid #d9dee7;
}

.summary-title {
  max-width: 42mm;
  overflow: hidden;
  color: #111827;
  font-size: 8px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.summary-subtitle {
  margin-top: 0.6mm;
  color: #667085;
  font-size: 5.4px;
  font-weight: 600;
}

.summary-client {
  width: 35%;
  color: #667085;
  font-size: 5.3px;
  line-height: 1.25;
  text-align: right;
}

.summary-client strong {
  display: block;
  overflow: hidden;
  color: #111827;
  font-size: 5.8px;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-bottom: 0.4mm;
}

.summary-line {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.6mm;
  padding: 2.2mm 0;
  border-bottom: 1px solid #d9dee7;
}

.summary-line span {
  display: block;
  color: #667085;
  font-size: 4.8px;
  font-weight: 800;
  letter-spacing: 0.1px;
}

.summary-line strong {
  display: block;
  margin-top: 0.5mm;
  color: #111827;
  font-size: 8px;
  font-weight: 700;
}

.summary-address {
  padding: 2mm 0;
  border-bottom: 1px solid #d9dee7;
  color: #111827;
  font-size: 5.2px;
  line-height: 6.2px;
}

.summary-address strong {
  color: #6b7280;
  font-size: 4.8px;
  letter-spacing: 0.1px;
  margin-right: 1mm;
}

.section-title {
  font-size: 6.3px;
  font-weight: 700;
  margin-top: 2mm;
  margin-bottom: 1.2mm;
  letter-spacing: 0.1px;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.summary-table th {
  padding: 1.1mm 0.6mm;
  background: #111827;
  color: #ffffff;
  border: 1px solid #111827;
  font-size: 4.2px;
  line-height: 5px;
  font-weight: 700;
  text-align: left;
  letter-spacing: 0;
}

.summary-table td {
  padding: 1mm 0.6mm;
  border: 1px solid #d1d5db;
  color: #111827;
  font-size: 4.4px;
  line-height: 5.2px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.summary-table tbody tr:nth-child(even) {
  background: #f3f4f6;
}

.summary-table tfoot td {
  background: #b8d7e3;
  border: 1px solid #111827;
  font-weight: 700;
}
  .fs-10{
  font-size:10px !important;
  } 
</style>
</head>

<body>

<section class="page">
  <div class="sticker">

    <!-- ============================== -->
    <!-- TOP HEADER : USER TABLE HTML    -->
    <!-- ============================== -->
    <table class="label-header">
      <colgroup>
        <col class="left-area" />
        <col class="right-area" />
      </colgroup>

      <tr>
        <!-- LEFT SIDE FULL TABLE -->
        <td style="vertical-align: top;padding-top: 10px;  padding-left: 10px;">
          <table style="width:100%; height:100%; border-collapse:collapse; table-layout:fixed;">
            <tr>
              <td colspan="2" class="logo-cell">
                ${logoHtml}
              </td>
            </tr>

            <tr>
              <td colspan="2" class="company-cell">
                <span class="company-name">
                  ${escapeHtml(
      vendor.vendor_name ||
      hardcodedCompany.fallbackName
    )}
                </span>
              </td>
            </tr>

            <tr>
              <td class="address-cell">
                <span class="address-text">
                  ${escapeHtml(
      hardcodedCompany.addressLine1 ?? ""
    )}
                </span>

                <span class="address-text">
                  ${escapeHtml(
      hardcodedCompany.addressLine2 ?? ""
    )}
                </span>

                <span class="address-text">
                  ${escapeHtml(
      hardcodedCompany.addressLine3 ?? ""
    )}
                </span>

                <span class="gst-text">
                  GST: ${escapeHtml(
      hardcodedCompany.gst ?? ""
    )}
                </span>
              </td>

              <td class="contact-cell">
                <span class="contact-text">
                  Toll Free No. :
                  ${escapeHtml(
      hardcodedCompany.tollFreeNo ?? ""
    )}
                </span>

                <span class="contact-text">
                  Email :
                  <span class="email-link">
                    ${escapeHtml(
      hardcodedCompany.email
    )}
                  </span>
                </span>

                <span class="contact-text">
                  Website :
                  ${escapeHtml(
      hardcodedCompany.website ?? ""
    )}
                </span>

                <span style="float: right;" class="package-label">
                  PACKAGE NO.:
                </span>
              </td>
            </tr>
          </table>
        </td>

        <!-- RIGHT SIDE QR + NUMBER -->
        <td class="right-area">
          <div class="qr-box">
            <img
              src="${qrImage}"
              class="qr-img"
              alt="QR Code"
            />
          </div>

          <div class="package-number-box">
            <span class="${packageNoClass}">
  ${escapeHtml(packageNo)}
</span>
          </div>
        </td>
      </tr>
    </table>

    <div class="section-separator"></div>

<!-- ============================== -->
    <!-- CLIENT ROW                     -->
    <!-- ============================== -->
    <div class="info-row row-2col">
      <div class="info-cell">
        <div class="field-label">
          CLIENT NAME
        </div>

        <div class="field-value">
          ${escapeHtml(
      clientName
    )}
        </div>
      </div>

      <div class="info-cell align-right">
        <div class="field-label">
          CONTACT NUMBER
        </div>

        <div class="field-value">
          ${escapeHtml(
      clientContact
    )}
        </div>
      </div>
    </div>

    <!-- ============================== -->
    <!-- ADDRESS + PROJECT              -->
    <!-- ============================== -->
    <div class="info-row row-2col">
      <div class="info-cell">
        <div class="field-label">
          DELIVERY ADDRESS
        </div>

        <div class="field-value">
          ${escapeHtml(
      deliveryAddress
    )}
        </div>
      </div>

      <div class="info-cell align-right">
        <div class="field-label">
          PROJECT NAME
        </div>

        <div class="field-value">
          ${escapeHtml(
      project.project_name
    )}
        </div>
      </div>
    </div>

    <div class="section-separator"></div>

    <!-- ============================== -->
    <!-- PROJECT CODE / SIZE / DATE     -->
    <!-- ============================== -->
    <div class="info-row row-3col">
      <div class="info-cell">
        <div class="field-label">
          PROJECT CODE
        </div>

        <div class="field-value">
          ${escapeHtml(
      orderNumber
    )}
        </div>
      </div>

      <div class="info-cell">
        <div class="field-label">
          PACKAGE SIZE
        </div>

        <div class="field-value">
          ${escapeHtml(
      packageSize
    )}
        </div>
      </div>

      <div class="info-cell">
        <div class="field-label">
          PACKAGE DATE
        </div>

        <div class="field-value">
          ${packageDate}
        </div>
      </div>
    </div>

    <!-- ============================== -->
    <!-- FLOOR / BOX COUNT / ITEM NO    -->
    <!-- ============================== -->
    <div class="info-row row-3col">
      <div class="info-cell">
        <div class="field-label">
          FLOOR
        </div>

        <div class="field-value">
          ${escapeHtml(
      floorName
    )}
        </div>
      </div>

      <div class="info-cell">
        <div class="field-label">
          PRODUCT BOX COUNT
        </div>

        <div class="field-value">
          ${escapeHtml(
      productBoxCount
    )}
        </div>
      </div>

      <div class="info-cell">
        <div class="field-label">
          ITEM NO.
        </div>

        <div class="field-value filed-value-item-no">
          ${escapeHtml(
      itemNo
    )}
        </div>
      </div>
    </div>

    <div class="section-separator"></div>

    <!-- ============================== -->
    <!-- PRODUCT TITLE                  -->
    <!-- ============================== -->
    <div class="field-label" style='padding-top:3px;padding-bottom:3px;'>
      PRODUCT :
      <span class="project-value">
      ${escapeHtml(
      productName
    )}
    </span>
    </div>

    <!-- ============================== -->
    <!-- COMPONENTS TABLE               -->
    <!-- ============================== -->
    <table class="component-table" style="border: 1px solid #000 !important;">
      <colgroup>
        <col class="col-code" />
        <col class="col-component" />
        <col class="col-qty" />
        <col class="col-unit" />
        <col class="col-total" />
      </colgroup>

      <thead>
        <tr class="table-head-main">
          <th class="blank-head"></th>

          <th class="component-head fs-10" >
            COMPONENTS
          </th>

          <th class="blank-head"></th>

          <th
            colspan="2"
            class="weight-head fs-10"
            style="font-size:10px;"
          >
            WEIGHT (KG)
          </th>
        </tr>

        <tr class="table-head-sub">
          <th class="code-head fs-10">
            CODE
          </th>

          <th class="name-head fs-10" >
            NAME
          </th>

          <th class="qty-head fs-10" >
            QTY
          </th>

          <th class="unit-head fs-10">
            UNIT
          </th>

          <th class="total-head fs-10" >
            TOTAL
          </th>
        </tr>
      </thead>

      <tbody  >
        ${componentRows ||
      `
            <tr>
              <td
                colspan="5"
                class="empty-row"
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
            class="total-title"
          >
            TOTAL PACKAGE QUANTITY / WEIGHT
          </td>

          <td class="qty-cell">
            ${formatQuantity(
        totalQuantity
      )}
          </td>

          <td class="unit-cell">
            -
          </td>

          <td class="total-cell">
            ${totalWeight.toFixed(
        2
      )}KG
          </td>
        </tr>
      </tfoot>
    </table>

  </div>
</section>

</body>
</html>
`;

    /*
    |--------------------------------------------------------------------------
    | 17. Prepare printable HTML
    |--------------------------------------------------------------------------
    | Backend cannot open the printer directly. This returns print_html.
    | Open this HTML in a new browser window/tab; the script will trigger
    | the browser print dialog automatically.
    */

    const printHtml = html.replace(
      "</body>",
      `
<script>
(function () {
  function startPrint() {
    window.focus();

    setTimeout(function () {
      window.print();
    }, 300);
  }

  if (document.readyState === "complete") {
    startPrint();
  } else {
    window.addEventListener("load", startPrint);
  }
})();
</script>
</body>`
    );

    return validationResponse(
      1,
      "Box print generated successfully",
      {
        print_html:
          printHtml,

        box_id:
          box.id,

        packing_type:
          project.packing_type,

        product_box_count:
          productBoxCount,

        group_name:
          currentBoxGroupName,

        total_quantity:
          totalQuantity,

        total_weight:
          Number(
            totalWeight.toFixed(
              2
            )
          ),

        box_info_values:
          boxInfoValues,
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
      "Failed to generate box print"
    );
  }
};






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
          ? `${lead.firstname || ""} ${lead.lastname || ""
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
                `${boxIndex +
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
                        ${index +
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
                        ${item.quantity
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

                      more item${hiddenItemsCount >
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


                        ${box.details
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
                    ${box.items.length
              }

                    products

                    ·

                    ${box.total_quantity
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

                    ${itemRows ||
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
                        ${box.total_quantity
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
    3in 5in;

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
    5in;

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
          "5in",

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



export const generateProjectFullReportService = async (
  project_id: number,
  vendor_id: number
) => {



  const calibriRegularPath = path.resolve(
    __dirname,
    "../../../assets/fonts/calibri/calibri-regular.ttf"
  );

  const calibriBoldPath = path.resolve(
    __dirname,
    "../../../assets/fonts/calibri/calibri-bold.ttf"
  );

  const calibriItalicPath = path.resolve(
    __dirname,
    "../../../assets/fonts/calibri/calibri-italic.ttf"
  );

  const calibriBoldItalicPath = path.resolve(
    __dirname,
    "../../../assets/fonts/calibri/calibri-bold-italic.ttf"
  );

  console.log("Calibri font path:", calibriRegularPath);

  const calibriRegular = fontToBase64(calibriRegularPath);

  const calibriBold = fontToBase64(
    calibriBoldPath
  );

  const calibriItalic = fontToBase64(
    calibriItalicPath
  );

  const calibriBoldItalic = fontToBase64(
    calibriBoldItalicPath
  );


  const tempDir = path.join(
    process.cwd(),
    "tmp"
  );

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, {
      recursive: true,
    });
  }

  let tempFilePath: string | null = null;



  const toNumber = (
    value: any
  ) => {
    const numberValue = Number(
      String(value ?? "")
        .replace(/[^0-9.]/g, "")
    );

    return Number.isFinite(numberValue)
      ? numberValue
      : 0;
  };

  const formatDimension = (
    value: any
  ) => {
    const numberValue = toNumber(value);

    if (!numberValue) {
      return "0";
    }

    return Number.isInteger(numberValue)
      ? String(numberValue)
      : numberValue.toFixed(2);
  };

  const formatQuantity = (
    value: number
  ) => {
    return String(value || 0).padStart(
      2,
      "0"
    );
  };

  const getItemSizeText = (
    item: {
      length?: any;
      width?: any;
      thickness?: any;
    }
  ) => {
    const length = toNumber(item.length);
    const width = toNumber(item.width);

    if (!length || !width) {
      return "2400 x 1200 mm";
    }

    return `${formatDimension(length)} x ${formatDimension(width)} mm`;
  };

  const getPackageSizeText = (
    items: {
      length?: any;
      width?: any;
    }[]
  ) => {
    const maxLength =
      Math.max(
        0,
        ...items.map((item) =>
          toNumber(item.length)
        )
      );

    const maxWidth =
      Math.max(
        0,
        ...items.map((item) =>
          toNumber(item.width)
        )
      );

    if (!maxLength || !maxWidth) {
      return "2400 x 1200 mm";
    }

    return `${formatDimension(maxLength)} x ${formatDimension(maxWidth)} mm`;
  };

  const findBoxInfoValue = (
    values: {
      field_label: string;
      field_key: string;
      field_value: string;
    }[],
    keywords: string[]
  ) => {
    const normalizedKeywords =
      keywords.map((keyword) =>
        keyword.toLowerCase()
      );

    const matchedValue =
      values.find((item) => {
        const label =
          String(item.field_label || "")
            .toLowerCase();

        const key =
          String(item.field_key || "")
            .toLowerCase();

        return normalizedKeywords.some(
          (keyword) =>
            label.includes(keyword) ||
            key.includes(keyword)
        );
      });

    return matchedValue
      ?.field_value
      ?.trim() || "";
  };

  const resolveProductName = (
    items: {
      category_name?: string | null;
      group_name?: string | null;
      item_name?: string | null;
    }[]
  ) => {
    const firstItem =
      items.find(Boolean);

    return (
      firstItem?.category_name ||
      firstItem?.group_name ||
      firstItem?.item_name ||
      "ELICIT LINEAR WORKSTATION"
    );
  };

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
          packing_type: true,
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
          gst_no: true,
          toll_free_no: true,
          website_link: true,
          tag_line: true,
          address: true,
          pincode: true,
          city: true,
          state: {
            select: {
              id: true,
              name: true,
            },
          },

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

    const hardcodedCompany = {
      tollFreeNo: vendor.toll_free_no,
      email: vendor.primary_contact_email,
      website: vendor.website_link,
      addressLine1: vendor.address,
      addressLine2: vendor.city,
      addressLine3: vendor.pincode + ' ' + vendor.state?.name,
      gst: vendor.gst_no,
      tagline: vendor.tag_line,
      fallbackName: vendor.vendor_name
    };

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
          ? `${lead.firstname || ""} ${lead.lastname || ""
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
    | 5. Fetch boxes
    |--------------------------------------------------------------------------
    */

    const boxes =
      await prisma.boxMaster.findMany({
        where: {
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

          box_info_values: {
            select: {
              id: true,
              field_id: true,
              field_value: true,

              field: {
                select: {
                  id: true,
                  field_label: true,
                  field_key: true,
                  field_type: true,
                  is_required: true,
                  sort_order: true,
                  active: true,
                },
              },
            },
          },
        },

        orderBy: {
          created_date: "asc",
        },
      });

    if (boxes.length === 0) {
      return validationResponse(
        0,
        "No boxes found"
      );
    }

    const totalBoxes =
      boxes.length;

    /*
    |--------------------------------------------------------------------------
    | 6. Fetch products for every box
    |--------------------------------------------------------------------------
    */

    const rawBoxesWithItems =
      await Promise.all(
        boxes.map(
          async (
            box
          ) => {
            const mappings =
              await prisma.cutListMachineMapping.findMany({
                where: {
                  box_id: box.id,
                  project_id,
                  vendor_id,
                  machine_id: packagingMachine.id,
                  expected_in: true,
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
                      material_details: true,
                      weight: true,
                      qty: true,
                      length: true,
                      width: true,
                      thickness: true,
                    },
                  },
                },

                orderBy: {
                  created_at: "asc",
                },
              });

            const itemMap =
              new Map<
                number,
                {
                  id: number;
                  item_name: string;
                  category_name: string | null;
                  group_name: string | null;
                  unique_code: string | null;
                  material_details: string | null;
                  length: any;
                  width: any;
                  thickness: any;
                  unit_weight: number;
                  quantity: number;
                  total_weight: number;
                }
              >();

            for (const mapping of mappings) {
              const cutList =
                mapping.cut_list;

              if (!cutList) {
                continue;
              }

              const cutListWeight =
                Number(
                  cutList.weight ||
                  0
                );

              const cutListQuantity =
                Number(
                  cutList.qty ||
                  0
                );

              const unitWeight =
                cutListQuantity > 0
                  ? cutListWeight /
                    cutListQuantity
                  : 0;

              const existingItem =
                itemMap.get(
                  cutList.id
                );

              if (existingItem) {
                existingItem.quantity += 1;
                existingItem.total_weight =
                  unitWeight *
                  existingItem.quantity;
              } else {
                itemMap.set(
                  cutList.id,
                  {
                    id: cutList.id,
                    item_name: cutList.item_name,
                    category_name: cutList.category_name,
                    group_name: cutList.group_name,
                    unique_code: cutList.unique_code,
                    material_details: cutList.material_details,
                    length: cutList.length,
                    width: cutList.width,
                    thickness: cutList.thickness,
                    unit_weight: unitWeight,
                    quantity: 1,
                    total_weight: unitWeight,
                  }
                );
              }
            }

            const items =
              Array.from(
                itemMap.values()
              ).map((item) => ({
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
              }));

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

            const groupedItem =
              items.find((item) =>
                Boolean(
                  item.group_name
                    ?.trim()
                )
              );

            const boxGroupName =
              groupedItem
                ?.group_name
                ?.trim() ||
              null;

            const boxInfoValues =
              box.box_info_values
                .filter(
                  (item) =>
                    item.field &&
                    item.field.active
                )
                .sort(
                  (
                    a,
                    b
                  ) =>
                    Number(
                      a.field.sort_order ||
                      0
                    ) -
                    Number(
                      b.field.sort_order ||
                      0
                    )
                )
                .map((item) => ({
                  id: item.id,
                  field_id: item.field_id,
                  field_label: item.field.field_label,
                  field_key: item.field.field_key,
                  field_type: item.field.field_type,
                  is_required: item.field.is_required,
                  sort_order: item.field.sort_order,
                  field_value: item.field_value || "",
                }));

            return {
              ...box,

              items,

              order_no:
                orderNumber,

              packed_by_name:
                box.packedByUser?.user_name ||
                "N/A",

              packet_no:
                box.box_name,

              package_date:
                box.packed_at ||
                box.created_date,

              address:
                clientAddress,

              box_group_name:
                boxGroupName,

              box_info_values:
                boxInfoValues,

              package_size:
                getPackageSizeText(
                  items
                ),

              product_name:
                resolveProductName(
                  items
                ),

              floor_name:
                findBoxInfoValue(
                  boxInfoValues,
                  [
                    "floor",
                    "floor_name",
                    "floor name",
                  ]
                ) || "-",

              item_no:
                Array.from(
                  new Set(
                    items
                      .map((item) =>
                        String(item.material_details || "").trim()
                      )
                      .filter(Boolean)
                  )
                ).join(", ") || "-",

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
    | 7. Calculate PRODUCT BOX COUNT
    |--------------------------------------------------------------------------
    */

    const boxesWithItems =
      (() => {
        if (
          project.packing_type !==
          PackingType.GROUPWISE
        ) {
          return rawBoxesWithItems.map(
            (
              box,
              index
            ) => ({
              ...box,

              product_box_count:
                `${index + 1} of ${totalBoxes}`,
            })
          );
        }

        const getGroupKey =
          (
            box:
              (
                typeof rawBoxesWithItems
              )[number]
          ) => {
            const groupName =
              box.box_group_name
                ?.trim()
                .toLowerCase();

            if (!groupName) {
              return `__ungrouped_box_${box.id}`;
            }

            return groupName;
          };

        const groupTotalMap =
          new Map<
            string,
            number
          >();

        for (const box of rawBoxesWithItems) {
          const groupKey =
            getGroupKey(
              box
            );

          groupTotalMap.set(
            groupKey,
            (
              groupTotalMap.get(
                groupKey
              ) || 0
            ) + 1
          );
        }

        const groupCurrentMap =
          new Map<
            string,
            number
          >();

        return rawBoxesWithItems.map(
          (
            box
          ) => {
            const groupKey =
              getGroupKey(
                box
              );

            const currentNumber =
              (
                groupCurrentMap.get(
                  groupKey
                ) || 0
              ) + 1;

            groupCurrentMap.set(
              groupKey,
              currentNumber
            );

            const groupTotal =
              groupTotalMap.get(
                groupKey
              ) || 1;

            return {
              ...box,

              product_box_count:
                `${currentNumber} of ${groupTotal}`,
            };
          }
        );
      })();

    /*
    |--------------------------------------------------------------------------
    | 8. Project totals
    |--------------------------------------------------------------------------
    */

    const packedBoxes =
      boxes.filter(
        (box) =>
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
    | 9. Logo HTML
    |--------------------------------------------------------------------------
    */



    const logoHtml =
      logoUrl
        ? `
          <img
            src="${logoUrl}"
            class="logo-img"
            alt="Adarsh Logo"
          />
        `
        : `
          <div class="fallback-logo-text">
            adarsh
          </div>
        `;

    /*
    |--------------------------------------------------------------------------
    | 10. Summary page
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
              <td>${index + 1}</td>

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

              <td>${box.items.length}</td>

              <td>${box.total_quantity}</td>

              <td>
                ${box.total_weight.toFixed(
            2
          )} kg
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

    const summaryPage = `
      <section class="page summary-page">
        <div class="summary-header">
          <div class="summary-logo-wrap">
            ${logoHtml}
          </div>

          <div class="summary-company-info">
            <div class="summary-company-name">
              ${escapeHtml(
      vendor.vendor_name ||
      hardcodedCompany.fallbackName
    )}
            </div>

            <div>
              ${escapeHtml(
      hardcodedCompany.addressLine1 ?? ""
    )}
              ${escapeHtml(
      hardcodedCompany.addressLine2 ?? ""
    )}
            </div>

            <div>
              ${escapeHtml(
      hardcodedCompany.addressLine3 ?? ""
    )}
            </div>

            <div>
              GST:
              ${escapeHtml(
      hardcodedCompany.gst ?? ""
    )}
            </div>
          </div>
        </div>

        <div class="summary-project-heading">
          <div>
            <div class="summary-title">
              ${escapeHtml(
      project.project_name
    )}
            </div>

            <div class="summary-subtitle">
              Order Number:
              ${escapeHtml(
      orderNumber
    )}
            </div>
          </div>

          <div class="summary-client">
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

        <div class="summary-line">
          <div>
            <span>BOXES</span>
            <strong>${packedBoxes}</strong>
          </div>

          <div>
            <span>PRODUCTS</span>
            <strong>${totalProducts}</strong>
          </div>

          <div>
            <span>TOTAL QTY</span>
            <strong>${totalQuantity}</strong>
          </div>

          <div>
            <span>TOTAL WEIGHT</span>

            <strong>
              ${totalWeight.toFixed(
      2
    )} kg
            </strong>
          </div>
        </div>

        <div class="summary-address">
          <strong>DELIVERY ADDRESS:</strong>

          ${escapeHtml(
      clientAddress
    )}
        </div>

        <h3 class="section-title">
          BOX OVERVIEW
        </h3>

        <table class="summary-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Packet</th>
              <th>Packed By</th>
              <th>Date</th>
              <th>Count</th>
              <th>Products</th>
              <th>Qty</th>
              <th>Weight</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${summaryRows}
          </tbody>

          <tfoot>
            <tr>
              <td colspan="5">TOTAL</td>
              <td>${totalProducts}</td>
              <td>${totalQuantity}</td>

              <td>
                ${totalWeight.toFixed(
      2
    )} kg
              </td>

              <td>${packedBoxes}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    `;

    /*
    |--------------------------------------------------------------------------
    | 11. Sticker pages
    |--------------------------------------------------------------------------
    */

    const stickerPagesArray =
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
                  width: 400,
                  margin: 1,
                  errorCorrectionLevel: "M",

                  color: {
                    dark: "#000000",
                    light: "#FFFFFF",
                  },
                }
              );

            const packageNo = String(box.packet_no || "").trim();

            const packageNoClass =
              packageNo.length >= 4
                ? "package-number package-number-4"
                : packageNo.length === 3
                  ? "package-number package-number-3"
                  : "package-number";

            const componentRows =
              box.items
                .map(
                  (
                    item
                  ) => `
                    <tr>
                      <td class="code-cell">
                        ${escapeHtml(
                    item.unique_code ||
                    "-"
                  )}
                      </td>

                      <td class="component-cell">
                        <strong>
                          ${escapeHtml(
                    item.item_name ||
                    "-"
                  )}
                        </strong>

                        <span>
                          ${escapeHtml(
                    getItemSizeText(
                      item
                    )
                  )}
                        </span>
                      </td>

                      <td class="qty-cell">
                        ${formatQuantity(
                    item.quantity
                  )}
                      </td>

                      <td class="unit-cell">
                        ${item.unit_weight.toFixed(
                    2
                  )}
                      </td>

                      <td class="total-cell">
                        ${item.total_weight.toFixed(
                    2
                  )}
                      </td>
                    </tr>
                  `
                )
                .join("");

            return `
              <section class="page sticker-page">
                <div class="sticker">

                  <!-- ============================== -->
                  <!-- TOP HEADER : USER TABLE HTML    -->
    <!-- ============================== -->
    <table class="label-header">
      <colgroup>
        <col class="left-area" />
        <col class="right-area" />
      </colgroup>

      <tr>
        <!-- LEFT SIDE FULL TABLE -->
        <td style="vertical-align: top;padding-top: 10px;  padding-left: 10px;">
          <table style="width:100%; height:100%; border-collapse:collapse; table-layout:fixed;">
            <tr>
              <td colspan="2" class="logo-cell">
                ${logoHtml}
              </td>
            </tr>

            <tr>
              <td colspan="2" class="company-cell">
                <span class="company-name">
                  ${escapeHtml(
              vendor.vendor_name ||
              hardcodedCompany.fallbackName
            )}
                </span>
              </td>
            </tr>

            <tr>
              <td class="address-cell">
                <span class="address-text">
                  ${escapeHtml(
              hardcodedCompany.addressLine1 ?? ""
            )}
                </span>

                <span class="address-text">
                  ${escapeHtml(
              hardcodedCompany.addressLine2 ?? ""
            )}
                </span>

                <span class="address-text">
                  ${escapeHtml(
              hardcodedCompany.addressLine3 ?? ""
            )}
                </span>

                <span class="gst-text">
                  GST: ${escapeHtml(
              hardcodedCompany.gst ?? ""
            )}
                </span>
              </td>

              <td class="contact-cell">
                <span class="contact-text">
                  Toll Free No. :
                  ${escapeHtml(
              hardcodedCompany.tollFreeNo ?? ""
            )}
                </span>

                <span class="contact-text">
                  Email :
                  <span class="email-link">
                    ${escapeHtml(
              hardcodedCompany.email
            )}
                  </span>
                </span>

                <span class="contact-text">
                  Website :
                  ${escapeHtml(
              hardcodedCompany.website ?? ""
            )}
                </span>

                <span style="float: right;" class="package-label">
                  PACKAGE NO.:
                </span>
              </td>
            </tr>
          </table>
        </td>

        <!-- RIGHT SIDE QR + NUMBER -->
        <td class="right-area">
          <div class="qr-box">
            <img
              src="${qrImage}"
              class="qr-img"
              alt="QR Code"
            />
          </div>

          <div class="package-number-box">
           <span class="${packageNoClass}">
  ${escapeHtml(packageNo)}
</span>
          </div>
        </td>
      </tr>
    </table>

    <div class="section-separator"></div>

<!-- ============================== -->
    <!-- CLIENT ROW                     -->
                  <!-- ============================== -->
                  <div class="info-row row-2col">
                    <div class="info-cell">
                      <div class="field-label">
                        CLIENT NAME
                      </div>

                      <div class="field-value">
                        ${escapeHtml(
              clientName
            )}
                      </div>
                    </div>

                    <div class="info-cell align-right">
                      <div class="field-label">
                        CONTACT NUMBER
                      </div>

                      <div class="field-value">
                        ${escapeHtml(
              clientContact
            )}
                      </div>
                    </div>
                  </div>

                  <!-- ============================== -->
                  <!-- ADDRESS + PROJECT              -->
                  <!-- ============================== -->
                  <div class="info-row row-2col">
                    <div class="info-cell">
                      <div class="field-label">
                        DELIVERY ADDRESS
                      </div>

                      <div class="field-value">
                        ${escapeHtml(
              box.address
            )}
                      </div>
                    </div>

                    <div class="info-cell align-right">
                      <div class="field-label">
                        PROJECT NAME
                      </div>

                      <div class="field-value">
                        ${escapeHtml(
              project.project_name
            )}
                      </div>
                    </div>
                  </div>

                  <div class="section-separator"></div>

                  <!-- ============================== -->
                  <!-- PROJECT CODE / SIZE / DATE     -->
                  <!-- ============================== -->
                  <div class="info-row row-3col">
                    <div class="info-cell">
                      <div class="field-label">
                        PROJECT CODE
                      </div>

                      <div class="field-value">
                        ${escapeHtml(
              box.order_no
            )}
                      </div>
                    </div>

                    <div class="info-cell">
                      <div class="field-label">
                        PACKAGE SIZE
                      </div>

                      <div class="field-value">
                        ${escapeHtml(
              box.package_size
            )}
                      </div>
                    </div>

                    <div class="info-cell">
                      <div class="field-label">
                        PACKAGE DATE
                      </div>

                      <div class="field-value">
                        ${packageDate}
                      </div>
                    </div>
                  </div>

                  <!-- ============================== -->
                  <!-- FLOOR / BOX COUNT / ITEM NO    -->
                  <!-- ============================== -->
                  <div class="info-row row-3col">
                    <div class="info-cell">
                      <div class="field-label">
                        FLOOR
                      </div>

                      <div class="field-value">
                        ${escapeHtml(
              box.floor_name
            )}
                      </div>
                    </div>

                    <div class="info-cell">
                      <div class="field-label">
                        PRODUCT BOX COUNT
                      </div>

                      <div class="field-value">
                        ${escapeHtml(
              box.product_box_count
            )}
                      </div>
                    </div>

                    <div class="info-cell">
                      <div class="field-label">
                        ITEM NO.
                      </div>

                      <div class="field-value filed-value-item-no">
                        ${escapeHtml(
              box.item_no
            )}
                      </div>
                    </div>
                  </div>

                  <div class="section-separator"></div>

                  <!-- ============================== -->
                  <!-- PRODUCT TITLE                  -->
                  <!-- ============================== -->
                  <div class="field-label" style="padding-top:3px;padding-bottom:3px;">
                    PRODUCT :
                    <span class="project-value">
                    ${escapeHtml(
              box.product_name
            )}
                    </span>
                  </div>

                  <!-- ============================== -->
                  <!-- COMPONENTS TABLE               -->
                  <!-- ============================== -->
                  <table class="component-table" style="border: 1px solid #000 !important;">
                    <colgroup>
                      <col class="col-code" />
                      <col class="col-component" />
                      <col class="col-qty" />
                      <col class="col-unit" />
                      <col class="col-total" />
                    </colgroup>

                    <thead>
                      <tr class="table-head-main">
                        <th class="blank-head"></th>

                        <th class="component-head fs-10">
                          COMPONENTS
                        </th>

                        <th class="blank-head"></th>

                        <th
                          colspan="2"
                          class="weight-head fs-10"
                          style="font-size:10px;"
                        >
                          WEIGHT (KG)
                        </th>
                      </tr>

                      <tr class="table-head-sub">
                        <th class="code-head fs-10">
                          CODE
                        </th>

                        <th class="name-head fs-10">
                          NAME
                        </th>

                        <th class="qty-head fs-10">
                          QTY
                        </th>

                        <th class="unit-head fs-10">
                          UNIT
                        </th>

                        <th class="total-head fs-10">
                          TOTAL
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      ${componentRows ||
              `
                          <tr>
                            <td
                              colspan="5"
                              class="empty-row"
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
                          class="total-title"
                        >
                          TOTAL PACKAGE QUANTITY / WEIGHT
                        </td>

                        <td class="qty-cell">
                          ${formatQuantity(
                box.total_quantity
              )}
                        </td>

                        <td class="unit-cell">
                          -
                        </td>

                        <td class="total-cell">
                          ${box.total_weight.toFixed(
                2
              )}KG
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                </div>
              </section>
            `;
          }
        )
      );

    const stickerPages =
      stickerPagesArray.join("");

    /*
    |--------------------------------------------------------------------------
    | 12. Final HTML
    |--------------------------------------------------------------------------
    */

    const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>

<style>
@font-face {
  font-family: "CalibriPdf";
  src: url("data:font/truetype;base64,${calibriRegular}") format("truetype");
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: "CalibriPdf";
  src: url("data:font/truetype;base64,${calibriBold}") format("truetype");
  font-weight: 700;
  font-style: normal;
}

@font-face {
  font-family: "CalibriPdf";
  src: url("data:font/truetype;base64,${calibriItalic}") format("truetype");
  font-weight: 400;
  font-style: italic;
}

@font-face {
  font-family: "CalibriPdf";
  src: url("data:font/truetype;base64,${calibriBoldItalic}") format("truetype");
  font-weight: 700;
  font-style: italic;
}
@page {
  size: 3in 5in;
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
  height: 5in;
  margin: 0;
  padding: 0;
}

body {
  color: #111827;
  background: #ffffff;
 font-family: "CalibriPdf", Arial, Helvetica, sans-serif;
  font-size: 7px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 3in;
  height: 5in;
  padding: 1.4mm;
  overflow: hidden;
  page-break-after: always;
  background: #ffffff;
}

.page:last-child {
  page-break-after: auto;
}

.summary-page {
  height: 100%;
}

/*
|--------------------------------------------------------------------------
| Sticker container - 3 inch x 5 inch
|--------------------------------------------------------------------------
*/

.sticker {
  width: 100%;
  height: 100%;
  border: 1px solid #4b5563;
  padding: 0 1.4mm 1.2mm;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/*
|--------------------------------------------------------------------------
| Header - user provided table format
|--------------------------------------------------------------------------
*/


.label-header {
  width: calc(100% + 6.8mm);
  margin-left: -3.4mm;
  margin-right: -3.4mm;
  min-height: 0.75in;
  border-collapse: collapse;
  table-layout: fixed;
  background: #ffffff;
  flex: 0 0 auto;
}

.label-header td {
  padding: 0;
}

.left-area {
  width: 70%;
}

.right-area {
  width: 30%;
  text-align: center;
  vertical-align: top;
}

.logo-cell {
  height: 20px;
  text-align: center;
  vertical-align: middle !important;
  border-bottom: none !important;
}

.logo-img {
  width: 150px;
  height: auto;
  display: inline-block;
  vertical-align: middle;
}

.fallback-logo-text {
  display: inline-block;
  color: #f58220;
  font-size: 28px;
  line-height: 28px;
  font-weight: 700;
  font-style: italic;
  letter-spacing: -1px;
}

.tagline-cell {
  height: 16px;
  text-align: center;
  vertical-align: middle !important;
  border-top: none !important;
}

.tagline {
  font-size: 7px;
  line-height: 8px;
  font-weight: 800;
  font-style: italic;
  color: #101a4c;
  display: block;
  margin-top: -2px;
}

.company-cell {
  height: 0;
  text-align: center;
}


.company-name {
  font-size: 12px;
  line-height: 15px;
  font-weight: 700;
  color: #172033;
  text-transform: uppercase;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.address-cell,
.contact-cell {
  height: 30px;
  padding: 3px 4px !important;
  vertical-align: top !important;
}

.address-cell {
  width: 45%;
}

.contact-cell {
  width: 55%;
}

.contact-text {
font-family: "CalibriPdf", Arial, Helvetica, sans-serif;
  display: block;
  font-size: 6pt;
  line-height: 7pt;
  font-weight: 500;
  color: #667085;
  white-space: nowrap;
}

.address-text,
.gst-text {
  font-family: "CalibriPdf", Arial, Helvetica, sans-serif;
  font-size: 6pt;
  line-height: 7pt;
  font-weight: 500;
  font-style: normal;
  color: #667085;
}



.email-link {
  color: #173f9f;
  text-decoration: underline;
  font-weight: 800;
}

.package-label-cell {
  height: 24px;
  text-align: center;
  vertical-align: middle !important;
}

.package-label {
  font-size: 9px;
  line-height: 10px;
  font-weight: 700;
  color: #231f20;
  white-space: nowrap;
}

.qr-box {
padding-top:20px;
  width: 100%;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qr-img {
  width: 50px;
  height: 50px;
  object-fit: contain;
  display: block;
}

.package-number-box {
padding-top:25px;
  width: 100%;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  // padding: 0 2px;
  overflow: visible;
}

.package-number {
  display: block;
  max-width: 100%;
  font-size: 46px;
  line-height: 1;
  font-weight: 700;
  color: #231f20;
  letter-spacing: -2px;
  text-align: center;
  white-space: nowrap;
  font-family: "CalibriPdf", Arial, Helvetica, sans-serif;
}

/* for 3 digit package no */
.package-number-3 {
  font-size: 40px;
  letter-spacing: -2px;
}

/* for 4 digit package no */
.package-number-4 {
  font-size: 32px;
  letter-spacing: -1.5px;
}

/*
|--------------------------------------------------------------------------
| Information rows - CDR final
|--------------------------------------------------------------------------
*/

.info-row {
  display: grid;
  gap: 1.3mm;
  padding: 0.45mm 0;
  flex: 0 0 auto;
}

.row-2col {
  grid-template-columns: 62% 38%;
}

.row-3col {
  grid-template-columns: 30% 40% 30%;
}

.info-cell {
  min-width: 0;
}

.align-right {
  text-align: right;
  padding-right:5px;
}

.field-label {
  color: #64748b;
  font-size: 7.5pt;
  line-height: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05px;
  margin-bottom: 0.8mm;
}

.field-value {
  color: #111827;
  font-size: 8px !important;
  line-height: 8px;
  font-weight: 800;
  overflow-wrap: anywhere;
   margin-bottom: 0.5mm;
}

.filed-value-item-no {
  font-size: 18px !important;
  line-height: 12px;
}

.section-separator {
  height: 1px;
  background: #4b5563;
  margin: 1.1mm 0 1mm;
  flex: 0 0 auto;
}

/*
|--------------------------------------------------------------------------
| Product title
|--------------------------------------------------------------------------
*/

.product-title {
  color: #64748b;
  font-size: 7.5pt;
  line-height: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05px;
  margin: 0 0 1.1mm;
  flex: 0 0 auto;
}

.project-value{
color: #111827;
  font-size: 12pt;
  line-height: 6px;
  font-weight: 600;
  overflow-wrap: anywhere;
   margin-bottom: 0.5mm;
   text-transform: uppercase;
}


.component-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  border: 1px solid #111827 !important;
  flex: 0 0 auto;
}

.col-code {
  width: 10%;
}

.col-component {
  width: 55%;
}

.col-qty {
  width: 9%;
}

.col-unit {
  width: 12%;
}

.col-total {
  width: 14%;
}

.component-table th {
  background: #ffffff;
  color: #111827;
  border: 1px solid #111827;
  font-size: 4.7px;
  line-height: 5.3px;
  font-weight: 800;
  text-align: center;
  vertical-align: middle;
  padding: 0.9mm 0.45mm;
}

.component-table .table-head-main th {
  height: 3mm;
  border-bottom: 1px solid #374151;
}



.component-table .table-head-sub th {
  height: 4mm;
  font-size: 4.5px;
  line-height: 5px;
}

.blank-head {
  background: #111827;
  color: transparent;
}

.component-table td {
  color: #111827;
  border-left: 1px solid #111827;
  border-right: 1px solid #111827;
  border-bottom: 1px solid #111827;
  font-size: 5.3px;
  line-height: 6.1px;
  font-weight: 600;
  padding: 0.85mm 0.65mm;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.component-table tbody tr:nth-child(odd) {
  background: #fff;
}

.component-table tbody tr:nth-child(even) {
  background: #fff;
}

.code-cell {
  text-align: center;  
  color: #111827;
  font-size: 8px !important;
  line-height: 6.1px;
  font-weight: 800;
}





.component-cell strong {
  display: block;
  color: #111827;
  font-size: 8px !important;
  line-height: 6.1px;
  font-weight: 800;
}

.component-cell span {
  display: block;
  margin-top: 1mm;
  color: #111827;
  font-size: 8px !important;
  line-height: 5.7px;
  font-weight: 800;
}

.qty-cell,
.unit-cell,
.total-cell {
  text-align: center;
  font-weight: 800;
  color: #111827;
  font-size: 8px !important;
  border-left: 1px solid #111827 !important;
  border-right: 1px solid #111827 !important;
  border-bottom: 1px solid #111827;
}

.component-table tfoot td {
  background: #fff;
  border: 1px solid #111827;
  font-size: 8px !important;
  line-height: 5.8px;
  font-weight: 800;
  padding: 1mm 0.65mm;
}

.total-title {
  text-align: left;
}

.empty-row {
  text-align: center;
  padding: 4mm 1mm !important;
  font-weight: 800;
}


/*
|--------------------------------------------------------------------------
| Summary page - 3 inch x 5 inch
|--------------------------------------------------------------------------
*/

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  min-height: 15mm;
  padding-bottom: 2mm;
  border-bottom: 1px solid #172033;
}

.summary-logo-wrap {
  max-width: 45%;
}

.summary-company-info {
  color: #667085;
  font-size: 5px;
  line-height: 1.35;
  text-align: right;
}

.summary-company-name {
  color: #172033;
  font-size: 6.2px;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 0.8mm;
}

.summary-project-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 13mm;
  padding: 2mm 0;
  border-bottom: 1px solid #d9dee7;
}

.summary-title {
  max-width: 42mm;
  overflow: hidden;
  color: #111827;
  font-size: 8px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.summary-subtitle {
  margin-top: 0.6mm;
  color: #667085;
  font-size: 5.4px;
  font-weight: 600;
}

.summary-client {
  width: 35%;
  color: #667085;
  font-size: 5.3px;
  line-height: 1.25;
  text-align: right;
}

.summary-client strong {
  display: block;
  overflow: hidden;
  color: #111827;
  font-size: 5.8px;
  white-space: nowrap;
  text-overflow: ellipsis;
  margin-bottom: 0.4mm;
}

.summary-line {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.6mm;
  padding: 2.2mm 0;
  border-bottom: 1px solid #d9dee7;
}

.summary-line span {
  display: block;
  color: #667085;
  font-size: 4.8px;
  font-weight: 800;
  letter-spacing: 0.1px;
}

.summary-line strong {
  display: block;
  margin-top: 0.5mm;
  color: #111827;
  font-size: 8px;
  font-weight: 700;
}

.summary-address {
  padding: 2mm 0;
  border-bottom: 1px solid #d9dee7;
  color: #111827;
  font-size: 5.2px;
  line-height: 6.2px;
}

.summary-address strong {
  color: #6b7280;
  font-size: 4.8px;
  letter-spacing: 0.1px;
  margin-right: 1mm;
}

.section-title {
  font-size: 6.3px;
  font-weight: 700;
  margin-top: 2mm;
  margin-bottom: 1.2mm;
  letter-spacing: 0.1px;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.summary-table th {
  padding: 1.1mm 0.6mm;
  background: #111827;
  color: #ffffff;
  border: 1px solid #111827;
  font-size: 4.2px;
  line-height: 5px;
  font-weight: 700;
  text-align: left;
  letter-spacing: 0;
}

.summary-table td {
  padding: 1mm 0.6mm;
  border: 1px solid #d1d5db;
  color: #111827;
  font-size: 4.4px;
  line-height: 5.2px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.summary-table tbody tr:nth-child(even) {
  background: #f3f4f6;
}

.summary-table tfoot td {
  background: #b8d7e3;
  border: 1px solid #111827;
  font-weight: 700;
}
  .fs-10{
  font-size:10px !important;
  } 
</style>
</head>

<body>
${summaryPage}
${stickerPages}
</body>
</html>
`;

    /*
    |--------------------------------------------------------------------------
    | 13. Generate PDF
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
        width: "3in",
        height: "5in",
        printBackground: true,
        preferCSSPageSize: true,

        margin: {
          top: "0",
          bottom: "0",
          left: "0",
          right: "0",
        },
      }
    );

    /*
    |--------------------------------------------------------------------------
    | 14. Upload PDF
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

    tempFilePath = null;

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

        packing_type:
          project.packing_type,

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
  } catch (
  error
  ) {
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
  preferCSSPageSize?: boolean;

  margin?: {
    top?: string;

    bottom?: string;

    left?: string;

    right?: string;
  };
};


export const markItemSiteInService_old = async (
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
export const getBoxSiteInStatusService_old = async (
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
  const t0 = Date.now();
  const contentTimeoutMs = 45000;
  const assetWaitTimeoutMs = 15000;
  console.log(`[pdf-timing] launch:start`);

  const browser =
    await puppeteer.launch({
      headless: true,

      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

  console.log(`[pdf-timing] launch:done +${Date.now() - t0}ms`);

  try {
    const page =
      await browser.newPage();

    console.log(`[pdf-timing] newPage:done +${Date.now() - t0}ms`);

    page.on("request", (req) => {
      console.log(
        `[pdf-timing] request-start url=${req.url()} type=${req.resourceType()} +${Date.now() - t0}ms`
      );
    });

    page.on("requestfailed", (req) => {
      console.log(
        `[pdf-timing] requestfailed url=${req.url()} errorText=${req.failure()?.errorText} +${Date.now() - t0}ms`
      );
    });

    page.on("requestfinished", (req) => {
      console.log(
        `[pdf-timing] requestfinished url=${req.url()} +${Date.now() - t0}ms`
      );
    });

    page.on("console", (msg) => {
      console.log(`[pdf-timing] page-console: ${msg.text()}`);
    });

    page.setDefaultNavigationTimeout(contentTimeoutMs);
    page.setDefaultTimeout(contentTimeoutMs);

    await page.setContent(
      html,
      {
        waitUntil:
          "domcontentloaded",
        timeout:
          contentTimeoutMs,
      }
    );

    console.log(`[pdf-timing] setContent:done +${Date.now() - t0}ms`);

    try {
      await page.evaluate(
        async (timeoutMs) => {
          const fonts =
            typeof document.fonts?.ready?.then === "function"
              ? document.fonts.ready.catch(() => undefined)
              : Promise.resolve();

          const images =
            Promise.all(
              Array.from(document.images).map(async (image) => {
                if (image.complete) {
                  return;
                }

                await new Promise<void>((resolve) => {
                  const cleanup = () => {
                    image.removeEventListener("load", onDone);
                    image.removeEventListener("error", onDone);
                  };

                  const onDone = () => {
                    cleanup();
                    resolve();
                  };

                  image.addEventListener("load", onDone, { once: true });
                  image.addEventListener("error", onDone, { once: true });
                });
              })
            );

          await Promise.race([
            Promise.all([fonts, images]),
            new Promise((resolve) => setTimeout(resolve, timeoutMs)),
          ]);
        },
        assetWaitTimeoutMs
      );

      console.log(`[pdf-timing] assets:ready +${Date.now() - t0}ms`);
    } catch (error) {
      console.warn(
        `[pdf-timing] assets:wait-skipped error=${error instanceof Error ? error.message : String(error)} +${Date.now() - t0}ms`
      );
    }

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

    console.log(`[pdf-timing] pdf:done +${Date.now() - t0}ms`);
  } finally {
    await browser.close();
    console.log(`[pdf-timing] browser-closed +${Date.now() - t0}ms`);
  }
};

const fetchImageAsDataUrl = async (
  imageUrl: string,
  timeoutMs: number = 8000
) => {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    timeoutMs
  );

  try {
    const response = await fetch(
      imageUrl,
      {
        signal:
          controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) || "image/png";

    const arrayBuffer =
      await response.arrayBuffer();

    return `data:${contentType};base64,${Buffer.from(
      arrayBuffer
    ).toString("base64")}`;
  } finally {
    clearTimeout(timeout);
  }
};

type BoxInfoValueInput = {
  field_id: number;
  field_value?: string | null;
};

const normalizeValue = (
  value: string | null | undefined
) => {
  const trimmed =
    String(value ?? "").trim();

  return trimmed || null;
};

const getBoxInfoValuesFormatted = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {
  const rows =
    await prisma.boxInfoFieldValue.findMany({
      where: {
        box_id,
        project_id,
        vendor_id,
      },

      include: {
        field: {
          select: {
            id: true,
            field_label: true,
            field_key: true,
            field_type: true,
            is_required: true,
            sort_order: true,
            active: true,
          },
        },
      },
    });

  return rows
    .filter((row) => row.field?.active)
    .sort(
      (a, b) =>
        Number(a.field.sort_order || 0) -
        Number(b.field.sort_order || 0)
    )
    .map((row) => ({
      id: row.id,
      field_id: row.field_id,
      field_label: row.field.field_label,
      field_key: row.field.field_key,
      field_type: row.field.field_type,
      is_required: row.field.is_required,
      sort_order: row.field.sort_order,
      field_value: row.field_value || "",
    }));
};

const saveBoxInfoValuesTx = async ({
  tx,
  box_id,
  project_id,
  vendor_id,
  values,
  user_id,
}: {
  tx: any;
  box_id: number;
  project_id: number;
  vendor_id: number;
  values: BoxInfoValueInput[];
  user_id?: number | null;
}) => {
  const configuredFields =
    await tx.projectBoxInfoField.findMany({
      where: {
        project_id,
        vendor_id,
        active: true,
      },

      orderBy: [
        {
          sort_order: "asc",
        },
        {
          id: "asc",
        },
      ],

      select: {
        id: true,
        field_label: true,
        is_required: true,
      },
    });

  const valueMap =
    new Map<number, string | null>();

  for (const item of values || []) {
    valueMap.set(
      Number(item.field_id),
      normalizeValue(item.field_value)
    );
  }

  for (const field of configuredFields) {
    const value =
      valueMap.get(field.id) || null;

    if (field.is_required && !value) {
      throw new Error(`${field.field_label} is required`);
    }
  }

  for (const field of configuredFields) {
    const value =
      valueMap.get(field.id) || null;

    await tx.boxInfoFieldValue.upsert({
      where: {
        box_id_field_id: {
          box_id,
          field_id: field.id,
        },
      },

      create: {
        box_id,
        project_id,
        vendor_id,
        field_id: field.id,
        field_value: value,
        created_by: user_id || null,
      },

      update: {
        field_value: value,
        updated_by: user_id || null,
      },
    });
  }
};


export const getProjectBoxInfoFieldsService = async (
  project_id: number,
  vendor_id: number
) => {
  const fields =
    await prisma.projectBoxInfoField.findMany({
      where: {
        project_id,
        vendor_id,
        active: true,
      },

      orderBy: [
        {
          sort_order: "asc",
        },
        {
          id: "asc",
        },
      ],

      select: {
        id: true,
        project_id: true,
        vendor_id: true,
        field_label: true,
        field_key: true,
        field_type: true,
        is_required: true,
        sort_order: true,
      },
    });

  return fields;
};

export const getBoxInfoValuesService = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {
  const fields =
    await prisma.projectBoxInfoField.findMany({
      where: {
        project_id,
        vendor_id,
        active: true,
      },

      orderBy: [
        {
          sort_order: "asc",
        },
        {
          id: "asc",
        },
      ],

      include: {
        values: {
          where: {
            box_id,
          },

          select: {
            id: true,
            field_value: true,
          },
        },
      },
    });

  return fields.map((field) => ({
    field_id: field.id,
    field_label: field.field_label,
    field_key: field.field_key,
    field_type: field.field_type,
    is_required: field.is_required,
    sort_order: field.sort_order,
    field_value:
      field.values?.[0]?.field_value || "",
  }));
};


const isManualCreatedMapping = (
  value: string | null | undefined
) => {
  return String(value ?? "")
    .trim()
    .toLowerCase() === "manual";
};

const clampReceivedQty = (
  receivedQty: number | null | undefined,
  packedQty: number
) => {
  const normalizedPackedQty =
    Math.max(
      0,
      Number(packedQty || 0)
    );

  const normalizedReceivedQty =
    Math.max(
      0,
      Number(receivedQty ?? 0)
    );

  return Math.min(
    normalizedReceivedQty,
    normalizedPackedQty
  );
};


export const markItemSiteInService = async (
  unique_code: string,
  box_id: number,
  project_id: number,
  vendor_id: number,
  user_id: number
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Verify box
    |--------------------------------------------------------------------------
    */

    const box =
      await prisma.boxMaster.findFirst({
        where: {
          id: box_id,
          project_id,
          vendor_id,
          is_deleted: false,
          box_status: "packed",
        },

        select: {
          id: true,
          site_in_at: true,
        },
      });

    if (!box) {
      return validationResponse(
        0,
        "Box not found"
      );
    }

    if (!box.site_in_at) {
      return validationResponse(
        0,
        "Box has not been marked as site in yet"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Validate user
    |--------------------------------------------------------------------------
    */

    const user =
      await prisma.userMaster.findFirst({
        where: {
          id: user_id,
          vendor_id,
        },

        select: {
          id: true,
        },
      });

    if (!user) {
      return validationResponse(
        0,
        "Invalid user"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 3. Find CutList item
    |--------------------------------------------------------------------------
    */

    const cutList =
      await prisma.cutList.findFirst({
        where: {
          unique_code,
          project_id,
          vendor_id,
        },

        select: {
          id: true,
          item_name: true,
          unique_code: true,

          include_in_packing: true,
          scan_pack_validate: true,
        },
      });

    if (!cutList) {
      return validationResponse(
        0,
        "Item not found for this QR code"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Manual item must use manual verification screen
    |--------------------------------------------------------------------------
    */

    if (
      cutList.include_in_packing === true &&
      cutList.scan_pack_validate === false
    ) {
      return validationResponse(
        0,
        "This item was packed manually. Use Verify Manual Items."
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 4. Packaging machine
    |--------------------------------------------------------------------------
    */

    const packagingMachine =
      await prisma.machineMaster.findFirst({
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
      });

    if (!packagingMachine) {
      return validationResponse(
        0,
        "Packaging machine not configured"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 5. Find one normal/scanned unit in THIS BOX
    |--------------------------------------------------------------------------
    |
    | Normal scan packing:
    |   one mapping row = one physical unit
    |
    | Manual rows are explicitly excluded.
    |--------------------------------------------------------------------------
    */

    const mapping =
      await prisma.cutListMachineMapping.findFirst({
        where: {
          cut_list_id:
            cutList.id,

          box_id,

          project_id,
          vendor_id,

          machine_id:
            packagingMachine.id,

          expected_in:
            true,

          actual_in_at: {
            not: null,
          },

          site_in_at:
            null,

          OR: [
            {
              row_created_source:
                null,
            },
            {
              row_created_source: {
                not:
                  "Manual",
              },
            },
          ],
        },

        select: {
          id: true,
          box_id: true,
          actual_in_at: true,
          site_in_at: true,
          row_created_source: true,
        },

        orderBy: {
          id: "asc",
        },
      });

    if (!mapping) {
      /*
      |--------------------------------------------------------------------------
      | Distinguish wrong box / not packed / already received
      |--------------------------------------------------------------------------
      */

      const anyInBox =
        await prisma.cutListMachineMapping.findFirst({
          where: {
            cut_list_id:
              cutList.id,

            box_id,

            project_id,
            vendor_id,

            machine_id:
              packagingMachine.id,

            expected_in:
              true,

            OR: [
              {
                row_created_source:
                  null,
              },
              {
                row_created_source: {
                  not:
                    "Manual",
                },
              },
            ],
          },

          select: {
            id: true,
            site_in_at: true,
            actual_in_at: true,
          },

          orderBy: {
            id: "asc",
          },
        });

      if (!anyInBox) {
        return validationResponse(
          0,
          "Item is not packed in this box"
        );
      }

      if (!anyInBox.actual_in_at) {
        return validationResponse(
          0,
          "Item has not been scanned into the box yet"
        );
      }

      return validationResponse(
        0,
        "All units of this item are already marked as received at site"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 6. Mark one scanned unit received
    |--------------------------------------------------------------------------
    */

    const updated =
      await prisma.cutListMachineMapping.update({
        where: {
          id: mapping.id,
        },

        data: {
          site_in_at:
            new Date(),

          site_in_by:
            user_id,
        },

        select: {
          id: true,
          site_in_at: true,
          site_in_by: true,

          cut_list: {
            select: {
              item_name: true,
              unique_code: true,
            },
          },
        },
      });

    /*
    |--------------------------------------------------------------------------
    | Remaining normal scanned units
    |--------------------------------------------------------------------------
    */

    const remaining =
      await prisma.cutListMachineMapping.count({
        where: {
          cut_list_id:
            cutList.id,

          box_id,

          project_id,
          vendor_id,

          machine_id:
            packagingMachine.id,

          expected_in:
            true,

          actual_in_at: {
            not: null,
          },

          site_in_at:
            null,

          OR: [
            {
              row_created_source:
                null,
            },
            {
              row_created_source: {
                not:
                  "Manual",
              },
            },
          ],
        },
      });

    const message =
      remaining > 0
        ? `Item received. ${remaining} more unit${
            remaining > 1
              ? "s"
              : ""
          } of this item pending`
        : "Item marked as received at site";

    return validationResponse(
      1,
      message,
      {
        ...updated,

        remaining_units:
          remaining,
      }
    );
  } catch (error) {
    console.error(
      "Error in markItemSiteInService:",
      error
    );

    return validationResponse(
      0,
      "Failed to mark item as received at site"
    );
  }
};


export const getManualBoxSiteInItemsService = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Box validation
    |--------------------------------------------------------------------------
    */

    const box =
      await prisma.boxMaster.findFirst({
        where: {
          id: box_id,
          project_id,
          vendor_id,
          is_deleted: false,
          box_status: "packed",
        },

        select: {
          id: true,
          box_name: true,
          box_status: true,
          site_in_at: true,
          site_in_by: true,
          factory_out_at: true,
        },
      });

    if (!box) {
      return validationResponse(
        0,
        "Box not found"
      );
    }

    if (!box.site_in_at) {
      return validationResponse(
        0,
        "Box has not been marked as site in yet"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Packaging machine
    |--------------------------------------------------------------------------
    */

    const packagingMachine =
      await prisma.machineMaster.findFirst({
        where: {
          vendor_id,
          machine_type_id: 18,
        },

        select: {
          id: true,
          machine_name: true,
        },

        orderBy: {
          id: "asc",
        },
      });

    if (!packagingMachine) {
      return validationResponse(
        0,
        "Packaging machine not configured"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 3. Fetch manual mappings in this box
    |--------------------------------------------------------------------------
    |
    | Manual mapping can represent multiple physical units:
    |
    |   mapping.qty = 5
    |
    | received_qty is saved against this same row.
    |--------------------------------------------------------------------------
    */

    const mappings =
      await prisma.cutListMachineMapping.findMany({
        where: {
          box_id,
          project_id,
          vendor_id,

          machine_id:
            packagingMachine.id,

          expected_in:
            true,

          actual_in_at: {
            not: null,
          },

          row_created_source:
            "Manual",
        },

        select: {
          id: true,
          cut_list_id: true,

          qty: true,
          received_qty: true,

          weight: true,

          actual_in_at: true,

          site_in_at: true,
          site_in_by: true,

          row_created_source: true,

          cut_list: {
            select: {
              id: true,
              item_name: true,
              description: true,

              unique_code: true,
              unique_code_2: true,

              category_name: true,
              group_name: true,

              length: true,
              width: true,
              thickness: true,

              qty: true,
              weight: true,

              include_in_packing: true,
              scan_pack_validate: true,
            },
          },
        },

        orderBy: {
          id: "asc",
        },
      });

    /*
    |--------------------------------------------------------------------------
    | 4. User names
    |--------------------------------------------------------------------------
    */

    const siteInUserIds = [
      ...new Set(
        mappings
          .map(
            (mapping) =>
              mapping.site_in_by
          )
          .filter(Boolean)
      ),
    ] as number[];

    const users =
      siteInUserIds.length > 0
        ? await prisma.userMaster.findMany({
            where: {
              id: {
                in:
                  siteInUserIds,
              },
            },

            select: {
              id: true,
              user_name: true,
            },
          })
        : [];

    const userMap =
      new Map<number, string>(
        users.map(
          (user) => [
            user.id,
            user.user_name,
          ]
        )
      );

    /*
    |--------------------------------------------------------------------------
    | 5. Format rows
    |--------------------------------------------------------------------------
    */

    const items =
      mappings.map(
        (mapping) => {
          const packedQty =
            Math.max(
              0,
              Number(
                mapping.qty ??
                0
              )
            );

          const receivedQty =
            clampReceivedQty(
              mapping.received_qty,
              packedQty
            );

          const pendingQty =
            Math.max(
              packedQty -
                receivedQty,
              0
            );

          const isVerified =
            mapping.received_qty !==
            null;

          const isFullyReceived =
            packedQty > 0 &&
            receivedQty >=
              packedQty;

          const perItemWeight =
            Number(
              mapping.weight ||
              0
            );

          return {
            mapping_id:
              mapping.id,

            cut_list_id:
              mapping.cut_list_id,

            item_name:
              mapping.cut_list
                .item_name,

            description:
              mapping.cut_list
                .description,

            unique_code:
              mapping.cut_list
                .unique_code,

            unique_code_2:
              mapping.cut_list
                .unique_code_2,

            category_name:
              mapping.cut_list
                .category_name,

            group_name:
              mapping.cut_list
                .group_name,

            length:
              mapping.cut_list
                .length,

            width:
              mapping.cut_list
                .width,

            thickness:
              mapping.cut_list
                .thickness,

            packed_qty:
              packedQty,

            received_qty:
              mapping.received_qty ===
              null
                ? null
                : receivedQty,

            /*
            |--------------------------------------------------------------------------
            | Initial textbox value:
            |
            | Never verified -> packed quantity
            | Already saved  -> saved received quantity
            |--------------------------------------------------------------------------
            */

            suggested_received_qty:
              mapping.received_qty ===
              null
                ? packedQty
                : receivedQty,

            pending_qty:
              pendingQty,

            is_verified:
              isVerified,

            is_fully_received:
              isFullyReceived,

            per_item_weight:
              perItemWeight,

            packed_weight:
              Number(
                (
                  perItemWeight *
                  packedQty
                ).toFixed(4)
              ),

            received_weight:
              Number(
                (
                  perItemWeight *
                  receivedQty
                ).toFixed(4)
              ),

            site_in_at:
              mapping.site_in_at,

            site_in_by:
              mapping.site_in_by,

            site_in_by_name:
              mapping.site_in_by
                ? userMap.get(
                    mapping.site_in_by
                  ) ?? null
                : null,

            row_created_source:
              mapping.row_created_source,
          };
        }
      );

    /*
    |--------------------------------------------------------------------------
    | 6. Summary
    |--------------------------------------------------------------------------
    */

    const totalQty =
      items.reduce(
        (
          sum,
          item
        ) =>
          sum +
          item.packed_qty,
        0
      );

    const receivedQty =
      items.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Number(
            item.received_qty ??
            0
          ),
        0
      );

    const pendingQty =
      Math.max(
        totalQty -
          receivedQty,
        0
      );

    const verifiedRows =
      items.filter(
        (item) =>
          item.is_verified
      ).length;

    const fullyReceivedRows =
      items.filter(
        (item) =>
          item.is_fully_received
      ).length;

    return validationResponse(
      1,
      "Manual box items fetched",
      {
        box,

        summary: {
          total_products:
            items.length,

          total_qty:
            totalQty,

          received_qty:
            receivedQty,

          pending_qty:
            pendingQty,

          verified_products:
            verifiedRows,

          fully_received_products:
            fullyReceivedRows,

          progress_pct:
            totalQty > 0
              ? Math.round(
                  (
                    receivedQty /
                    totalQty
                  ) *
                    100
                )
              : 0,
        },

        items,
      }
    );
  } catch (error) {
    console.error(
      "Error in getManualBoxSiteInItemsService:",
      error
    );

    return validationResponse(
      0,
      "Failed to fetch manual items"
    );
  }
};


export const verifyManualBoxSiteInItemService = async (
  mapping_id: number,
  box_id: number,
  project_id: number,
  vendor_id: number,
  user_id: number,
  received_qty: number
) => {
  try {
    /*
    |--------------------------------------------------------------------------
    | 1. Quantity validation
    |--------------------------------------------------------------------------
    */

    if (
      !Number.isInteger(
        received_qty
      ) ||
      received_qty < 0
    ) {
      return validationResponse(
        0,
        "received_qty must be a whole number greater than or equal to 0"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 2. Box validation
    |--------------------------------------------------------------------------
    */

    const box =
      await prisma.boxMaster.findFirst({
        where: {
          id: box_id,
          project_id,
          vendor_id,
          is_deleted: false,
          box_status: "packed",
        },

        select: {
          id: true,
          box_name: true,
          site_in_at: true,
        },
      });

    if (!box) {
      return validationResponse(
        0,
        "Box not found"
      );
    }

    if (!box.site_in_at) {
      return validationResponse(
        0,
        "Box has not been marked as site in yet"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 3. User validation
    |--------------------------------------------------------------------------
    */

    const user =
      await prisma.userMaster.findFirst({
        where: {
          id: user_id,
          vendor_id,
        },

        select: {
          id: true,
          user_name: true,
        },
      });

    if (!user) {
      return validationResponse(
        0,
        "Invalid user"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 4. Packaging machine
    |--------------------------------------------------------------------------
    */

    const packagingMachine =
      await prisma.machineMaster.findFirst({
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
      });

    if (!packagingMachine) {
      return validationResponse(
        0,
        "Packaging machine not configured"
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 5. Verify mapping belongs to this exact box/project/vendor
    |--------------------------------------------------------------------------
    */

    const mapping =
      await prisma.cutListMachineMapping.findFirst({
        where: {
          id:
            mapping_id,

          box_id,

          project_id,
          vendor_id,

          machine_id:
            packagingMachine.id,

          expected_in:
            true,

          actual_in_at: {
            not: null,
          },

          row_created_source:
            "Manual",
        },

        select: {
          id: true,
          cut_list_id: true,

          qty: true,
          received_qty: true,

          site_in_at: true,
          site_in_by: true,

          cut_list: {
            select: {
              item_name: true,
              unique_code: true,
            },
          },
        },
      });

    if (!mapping) {
      return validationResponse(
        0,
        "Manual item not found in this box"
      );
    }

    const packedQty =
      Math.max(
        0,
        Number(
          mapping.qty ??
          0
        )
      );

    if (
      received_qty >
      packedQty
    ) {
      return validationResponse(
        0,
        `Received quantity cannot be greater than packed quantity (${packedQty})`
      );
    }

    /*
    |--------------------------------------------------------------------------
    | 6. Update
    |--------------------------------------------------------------------------
    |
    | site_in_at / site_in_by become the manual verification audit fields.
    |
    | If received_qty = 0:
    |   received_qty is still saved as 0,
    |   site_in_at is cleared because nothing was received.
    |--------------------------------------------------------------------------
    */

    const now =
      new Date();

    const updated =
      await prisma.cutListMachineMapping.update({
        where: {
          id:
            mapping.id,
        },

        data: {
          received_qty,

          site_in_at:
            received_qty > 0
              ? now
              : null,

          site_in_by:
            received_qty > 0
              ? user_id
              : null,
        },

        select: {
          id: true,
          cut_list_id: true,

          qty: true,
          received_qty: true,

          site_in_at: true,
          site_in_by: true,

          cut_list: {
            select: {
              item_name: true,
              unique_code: true,
            },
          },
        },
      });

    const pendingQty =
      Math.max(
        packedQty -
          received_qty,
        0
      );

    /*
    |--------------------------------------------------------------------------
    | 7. Calculate current manual box progress
    |--------------------------------------------------------------------------
    */

    const allManualMappings =
      await prisma.cutListMachineMapping.findMany({
        where: {
          box_id,
          project_id,
          vendor_id,

          machine_id:
            packagingMachine.id,

          expected_in:
            true,

          actual_in_at: {
            not: null,
          },

          row_created_source:
            "Manual",
        },

        select: {
          qty: true,
          received_qty: true,
        },
      });

    const boxManualTotalQty =
      allManualMappings.reduce(
        (
          sum,
          item
        ) =>
          sum +
          Math.max(
            0,
            Number(
              item.qty ??
              0
            )
          ),
        0
      );

    const boxManualReceivedQty =
      allManualMappings.reduce(
        (
          sum,
          item
        ) => {
          const itemQty =
            Math.max(
              0,
              Number(
                item.qty ??
                0
              )
            );

          return (
            sum +
            clampReceivedQty(
              item.received_qty,
              itemQty
            )
          );
        },
        0
      );

    const boxManualPendingQty =
      Math.max(
        boxManualTotalQty -
          boxManualReceivedQty,
        0
      );

    const message =
      pendingQty === 0
        ? "Manual item verified successfully"
        : `Manual item verified. ${pendingQty} unit${
            pendingQty > 1
              ? "s"
              : ""
          } pending for this item`;

    return validationResponse(
      1,
      message,
      {
        mapping_id:
          updated.id,

        cut_list_id:
          updated.cut_list_id,

        item_name:
          updated.cut_list
            .item_name,

        unique_code:
          updated.cut_list
            .unique_code,

        packed_qty:
          packedQty,

        received_qty:
          Number(
            updated.received_qty ??
            0
          ),

        pending_qty:
          pendingQty,

        is_fully_received:
          pendingQty === 0,

        site_in_at:
          updated.site_in_at,

        site_in_by:
          updated.site_in_by,

        site_in_by_name:
          received_qty > 0
            ? user.user_name
            : null,

        box_summary: {
          total_qty:
            boxManualTotalQty,

          received_qty:
            boxManualReceivedQty,

          pending_qty:
            boxManualPendingQty,

          progress_pct:
            boxManualTotalQty > 0
              ? Math.round(
                  (
                    boxManualReceivedQty /
                    boxManualTotalQty
                  ) *
                    100
                )
              : 0,
        },
      }
    );
  } catch (error) {
    console.error(
      "Error in verifyManualBoxSiteInItemService:",
      error
    );

    return validationResponse(
      0,
      "Failed to verify manual item"
    );
  }
};

export const getBoxSiteInStatusService = async (
  box_id: number,
  project_id: number,
  vendor_id: number
) => {
  try {
    const box =
      await prisma.boxMaster.findFirst({
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
          site_in_at: true,
          factory_out_at: true,
        },
      });

    if (!box) {
      return validationResponse(
        0,
        "Box not found"
      );
    }

    const packagingMachine =
      await prisma.machineMaster.findFirst({
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
      });

    if (!packagingMachine) {
      return validationResponse(
        0,
        "Packaging machine not configured"
      );
    }

    const items =
      await prisma.cutListMachineMapping.findMany({
        where: {
          box_id,
          project_id,
          vendor_id,

          machine_id:
            packagingMachine.id,

          expected_in:
            true,

          actual_in_at: {
            not: null,
          },
        },

        select: {
          id: true,

          qty: true,
          received_qty: true,

          row_created_source: true,

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

        orderBy: {
          id: "asc",
        },
      });

    let totalItems = 0;
    let receivedItems = 0;

    let scannedTotalItems = 0;
    let scannedReceivedItems = 0;

    let manualTotalItems = 0;
    let manualReceivedItems = 0;

    const formattedItems =
      items.map(
        (item) => {
          const mappingQty =
            Math.max(
              0,
              Number(
                item.qty ??
                1
              )
            );

          const isManual =
            isManualCreatedMapping(
              item.row_created_source
            );

          let receivedQty = 0;

          if (isManual) {
            receivedQty =
              clampReceivedQty(
                item.received_qty,
                mappingQty
              );

            manualTotalItems +=
              mappingQty;

            manualReceivedItems +=
              receivedQty;
          } else {
            receivedQty =
              item.site_in_at
                ? mappingQty
                : 0;

            scannedTotalItems +=
              mappingQty;

            scannedReceivedItems +=
              receivedQty;
          }

          totalItems +=
            mappingQty;

          receivedItems +=
            receivedQty;

          return {
            mapping_id:
              item.id,

            cut_list_id:
              item.cut_list.id,

            item_name:
              item.cut_list
                .item_name,

            category_name:
              item.cut_list
                .category_name,

            group_name:
              item.cut_list
                .group_name,

            unique_code:
              item.cut_list
                .unique_code,

            qty:
              mappingQty,

            received_qty:
              isManual
                ? item.received_qty
                : receivedQty,

            pending_qty:
              Math.max(
                mappingQty -
                  receivedQty,
                0
              ),

            row_created_source:
              item.row_created_source,

            is_manual:
              isManual,

            site_in_at:
              item.site_in_at,

            site_in_by:
              item.site_in_by,

            is_received:
              receivedQty >=
              mappingQty,
          };
        }
      );

    const pendingItems =
      Math.max(
        totalItems -
          receivedItems,
        0
      );

    const scannedPendingItems =
      Math.max(
        scannedTotalItems -
          scannedReceivedItems,
        0
      );

    const manualPendingItems =
      Math.max(
        manualTotalItems -
          manualReceivedItems,
        0
      );

    return validationResponse(
      1,
      "Box site in status fetched",
      {
        box,

        /*
        |--------------------------------------------------------------------------
        | Overall physical quantities
        |--------------------------------------------------------------------------
        */

        total_items:
          totalItems,

        received_items:
          receivedItems,

        pending_items:
          pendingItems,

        progress_pct:
          totalItems > 0
            ? Math.round(
                (
                  receivedItems /
                  totalItems
                ) *
                  100
              )
            : 0,

        /*
        |--------------------------------------------------------------------------
        | Scanner flow
        |--------------------------------------------------------------------------
        */

        scanned_total_items:
          scannedTotalItems,

        scanned_received_items:
          scannedReceivedItems,

        scanned_pending_items:
          scannedPendingItems,

        /*
        |--------------------------------------------------------------------------
        | Manual flow
        |--------------------------------------------------------------------------
        */

        manual_total_items:
          manualTotalItems,

        manual_received_items:
          manualReceivedItems,

        manual_pending_items:
          manualPendingItems,

        has_manual_items:
          manualTotalItems > 0,

        manual_complete:
          manualTotalItems > 0 &&
          manualPendingItems === 0,

        items:
          formattedItems,
      }
    );
  } catch (error) {
    console.error(
      "Error in getBoxSiteInStatusService:",
      error
    );

    return validationResponse(
      0,
      "Failed to fetch box site in status"
    );
  }
};