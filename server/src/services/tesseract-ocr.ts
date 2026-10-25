import { createRequire } from 'node:module';
import path from 'node:path';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { createWorker, type Worker } from 'tesseract.js';
import { noProviderExtractor, parseFdrText, type ApprovedMime, type DocumentExtractor } from './fdr-document-processing.js';

const require = createRequire(import.meta.url);
const englishData = require('@tesseract.js-data/eng') as { code: string; gzip: boolean; langPath: string };
const pdfjsBuildDirectory = path.dirname(require.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
const MAX_PDF_PAGES = 10;
const MAX_RENDERED_BYTES = 50 * 1024 * 1024;

let workerPromise: Promise<Worker> | undefined;
let queue: Promise<void> = Promise.resolve();

function getWorker() {
  workerPromise ??= createWorker(englishData.code, 1, {
    langPath: englishData.langPath,
    gzip: englishData.gzip,
    cacheMethod: 'none',
  }).catch((error: unknown) => {
    workerPromise = undefined;
    throw error;
  });
  return workerPromise;
}

async function renderPdfPages(pdfBytes: Buffer) {
  // Node may provide browser-like canvas globals that are incompatible with NAPI canvas.
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: Uint8Array.from(pdfBytes),
    isEvalSupported: false,
    stopAtErrors: true,
    maxImageSize: 40_000_000,
    standardFontDataUrl: `${path.resolve(pdfjsBuildDirectory, '../../standard_fonts')}${path.sep}`,
  });
  const pdf = await loadingTask.promise;
  try {
    if (pdf.numPages < 1) throw new Error('PDF contains no renderable pages');
    let totalBytes = 0;
    const pages: Buffer[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, MAX_PDF_PAGES); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(220 / 72, 12_000 / unscaled.width, 12_000 / unscaled.height, Math.sqrt(40_000_000 / (unscaled.width * unscaled.height)));
      if (!Number.isFinite(scale) || scale <= 0) throw new Error('PDF page dimensions exceed OCR processing limits');
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
      page.cleanup();
      const image = canvas.toBuffer('image/png');
      totalBytes += image.length;
      if (image.length > 25 * 1024 * 1024 || totalBytes > MAX_RENDERED_BYTES) throw new Error('Rendered PDF exceeds OCR processing limits');
      pages.push(image);
    }
    return pages;
  } finally {
    await pdf.destroy();
  }
}

async function recognize(bytes: Buffer, mime: ApprovedMime) {
  const images = mime === 'application/pdf' ? await renderPdfPages(bytes) : [bytes];
  let totalConfidence = 0;
  const pageTexts: string[] = [];
  const worker = await getWorker();
  for (const image of images) {
    const result = await worker.recognize(image, { rotateAuto: true });
    const text = result.data.text.trim();
    if (text) pageTexts.push(text);
    totalConfidence += result.data.confidence;
  }
  const text = pageTexts.join('\n\n').slice(0, 200_000);
  if (!text.trim()) throw new Error('No readable text was found in the uploaded document');
  return { text, fields: parseFdrText(text, Math.max(0, Math.min(1, totalConfidence / images.length / 100))) };
}

function queueRecognition(bytes: Buffer, mime: ApprovedMime) {
  const task = queue.then(() => recognize(bytes, mime));
  queue = task.then(() => undefined, () => undefined);
  return task;
}

export const tesseractDocumentExtractor: DocumentExtractor = {
  async extractPdfText(bytes) {
    return noProviderExtractor.extractPdfText(bytes);
  },
  async runOcr(bytes, mime) {
    return (await queueRecognition(bytes, mime)).fields;
  },
  runOcrWithText: queueRecognition,
};

export async function shutdownOcrEngine() {
  const worker = await workerPromise?.catch(() => undefined);
  workerPromise = undefined;
  if (worker) await worker.terminate();
}
