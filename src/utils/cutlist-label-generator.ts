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
      .fontSize(8.5)
      .text(text(item.projectName), x + 6, y + 6, {
        width: cellWidth - 12,
        align: "center",
        ellipsis: true,
        lineBreak: false,
      });

    // QR Code
    const qrSize = 74;
    const qrX = x + cellWidth - qrSize - 10;
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
        ellipsis: true,
        lineBreak: false,
      });

    // Left info rows
    const infoX = x + 10;
    const infoWidth = cellWidth - qrSize - 20;
    const labelWidth = 58;
    const valueWidth = infoWidth - labelWidth;

    const renderRow = (label: string, value: unknown, rowY: number) => {
      doc
        .font("Helvetica-Bold")
        .fontSize(7)
        .fillColor("#334155")
        .text(`${label}:`, infoX, rowY, {
          width: labelWidth,
          lineBreak: false,
        });
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#0F172A")
        .text(text(value), infoX + labelWidth, rowY, {
          width: valueWidth,
          ellipsis: true,
          lineBreak: false,
        });
    };

    const size = [item.length, item.width, item.thickness]
      .map(text)
      .join(" x ");
    let currentY = y + 26;
    const rowStep = 12.5;

    renderRow("Part Name", item.itemName, currentY);
    renderRow("Module/Group", item.groupName, (currentY += rowStep));
    renderRow("Cutting Size", size, (currentY += rowStep));
    renderRow("Material Code", item.materialCode, (currentY += rowStep));
    renderRow("Category", item.categoryName, (currentY += rowStep));
    renderRow("Client Name", item.clientName, (currentY += rowStep));
    renderRow("Order No", item.orderNo, (currentY += rowStep));

    // Subtle divider above lower section
    const divY = currentY + 15;
    doc
      .moveTo(infoX, divY)
      .lineTo(x + cellWidth - 10, divY)
      .lineWidth(0.5)
      .stroke("#E2E8F0");

    // Lower section (Full Width)
    const lowerY = divY + 5;
    // Edge Band
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#334155")
      .text("Edge Band:", infoX, lowerY, {
        width: labelWidth,
        lineBreak: false,
      });
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#0F172A")
      .text(text(item.edgeBand), infoX + labelWidth, lowerY, {
        width: cellWidth - 20 - labelWidth,
        ellipsis: true,
        lineBreak: false,
      });

    // Quantity & Weight row
    const qtyY = lowerY + 13;
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#334155")
      .text("Quantity:", infoX, qtyY, { width: 42, lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#0F172A")
      .text(text(item.quantity), infoX + 42, qtyY, {
        width: 50,
        lineBreak: false,
      });

    const weightX = x + cellWidth / 2 + 10;
    doc
      .font("Helvetica-Bold")
      .fontSize(7)
      .fillColor("#334155")
      .text("Weight:", weightX, qtyY, { width: 36, lineBreak: false });
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#0F172A")
      .text(text(item.weight), weightX + 36, qtyY, {
        width: 50,
        lineBreak: false,
      });

    // Footer Unique Code
    doc
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor("#0F172A")
      .text(`Unique Code: ${text(item.itemCode)}`, x, y + cellHeight - 13, {
        width: cellWidth,
        align: "center",
        ellipsis: true,
        lineBreak: false,
      });
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(publicPath));
    stream.on("error", reject);
  });
};
