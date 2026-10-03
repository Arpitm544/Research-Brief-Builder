import assert from "node:assert/strict";
import { gzipSync, deflateSync, brotliCompressSync } from "node:zlib";
import { createServer } from "node:http";
import { test } from "node:test";
import { ResearchFailure } from "../src/services/errors.js";
import { extractText } from "../src/services/extract-text.js";
import { isPublicAddress, requestPublicPage, safeFetch, validatePublicUrl, type FetchDependencies, type PageResponse } from "../src/services/safe-fetch.js";

const limits = { FETCH_TIMEOUT_MS: 300, MAX_RESPONSE_BYTES: 1024, MAX_REDIRECTS: 2 };
const address = { address: "93.184.215.14", family: 4 };
function response(status = 200, headers: Record<string, string | undefined> = {}, chunks: (string | Buffer)[] = ["A readable public page."]): PageResponse {
  return { status, headers: { "content-type": "text/plain", ...headers }, body: { async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield Buffer.from(chunk); } }, cancel() {} };
}
function dependencies(overrides: Partial<FetchDependencies> = {}): FetchDependencies {
  return { resolve: async () => [address], request: async () => response(), ...overrides };
}
function hasCode(code: string) { return (error: unknown) => error instanceof ResearchFailure && error.code === code; }

test("rejects unsafe protocols, credentials, ports, obfuscated loopback, and private/reserved IPs", () => {
  const urls = [
    "file:///etc/passwd", "ftp://public.org/data", "https://user:password@public.org", "https://public.org:8443",
    "http://localhost", "http://localhost.", "http://sub.localhost", "http://foo.local", "http://router.home.arpa",
    "http://127.0.0.1", "http://127.1", "http://2130706433", "http://0x7f000001", "http://0177.0.0.1",
    "http://10.1.2.3", "http://172.31.1.1", "http://192.168.0.1", "http://169.254.169.254",
    "http://100.64.1.2", "http://0.0.0.0", "http://192.0.2.1", "http://198.18.0.1", "http://224.0.0.1",
    "http://[::1]", "http://[fc00::1]", "http://[fe80::1]", "http://[::ffff:127.0.0.1]", "http://[2001:db8::1]",
  ];
  for (const url of urls) assert.throws(() => validatePublicUrl(url), hasCode("UNSAFE_URL"), url);
  assert.throws(() => validatePublicUrl("not a url"), hasCode("INVALID_INPUT"));
});

test("permits ordinary public addresses and removes fragments without trusting canonical metadata", () => {
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  assert.equal(isPublicAddress("2002:0808:0808::1"), false);
  assert.equal(validatePublicUrl("https://public.org:443/article#section").href, "https://public.org/article");
});

test("blocks mixed DNS answers before opening a connection", async () => {
  let requests = 0;
  await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({
    resolve: async () => [address, { address: "10.0.0.1", family: 4 }],
    request: async () => { requests++; return response(); },
  })), hasCode("UNSAFE_URL"));
  assert.equal(requests, 0);
});

test("tries every validated address after connection failures with the same hostname and deadline", async () => {
  const addresses = [{ address: "2606:4700:4700::1111", family: 6 }, address, { address: "8.8.8.8", family: 4 }];
  const attempted: typeof addresses = [];
  const signals: AbortSignal[] = [];
  const page = await safeFetch("https://public.org/article", limits, undefined, dependencies({
    resolve: async () => addresses,
    request: async (url, pinned, signal) => {
      assert.equal(url.href, "https://public.org/article");
      attempted.push(pinned); signals.push(signal);
      if (attempted.length < addresses.length) throw new Error("Endpoint unreachable");
      return response();
    },
  }));
  assert.deepEqual(attempted, addresses);
  assert.ok(signals.every((signal) => signal === signals[0]));
  assert.equal(page.body, "A readable public page.");
});

test("reports failure only after all addresses fail and stops retrying on cancellation", async () => {
  const addresses = [address, { address: "8.8.8.8", family: 4 }];
  let requests = 0;
  await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({
    resolve: async () => addresses,
    request: async () => { requests++; throw new Error("secret connection details"); },
  })), (error: unknown) => hasCode("FETCH_FAILED")(error) && !(error as Error).message.includes("secret"));
  assert.equal(requests, 2);

  requests = 0;
  const controller = new AbortController();
  await assert.rejects(safeFetch("https://public.org/", limits, controller.signal, dependencies({
    resolve: async () => addresses,
    request: async () => { requests++; controller.abort(); throw new Error("cancelled"); },
  })), hasCode("FETCH_FAILED"));
  assert.equal(requests, 1);
});

