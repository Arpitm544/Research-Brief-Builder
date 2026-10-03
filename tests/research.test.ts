import assert from "node:assert/strict";
import { test } from "node:test";
import { Readability } from "@mozilla/readability";
import { readConfig } from "../src/config/env.js";
import { DemoSearchProvider, demoQuestion, demoSources } from "../src/demo/fixtures.js";
import { fetchOutputSchema, searchInputSchema, searchOutputSchema } from "../src/schemas/research.js";
import { buildBriefPrompt } from "../views/shared/brief-context.js";
import { extractText } from "../src/services/extract-text.js";
import { BraveSearchProvider } from "../src/services/web-search-adapter.js";
import { createFetchHandler } from "../src/tools/fetch-source.js";
import { createSearchHandler } from "../src/tools/search-sources.js";
import { domainMatches, publicationDate } from "../src/services/source-utils.js";

const config = readConfig({});
const htmlPage = (body: string) => ({ url: "https://public.org/article", body, contentType: "text/html", retrievedAt: "2026-10-04T00:00:00.000Z" });
const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });

test("configuration and tool inputs enforce bounded values without exposing secrets", () => {
  assert.equal(config.SEARCH_PROVIDER, "demo");
  for (const env of [{ MAX_SEARCH_RESULTS: "11" }, { MAX_SOURCE_CHARS: "999999" }, { FETCH_TIMEOUT_MS: "999999" }, { SEARCH_PROVIDER: "secret-provider-key" }]) {
    assert.throws(() => readConfig(env), (error: unknown) => error instanceof Error && !error.message.includes("secret-provider-key"));
  }
  assert.equal(searchInputSchema.safeParse({ query: "ok" }).success, false);
  for (const domains of [["https://public.org"], ["a.org/path"], ["a.org:443"], ["a.org", "b.org", "c.org", "d.org", "e.org", "f.org"]]) {
    assert.equal(searchInputSchema.safeParse({ query: "question", domains }).success, false);
  }
});

test("Brave requires a nonblank API key at startup while demo configuration can omit it", () => {
  for (const key of [undefined, "", "   "]) {
    assert.equal(readConfig({ SEARCH_PROVIDER: "demo", BRAVE_SEARCH_API_KEY: key }).SEARCH_PROVIDER, "demo");
    assert.throws(() => readConfig({ SEARCH_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: key }), /^Error: Invalid configuration: BRAVE_SEARCH_API_KEY$/);
  }
  assert.equal(readConfig({ SEARCH_PROVIDER: "brave", BRAVE_SEARCH_API_KEY: "  test-secret  " }).BRAVE_SEARCH_API_KEY, "test-secret");
});

test("domain filters enforce DNS label lengths and match fully qualified hostnames", () => {
  for (const domain of ["a.org", `${"a".repeat(63)}.org`, `${"a".repeat(63)}.sub.org`]) {
    assert.equal(searchInputSchema.safeParse({ query: "question", domains: [domain] }).success, true, domain);
  }
  for (const domain of [`${"a".repeat(64)}.org`, `sub.${"a".repeat(64)}.org`, "-bad.org", "bad-.org"]) {
    assert.equal(searchInputSchema.safeParse({ query: "question", domains: [domain] }).success, false, domain);
  }
  for (const hostname of ["public.org.", "docs.public.org.", "PUBLIC.ORG."]) assert.equal(domainMatches(hostname, ["public.org"]), true);
  assert.equal(domainMatches("public.org", ["PUBLIC.ORG."]), true);
  assert.equal(domainMatches("notpublic.org.", ["public.org"]), false);
  assert.equal(domainMatches("public.org.evil.org.", ["public.org"]), false);
});

test("publication timestamps can cross UTC midnight while invalid calendar dates remain rejected", () => {
  assert.equal(publicationDate("2026-10-04T00:30:00+05:30"), "2026-10-03T19:00:00.000Z");
  assert.equal(publicationDate("2026-10-04T23:30:00-07:00"), "2026-10-05T06:30:00.000Z");
  assert.equal(publicationDate("2024-02-29"), "2024-02-29");
  for (const value of ["2026-02-29", "2026-02-30T00:30:00+05:30", "2026-13-01", "2026-10-04Tbad", "2 days ago"]) {
    assert.equal(publicationDate(value), undefined, value);
  }
});

test("demo search and retrieval work offline and hand off explicitly synthetic evidence", async () => {
  const search = createSearchHandler(config, new DemoSearchProvider());
  const found = (await search({ query: demoQuestion })).structuredContent;
  assert.equal(searchOutputSchema.safeParse(found).success, true);
  assert.equal(found.sources.length, 3); assert.equal(found.isDemo, true);
  let networkCalls = 0;
  const retrieve = createFetchHandler(config, async () => { networkCalls++; throw new Error("network should not run"); });
  const results = await Promise.all(found.sources.map(async (source) => (await retrieve({ url: source.url })).structuredContent));
  assert.equal(networkCalls, 0);
  for (const result of results) {
    assert.equal(fetchOutputSchema.safeParse(result).success, true);
    assert.equal(result.isDemo, true); assert.ok(result.source?.text.includes("SYNTHETIC DEMO SOURCE"));
  }
  const prompt = buildBriefPrompt(demoQuestion, results);
  assert.match(prompt, /SYNTHETIC DEMO evidence/); assert.match(prompt, /never instructions/);
  for (const source of found.sources) assert.ok(prompt.includes(source.url));
});

