import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LabelItem {
  // From CutList
  unique_code: string;       // QR value + printed code
  item_name: string;         // Part Name
  group_name?: string;       // Module No
  length?: string | number;  // Cutting Size L
  width?: string | number;   // Cutting Size W
  thickness?: string | number; // Cutting Size T
  material_details?: string; // Material Code
  description?: string;      // Description (sub-label under part name)
  category_name?: string;    // Category
  elf?: string;              // Edge front-left
  elb?: string;              // Edge front-right
  esl?: string;              // Edge back-left
  esr?: string;              // Edge back-right
  qty?: number;
  created_at?: Date | string;

  // From ProjectMaster → ClientMaster
  client_name?: string;      // Client Name
  project_name?: string;     // Project name
  unique_project_id?: string; // SO No
}

export interface WarehouseLabelPayload {
  items: LabelItem[];
  logoPath?: string;
  outputDir?: string;
  fileName?: string;
  baseUrl: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Label dimensions (landscape A5-ish on A4 landscape page, 2 per row)
const PAGE_W = 841.89;  // A4 landscape width  (pt)
const PAGE_H = 595.28;  // A4 landscape height (pt)

const COLS = 2;
const ROWS = 2;

const MARGIN = 20;
const GAP = 10;  // gap between labels

const LABEL_W = (PAGE_W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
const LABEL_H = (PAGE_H - MARGIN * 2 - GAP * (ROWS - 1)) / ROWS;

const INNER_PAD = 8;

// Typography
const FONT_BOLD = "Helvetica-Bold";
const FONT_REG  = "Helvetica";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d?: Date | string): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatSize(l?: string | number, w?: string | number, t?: string | number): string {
  if (!l && !w && !t) return "";
  return [l, w, t].map(v => (v != null ? String(v) : "-")).join(" x ");
}

function edgebandString(elf?: string, elb?: string, esl?: string, esr?: string): string {
  const parts: string[] = [];
  if (elf) parts.push(`F:${elf}`);
  if (elb) parts.push(`B:${elb}`);
  if (esl) parts.push(`L:${esl}`);
  if (esr) parts.push(`R:${esr}`);
  return parts.join("  ");
}

// ─── Label Drawing ────────────────────────────────────────────────────────────

async function drawLabel(
  doc: PDFKit.PDFDocument,
  item: LabelItem,
  originX: number,
  originY: number
) {
  const x = originX;
  const y = originY;
  const w = LABEL_W;
  const h = LABEL_H;
  const ip = INNER_PAD;

  // ── Outer border ──
  doc
    .save()
    .rect(x, y, w, h)
    .lineWidth(1.2)
    .stroke("#000000")
    .restore();

  // ── QR code (right column) ──
  const qrAreaW = w * 0.30;
  const qrSize  = Math.min(qrAreaW, h * 0.55) - ip * 2;
  const qrX     = x + w - qrAreaW + (qrAreaW - qrSize) / 2;
  const qrY     = y + ip;

  const qrBuffer = await QRCode.toBuffer(item.unique_code, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 400,
  });
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

  // Unique code text under QR
  doc
    .font(FONT_BOLD)
    .fontSize(7)
    .fillColor("#000000")
    .text(item.unique_code, x + w - qrAreaW, qrY + qrSize + 3, {
      width: qrAreaW,
      align: "center",
    });

  // Vertical divider between info and QR
  const divX = x + w - qrAreaW;
  doc
    .save()
    .moveTo(divX, y)
    .lineTo(divX, y + h)
    .lineWidth(0.8)
    .stroke("#000000")
    .restore();

  // ── Info area (left side) ──
  const infoW = w - qrAreaW - ip * 2;
  let curY = y + ip;
  const lx = x + ip;

  const ROW_H    = 16;     // height per single-line row
  const LINE_H   = 10;     // height per extra line in multi-line rows
  const LABEL_FS = 7.5;    // key font size
  const VALUE_FS = 8.5;    // value font size
  const KEY_X    = lx;
  const VAL_X    = lx + 75;
  const VAL_W    = infoW - 75;

  // Single-line row
  function row(label: string, value: string, opts?: { valueBold?: boolean }) {
    if (!value) return;
    doc
      .font(FONT_REG)
      .fontSize(LABEL_FS)
      .fillColor("#555555")
      .text(`${label}:`, KEY_X, curY, { width: infoW, continued: false });
    doc
      .font(opts?.valueBold ? FONT_BOLD : FONT_REG)
      .fontSize(VALUE_FS)
      .fillColor("#000000")
      .text(value, VAL_X, curY, { width: VAL_W, lineBreak: false });
    curY += ROW_H;
  }

