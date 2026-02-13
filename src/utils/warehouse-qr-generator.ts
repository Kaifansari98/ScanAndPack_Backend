import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

export interface QRItem {
  value: string;
  itemCode: string;     // First label (bold)
  itemName: string;
}

export interface WarehouseQRPayload {
  boxQR?: QRItem;
  itemQRs: QRItem[];
  logoPath?: string;
  columns?: number;
  pageSize?: "A4" | "LETTER";
  outputDir?: string;          // Save location
  fileName?: string;           // File name
}

export const generateWarehouseQRPDF = async (
  payload: WarehouseQRPayload
): Promise<string> => {
  const {
    boxQR,
    itemQRs,
    logoPath,
    columns = 3,
    pageSize = "A4",
    outputDir = "assets/track-trace/qr",
    fileName = `warehouse-${Date.now()}.pdf`,
  } = payload;

  // Ensure directory exists
  const absoluteDir = path.join(process.cwd(), outputDir);
  if (!fs.existsSync(absoluteDir)) {
    fs.mkdirSync(absoluteDir, { recursive: true });
  }

  const fullPath = path.join(absoluteDir, fileName);
  const relativePath = process.env.APP_URL+'/'+ path.join(outputDir, fileName);


  const doc = new PDFDocument({
    size: pageSize,
    layout: "landscape",
    margin: 30,
  });

  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;

  let startY = 30;

  // ======================
  // LOGO
  // ======================
  if (logoPath && fs.existsSync(logoPath)) {
    doc.image(logoPath, pageWidth / 2 - 60, startY, { width: 120 });
    startY += 80;
  }

  // ======================
  // BOX QR
  // ======================
//   if (boxQR) {
//     const qrBuffer = await QRCode.toBuffer(boxQR.value, {
//       errorCorrectionLevel: "H",
//       margin: 1,
//       width: 400,
//     });

//     const qrSize = 150;

//     doc.image(qrBuffer, pageWidth / 2 - qrSize / 2, startY, {
//       width: qrSize,
//     });

//     doc
//       .fontSize(12)
//       .text(boxQR.label || boxQR.value, 0, startY + qrSize + 5, {
//         align: "center",
//       });

//     startY += qrSize + 40;
//   }

  // ======================
  // GRID (3x3 default)
  // ======================
// ======================
// GRID (3x3 default)
// ======================

const margin = 40;
// const columns = 3;
const rows = 2;

const usableWidth = pageWidth - margin * 2;
const usableHeight = pageHeight - margin * 2;

const cellWidth = usableWidth / columns;
const cellHeight = usableHeight / rows;

const qrSize = Math.min(cellWidth, cellHeight) - 60;

let itemIndex = 0;

while (itemIndex < itemQRs.length) {

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {

      if (itemIndex >= itemQRs.length) break;

      const item = itemQRs[itemIndex];

      const x = margin + col * cellWidth;
      const y = margin + row * cellHeight;

      const qrBuffer = await QRCode.toBuffer(item.value, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 400,
      });

      // Draw QR centered in cell
      doc.image(qrBuffer,
        x + (cellWidth - qrSize) / 2,
        y + 10,
        {
          width: qrSize,
          height: qrSize,
        }
      );

      const textY = y + qrSize + 20;

      // ITEM CODE (bold)
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(item.itemCode, x, textY, {
          width: cellWidth,
          align: "center",
        });

      // ITEM NAME
      doc
        .fontSize(9)
        .font("Helvetica")
        .text(item.itemName, x, textY + 14, {
          width: cellWidth,
          align: "center",
        });

      itemIndex++;
    }
  }

  // Add new page if more items left
  if (itemIndex < itemQRs.length) {
    doc.addPage({ layout: "landscape" });
  }
}


  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(relativePath));
    stream.on("error", reject);
  });
};
