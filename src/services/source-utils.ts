import { createHash } from "node:crypto";

export function sourceId(url: string) {
  return `src_${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

export function domainMatches(hostname: string, domains?: string[]) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");
  return !domains?.length || domains.some((domain) => {
    const normalized = domain.toLowerCase().replace(/\.$/, "");
    return normalizedHostname === normalized || normalizedHostname.endsWith(`.${normalized}`);
  });
}

export function publicationDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return;
  const date = new Date(value);
  const prefix = value.slice(0, 10);
  const calendarDate = new Date(`${prefix}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== prefix) return;
  return value.includes("T") ? date.toISOString() : value;
}