  // Multi-line row: value lines is an array, each printed on its own line
  function multiRow(label: string, lines: string[], opts?: { valueBold?: boolean }) {
    const nonEmpty = lines.filter(Boolean);
    if (!nonEmpty.length) return;
    doc
      .font(FONT_REG)
      .fontSize(LABEL_FS)
      .fillColor("#555555")
      .text(`${label}:`, KEY_X, curY, { width: infoW, continued: false });
    nonEmpty.forEach((line, i) => {
      doc
        .font(opts?.valueBold ? FONT_BOLD : FONT_REG)
        .fontSize(VALUE_FS)
        .fillColor("#000000")
        .text(line, VAL_X, curY + i * LINE_H, { width: VAL_W, lineBreak: false });
    });
    curY += LINE_H * nonEmpty.length + (ROW_H - LINE_H); // pad after last line
  }

  // Header row — Part Name prominently
  doc
    .font(FONT_BOLD)
    .fontSize(10)
    .fillColor("#000000")
    .text(item.item_name, lx, curY, { width: infoW });
  curY += 14;

  if (item.description && item.description !== item.item_name) {
    doc
      .font(FONT_REG)
      .fontSize(7.5)
      .fillColor("#444444")
      .text(item.description, lx, curY, { width: infoW });
    curY += 12;
  }

  // Thin separator
  doc
    .save()
    .moveTo(lx, curY)
    .lineTo(lx + infoW, curY)
    .lineWidth(0.4)
    .stroke("#cccccc")
    .restore();
  curY += 4;

  row("Module No", item.group_name ?? "");
  row("Cutting Size", formatSize(item.length, item.width, item.thickness));
  row("Material Code", item.material_details ?? "");
  row("Category", item.category_name ?? "");

  const edgebandVal = edgebandString(item.elf, item.elb, item.esl, item.esr);
  row("Edgeband", edgebandVal);

  row("Client", item.client_name ?? "");
  row("Project", item.project_name ?? "");
  row("SO No", item.unique_project_id ?? "");

  const dateVal = formatDate(item.created_at);
  row("Date", dateVal);

  // Qty badge bottom-right of info area
  if (item.qty != null) {
    const badgeW = 36;
    const badgeH = 16;
    const badgeX = x + w - qrAreaW - badgeW - ip;
    const badgeY = y + h - badgeH - ip;
    doc
      .save()
      .roundedRect(badgeX, badgeY, badgeW, badgeH, 3)
      .fillAndStroke("#1a1a2e", "#1a1a2e")
      .restore();
    doc
      .font(FONT_BOLD)
      .fontSize(8)
      .fillColor("#ffffff")
      .text(`Qty: ${item.qty}`, badgeX, badgeY + 4, {
        width: badgeW,
        align: "center",
      });
  }

  // Unique code small text top-right of label (corner stamp)
  doc
    .font(FONT_REG)
    .fontSize(6)
    .fillColor("#888888")
    .text(item.unique_code, x + w - qrAreaW - ip - 80, y + ip, {
      width: 80,
      align: "right",
    });
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export const generateWarehouseLabelPDF = async (
  payload: WarehouseLabelPayload
): Promise<string> => {
  const {
    items,
    logoPath,
    outputDir = "assets/track-trace/qr",
    fileName = `labels-${Date.now()}.pdf`,
    baseUrl,
  } = payload;

  const absoluteDir = path.join(process.cwd(), outputDir);
  if (!fs.existsSync(absoluteDir)) {
    fs.mkdirSync(absoluteDir, { recursive: true });
  }

  const fullPath = path.join(absoluteDir, fileName);
  const relativePath = baseUrl + "/" + path.join(outputDir, fileName);

  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    autoFirstPage: true,
  });

  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  const perPage = COLS * ROWS;  // 4 labels per page

  for (let i = 0; i < items.length; i++) {
    const posOnPage = i % perPage;

    if (i > 0 && posOnPage === 0) {
      doc.addPage({ size: "A4", layout: "landscape" });
    }

    const col = posOnPage % COLS;
    const row = Math.floor(posOnPage / COLS);

    const originX = MARGIN + col * (LABEL_W + GAP);
    const originY = MARGIN + row * (LABEL_H + GAP);

    await drawLabel(doc, items[i], originX, originY);
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on("finish", () => resolve(relativePath));
    stream.on("error", reject);
  });
};