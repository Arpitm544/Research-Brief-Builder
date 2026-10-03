import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { Page } from "./safe-fetch.js";
import { extractText } from "./extract-text.js";
import { ResearchFailure } from "./errors.js";

// A separate worker makes the deadline enforceable even during CPU-heavy parsing.
const workerCode = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const { getDocument } = await import(workerData.library);
  const task = getDocument({ data: new Uint8Array(workerData.data), isEvalSupported: false,
    disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, stopAtErrors: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    let text = '', pagesRead = 0, truncated = false;
    for (let i = 1; i <= Math.min(doc.numPages, workerData.maxPages); i++) {
      const page = await doc.getPage(i);
      const reader = page.streamTextContent().getReader();
      text += '\\n\\n[Page ' + i + ']\\n';
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          for (const item of chunk.value.items) {
            if (!('str' in item)) continue;
            text += item.str + (item.hasEOL ? '\\n' : ' ');
            if (text.length > workerData.maxChars) { truncated = true; break; }
          }
          if (truncated) { await reader.cancel(new Error("Extracted-character limit reached")); break; }
        }
      } finally { reader.releaseLock(); page.cleanup(); }
      pagesRead++;
      if (truncated) break;
    }
    parentPort.postMessage({ text: text.slice(0, workerData.maxChars), pagesRead,
      totalPages: doc.numPages, truncated: truncated || pagesRead < doc.numPages });
  } finally { await task.destroy(); }
})().catch(() => parentPort.postMessage({ error: true }));
`;

export async function extractPdf(page: Page, requestedUrl: string, maxChars: number, timeoutMs: number, parentSignal?: AbortSignal, maxPages = 20) {
  if (!page.pdfData) throw new ResearchFailure("UNREADABLE_SOURCE", "The PDF contains no document data.");
  const signal = parentSignal ? AbortSignal.any([parentSignal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  if (signal.aborted) throw new ResearchFailure("FETCH_FAILED", "PDF extraction was cancelled.", true);
  const library = pathToFileURL(createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs")).href;
  const worker = new Worker(workerCode, { eval: true, workerData: { library, data: page.pdfData, maxChars, maxPages },
    resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16 } });
  try {
    const result = await new Promise<{ text: string; pagesRead: number; totalPages: number; truncated: boolean }>((resolve, reject) => {
      const onAbort = () => reject(new ResearchFailure(parentSignal?.aborted ? "FETCH_FAILED" : "FETCH_TIMEOUT", "PDF extraction was cancelled or exceeded its deadline.", true));
      const fail = () => reject(new ResearchFailure("UNREADABLE_SOURCE", "This PDF could not be read. It may be damaged, encrypted, or exceed the parser's memory limit."));
      signal.addEventListener("abort", onAbort, { once: true });
      worker.once("error", fail);
      worker.once("exit", () => fail());
      worker.once("message", (value) => { signal.removeEventListener("abort", onAbort); value.error ? fail() : resolve(value); });
      worker.once("exit", () => signal.removeEventListener("abort", onAbort));
    });
    if (!result.text.replace(/\[Page \d+\]/g, "").trim()) throw new ResearchFailure("UNREADABLE_SOURCE", "This PDF has no readable text. Scanned documents require OCR, which is unavailable.");
    const extracted = extractText({ ...page, contentType: "text/plain", body: result.text }, requestedUrl, maxChars);
    extracted.source.contentType = "application/pdf";
    extracted.source.extractionQuality = "pdf-text";
    extracted.source.truncated ||= result.truncated;
    extracted.warnings.push("PDF text order may differ from its visual layout; tables and figures may be incomplete.");
    if (result.truncated) extracted.warnings.push(`PDF extraction is partial: read ${result.pagesRead} of ${result.totalPages} pages, capped at ${maxPages} pages and ${maxChars} characters.`);
    return extracted;
  } finally { await worker.terminate(); }
}
