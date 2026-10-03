import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import sniffHTMLEncoding from "html-encoding-sniffer";
import ipaddr from "ipaddr.js";
import type { Config } from "../config/env.js";
import { ResearchFailure } from "./errors.js";

export type Address = { address: string; family: number };
export type FetchLimits = Pick<Config, "FETCH_TIMEOUT_MS" | "MAX_RESPONSE_BYTES" | "MAX_REDIRECTS">;
export type Page = { url: string; body: string; pdfData?: Uint8Array; contentType: string; retrievedAt: string };
export interface PageResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  cancel(): void;
}
export interface FetchDependencies {
  resolve(hostname: string): Promise<Address[]>;
  request(url: URL, address: Address, signal: AbortSignal): Promise<PageResponse>;
}

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) return false;
  const parsed = ipaddr.parse(address);
  if (parsed.kind() === "ipv4") return parsed.range() === "unicast";
  const v6 = parsed as ipaddr.IPv6;
  // Reject IPv4-mapped addresses and transition ranges rather than translating them.
  return !v6.isIPv4MappedAddress() && v6.range() === "unicast" &&
    v6.match(ipaddr.parse("2000::") as ipaddr.IPv6, 3);
}

export function validatePublicUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch {
    throw new ResearchFailure("INVALID_INPUT", "Provide an absolute public HTTP or HTTPS URL.");
  }
  if (input.length > 2048 || !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.port) {
    throw new ResearchFailure("UNSAFE_URL", "Only HTTP/HTTPS URLs without credentials or nonstandard ports are supported.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  const blockedSuffixes = ["localhost", "local", "internal", "home.arpa", "test", "invalid", "onion"];
  if (!hostname || hostname.includes("%") || blockedSuffixes.some((suffix) =>
    hostname === suffix || hostname.endsWith(`.${suffix}`))) {
    throw new ResearchFailure("UNSAFE_URL", "Local and private-network hostnames cannot be retrieved.");
  }
  if (ipaddr.isValid(hostname) && !isPublicAddress(hostname)) {
    throw new ResearchFailure("UNSAFE_URL", "Private, loopback, link-local, and reserved addresses cannot be retrieved.");
  }
  url.hash = "";
  return url;
}

async function abortable<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(operation), aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

/** The socket uses the checked address; TLS still validates the original hostname. */
export async function requestPublicPage(url: URL, address: Address, signal: AbortSignal): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(url, {
      method: "GET",
      agent: false,
      signal,
      maxHeaderSize: 16384,
      family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      headers: {
        "User-Agent": "ResearchBriefBuilder/0.1 (+public-source-research)",
        Accept: "text/html, application/xhtml+xml, text/plain, application/pdf",
        "Accept-Encoding": "gzip, deflate, br",
      },
    }, (res) => {
      const headers: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(res.headers)) {
        headers[name] = Array.isArray(value) ? value.join(", ") : value;
      }
      resolve({ status: res.statusCode ?? 0, headers, body: res, cancel: () => res.destroy() });
    });
    req.on("error", reject);
    req.end();
  });
}

const dependencies: FetchDependencies = {
  resolve: (hostname) => dnsLookup(hostname, { all: true, verbatim: true }),
  request: requestPublicPage,
};

async function readBody(response: PageResponse, maxBytes: number, encoding: string, signal: AbortSignal): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let decodedSize = 0;
  let wireSize = 0;
  const input = Readable.from(response.body);
  const wireLimit = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    wireSize += chunk.length;
    callback(wireSize > maxBytes ? new ResearchFailure("RESPONSE_TOO_LARGE", "The encoded source exceeds the response-size limit.") : null, chunk);
  } });
  const output = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    decodedSize += chunk.length;
    if (decodedSize > maxBytes) return callback(new ResearchFailure("RESPONSE_TOO_LARGE", "The decoded source exceeds the response-size limit."));
    chunks.push(Buffer.from(chunk));
    callback();
  } });
  const decoder = encoding === "gzip" ? createGunzip() : encoding === "deflate" ? createInflate() : encoding === "br" ? createBrotliDecompress() : undefined;
  try {
    if (decoder) await pipeline(input, wireLimit, decoder, output, { signal });
    else await pipeline(input, wireLimit, output, { signal });
    return Buffer.concat(chunks, decodedSize);
  } finally {
    input.destroy(); wireLimit.destroy(); decoder?.destroy(); output.destroy();
  }
}

