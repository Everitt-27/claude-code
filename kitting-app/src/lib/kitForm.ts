// Generate the Material & Packaging Kit Form (WH-0001-MPKF-A-V5) as a clean PDF
// with pdf-lib. The generated document contains ONLY the controlled form — no
// app URL, no browser page titles, dates, headers or footers. Rows follow the
// draggable kit-list order; multiple lots/locations print as separate rows.

import { PDFDocument, PDFFont, StandardFonts, rgb, RGB } from "pdf-lib";
import { Kit } from "./types";
import { fmtQty } from "./format";

// Landscape US Letter.
const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 16;

const COLS = [
  { key: "pcfb", label: "PC/FB\nCheck", w: 48 },
  { key: "loc", label: "Inventory\nLocation", w: 82 },
  { key: "desc", label: "Material/Packaging Description", w: 188 },
  { key: "part", label: "Part/Item #", w: 90 },
  { key: "lot", label: "YE Lot #", w: 66 },
  { key: "amt", label: "Amount\n(In-Process)", w: 66 },
  { key: "uom", label: "UOM", w: 34 },
  { key: "pkg", label: "# of\nPackages", w: 50 },
  { key: "ret", label: "Return  Amount", w: 60 },
  { key: "units", label: "Units", w: 34 },
  { key: "rtn", label: "Rtn Chk", w: 46 },
] as const;

const ROWS_PER_PAGE = 15;

interface RowData {
  loc: string;
  desc: string;
  part: string;
  lot: string;
  amt: string;
  uom: string;
  pkg: string;
}

function buildRows(kit: Kit): RowData[] {
  const rows: RowData[] = [];
  const order = kit.order.length ? kit.order : kit.items.map((i) => i.id);
  for (const id of order) {
    const item = kit.items.find((i) => i.id === id);
    if (!item) continue;
    if (item.allocations.length === 0) {
      rows.push({
        loc: "",
        desc: item.name,
        part: item.itemCode,
        lot: "",
        amt: "",
        uom: item.requiredUom || "",
        pkg: "",
      });
    } else {
      for (const a of item.allocations) {
        rows.push({
          loc: a.location,
          desc: item.name,
          part: item.itemCode,
          lot: a.yeLot,
          amt: fmtQty(a.amount),
          uom: a.uom,
          pkg: a.packages != null ? String(a.packages) : "",
        });
      }
    }
  }
  return rows;
}

/** Shrink font size until text fits `maxW`, then truncate with an ellipsis. */
function fitText(text: string, font: PDFFont, maxW: number, startSize: number, minSize = 6): { text: string; size: number } {
  let size = startSize;
  while (size > minSize && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  if (font.widthOfTextAtSize(text, size) <= maxW) return { text, size };
  // Still too wide at min size -> truncate.
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "…", minSize) > maxW) t = t.slice(0, -1);
  return { text: t + "…", size: minSize };
}

/** Wrap text into up to `maxLines` lines fitting `maxW`. */
function wrapText(text: string, font: PDFFont, size: number, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(trial, size) <= maxW) {
      cur = trial;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines) {
    // Ensure last line fits with ellipsis if content remains.
    const fit = fitText(lines[maxLines - 1], font, maxW, size);
    lines[maxLines - 1] = fit.text;
  }
  return lines.length ? lines : [""];
}

export async function generateKitFormPdf(kit: Kit): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Material & Packaging Kit Form");
  pdf.setProducer("Yellow Emperor Kitting");
  pdf.setCreator("Yellow Emperor Kitting");

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const boldOblique = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const rows = buildRows(kit);
  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));

  for (let p = 0; p < pageCount; p++) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const pageRows = rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    drawPage(page, { font, bold, boldOblique, oblique }, kit, pageRows, p + 1, pageCount);
  }

  return pdf.save();
}

interface Fonts {
  font: PDFFont;
  bold: PDFFont;
  boldOblique: PDFFont;
  oblique: PDFFont;
}

const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.85, 0.85, 0.85);
const YE_GREEN = rgb(0.043, 0.42, 0.227);

