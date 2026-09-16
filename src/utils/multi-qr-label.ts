import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

export interface QRItem {
  value: string;
  label?: string;
}

export interface MultiQRLabelOptions {
  qrCodes: QRItem[];
  fileName?: string;
  widthMm?: number;
  heightMm?: number;
  columns?: number;
}

const mmToPt = (mm: number): number => mm * 2.83465;

export const generateMultiQRLabel = async ({
  qrCodes,
  fileName = "multi-qr-label.pdf",
  widthMm = 100,
  heightMm = 100,
  columns = 2,
}: MultiQRLabelOptions): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      const width = mmToPt(widthMm);
      const height = mmToPt(heightMm);

      const outputPath = path.join(process.cwd(), fileName);

      const doc = new PDFDocument({
        size: [width, height],
        margin: 10,
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const qrSize = (width - 40) / columns;
      const rows = Math.ceil(qrCodes.length / columns);

      let currentIndex = 0;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          if (currentIndex >= qrCodes.length) break;

          const qrItem = qrCodes[currentIndex];

          const qrBuffer = await QRCode.toBuffer(qrItem.value, {
            errorCorrectionLevel: "H",
            margin: 1,
            width: 300,
          });

          const x = 20 + col * qrSize;
          const y = 20 + row * (qrSize + 30);

          doc.image(qrBuffer, x, y, {
            width: qrSize - 10,
          });

          // Label below QR
          doc
            .fontSize(8)
            .fillColor("black")
            .text(qrItem.label || qrItem.value, x, y + qrSize - 5, {
              width: qrSize - 10,
              align: "center",
            });

          currentIndex++;
        }
      }

      doc.end();

      stream.on("finish", () => resolve(outputPath));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
};
