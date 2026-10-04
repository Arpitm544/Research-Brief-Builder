import { z } from "zod";
import { errorSchema } from "../services/errors.js";
import { retrievedSourceSchema, sourceSchema } from "./source.js";

export const searchInputSchema = z.object({
  query: z.string().trim().min(3).max(400).describe("A focused research question (3-400 characters)."),
  domains: z.array(z.string().trim().max(253).regex(
    /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
    "Use a domain such as energy.gov, without a scheme, port, or path.",
  )).max(5).optional().describe("Omit unless the user explicitly names sites to restrict the search. If requested, supply at most five bare domains such as energy.gov, without https:// or paths."),
  maxResults: z.number().int().min(1).max(10).optional().describe("Number of results, bounded by the server (maximum 10)."),
}).strict();

export const fetchInputSchema = z.object({
  url: z.string().trim().max(2048).optional().describe("Required for retrieval: the exact public HTTP or HTTPS URL provided by the user or returned by search_sources. If the request contains only question text, call search_sources instead. Private addresses and nonstandard ports are blocked."),
}).strict();

export const searchOutputSchema = z.object({
  kind: z.literal("search"),
  status: z.enum(["success", "error"]),
  query: z.string(),
  sources: z.array(sourceSchema),
  warnings: z.array(z.string()),
  provider: z.enum(["demo", "browserbase"]),
  isDemo: z.boolean(),
  retrievedAt: z.iso.datetime(),
  trust: z.literal("untrusted"),
  error: errorSchema.optional(),
});

export const fetchOutputSchema = z.object({
  kind: z.literal("source"),
  status: z.enum(["success", "error"]),
  requestedUrl: z.string().optional(),
  source: retrievedSourceSchema.optional(),
  warnings: z.array(z.string()),
  isDemo: z.boolean(),
  trust: z.literal("untrusted"),
  error: errorSchema.optional(),
});

export type SearchInput = z.infer<typeof searchInputSchema>;
export type FetchInput = z.infer<typeof fetchInputSchema>;
export type SearchOutput = z.infer<typeof searchOutputSchema>;
export type FetchOutput = z.infer<typeof fetchOutputSchema>;
