// Real document extraction for Master Formulas — no fake loading, no hardcoded
// results. Native PDF text first; OCR (tesseract.js, fully client-side, no API
// secrets) when pages are scans or native text is insufficient. Images always
// go through OCR. Runs only in the browser.

import * as pdfjs from "pdfjs-dist";

// In the default build, pdf.js runs off the main thread with a bundled worker.
// In the single-file artifact build (sandboxed, no external requests) it runs on
// the main thread instead so no worker asset or network fetch is needed.
let workerReady = false;
async function ensureWorker() {
  if (workerReady) return;
  workerReady = true;
  if (!__ARTIFACT__) {
    const mod = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = (mod as { default: string }).default;
  } else {
    pdfjs.GlobalWorkerOptions.workerSrc = "";
  }
}

export interface ExtractionResult {
  text: string;
  method: "pdf-text" | "ocr";
  confidence: number; // 0..1
  pages: number;
}

const MIN_TEXT_CHARS = 80; // below this, treat a PDF page as a scan needing OCR.

export type ProgressFn = (msg: string, pct?: number) => void;

async function ocrCanvas(
  canvas: HTMLCanvasElement,
  onProgress?: ProgressFn,
): Promise<{ text: string; confidence: number }> {
  if (__ARTIFACT__) {
    throw new Error(
      "On-device OCR isn’t available in this hosted preview (it needs to download a language model, which the sandbox blocks). Enter items manually, or use a text-based PDF / the batch library. The installable version supports photo OCR.",
    );
  }
  const Tesseract = await import("tesseract.js");
  const worker = await Tesseract.createWorker("eng", 1, {
    logger: (m: any) => {
      if (m.status && onProgress) onProgress(`OCR: ${m.status}`, m.progress);
    },
  });
  try {
    // OSD-friendly settings help rotated / imperfect mobile photos.
    const { data } = await worker.recognize(canvas);
    return { text: data.text || "", confidence: (data.confidence ?? 0) / 100 };
  } finally {
    await worker.terminate();
  }
}

async function renderPdfPageToCanvas(page: any, scale = 2): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export async function extractFromPdf(
  data: ArrayBuffer,
  onProgress?: ProgressFn,
): Promise<ExtractionResult> {
  onProgress?.("Reading PDF…", 0.05);
  await ensureWorker();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = doc.numPages;
  let nativeText = "";
  const pageTexts: string[] = [];

  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map((it: any) => ("str" in it ? it.str : "")).filter(Boolean);
    // Reconstruct line breaks using item vertical positions.
    const lineText = reconstructLines(content.items);
    pageTexts.push(lineText || strings.join(" "));
    nativeText += pageTexts[p - 1] + "\n";
  }

  if (nativeText.replace(/\s/g, "").length >= MIN_TEXT_CHARS) {
    onProgress?.("Extracted native PDF text", 1);
    return { text: nativeText, method: "pdf-text", confidence: 0.95, pages };
  }

  if (__ARTIFACT__) {
    // No OCR in the sandbox; return whatever native text exists (may be sparse)
    // so the editable review screen can be completed manually.
    return { text: nativeText, method: "pdf-text", confidence: 0.25, pages };
  }

  // Scanned / image-only PDF -> OCR each page.
  let ocrText = "";
  let confSum = 0;
  for (let p = 1; p <= pages; p++) {
    onProgress?.(`OCR page ${p}/${pages}…`, p / pages);
    const page = await doc.getPage(p);
    const canvas = await renderPdfPageToCanvas(page, 2);
    const { text, confidence } = await ocrCanvas(canvas, onProgress);
    ocrText += text + "\n";
    confSum += confidence;
  }
  return { text: ocrText, method: "ocr", confidence: pages ? confSum / pages : 0, pages };
}

/** Native PDF text only (no OCR) — used to index the batch library quickly. */
export async function nativePdfText(data: ArrayBuffer): Promise<string> {
  await ensureWorker();
  const doc = await pdfjs.getDocument({ data }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out += reconstructLines(content.items) + "\n";
  }
  return out;
}

/** Reconstruct newline-separated lines from pdf.js text items by y-position. */
function reconstructLines(items: any[]): string {
  const rows: { y: number; x: number; s: string }[] = [];
  for (const it of items) {
    if (!("str" in it) || !it.str) continue;
    const tr = it.transform || [1, 0, 0, 1, 0, 0];
    rows.push({ y: Math.round(tr[5]), x: tr[4], s: it.str });
  }
  rows.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines: string[] = [];
  let curY: number | null = null;
  let cur: string[] = [];
  for (const r of rows) {
    if (curY == null || Math.abs(r.y - curY) <= 3) {
      cur.push(r.s);
      curY = curY == null ? r.y : curY;
    } else {
      lines.push(cur.join(" "));
      cur = [r.s];
      curY = r.y;
    }
  }
  if (cur.length) lines.push(cur.join(" "));
  return lines.join("\n");
}

export async function extractFromImage(
  file: Blob,
  onProgress?: ProgressFn,
): Promise<ExtractionResult> {
  onProgress?.("Loading image…", 0.05);
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    // Cap dimension for OCR speed while keeping detail.
    const maxDim = 2200;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const { text, confidence } = await ocrCanvas(canvas, onProgress);
    return { text, method: "ocr", confidence, pages: 1 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Route a file to the right extractor by type. */
export async function extractDocument(
  file: File,
  onProgress?: ProgressFn,
): Promise<ExtractionResult> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    const buf = await file.arrayBuffer();
    return extractFromPdf(buf, onProgress);
  }
  return extractFromImage(file, onProgress);
}
