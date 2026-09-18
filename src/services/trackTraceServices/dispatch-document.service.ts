import fs from "fs";
import puppeteer from "puppeteer";
import { prisma } from "../../prisma/client";

const PACKAGING_MACHINE_TYPE_ID = 18;
const BOXES_PER_PAGE = 45;
const BOX_ROWS_PER_COLUMN = 15;
const PRODUCTS_PER_PAGE = 45;

type DispatchBox = {
  id: number;
  box_name: string;
  sequence_no: number | null;
  factory_out_at: Date | null;
  factory_out_by: number | null;
  factoryOutByUser: { user_name: string } | null;
  site_in_at: Date | null;
  site_in_by: number | null;
  siteInByUser: { user_name: string } | null;
  cutListMachineMapping: Array<{
    qty: number;
    cut_list: {
      item_name: string;
      group_name: string | null;
    };
    projectLocationProductQuantity: {
      location_name: string;
    } | null;
  }>;
};

type ProductSummary = {
  name: string;
  qty: number;
  boxCount: number;
};

const getPuppeteerOptions = () => {
  const options: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  };

  const macChromePath =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(macChromePath)) {
    options.executablePath = macChromePath;
  }

  return options;
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const normalizeLocation = (value: string): string =>
  value.trim().toLocaleLowerCase();

const sanitizeFileName = (value: string): string =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "project";

const getBoxNumber = (box: DispatchBox): number | string => {
  if (Number.isInteger(box.sequence_no) && Number(box.sequence_no) > 0) {
    return Number(box.sequence_no);
  }

  const numericName = box.box_name.trim().match(/^\d+$/)?.[0];
  return numericName ? Number(numericName) : box.box_name;
};

const sortBoxesByStatus = (
  boxes: DispatchBox[],
  statusField: "factory_out_at" | "site_in_at",
): DispatchBox[] =>
  [...boxes].sort((left, right) => {
    const statusOrder =
      Number(Boolean(right[statusField])) -
      Number(Boolean(left[statusField]));

    if (statusOrder !== 0) return statusOrder;

    const leftSequence =
      Number.isInteger(left.sequence_no) && Number(left.sequence_no) > 0
        ? Number(left.sequence_no)
        : Number(left.box_name);
    const rightSequence =
      Number.isInteger(right.sequence_no) && Number(right.sequence_no) > 0
        ? Number(right.sequence_no)
        : Number(right.box_name);
    const normalizedLeftSequence = Number.isFinite(leftSequence)
      ? leftSequence
      : Number.MAX_SAFE_INTEGER;
    const normalizedRightSequence = Number.isFinite(rightSequence)
      ? rightSequence
      : Number.MAX_SAFE_INTEGER;

    return normalizedLeftSequence - normalizedRightSequence || left.id - right.id;
  });

const chunk = <T>(rows: T[], size: number): T[][] => {
  if (rows.length === 0) return [[]];

  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
};

const getLocationMappings = (box: DispatchBox, locationName: string | null) =>
  box.cutListMachineMapping.filter((mapping) => {
    if (!locationName) return true;

    return (
      normalizeLocation(
        mapping.projectLocationProductQuantity?.location_name ?? "",
      ) === normalizeLocation(locationName)
    );
  });