test("address fallback remains bounded by the total retrieval deadline", async () => {
  let requests = 0;
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(safeFetch("https://public.org/", { ...limits, FETCH_TIMEOUT_MS: 20 }, undefined, dependencies({
      resolve: async () => [address, { address: "8.8.8.8", family: 4 }],
      request: async () => {
        if (++requests === 1) throw new Error("Endpoint unreachable");
        return new Promise(() => {});
      },
    })), hasCode("FETCH_TIMEOUT"));
    assert.equal(requests, 2);
  } finally { clearInterval(keepAlive); }
});

test("sniffs HTML BOMs and meta declarations before decoding source titles and evidence", async () => {
  const html = (meta: string) => `<html><head>${meta}<title>Café research</title></head><body><main>Evidence: déjà vu.</main></body></html>`;
  const cases: [Buffer, string][] = [
    [Buffer.from(html('<meta charset="windows-1252">'), "latin1"), "text/html"],
    [Buffer.from(html('<meta content="text/html; charset=iso-8859-1" http-equiv="Content-Type">'), "latin1"), "text/html"],
    [Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(html(""), "utf16le")]), "text/html; charset=utf-8"],
    [Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(html(""), "utf16le").swap16()]), "text/html"],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(html(""))]), "text/html; charset=windows-1252"],
    [Buffer.from(html('<meta charset="windows-1252">')), "text/html; charset=utf-8"],
  ];
  for (const [bytes, contentType] of cases) {
    const page = await safeFetch("https://public.org/article", limits, undefined, dependencies({
      request: async () => response(200, { "content-type": contentType }, [bytes]),
    }));
    const { source } = extractText(page, page.url, 20000);
    assert.equal(source.title, "Café research", contentType);
    assert.equal(source.text, "Evidence: déjà vu.", contentType);
  }
});

test("keeps plain-text charset handling and the UTF-8 default", async () => {
  for (const [bytes, contentType] of [[Buffer.from("Café"), "text/plain"], [Buffer.from("Café", "latin1"), "text/plain; charset=windows-1252"]] as const) {
    const page = await safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => response(200, { "content-type": contentType }, [bytes]) }));
    assert.equal(page.body, "Café");
  }
});

test("pins the checked address and rejects a redirect that rebinds the hostname to private DNS", async () => {
  let lookups = 0;
  let requests = 0;
  const deps = dependencies({
    resolve: async () => ++lookups === 1 ? [address] : [{ address: "127.0.0.1", family: 4 }],
    request: async (url, pinned) => {
      assert.equal(url.hostname, "public.org"); assert.deepEqual(pinned, address); requests++;
      return response(302, { location: "/next" });
    },
  });
  await assert.rejects(safeFetch("https://public.org/", limits, undefined, deps), hasCode("UNSAFE_URL"));
  assert.equal(lookups, 2); assert.equal(requests, 1);
});

test("validates redirect destinations before requesting them", async () => {
  for (const location of ["http://169.254.169.254/latest/meta-data/", "https://user:pass@public.org/", "file:///secret", "https://public.org:1234/"]) {
    let requests = 0;
    await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => { requests++; return response(302, { location }); } })), hasCode("UNSAFE_URL"));
    assert.equal(requests, 1);
  }
});

test("follows relative public redirects and enforces the redirect ceiling", async () => {
  const page = await safeFetch("https://public.org/", limits, undefined, dependencies({ request: async (url) => url.pathname === "/" ? response(301, { location: "/article" }) : response() }));
  assert.equal(page.url, "https://public.org/article");
  await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => response(302, { location: "/loop" }) })), hasCode("TOO_MANY_REDIRECTS"));
});

test("enforces streamed body size even when content-length is missing or false", async () => {
  for (const headers of [{}, { "content-length": "3" }, { "content-length": "2048" }]) {
    let cancelled = false;
    const oversized = response(200, headers, ["x".repeat(700), "x".repeat(700)]);
    oversized.cancel = () => { cancelled = true; };
    await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => oversized })), hasCode("RESPONSE_TOO_LARGE"));
    assert.equal(cancelled, true);
  }
});

test("returns clear errors for blocked access, server errors, unsupported content and unsupported compression", async () => {
  const cases: [PageResponse, string][] = [
    [response(403), "ACCESS_BLOCKED"], [response(503), "HTTP_ERROR"],
    [response(200, { "content-type": "image/png" }), "UNSUPPORTED_CONTENT"],
    [response(200, { "content-encoding": "gzip, br" }), "UNSUPPORTED_CONTENT"],
  ];
  for (const [reply, code] of cases) await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => reply })), hasCode(code));
});

