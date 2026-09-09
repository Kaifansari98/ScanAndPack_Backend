import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

export interface CutListLabelItem {
  value: string;
  itemCode: string;
  itemName: string;
  projectName?: string;
  orderNo?: string;
  clientName?: string;
  groupName?: string;
  categoryName?: string;
  materialCode?: string;
  length?: unknown;
  width?: unknown;
  thickness?: unknown;
  quantity?: unknown;
  weight?: unknown;
  edgeBand?: string;
  procurement?: string;
  machines?: string[];
  machineFlow?: string;
  targetMachine?: string;
}

interface CutListLabelPayload {
  itemQRs: CutListLabelItem[];
  baseUrl: string;
  outputDir?: string;
  fileName?: string;
}

const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? "-" : String(value);

export const generateCutListLabelsPDF = async ({
  itemQRs,
  baseUrl,
  outputDir = "assets/track-trace/qr",
  fileName = `cutlist-labels-${Date.now()}.pdf`,
}: CutListLabelPayload): Promise<string> => {
  const absoluteDir = path.join(process.cwd(), outputDir);
  fs.mkdirSync(absoluteDir, { recursive: true });

  const fullPath = path.join(absoluteDir, fileName);
  const publicPath = `${baseUrl}/${path.posix.join(outputDir, fileName)}`;

  // Page setup: A4 PORTRAIT (210mm x 297mm) -> 595.28 pt x 841.89 pt
  const pageMargin = 16;
  const gapX = 10;
  const gapY = 8;

  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: pageMargin,
  });

  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  const columns = 2;
  const rows = 4;
  const itemsPerPage = 8; // Exactly 8 stickers per A4 page!

  const cellWidth =
    (doc.page.width - pageMargin * 2 - gapX * (columns - 1)) / columns;
  const cellHeight =
    (doc.page.height - pageMargin * 2 - gapY * (rows - 1)) / rows;

  for (let index = 0; index < itemQRs.length; index++) {
    if (index > 0 && index % itemsPerPage === 0) {
      doc.addPage({ size: "A4", layout: "portrait", margin: pageMargin });
    }

    const pos = index % itemsPerPage;
    const col = pos % columns;
    const row = Math.floor(pos / columns);
    const x = pageMargin + col * (cellWidth + gapX);
    const y = pageMargin + row * (cellHeight + gapY);
    const item = itemQRs[index];

    const radius = 6;
    const headerHeight = 22;
    const footerHeight = 16;

    // Outer clipping & background fills
    doc.save();
    doc.roundedRect(x, y, cellWidth, cellHeight, radius).clip();

    // Header background (White)
    doc.rect(x, y, cellWidth, headerHeight).fill("#FFFFFF");
    doc
      .moveTo(x, y + headerHeight)
      .lineTo(x + cellWidth, y + headerHeight)
      .lineWidth(0.75)
      .stroke("#CBD5E1");

    // Footer background (subtle light gray fill #F8FAFC)
    doc
      .rect(x, y + cellHeight - footerHeight, cellWidth, footerHeight)
      .fill("#F8FAFC");
    doc
      .moveTo(x, y + cellHeight - footerHeight)
      .lineTo(x + cellWidth, y + cellHeight - footerHeight)
      .lineWidth(0.6)
      .stroke("#CBD5E1");

    doc.restore();

    // Outer Navy / Charcoal border
    doc
      .roundedRect(x, y, cellWidth, cellHeight, radius)
      .lineWidth(1)
      .stroke("#0F172A");

    // --- A. HEADER ---
    const titleStr = item.projectName
      ? `PROJ: ${item.projectName}`
      : "CUT LIST STICKER";

    let headerFontSize = 8.5;
    if (titleStr.length > 45) headerFontSize = 7.8;
    if (titleStr.length > 60) headerFontSize = 7.2;

    doc
      .fillColor("#0F172A")
      .font("Helvetica-Bold")
      .fontSize(headerFontSize)
      .text(titleStr, x + 8, y + (headerHeight - headerFontSize) / 2, {
        width: cellWidth - 16,
        align: "left",
        lineBreak: false,
        ellipsis: true,
      });

    // --- B. MAIN CONTENT ---
    const mainY = y + headerHeight + 5;

    // Right Side: QR Code (Larger 75pt size to fill top-right area & enhance scannability)
    const qrSize = 75;
    const qrX = x + cellWidth - qrSize - 8;
    const qrY = mainY;

    const qrBuffer = await QRCode.toBuffer(text(item.value), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // QR Code Subtext (Bold Centered Part Code under QR)
    doc
      .fillColor("#0F172A")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(text(item.itemCode), qrX - 2, qrY + qrSize + 2, {
        width: qrSize + 4,
        align: "center",
      });

    // Left Side: Part Info
    const infoX = x + 8;
    const topInfoWidth = qrX - infoX - 6;
    const labelWidth = 54;
    const valueWidth = topInfoWidth - labelWidth;

    let currentY = mainY;

    const renderTopRow = (label: string, value: unknown, isBoldVal = false) => {
      const valStr = text(value);
      doc
        .font("Helvetica-Bold")
        .fontSize(7.2)
        .fillColor("#334155")
        .text(`${label}:`, infoX, currentY, { width: labelWidth });

      doc
        .font(isBoldVal ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7.2)
        .fillColor("#0F172A")
        .text(valStr, infoX + labelWidth, currentY, {
          width: valueWidth,
          lineGap: 1,
        });

      const textHeight = doc.heightOfString(valStr, {
        width: valueWidth,
        lineGap: 1,
      });
      currentY += Math.max(textHeight, 9) + 3;
    };

    renderTopRow("Part Name", item.itemName, true);
    renderTopRow("Module/Group", item.groupName);

    // Cutting Size
    const sizeStr =
      [item.length, item.width, item.thickness].map(text).join(" x ") + " mm";
    renderTopRow("Cutting Size", sizeStr, true);

    renderTopRow("Material", item.materialCode);

    // Quantity & Weight
    const qtyRowY = currentY;
    doc
      .font("Helvetica-Bold")
      .fontSize(7.2)
      .fillColor("#334155")
      .text("Qty:", infoX, qtyRowY, { width: 22 });
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor("#0F172A")
      .text(text(item.quantity) + " Pcs", infoX + 22, qtyRowY, { width: 45 });

    if (item.weight && item.weight !== "-") {
      const weightX = infoX + 72;
      doc
        .font("Helvetica-Bold")
        .fontSize(7.2)
        .fillColor("#334155")
        .text("Wgt:", weightX, qtyRowY, { width: 24 });
      doc
        .font("Helvetica")
        .fontSize(7.2)
        .fillColor("#0F172A")
        .text(text(item.weight) + " kg", weightX + 24, qtyRowY, { width: 40 });
    }

    // Full-Width Machine Flow & Edge Band Section
    const flowSectionY = Math.max(currentY + 12, qrY + qrSize + 12);
    let flowY = flowSectionY;
    const fullLabelWidth = 62;
    const fullValueWidth = cellWidth - 18 - fullLabelWidth;

    const renderFullRow = (label: string, value: unknown, isBoldVal = false) => {
      const valStr = text(value);
      doc
        .font("Helvetica-Bold")
        .fontSize(7.2)
        .fillColor("#334155")
        .text(`${label}:`, infoX, flowY, { width: fullLabelWidth });

      doc
        .font(isBoldVal ? "Helvetica-Bold" : "Helvetica")
        .fontSize(7.2)
        .fillColor("#0F172A")
        .text(valStr, infoX + fullLabelWidth, flowY, {
          width: fullValueWidth,
          lineGap: 1.5,
        });

      const textHeight = doc.heightOfString(valStr, {
        width: fullValueWidth,
        lineGap: 1.5,
      });
      flowY += Math.max(textHeight, 9) + 3.5;
    };

    // Clean & deduplicate Machine Flow
    let rawFlow = item.targetMachine || item.machineFlow || "";
    if (rawFlow) {
      rawFlow = rawFlow
        .replace(/['"!]/g, "")
        .replace(/➔|→|\|/g, ",")
        .split(",")
        .map((s) => s.trim())
        .filter((s, i, arr) => s && (i === 0 || s !== arr[i - 1]))
        .join(", ");
    }

    if (item.targetMachine) {
      renderFullRow("Target Machine", rawFlow, true);
    } else if (rawFlow) {
      renderFullRow("Machine Flow", rawFlow, true);
    }

    if (item.edgeBand && item.edgeBand !== "-") {
      renderFullRow("Edge Band", item.edgeBand);
    }

    // --- C. FOOTER ---
    const footerTextY = y + cellHeight - footerHeight + (footerHeight - 9) / 2;
    doc
      .font("Helvetica-Bold")
      .fontSize(7.8)
      .fillColor("#0F172A")
      .text(`PART ID: ${text(item.itemCode)}`, x + 4, footerTextY, {
        width: cellWidth - 8,
        align: "center",
      });
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(publicPath));
    stream.on("error", reject);
  });
};
