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
  const marginX = 16;
  const marginY = 16;
  const doc = new PDFDocument({ size: "A4", layout: "portrait", margin: marginX });
  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  const columns = 2;
  const rows = 4;
  const itemsPerPage = 8;
  const gapX = 10;
  const gapY = 8;

  const cellWidth =
    (doc.page.width - marginX * 2 - gapX * (columns - 1)) / columns;
  const cellHeight =
    (doc.page.height - marginY * 2 - gapY * (rows - 1)) / rows;

  for (let index = 0; index < itemQRs.length; index++) {
    if (index > 0 && index % itemsPerPage === 0) {
      doc.addPage({ size: "A4", layout: "portrait", margin: marginX });
    }

    const pos = index % itemsPerPage;
    const col = pos % columns;
    const row = Math.floor(pos / columns);
    const x = marginX + col * (cellWidth + gapX);
    const y = marginY + row * (cellHeight + gapY);
    const item = itemQRs[index];

    const radius = 5;
    const headerHeight = 22;
    const footerHeight = 18;

    // Background & clipping for clean rounded header & footer
    doc.save();
    doc.roundedRect(x, y, cellWidth, cellHeight, radius).clip();

    // Header fill
    doc.rect(x, y, cellWidth, headerHeight).fill("#F1F5F9");
    // Header divider line
    doc
      .moveTo(x, y + headerHeight)
      .lineTo(x + cellWidth, y + headerHeight)
      .lineWidth(0.75)
      .stroke("#CBD5E1");

    // Footer fill & divider line
    doc
      .rect(x, y + cellHeight - footerHeight, cellWidth, footerHeight)
      .fill("#F8FAFC");
    doc
      .moveTo(x, y + cellHeight - footerHeight)
      .lineTo(x + cellWidth, y + cellHeight - footerHeight)
      .lineWidth(0.6)
      .stroke("#E2E8F0");
    doc.restore();

    // Outer border
    doc
      .roundedRect(x, y, cellWidth, cellHeight, radius)
      .lineWidth(1)
      .stroke("#1E293B");

    // Header text
    doc
      .fillColor("#0F172A")
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(text(item.projectName), x + 6, y + 6, {
        width: cellWidth - 12,
        align: "center",
      });

    // QR Code
    const qrSize = 74;
    const qrX = x + cellWidth - qrSize - 8;
    const qrY = y + 26;
    const qrBuffer = await QRCode.toBuffer(text(item.value), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 300,
    });
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    // QR Code Subtext (bold item code)
    doc
      .fillColor("#0F172A")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text(text(item.itemCode), qrX, qrY + qrSize + 2, {
        width: qrSize,
        align: "center",
      });

    // Left info rows with dynamic wrapping (Full text - NO ellipses)
    const infoX = x + 8;
    const infoWidth = qrX - infoX - 6;
    const labelWidth = 52;
    const valueWidth = infoWidth - labelWidth;

    let currentY = y + 26;

    const renderDynamicRow = (label: string, value: unknown) => {
      const valStr = text(value);
      doc
        .font("Helvetica-Bold")
        .fontSize(6.8)
        .fillColor("#334155")
        .text(`${label}:`, infoX, currentY, { width: labelWidth });

      const valY = currentY;
      doc
        .font("Helvetica")
        .fontSize(6.8)
        .fillColor("#0F172A")
        .text(valStr, infoX + labelWidth, valY, {
          width: valueWidth,
          lineGap: 1,
        });

      doc.font("Helvetica").fontSize(6.8);
      const textHeight = doc.heightOfString(valStr, {
        width: valueWidth,
        lineGap: 1,
      });
      currentY += Math.max(textHeight, 9) + 2.5;
    };

    const size = [item.length, item.width, item.thickness]
      .map(text)
      .join(" x ");

    renderDynamicRow("Part Name", item.itemName);
    renderDynamicRow("Module/Group", item.groupName);
    renderDynamicRow("Cutting Size", size);
    renderDynamicRow("Material Code", item.materialCode);
    renderDynamicRow("Category", item.categoryName);
    renderDynamicRow("Client Name", item.clientName);
    renderDynamicRow("Order No", item.orderNo);

    // Quantity & Weight placed directly below the fields (no divider line & no extra empty gap)
    const qtyRowY = currentY + 1;
    doc
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .fillColor("#334155")
      .text("Quantity:", infoX, qtyRowY, { width: 38 });
    doc
      .font("Helvetica")
      .fontSize(6.8)
      .fillColor("#0F172A")
      .text(text(item.quantity), infoX + 38, qtyRowY, { width: 35 });

    const weightX = infoX + 75;
    doc
      .font("Helvetica-Bold")
      .fontSize(6.8)
      .fillColor("#334155")
      .text("Weight:", weightX, qtyRowY, { width: 34 });
    doc
      .font("Helvetica")
      .fontSize(6.8)
      .fillColor("#0F172A")
      .text(text(item.weight), weightX + 34, qtyRowY, { width: 45 });

    // Footer Unique Code
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor("#0F172A")
      .text(`Unique Code: ${text(item.itemCode)}`, x, y + cellHeight - 13, {
        width: cellWidth,
        align: "center",
      });
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(publicPath));
    stream.on("error", reject);
  });
};
