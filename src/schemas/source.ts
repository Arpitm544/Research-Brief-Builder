import { z } from "zod";

export const sourceSchema = z.object({
  sourceId: z.string(),
  title: z.string(),
  url: z.url(),
  domain: z.string(),
  publishedAt: z.string().optional(),
  snippet: z.string(),
});

export const retrievedSourceSchema = sourceSchema.extend({
  requestedUrl: z.url(),
  text: z.string(),
  retrievedAt: z.iso.datetime(),
  contentType: z.string(),
  truncated: z.boolean(),
  extractionQuality: z.enum(["article", "fallback", "plain-text"]),
});

export type Source = z.infer<typeof sourceSchema>;
export type RetrievedSource = z.infer<typeof retrievedSourceSchema>;
