import { createHash } from "node:crypto";

export function sourceId(url: string) {
  return `src_${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

export function domainMatches(hostname: string, domains?: string[]) {
  return !domains?.length || domains.some((domain) => {
    const normalized = domain.toLowerCase();
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}

export function publicationDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10)) return;
  return value.includes("T") ? date.toISOString() : value;
}