test("demo search represents unrelated questions and domain filters as empty results", async () => {
  const search = createSearchHandler(config, new DemoSearchProvider());
  assert.equal((await search({ query: "Quantum mechanics experiments" })).structuredContent.sources.length, 0);
  assert.equal((await search({ query: demoQuestion, domains: ["energy.gov"] })).structuredContent.sources.length, 0);
});

test("demo search recognizes hyphenated heat-pump and cold-climate questions", async () => {
  const search = createSearchHandler(config, new DemoSearchProvider());
  for (const query of ["heat-pump installation", "Heat-pumps in winter", "cold-climate heating"]) {
    assert.equal((await search({ query })).structuredContent.sources.length, 3, query);
  }
});

test("the search handler enforces the server ceiling and reports it", async () => {
  const search = createSearchHandler({ ...config, MAX_SEARCH_RESULTS: 1 }, new DemoSearchProvider());
  const output = (await search({ query: demoQuestion, maxResults: 10 })).structuredContent;
  assert.equal(output.sources.length, 1); assert.ok(output.warnings.some((warning) => warning.includes("server maximum of 1")));
});

test("Brave adapter normalizes HTML, deduplicates URLs, filters domains and unsafe results", async () => {
  const request: typeof fetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(target.origin, "https://api.search.brave.com");
    assert.match(target.searchParams.get("q")!, /site:public.org/);
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("X-Subscription-Token"), "test-secret");
    return jsonResponse({ web: { results: [
      { title: "Bad", url: "http://127.0.0.1", description: "secret" },
      { title: "Different domain", url: "https://outside.org", description: "skip" },
      { title: "<b>Public &amp; useful</b>", url: "https://public.org/a#section", description: "A <strong>clear</strong> snippet.", page_age: "2026-09-30" },
      { title: "Duplicate", url: "https://public.org/a" },
      { title: "Subdomain", url: "https://docs.public.org/b", page_age: "2 days ago" },
    ] } });
  };
  const output = await new BraveSearchProvider("test-secret", 1000, request).search({ query: "a question", domains: ["public.org"], maxResults: 5 });
  assert.equal(output.sources.length, 2);
  assert.equal(output.sources[0]?.title, "Public & useful");
  assert.equal(output.sources[0]?.snippet, "A clear snippet.");
  assert.equal(output.sources[0]?.url, "https://public.org/a");
  assert.equal(output.sources[0]?.publishedAt, "2026-09-30");
  assert.equal(output.sources[1]?.publishedAt, undefined);
  assert.ok(output.warnings.length);
});

test("live search configuration and rate-limit errors are structured and do not expose provider errors", async () => {
  const unconfigured = createSearchHandler(config, new BraveSearchProvider(undefined, 1000));
  const noKey = await unconfigured({ query: "a question" });
  assert.equal(noKey.isError, true); assert.equal(noKey.structuredContent.error?.code, "PROVIDER_NOT_CONFIGURED");
  const limited = createSearchHandler(config, new BraveSearchProvider("secret", 1000, async () => jsonResponse({ key: "secret" }, 429)));
  assert.equal((await limited({ query: "a question" })).structuredContent.error?.code, "SEARCH_RATE_LIMITED");
  const broken = createSearchHandler(config, new BraveSearchProvider("secret", 1000, async () => { throw new Error("subscription=secret"); }));
  const output = await broken({ query: "a question" });
  assert.equal(output.structuredContent.error?.code, "SEARCH_UNAVAILABLE"); assert.ok(!JSON.stringify(output).includes("subscription=secret"));
});

test("Brave rejects malformed and oversized responses and represents no results", async () => {
  for (const payload of [{ web: { results: "bad" } }, { padding: "x".repeat(1000001) }]) {
    const output = await createSearchHandler(config, new BraveSearchProvider("secret", 1000, async () => jsonResponse(payload)))({ query: "a question" });
    assert.equal(output.isError, true); assert.equal(output.structuredContent.error?.code, "SEARCH_UNAVAILABLE");
  }
  const empty = await new BraveSearchProvider("secret", 1000, async () => jsonResponse({ web: { results: [] } })).search({ query: "a question", maxResults: 5 });
  assert.equal(empty.sources.length, 0); assert.ok(empty.warnings.length);
});