test("the total deadline bounds DNS resolution and a stalled response stream", async () => {
  // Keep the test process alive while the unref'ed AbortSignal timer runs.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await assert.rejects(safeFetch("https://public.org/", { ...limits, FETCH_TIMEOUT_MS: 20 }, undefined, dependencies({ resolve: () => new Promise(() => {}) })), hasCode("FETCH_TIMEOUT"));
    let cancelled = false;
    const stalled = response();
    stalled.body = { async *[Symbol.asyncIterator]() { yield Buffer.from("partial"); await new Promise(() => {}); } };
    stalled.cancel = () => { cancelled = true; };
    await assert.rejects(safeFetch("https://public.org/", { ...limits, FETCH_TIMEOUT_MS: 20 }, undefined, dependencies({ request: async () => stalled })), hasCode("FETCH_TIMEOUT"));
    assert.equal(cancelled, true);
  } finally { clearInterval(keepAlive); }
});

test("honors client cancellation and maps resolver failure without leaking error details", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(safeFetch("https://public.org/", limits, controller.signal, dependencies()), hasCode("FETCH_FAILED"));
  await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({ resolve: async () => { throw new Error("secret details"); } })), (error: unknown) => hasCode("DNS_FAILED")(error) && !(error as Error).message.includes("secret"));
});

test("the native transport connects to the pinned address while preserving Host and omitting cookies", async () => {
  const server = createServer((req, res) => {
    assert.equal(req.headers.host?.startsWith("unresolvable.invalid:"), true);
    assert.equal(req.headers.cookie, undefined); assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers["accept-encoding"], "gzip, deflate, br");
    res.setHeader("Content-Type", "text/plain"); res.end("Pinned connection succeeded.");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const bound = server.address(); assert.ok(bound && typeof bound !== "string");
    const reply = await requestPublicPage(new URL(`http://unresolvable.invalid:${bound.port}/`), { address: "127.0.0.1", family: 4 }, AbortSignal.timeout(1000));
    const chunks = []; for await (const chunk of reply.body) chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString(), "Pinned connection succeeded."); reply.cancel();
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});


test("decodes gzip, deflate and brotli while enforcing encoded and decoded limits", async () => {
  for (const [encoding, compress] of [["gzip", gzipSync], ["deflate", deflateSync], ["br", brotliCompressSync]] as const) {
    const encoded = compress(Buffer.from("Café evidence."));
    const page = await safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => response(200, { "content-encoding": encoding }, [encoded.subarray(0, 3), encoded.subarray(3)]) }));
    assert.equal(page.body, "Café evidence.");
    let cancelled = false;
    const bomb = response(200, { "content-encoding": encoding }, [compress(Buffer.from("x".repeat(100000)))]);
    bomb.cancel = () => { cancelled = true; };
    await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => bomb })), hasCode("RESPONSE_TOO_LARGE"));
    assert.equal(cancelled, true);
  }
  await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => response(200, { "content-encoding": "gzip" }, [Buffer.alloc(2048)]) })), hasCode("RESPONSE_TOO_LARGE"));
});

test("rejects corrupted compressed responses and returns PDF bytes without text decoding", async () => {
  await assert.rejects(safeFetch("https://public.org/", limits, undefined, dependencies({ request: async () => response(200, { "content-encoding": "gzip" }, ["broken gzip"]) })), hasCode("FETCH_FAILED"));
  const bytes = Buffer.from([0x25, 0x50, 0x44, 0x46, 0xff]);
  const page = await safeFetch("https://public.org/paper", limits, undefined, dependencies({ request: async () => response(200, { "content-type": "application/pdf", "content-encoding": "gzip" }, [gzipSync(bytes)]) }));
  assert.deepEqual(Buffer.from(page.pdfData!), bytes);
  assert.equal(page.body, "");
});

test("a stalled compressed response remains bounded by the shared retrieval deadline", async () => {
  const keepAlive = setInterval(() => {}, 1000);
  let cancelled = false;
  const reply = response(200, { "content-encoding": "gzip" });
  reply.body = { async *[Symbol.asyncIterator]() { yield gzipSync(Buffer.from("partial")); await new Promise(() => {}); } };
  reply.cancel = () => { cancelled = true; };
  try {
    await assert.rejects(safeFetch("https://public.org/", { ...limits, FETCH_TIMEOUT_MS: 20 }, undefined, dependencies({ request: async () => reply })), hasCode("FETCH_TIMEOUT"));
    assert.equal(cancelled, true);
  } finally { clearInterval(keepAlive); }
});


test("recognizes PDFs served as generic binary data while rejecting other binary formats", async () => {
  const page = await safeFetch("https://public.org/paper", limits, undefined, dependencies({ request: async () => response(200, { "content-type": "application/octet-stream" }, ["%PDF-1.7\nDocument bytes"]) }));
  assert.equal(page.contentType, "application/pdf");
  assert.ok(page.pdfData);
  await assert.rejects(safeFetch("https://public.org/binary", limits, undefined, dependencies({ request: async () => response(200, { "content-type": "application/octet-stream" }, ["PNG image bytes"]) })), hasCode("UNSUPPORTED_CONTENT"));
});
