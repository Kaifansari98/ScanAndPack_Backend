import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

export interface LabelOptions {
  content: string;        // QR encoded value (unique_code)
  title?: string;         // Item / Project name
  fileName?: string;      // Output file name
  widthMm?: number;       // Label width in mm
  heightMm?: number;      // Label height in mm
}

const mmToPt = (mm: number): number => mm * 2.83465;

export const generateQrLabel = async ({
  content,
  title = "",
  fileName = "label.pdf",
  widthMm = 50,
  heightMm = 30,
}: LabelOptions): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      const width = mmToPt(widthMm);
      const height = mmToPt(heightMm);

      const outputPath = path.join(process.cwd(), fileName);

      const doc = new PDFDocument({
        size: [width, height],
        margin: 5,
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      // Generate QR buffer
      const qrBuffer = await QRCode.toBuffer(content, {
        errorCorrectionLevel: "H",
        margin: 1,
        width: 200,
      });

      // Center QR
      const qrSize = Math.min(width - 20, height - 40);
      const qrX = (width - qrSize) / 2;
      const qrY = 10;

      doc.image(qrBuffer, qrX, qrY, {
        width: qrSize,
      });

      // Title (bold style simulation)
      if (title) {
        doc
          .fontSize(8)
          .fillColor("black")
          .text(title, 0, qrY + qrSize + 2, {
            align: "center",
            width,
          });
      }

      // Content (unique code)
      doc
        .fontSize(7)
        .fillColor("black")
        .text(content, 0, qrY + qrSize + 12, {
          align: "center",
          width,
        });

      doc.end();

      stream.on("finish", () => resolve(outputPath));
      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
};
