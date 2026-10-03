import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { RetrievedSource } from "../schemas/source.js";
import { ResearchFailure } from "./errors.js";
import type { Page } from "./safe-fetch.js";
import { publicationDate, sourceId } from "./source-utils.js";

const blockSelector = "p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, br, div, section, article, main, ul, ol, dl, dt, dd, figure, figcaption, table, tr, td, th";

export function cleanText(text: string) {
  return text.replace(/\r\n?/g, "\n").replace(/[\t\u00a0 ]+/g, " ")
    .replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractText(page: Page, requestedUrl: string, maxChars: number): {
  source: RetrievedSource;
  warnings: string[];
} {
  let text = page.body;
  let title = new URL(page.url).hostname;
  let publishedAt: string | undefined;
  let quality: RetrievedSource["extractionQuality"] = "plain-text";
  const warnings: string[] = [];
  if (page.contentType !== "text/plain") {
    // No script execution or external resource loading. Page markup is untrusted.
    const dom = new JSDOM(page.body, { url: page.url });
    try {
      const document = dom.window.document;
      title = cleanText(document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "") ||
        cleanText(document.title) || title;
      const dateValue = document.querySelector('meta[property="article:published_time"], meta[name="date"], meta[itemprop="datePublished"]')?.getAttribute("content") ??
        document.querySelector('time[itemprop="datePublished"]')?.getAttribute("datetime");
      publishedAt = publicationDate(dateValue);
      if (document.querySelector('meta[name="robots"]')?.getAttribute("content")?.includes("noarchive")) {
        warnings.push("The page asks crawlers not to archive its contents; this app keeps no stored copy.");
      }
      let article: ReturnType<Readability["parse"]> = null;
      try { article = new Readability(document.cloneNode(true) as Document).parse(); } catch { /* Use bounded fallback below. */ }
      if (article?.textContent?.trim()) {
        const articleDom = new JSDOM(article.content ?? "");
        try {
          articleDom.window.document.querySelectorAll(blockSelector).forEach((element) => element.append("\n\n"));
          text = articleDom.window.document.body.textContent ?? article.textContent;
        } finally { articleDom.window.close(); }
        title = cleanText(article.title ?? "") || title;
        publishedAt ??= publicationDate(article.publishedTime);
        quality = "article";
      } else {
        document.querySelectorAll("script, style, noscript, nav, header, footer, aside, form, iframe, template, [hidden], [aria-hidden='true']").forEach((element) => element.remove());
        const root = document.querySelector("main, article, [role='main']") ?? document.body;
        root.querySelectorAll(blockSelector).forEach((element) => element.append("\n\n"));
        text = root.textContent ?? "";
        quality = "fallback";
        warnings.push("Article extraction was incomplete; text may include unrelated page content.");
      }
    } finally { dom.window.close(); }
  }
  text = cleanText(text);
  if (!text) throw new ResearchFailure("UNREADABLE_SOURCE", "The page contains no readable text. It may require JavaScript, sign-in, or a subscription.");
  if (text.length < 300) warnings.push("Very little readable text was returned. This may be a preview or blocked page.");
  const truncated = text.length > maxChars;
  if (truncated) {
    text = text.slice(0, maxChars);
    warnings.push(`Source text was truncated at ${maxChars.toLocaleString("en-US")} characters.`);
  }
  if (requestedUrl !== page.url) warnings.push("The source redirected; cite the final retrieved URL shown here.");
  return {
    source: {
      sourceId: sourceId(page.url), title: title.slice(0, 300), url: page.url,
      requestedUrl, domain: new URL(page.url).hostname, publishedAt,
      snippet: text.slice(0, 300), text, retrievedAt: page.retrievedAt,
      contentType: page.contentType, truncated, extractionQuality: quality,
    },
    warnings,
  };
}
