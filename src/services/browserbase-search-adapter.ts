import { JSDOM } from "jsdom";
import { z } from "zod";
import { ResearchFailure } from "./errors.js";
import { validatePublicUrl } from "./safe-fetch.js";
import type { SearchProvider } from "./search-provider.js";
import { domainMatches, publicationDate, sourceId } from "./source-utils.js";

const responseSchema = z.object({
  results: z.array(z.object({
    title: z.string().max(2000),
    url: z.string().max(4096),
    description: z.string().max(20000).optional(),
    publishedDate: z.string().max(100).optional(),
  })).max(25),
});

function plainText(value: string) {
  return (JSDOM.fragment(value).textContent ?? "").replace(/\s+/g, " ").trim();
}

export class BrowserbaseSearchProvider implements SearchProvider {
  readonly name = "browserbase" as const;
  constructor(
    private readonly apiKey: string | undefined,
    private readonly timeoutMs: number,
    private readonly request: typeof fetch = fetch,
  ) {}

  async search(input: Parameters<SearchProvider["search"]>[0], parentSignal?: AbortSignal) {
    if (!this.apiKey) throw new ResearchFailure("PROVIDER_NOT_CONFIGURED", "Live search requires BROWSERBASE_API_KEY. Add a key to .env or choose SEARCH_PROVIDER=demo.");
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = parentSignal ? AbortSignal.any([timeout, parentSignal]) : timeout;
    const query = Array.from(input.query).slice(0, 200).join("");
    // Ask for extra candidates when filtering locally so domain restrictions remain strict.
    const numResults = input.domains?.length ? 25 : input.maxResults;
    try {
      const response = await this.request("https://api.browserbase.com/v1/search", {
        method: "POST", signal, redirect: "error",
        headers: { Accept: "application/json", "Content-Type": "application/json", "x-bb-api-key": this.apiKey },
        body: JSON.stringify({ query, numResults }),
      });
      try {
        if (response.status === 429) throw new ResearchFailure("SEARCH_RATE_LIMITED", "The search provider rate limit was reached. Retry later.", true);
        if ([401, 403].includes(response.status)) throw new ResearchFailure("PROVIDER_NOT_CONFIGURED", "Browserbase rejected the API key or Search is not enabled for this project.");
        if (!response.ok) throw new ResearchFailure("SEARCH_UNAVAILABLE", "The search provider is unavailable. Retry later.", true);
        if (!response.headers.get("content-type")?.includes("application/json")) {
          throw new ResearchFailure("SEARCH_UNAVAILABLE", "The search provider returned an unreadable response.", true);
        }
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        const reader = response.body?.getReader();
        if (!reader) throw new ResearchFailure("SEARCH_UNAVAILABLE", "The search provider returned an empty response.", true);
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > 1000000) throw new ResearchFailure("SEARCH_UNAVAILABLE", "The search response exceeded the provider-response limit.", true);
            chunks.push(value);
          }
        } finally { await reader.cancel(); reader.releaseLock(); }
        const parsed = responseSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        if (!parsed.success) throw new ResearchFailure("SEARCH_UNAVAILABLE", "The search provider returned an unexpected response.", true);
        const warnings: string[] = [];
        if (query.length < input.query.length) warnings.push("The question was shortened to Browserbase Search's 200-character limit.");
        const sources = [];
        const seen = new Set<string>();
        let skipped = 0;
        for (const result of parsed.data.results) {
          let sourceUrl: URL;
          try { sourceUrl = validatePublicUrl(result.url); } catch { skipped++; continue; }
          if (!domainMatches(sourceUrl.hostname, input.domains)) { skipped++; continue; }
          if (seen.has(sourceUrl.href)) continue;
          seen.add(sourceUrl.href);
          sources.push({
            sourceId: sourceId(sourceUrl.href), title: plainText(result.title).slice(0, 300) || sourceUrl.hostname,
            url: sourceUrl.href, domain: sourceUrl.hostname,
            publishedAt: publicationDate(result.publishedDate), snippet: plainText(result.description ?? result.title).slice(0, 1000),
          });
          if (sources.length >= input.maxResults) break;
        }
        if (skipped) warnings.push("Some provider results were omitted because their URLs were unsafe or outside the requested domains.");
        if (!sources.length) warnings.push("No usable sources were found. Narrow or rephrase the question, or relax the domain filter.");
        return { sources, warnings };
      } finally { await response.body?.cancel().catch(() => {}); }
    } catch (error) {
      if (timeout.aborted) throw new ResearchFailure("SEARCH_TIMEOUT", "The search provider did not respond within the deadline.", true);
      if (error instanceof ResearchFailure) throw error;
      throw new ResearchFailure("SEARCH_UNAVAILABLE", "Search could not be completed. Retry later.", true);
    }
  }
}