async function requestAddresses(url: URL, addresses: Address[], signal: AbortSignal, deps: FetchDependencies): Promise<PageResponse> {
  let lastError: unknown;
  for (const address of addresses) {
    signal.throwIfAborted();
    try { return await abortable(() => deps.request(url, address, signal), signal); }
    catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export async function safeFetch(
  input: string,
  limits: FetchLimits,
  parentSignal?: AbortSignal,
  deps: FetchDependencies = dependencies,
): Promise<Page> {
  const timeout = AbortSignal.timeout(limits.FETCH_TIMEOUT_MS);
  const signal = parentSignal ? AbortSignal.any([timeout, parentSignal]) : timeout;
  let url = validatePublicUrl(input);
  try {
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted();
      const hostname = url.hostname.replace(/^\[|\]$/g, "");
      let addresses: Address[];
      if (ipaddr.isValid(hostname)) {
        addresses = [{ address: hostname, family: ipaddr.parse(hostname).kind() === "ipv4" ? 4 : 6 }];
      } else {
        try { addresses = await abortable(() => deps.resolve(hostname), signal); }
        catch (error) {
          if (signal.aborted) throw error;
          throw new ResearchFailure("DNS_FAILED", "The source hostname could not be resolved.", true);
        }
      }
      // Reject mixed public/private answers, including an unused private fallback.
      if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
        throw new ResearchFailure("UNSAFE_URL", "The source hostname resolves to a blocked network address.");
      }
      const response = await requestAddresses(url, addresses, signal, deps);
      try {
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirects >= limits.MAX_REDIRECTS) throw new ResearchFailure("TOO_MANY_REDIRECTS", "This source redirected too many times.");
          const location = response.headers.location;
          if (!location) throw new ResearchFailure("FETCH_FAILED", "The source returned a redirect without a destination.");
          let next: URL;
          try { next = new URL(location, url); } catch {
            throw new ResearchFailure("UNSAFE_URL", "The source returned an invalid redirect destination.");
          }
          url = validatePublicUrl(next.href);
          continue;
        }
        if ([401, 403, 407, 429, 451].includes(response.status)) {
          throw new ResearchFailure("ACCESS_BLOCKED", "The source requires authentication or blocks automated retrieval.", response.status === 429);
        }
        if (response.status < 200 || response.status >= 300) {
          throw new ResearchFailure("HTTP_ERROR", `The source returned HTTP ${response.status}.`, response.status >= 500);
        }
        let contentType = response.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() ?? "";
        if (!["text/html", "application/xhtml+xml", "text/plain", "application/pdf", "application/octet-stream"].includes(contentType)) {
          throw new ResearchFailure("UNSUPPORTED_CONTENT", "Only HTML, plain-text, and PDF sources are supported.");
        }
        const encoding = response.headers["content-encoding"]?.trim().toLowerCase() ?? "identity";
        if (!["identity", "gzip", "deflate", "br"].includes(encoding)) {
          throw new ResearchFailure("UNSUPPORTED_CONTENT", "The source uses an unsupported or stacked compression encoding.");
        }
        if (Number(response.headers["content-length"]) > limits.MAX_RESPONSE_BYTES) {
          throw new ResearchFailure("RESPONSE_TOO_LARGE", "This source exceeds the server's response-size limit.");
        }
        const buffer = await abortable(() => readBody(response, limits.MAX_RESPONSE_BYTES, encoding, signal), signal);
        if (contentType === "application/octet-stream") {
          if (!buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) {
            throw new ResearchFailure("UNSUPPORTED_CONTENT", "The binary source is not a recognizable PDF.");
          }
          contentType = "application/pdf";
        }
        if (contentType === "application/pdf") return { url: url.href, body: "", pdfData: buffer, contentType, retrievedAt: new Date().toISOString() };
        const headerCharset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(response.headers["content-type"] ?? "")?.[1];
        const charset = contentType === "text/plain" ? headerCharset ?? "utf-8" : sniffHTMLEncoding(buffer, {
          transportLayerEncodingLabel: headerCharset,
          xml: contentType === "application/xhtml+xml",
        });
        let body: string;
        try { body = new TextDecoder(charset).decode(buffer); } catch {
          throw new ResearchFailure("UNSUPPORTED_CONTENT", "The source uses an unsupported text encoding.");
        }
        return { url: url.href, body, contentType, retrievedAt: new Date().toISOString() };
      } finally { response.cancel(); }
    }
  } catch (error) {
    if (timeout.aborted) throw new ResearchFailure("FETCH_TIMEOUT", "The source did not respond within the retrieval deadline.", true);
    if (parentSignal?.aborted) throw new ResearchFailure("FETCH_FAILED", "Source retrieval was cancelled.", true);
    if (error instanceof ResearchFailure) throw error;
    throw new ResearchFailure("FETCH_FAILED", "The public source could not be retrieved. Try another source or retry later.", true);
  }
}