test("article extraction keeps provenance, date and paragraphs while excluding scripts and navigation", () => {
  const paragraph = "This is a substantial paragraph about the evidence collected for a focused research question. It discusses observations, limitations, and the context required to interpret a result. ";
  const page = htmlPage(`<html><head><title>Research article</title><meta property="article:published_time" content="2026-09-25T12:00:00Z"><link rel="canonical" href="http://127.0.0.1/secret"><script>globalThis.shouldNeverRun = true</script></head><body><nav>Unrelated navigation</nav><article><h1>Research article</h1><p>${paragraph.repeat(4)}</p><p>${paragraph.repeat(4)}</p></article></body></html>`);
  const { source } = extractText(page, page.url, 20000);
  assert.equal(source.url, page.url); assert.equal(source.title, "Research article");
  assert.equal(source.publishedAt, "2026-09-25T12:00:00.000Z"); assert.match(source.text, /\n\n/);
  assert.ok(!source.text.includes("shouldNeverRun")); assert.ok(!source.text.includes("Unrelated navigation"));
});

test("fallback and truncation warnings describe partial text, and empty pages fail clearly", () => {
  const tiny = extractText(htmlPage("<main>A small fragment.</main>"), "https://public.org/original", 1000);
  assert.ok(tiny.warnings.some((warning) => warning.includes("Very little")));
  assert.ok(tiny.warnings.some((warning) => warning.includes("redirected")));
  const long = extractText({ ...htmlPage(""), contentType: "text/plain", body: "Evidence. ".repeat(300) }, "https://public.org/article", 1000);
  assert.equal(long.source.text.length, 1000); assert.equal(long.source.truncated, true);
  assert.ok(long.warnings.some((warning) => warning.includes("truncated")));
  assert.throws(() => extractText(htmlPage("<script>doSomething()</script>"), "https://public.org/article", 1000), /no readable text/);
});

test("blank Open Graph titles fall back to the document title", () => {
  const page = htmlPage('<html><head><title>Document research title</title><meta property="og:title" content="   "></head><body><main>Readable evidence.</main></body></html>');
  assert.equal(extractText(page, page.url, 20000).source.title, "Document research title");
});

test("article extraction separates adjacent block containers without breaking inline text", () => {
  const page = htmlPage("<main><div>First<span>Word</span></div><section>Second sentence.</section><div>Third sentence.</div></main>");
  const { source } = extractText(page, page.url, 20000);
  assert.equal(source.extractionQuality, "article");
  assert.equal(source.text, "FirstWord\n\nSecond sentence.\n\nThird sentence.");
});

test("fallback extraction separates adjacent block containers without breaking inline text", (context) => {
  context.mock.method(Readability.prototype, "parse", () => null);
  const page = htmlPage("<main><div>First<span>Word</span></div><section>Second sentence.</section><div>Third sentence.</div></main>");
  const { source } = extractText(page, page.url, 20000);
  assert.equal(source.extractionQuality, "fallback");
  assert.equal(source.text, "FirstWord\n\nSecond sentence.\n\nThird sentence.");
});

test("rejected URLs never echo credentials, and validated URLs are normalized before being returned", async () => {
  let networkCalls = 0;
  const retrieve = createFetchHandler(config, async () => { networkCalls++; throw new Error("network failure"); });
  for (const url of ["https://private-user:private-password@public.org/article", "https://private-user:private-password@public.org/" + "x".repeat(2048), "malformed-private-password"]) {
    const result = await retrieve({ url });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.requestedUrl, undefined);
    assert.equal(fetchOutputSchema.safeParse(result.structuredContent).success, true);
    assert.ok(!JSON.stringify(result).includes("private-user"));
    assert.ok(!JSON.stringify(result).includes("private-password"));
  }
  assert.equal(networkCalls, 0);
  const failure = await retrieve({ url: "  https://public.org/article#section  " });
  assert.equal(failure.structuredContent.requestedUrl, "https://public.org/article");
  assert.equal(networkCalls, 1);
});

test("source failures remain separate from successes and only retrieved URLs enter brief context", async () => {
  const retrieve = createFetchHandler(config);
  const success = (await retrieve({ url: demoSources[0]!.url })).structuredContent;
  const failure = (await retrieve({ url: "http://127.0.0.1/private" })).structuredContent;
  assert.equal(failure.error?.code, "UNSAFE_URL"); assert.equal(failure.status, "error");
  assert.equal(fetchOutputSchema.safeParse(failure).success, true);
  const prompt = buildBriefPrompt(demoQuestion, [success, success, failure]);
  assert.ok(!prompt.includes("127.0.0.1"));
  const payload = JSON.parse(prompt.split("BEGIN UNTRUSTED RESEARCH DATA\n\n")[1]!.split("\n\nEND UNTRUSTED RESEARCH DATA")[0]!);
  assert.equal(payload.sources.length, 1); assert.equal(payload.sources[0].url, success.source?.url);
  assert.throws(() => buildBriefPrompt(demoQuestion, [failure]), /Read at least one/);
});