function drawPage(
  page: any,
  f: Fonts,
  kit: Kit,
  rows: RowData[],
  pageNum: number,
  pageTotal: number,
) {
  const left = MARGIN;
  const right = PAGE_W - MARGIN;
  const top = PAGE_H - MARGIN;
  const box = (x: number, y: number, w: number, h: number, opts: { fill?: RGB; border?: number } = {}) => {
    if (opts.fill) page.drawRectangle({ x, y, width: w, height: h, color: opts.fill });
    page.drawRectangle({ x, y, width: w, height: h, borderColor: BLACK, borderWidth: opts.border ?? 1 });
  };
  const text = (s: string, x: number, y: number, size: number, fnt: PDFFont, color: RGB = BLACK) =>
    page.drawText(s, { x, y, size, font: fnt, color });

  // ---- Title + logo ----
  const headerTop = top;
  // Simple Yellow Emperor wordmark + droplet leaf mark.
  drawDroplet(page, left + 22, headerTop - 30, 20);
  text("yellow", left + 40, headerTop - 20, 20, f.bold, YE_GREEN);
  text("emperor", left + 40, headerTop - 40, 20, f.bold, YE_GREEN);
  const title = "Material & Packaging Kit Form";
  const tSize = 26;
  text(title, 300 + (PAGE_W - 300 - f.bold.widthOfTextAtSize(title, tSize)) / 2, headerTop - 30, tSize, f.bold);

  // ---- Info grid (Customer/Product/Fulfillment/Approved + right column) ----
  const gridTop = headerTop - 52;
  const gridH = 88;
  const gridLeft = 300;
  const rowH = gridH / 4;
  const colMid = gridLeft + 262;
  box(gridLeft, gridTop - gridH, right - gridLeft, gridH);
  for (let i = 1; i < 4; i++)
    page.drawLine({ start: { x: gridLeft, y: gridTop - rowH * i }, end: { x: right, y: gridTop - rowH * i }, thickness: 1, color: BLACK });
  page.drawLine({ start: { x: colMid, y: gridTop }, end: { x: colMid, y: gridTop - gridH }, thickness: 1, color: BLACK });

  const labelVal = (label: string, value: string, x: number, rowIdx: number, valX: number) => {
    const y = gridTop - rowH * rowIdx - rowH / 2 - 4;
    text(label, x + 6, y, 11, f.bold);
    const fit = fitText(value || "", f.font, valX + 150 - (x + f.bold.widthOfTextAtSize(label, 11) + 12), 12, 11);
    text(fit.text, x + f.bold.widthOfTextAtSize(label, 11) + 12, y, fit.size, f.font);
  };
  labelVal("Customer:", kit.customer, gridLeft, 0, gridLeft);
  labelVal("Product:", kit.product, gridLeft, 1, gridLeft);
  labelVal("Kit Fulfillment By:", "", gridLeft, 2, gridLeft);
  labelVal("Kit Approved By:", "", gridLeft, 3, gridLeft);
  labelVal("Fish Bowl Location:", kit.fishbowlLocation, colMid, 0, colMid);
  labelVal("Batch #:", kit.batch, colMid, 1, colMid);
  rightDate(page, f, "Date Fulfilled:", colMid, gridTop - rowH * 2 - rowH / 2 - 4, right);
  rightDate(page, f, "Date Approved:", colMid, gridTop - rowH * 3 - rowH / 2 - 4, right);

  // ---- Kit Details banner ----
  const bannerY = gridTop - gridH - 20;
  box(left, bannerY, right - left, 18, { fill: GRAY });
  const kd = "Kit Details";
  text(kd, (PAGE_W - f.bold.widthOfTextAtSize(kd, 11)) / 2, bannerY + 4, 11, f.bold);

  // ---- Table header ----
  const tableTop = bannerY;
  const colHeaderH = 26;
  let x = left;
  const colX: number[] = [];
  for (const c of COLS) {
    colX.push(x);
    box(x, tableTop - colHeaderH, c.w, colHeaderH, { fill: GRAY });
    const lines = c.label.split("\n");
    lines.forEach((ln, i) => {
      const size = 8;
      const w = f.boldOblique.widthOfTextAtSize(ln, size);
      text(ln, x + (c.w - w) / 2, tableTop - 11 - i * 9, size, f.boldOblique);
    });
    x += c.w;
  }
  colX.push(x);

  // ---- Body rows ----
  const bodyH = 22;
  let rowY = tableTop - colHeaderH;
  for (let r = 0; r < ROWS_PER_PAGE; r++) {
    const data = rows[r];
    const yTop = rowY;
    rowY -= bodyH;
    // Cell borders.
    for (let c = 0; c < COLS.length; c++) box(colX[c], rowY, COLS[c].w, bodyH);
    if (!data) continue;
    const cell = (colKey: string, value: string, opts: { wrap?: boolean } = {}) => {
      const ci = COLS.findIndex((c) => c.key === colKey);
      if (ci < 0 || !value) return;
      const cx = colX[ci];
      const cw = COLS[ci].w;
      if (opts.wrap) {
        const lines = wrapText(value, f.font, 9.5, cw - 6, 2);
        lines.forEach((ln, i) => text(ln, cx + 3, rowY + bodyH - 9 - i * 9.5, 9.5, f.font));
      } else {
        const fit = fitText(value, f.font, cw - 6, 10.5);
        text(fit.text, cx + 3, rowY + (bodyH - fit.size) / 2 + 1, fit.size, f.font);
      }
    };
    // PC/FB check shows a "/" divider as on the paper form.
    const pcx = colX[0];
    text("/", pcx + COLS[0].w / 2 - 2, rowY + bodyH / 2 - 4, 10, f.font);
    cell("loc", data.loc);
    cell("desc", data.desc, { wrap: true });
    cell("part", data.part);
    cell("lot", data.lot);
    cell("amt", data.amt);
    cell("uom", data.uom);
    cell("pkg", data.pkg);
    void yTop;
  }

  // ---- Notes ----
  const notesTop = rowY;
  const notesH = 44;
  box(left, notesTop - notesH, right - left, notesH);
  text("Notes:", left + 4, notesTop - 12, 10, f.bold);
  if (kit.notes) {
    const lines = wrapText(kit.notes, f.font, 9, right - left - 12, 3);
    lines.forEach((ln, i) => text(ln, left + 44, notesTop - 12 - i * 11, 9, f.font));
  }

  // ---- Signoff band ----
  const bandTop = notesTop - notesH;
  const bandH = 40;
  box(left, bandTop - bandH, right - left, bandH, { fill: GRAY });
  page.drawLine({ start: { x: left, y: bandTop - bandH / 2 }, end: { x: right, y: bandTop - bandH / 2 }, thickness: 1, color: BLACK });
  text("Kit Inspected & Received By:", left + 6, bandTop - 13, 11, f.bold);
  text("Return Amount Approved By:", left + 6, bandTop - bandH / 2 - 13, 11, f.bold);
  rightDate(page, f, "Date Inspected/Received:", left + 360, bandTop - 13, right - 6);
  rightDate(page, f, "Date Return Approved:", left + 360, bandTop - bandH / 2 - 13, right - 6);

  // ---- Compliance note ----
  const note = "Note: Once filled out, this form will be turned in, reviewed and filed in accordance with the Compliance Department.";
  const nSize = 9;
  text(note, (PAGE_W - f.boldOblique.widthOfTextAtSize(note, nSize)) / 2, bandTop - bandH - 12, nSize, f.boldOblique);

  // ---- QC signoff + footer version line ----
  const qcTop = bandTop - bandH - 20;
  box(left, qcTop - 20, 640, 20);
  text("QC Signoff:", left + 6, qcTop - 14, 11, f.bold);
  text("Review Date:", left + 300, qcTop - 14, 11, f.bold);
  text("/         /", left + 400, qcTop - 14, 11, f.font);
  const pageLabel = `page ______ of ______`;
  text(pageLabel, right - f.bold.widthOfTextAtSize(pageLabel, 9) - 4, qcTop - 32, 9, f.bold);
  text(`(${pageNum} of ${pageTotal})`, right - 60, qcTop - 44, 8, f.font);

  const verY = qcTop - 44;
  text("Version:", left + 60, verY, 9, f.bold);
  text("WH-0001-MPKF-A-V5", left + 110, verY, 9, f.font);
  text("QC Approval:", left + 300, verY, 9, f.bold);
  text("Date:", left + 480, verY, 9, f.bold);
  text("5/4/2026", left + 510, verY, 9, f.font);
}

function rightDate(page: any, f: Fonts, label: string, x: number, y: number, right: number) {
  page.drawText(label, { x: x + 6, y, size: 11, font: f.bold, color: BLACK });
  const slash = "/           /";
  const w = f.font.widthOfTextAtSize(slash, 11);
  page.drawText(slash, { x: right - w - 8, y, size: 11, font: f.font, color: BLACK });
}

/** Draw a small droplet + leaf-vein mark to evoke the Yellow Emperor logo. */
function drawDroplet(page: any, cx: number, cy: number, r: number) {
  page.drawCircle({ x: cx, y: cy - r * 0.3, size: r * 0.75, color: YE_GREEN });
  page.drawLine({ start: { x: cx, y: cy + r * 0.8 }, end: { x: cx - r * 0.7, y: cy - r * 0.2 }, thickness: 2, color: YE_GREEN });
  page.drawLine({ start: { x: cx, y: cy + r * 0.8 }, end: { x: cx + r * 0.7, y: cy - r * 0.2 }, thickness: 2, color: YE_GREEN });
  page.drawLine({ start: { x: cx, y: cy + r * 0.9 }, end: { x: cx, y: cy - r * 0.9 }, thickness: 1.2, color: rgb(1, 1, 1) });
}