const getProductSummary = (
  boxes: DispatchBox[],
  locationName: string | null,
): ProductSummary[] => {
  const products = new Map<
    string,
    { qty: number; boxIds: Set<number> }
  >();

  for (const box of boxes) {
    for (const mapping of getLocationMappings(box, locationName)) {
      const name =
        mapping.cut_list.group_name?.trim() ||
        mapping.cut_list.item_name.trim() ||
        "Unspecified Product";
      const current = products.get(name) ?? {
        qty: 0,
        boxIds: new Set<number>(),
      };

      current.qty += Math.max(0, Number(mapping.qty || 0));
      current.boxIds.add(box.id);
      products.set(name, current);
    }
  }

  return Array.from(products.entries())
    .map(([name, value]) => ({
      name,
      qty: value.qty,
      boxCount: value.boxIds.size,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
};

const paginateDispatchBoxes = (
  boxes: DispatchBox[],
  locationName: string | null,
): DispatchBox[][] => {
  if (boxes.length === 0) return [[]];

  const pages: DispatchBox[][] = [];
  let currentPage: DispatchBox[] = [];
  let currentProducts = new Set<string>();

  for (const box of boxes) {
    const boxProducts = new Set(
      getLocationMappings(box, locationName).map(
        (mapping) =>
          mapping.cut_list.group_name?.trim() ||
          mapping.cut_list.item_name.trim() ||
          "Unspecified Product",
      ),
    );
    const mergedProducts = new Set([...currentProducts, ...boxProducts]);
    const pageIsFull = currentPage.length >= BOXES_PER_PAGE;
    const summaryIsFull =
      currentPage.length > 0 && mergedProducts.size > PRODUCTS_PER_PAGE;

    if (pageIsFull || summaryIsFull) {
      pages.push(currentPage);
      currentPage = [];
      currentProducts = new Set<string>();
    }

    currentPage.push(box);
    for (const product of boxProducts) currentProducts.add(product);
  }

  if (currentPage.length > 0) pages.push(currentPage);

  return pages;
};

const renderBoxColumns = (
  boxes: DispatchBox[],
  checkField: "factory_out_at" | "site_in_at",
) => {
  const columns = chunk(boxes, BOX_ROWS_PER_COLUMN);

  while (columns.length < 3) columns.push([]);

  return Array.from({ length: BOX_ROWS_PER_COLUMN }, (_, rowIndex) =>
    columns
      .slice(0, 3)
      .map((column) => {
        const box = column[rowIndex];
        const checked = Boolean(box?.[checkField]);

        return `
          <td class="packet-number">${box ? escapeHtml(getBoxNumber(box)) : ""}</td>
          <td class="check-cell ${checked ? "checked" : ""}">
            ${checked ? "&#10003;" : ""}
          </td>
        `;
      })
      .join(""),
  )
    .map((cells) => `<tr>${cells}</tr>`)
    .join("");
};

const renderProductSummary = (summary: ProductSummary[]) => {
  if (summary.length === 0) {
    return `
      <tr>
        <td colspan="9" class="empty-summary">No packed product data for these boxes.</td>
      </tr>
    `;
  }

  const columns = chunk(summary, Math.max(1, Math.ceil(summary.length / 3)));
  while (columns.length < 3) columns.push([]);

  const rowCount = Math.max(...columns.map((column) => column.length), 1);

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const cells = columns
      .map((column) => {
        const product = column[rowIndex];
        return `
          <td class="product-name">${product ? escapeHtml(product.name) : ""}</td>
          <td class="number-cell">${product ? product.qty : ""}</td>
          <td class="number-cell">${product ? product.boxCount : ""}</td>
        `;
      })
      .join("");

    return `<tr>${cells}</tr>`;
  }).join("");
};

const formatDate = (value: Date | null): string => {
  if (!value) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
};

const buildDispatchHtml = ({
  project,
  locationPages,
}: {
  project: {
    id: number;
    project_name: string;
    order_no: string | null;
    client_name: string | null;
    client_address: string | null;
    client_contact_no: string | null;
    vendor: { vendor_name: string };
    lead: {
      lead_code: string;
      firstname: string;
      lastname: string;
      site_address: string | null;
      vehicle_no: string | null;
      driver_number: string | null;
    } | null;
  };
  locationPages: Array<{
    locationName: string | null;
    loadingBoxes: DispatchBox[];
    unloadingBoxes: DispatchBox[];
    pageNumber: number;
    totalPages: number;
    totalLocationBoxes: number;
  }>;
}) => {
  const generatedOn = formatDate(new Date());
  const jobNumber = project.order_no?.trim() || project.lead?.lead_code || project.id;
  const clientName =
    project.client_name?.trim() ||
    [project.lead?.firstname, project.lead?.lastname]
      .filter(Boolean)
      .join(" ") ||
    "-";
  const address =
    project.client_address?.trim() || project.lead?.site_address?.trim() || "-";

  const pages = locationPages
    .map(({
      locationName,
      loadingBoxes,
      unloadingBoxes,
      pageNumber,
      totalPages,
      totalLocationBoxes,
    }) => {
      const dispatchedBoxes = loadingBoxes.filter((box) => box.factory_out_at);
      const siteReceivedBoxes = unloadingBoxes.filter((box) => box.site_in_at);
      const dispatcherNames = Array.from(
        new Set(
          dispatchedBoxes
            .map(
              (box) =>
                box.factoryOutByUser?.user_name.trim() ||
                (box.factory_out_by ? `User #${box.factory_out_by}` : null),
            )
            .filter((name): name is string => Boolean(name)),
        ),
      );
      const siteReceiverNames = Array.from(
        new Set(
          siteReceivedBoxes
            .map(
              (box) =>
                box.siteInByUser?.user_name.trim() ||
                (box.site_in_by ? `User #${box.site_in_by}` : null),
            )
            .filter((name): name is string => Boolean(name)),
        ),
      );
      const latestDispatchDate = dispatchedBoxes.reduce<Date | null>(
        (latest, box) =>
          !latest || (box.factory_out_at && box.factory_out_at > latest)
            ? box.factory_out_at
            : latest,
        null,
      );
      const latestSiteReceiptDate = siteReceivedBoxes.reduce<Date | null>(
        (latest, box) =>
          !latest || (box.site_in_at && box.site_in_at > latest)
            ? box.site_in_at
            : latest,
        null,
      );
      const summary = getProductSummary(loadingBoxes, locationName);

      return `
        <section class="dispatch-page">
          <table class="header-table">
            <tr>
              <td class="company-name" colspan="6">${escapeHtml(project.vendor.vendor_name)}</td>
              <td class="page-label" colspan="2">${escapeHtml(locationName || "ALL LOCATIONS")} &nbsp; | &nbsp; Page ${pageNumber} of ${totalPages}</td>
            </tr>
            <tr>
              <th>Job No.</th>
              <td colspan="2" class="value strong">${escapeHtml(jobNumber)}</td>
              <th>Generated Date</th>
              <td>${generatedOn}</td>
              <th>Dispatch Date</th>
              <td colspan="2">${formatDate(latestDispatchDate)}</td>
            </tr>
            <tr>
              <th>Project</th>
              <td colspan="2" class="value strong">${escapeHtml(project.project_name)}</td>
              <th>Client</th>
              <td>${escapeHtml(clientName)}</td>
              <th>Contact No.</th>
              <td colspan="2">${escapeHtml(project.client_contact_no || "-")}</td>
            </tr>
            <tr>
              <th>Location</th>
              <td colspan="2" class="value strong">${escapeHtml(locationName || address)}</td>
              <th>Vehicle No.</th>
              <td>${escapeHtml(project.lead?.vehicle_no || "-")}</td>
              <th>Dispatcher</th>
              <td colspan="2">${escapeHtml(dispatcherNames.join(", ") || "-")}</td>
            </tr>
            <tr>
              <th>Site Address</th>
              <td colspan="4">${escapeHtml(address)}</td>
              <th>Driver Mobile</th>
              <td colspan="2">${escapeHtml(project.lead?.driver_number || "-")}</td>
            </tr>
            <tr>
              <th>Site Receipt Date</th>
              <td colspan="2">${formatDate(latestSiteReceiptDate)}</td>
              <th>Site Received By</th>
              <td colspan="4">${escapeHtml(siteReceiverNames.join(", ") || "-")}</td>
            </tr>
          </table>

          <div class="movement-grid">
            <table class="movement-table">
              <thead>
                <tr><th colspan="6" class="movement-title">LOADING / DISPATCH</th></tr>
                <tr>
                  <th>Pkt No.</th><th>Check</th>
                  <th>Pkt No.</th><th>Check</th>
                  <th>Pkt No.</th><th>Check</th>
                </tr>
              </thead>
              <tbody>${renderBoxColumns(loadingBoxes, "factory_out_at")}</tbody>
              <tfoot>
                <tr><th colspan="2">PAGE TOTAL</th><td colspan="4">${loadingBoxes.length} / ${totalLocationBoxes}</td></tr>
              </tfoot>
            </table>

            <table class="movement-table">
              <thead>
                <tr><th colspan="6" class="movement-title">UNLOADING / SITE RECEIPT</th></tr>
                <tr>
                  <th>Pkt No.</th><th>Check</th>
                  <th>Pkt No.</th><th>Check</th>
                  <th>Pkt No.</th><th>Check</th>
                </tr>
              </thead>
              <tbody>${renderBoxColumns(unloadingBoxes, "site_in_at")}</tbody>
              <tfoot>
                <tr><th colspan="2">PAGE TOTAL</th><td colspan="4">${unloadingBoxes.length} / ${totalLocationBoxes}</td></tr>
              </tfoot>
            </table>
          </div>

          <table class="remark-table">
            <tr><th>Remark</th><td></td></tr>
          </table>

          <table class="summary-table">
            <thead>
              <tr>
                <th>PRODUCT / GROUP</th><th>NOS</th><th>PKT</th>
                <th>PRODUCT / GROUP</th><th>NOS</th><th>PKT</th>
                <th>PRODUCT / GROUP</th><th>NOS</th><th>PKT</th>
              </tr>
            </thead>
            <tbody>${renderProductSummary(summary)}</tbody>
            <tfoot>
              <tr>
                <th colspan="7">TOTAL ON THIS PAGE</th>
                <th>${summary.reduce((total, row) => total + row.qty, 0)}</th>
                <th>${loadingBoxes.length}</th>
              </tr>
            </tfoot>
          </table>

          <div class="legend">
            <span><strong>&#10003;</strong> Loading: factory_out_at &nbsp; | &nbsp; Unloading: site_in_at</span>
            <span>All box numbers are shown, including boxes not yet dispatched.</span>
          </div>
        </section>
      `;
    })
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Dispatch Document</title>
        <style>
          @page { size: A4 landscape; margin: 7mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; }
          body { font-size: 9px; }
          table { width: 100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border: 1px solid #222; padding: 2px 4px; vertical-align: middle; }
          th { font-weight: 700; }
          .dispatch-page { break-after: page; page-break-after: always; min-height: 190mm; background: #fff; }
          .dispatch-page:last-child { break-after: auto; page-break-after: auto; }
          .header-table { margin-bottom: 3px; }
          .header-table th { width: 10%; text-align: left; background: #f2f2f2; }
          .header-table td { height: 5mm; }
          .company-name { font-size: 14px; font-weight: 800; text-align: center; letter-spacing: .25px; }
          .page-label { text-align: center; font-size: 9px; font-weight: 700; }
          .strong { font-weight: 700; font-size: 10px; }
          .movement-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
          .movement-table th, .movement-table td { text-align: center; height: 5mm; padding: 1px 3px; }
          .movement-table .movement-title { font-size: 10px; height: 5mm; background: #e9e9e9; letter-spacing: .4px; }
          .movement-table thead tr:nth-child(2) th { background: #f6f6f6; }
          .packet-number { font-weight: 700; width: 12%; }
          .check-cell { width: 21%; font-size: 13px; }
          .checked { color: #087a30; font-weight: 900; }
          .movement-table tfoot th, .movement-table tfoot td { height: 4mm; background: #f3f3f3; font-weight: 700; }
          .remark-table { margin-top: 3px; }
          .remark-table th { width: 9%; text-align: left; background: #f3f3f3; }
          .remark-table td { height: 5mm; }
          .summary-table { margin-top: 3px; font-size: 7.5px; }
          .summary-table th { background: #f3f3f3; text-align: center; }
          .summary-table td { height: 3.4mm; }
          .summary-table .product-name { width: 25%; font-weight: 600; }
          .number-cell { width: 4%; text-align: center; }
          .summary-table tfoot th { height: 4mm; }
          .empty-summary { text-align: center; color: #555; height: 6mm !important; }
          .legend { display: flex; justify-content: space-between; gap: 12px; padding: 2px 1px 0; font-size: 7px; color: #444; }
        </style>
      </head>
      <body>${pages}</body>
    </html>`;
};

export const generateDispatchDocumentService = async (
  uniqueProjectId: string,
  vendorId: number,
  requestedLocations: string[],
) => {
  const project = await prisma.projectMaster.findFirst({
    where: {
      unique_project_id: uniqueProjectId,
      vendor_id: vendorId,
      isDeleted: false,
    },
    select: {
      id: true,
      project_name: true,
      order_no: true,
      client_name: true,
      client_address: true,
      client_contact_no: true,
      vendor: {
        select: { vendor_name: true },
      },
      lead: {
        select: {
          lead_code: true,
          firstname: true,
          lastname: true,
          site_address: true,
          vehicle_no: true,
          driver_number: true,
        },
      },
    },
  });

  if (!project) {
    return {
      success: false as const,
      message: "Project not found",
      statusCode: 404,
    };
  }

  const [locationRows, boxes] = await Promise.all([
    prisma.projectLocationProductQuantity.findMany({
      where: { project_id: project.id, vendor_id: vendorId },
      select: { location_name: true },
      distinct: ["location_name"],
      orderBy: { location_name: "asc" },
    }),
    prisma.boxMaster.findMany({
      where: {
        project_id: project.id,
        vendor_id: vendorId,
        is_deleted: false,
      },
      select: {
        id: true,
        box_name: true,
        sequence_no: true,
        factory_out_at: true,
        factory_out_by: true,
        factoryOutByUser: {
          select: { user_name: true },
        },
        site_in_at: true,
        site_in_by: true,
        siteInByUser: {
          select: { user_name: true },
        },
        cutListMachineMapping: {
          where: {
            expected_in: true,
            actual_in_at: { not: null },
            machine: { machine_type_id: PACKAGING_MACHINE_TYPE_ID },
          },
          select: {
            qty: true,
            cut_list: {
              select: {
                item_name: true,
                group_name: true,
              },
            },
            projectLocationProductQuantity: {
              select: { location_name: true },
            },
          },
        },
      },
      orderBy: [{ sequence_no: "asc" }, { id: "asc" }],
    }),
  ]);

  const configuredLocationMap = new Map(
    locationRows
      .map((row) => row.location_name.trim())
      .filter(Boolean)
      .map((name) => [normalizeLocation(name), name]),
  );

  let selectedLocations: Array<string | null>;

  if (configuredLocationMap.size > 0) {
    const normalizedRequestedLocations = Array.from(
      new Set(
        requestedLocations
          .map((location) => normalizeLocation(location))
          .filter(Boolean),
      ),
    );

    if (normalizedRequestedLocations.length === 0) {
      return {
        success: false as const,
        message: "Select at least one location",
        statusCode: 422,
      };
    }

    const invalidLocations = normalizedRequestedLocations.filter(
      (location) => !configuredLocationMap.has(location),
    );

    if (invalidLocations.length > 0) {
      return {
        success: false as const,
        message: `Invalid project location: ${invalidLocations.join(", ")}`,
        statusCode: 422,
      };
    }

    selectedLocations = normalizedRequestedLocations.map(
      (location) => configuredLocationMap.get(location)!,
    );
  } else {
    selectedLocations = [null];
  }

  const locationPages = selectedLocations.flatMap((locationName) => {
    const locationBoxes = locationName
      ? boxes.filter((box) =>
          box.cutListMachineMapping.some(
            (mapping) =>
              normalizeLocation(
                mapping.projectLocationProductQuantity?.location_name ?? "",
              ) === normalizeLocation(locationName),
          ),
        )
      : boxes;
    const loadingPages = paginateDispatchBoxes(
      sortBoxesByStatus(locationBoxes, "factory_out_at"),
      locationName,
    );
    const unloadingBoxes = sortBoxesByStatus(locationBoxes, "site_in_at");
    let unloadingOffset = 0;

    return loadingPages.map((loadingBoxes, index) => {
      const unloadingPageBoxes = unloadingBoxes.slice(
        unloadingOffset,
        unloadingOffset + loadingBoxes.length,
      );
      unloadingOffset += loadingBoxes.length;

      return {
        locationName,
        loadingBoxes,
        unloadingBoxes: unloadingPageBoxes,
        pageNumber: index + 1,
        totalPages: loadingPages.length,
        totalLocationBoxes: locationBoxes.length,
      };
    });
  });

  const html = buildDispatchHtml({ project, locationPages });
  const browser = await puppeteer.launch(getPuppeteerOptions());

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    return {
      success: true as const,
      message: "Dispatch document generated successfully",
      data: Buffer.from(pdf),
      fileName: `${sanitizeFileName(project.project_name)}_Dispatch_Document.pdf`,
    };
  } finally {
    await browser.close();
  }
};
