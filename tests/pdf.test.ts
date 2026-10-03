import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPdf } from "../src/services/extract-pdf.js";
import type { Page } from "../src/services/safe-fetch.js";
import { createFetchHandler } from "../src/tools/fetch-source.js";
import { readConfig } from "../src/config/env.js";
import { fetchOutputSchema } from "../src/schemas/research.js";

// Minimal valid PDF fixture with accurate byte offsets; no network or renderer needed.
function pdf(pages = 1, text = "Readable research evidence") {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let i = 0; i < pages; i++) {
    const lines = text.match(/.{1,60}/g) ?? [""];
    const content = `BT /F1 12 Tf 72 720 Td ${lines.map((line) => `(${line}) Tj 0 -10 Td`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
function page(data: Uint8Array): Page { return { url: "https://public.org/paper.pdf", body: "", pdfData: data, contentType: "application/pdf", retrievedAt: "2026-10-04T00:00:00.000Z" }; }

test("PDF retrieval returns schema-valid text with page markers and layout warnings", async () => {
  const response = await createFetchHandler(readConfig({}), async () => page(pdf()))({ url: "https://public.org/paper.pdf" });
  assert.equal(response.structuredContent.status, "success");
  assert.equal(fetchOutputSchema.safeParse(response.structuredContent).success, true);
  assert.match(response.structuredContent.source!.text, /\[Page 1\].*\nReadable research evidence/);
  assert.equal(response.structuredContent.source!.extractionQuality, "pdf-text");
  assert.ok(response.structuredContent.warnings.some((warning) => warning.includes("visual layout")));
});

test("PDF extraction caps pages and text, rejects malformed/scanned PDFs, and respects cancellation/deadline", async () => {
  const partial = await extractPdf(page(pdf(3)), "https://public.org/paper.pdf", 1000, 5000, undefined, 2);
  assert.equal(partial.source.truncated, true);
  assert.ok(!partial.source.text.includes("[Page 3]"));
  assert.ok(partial.warnings.some((warning) => warning.includes("2 of 3")));
  const bounded = await extractPdf(page(pdf(2, "Evidence ".repeat(300))), "https://public.org/paper.pdf", 1000, 5000);
  assert.equal(bounded.source.text.length <= 1000, true);
  assert.equal(bounded.source.truncated, true);
  await assert.rejects(extractPdf(page(Buffer.from("bad pdf")), "https://public.org/paper.pdf", 1000, 5000), /could not be read/);
  await assert.rejects(extractPdf(page(pdf(1, "")), "https://public.org/paper.pdf", 1000, 5000), /require OCR/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(extractPdf(page(pdf()), "https://public.org/paper.pdf", 1000, 5000, controller.signal), /cancelled/);
  await assert.rejects(extractPdf(page(pdf()), "https://public.org/paper.pdf", 1000, 1), /deadline/);
});
