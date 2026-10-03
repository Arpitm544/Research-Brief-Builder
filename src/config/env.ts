import { z } from "zod";

const envSchema = z.object({
  SEARCH_PROVIDER: z.enum(["demo", "browserbase"]).default("demo"),
  BROWSERBASE_API_KEY: z.string().trim().optional(),
  MAX_SEARCH_RESULTS: z.coerce.number().int().min(1).max(10).default(5),
  MAX_SOURCE_CHARS: z.coerce.number().int().min(1000).max(30000).default(20000),
  FETCH_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(10000),
  MAX_RESPONSE_BYTES: z.coerce.number().int().min(1024).max(5000000).default(2000000),
  MAX_REDIRECTS: z.coerce.number().int().min(0).max(5).default(3),
}).superRefine((config, context) => {
  if (config.SEARCH_PROVIDER === "browserbase" && !config.BROWSERBASE_API_KEY) {
    context.addIssue({ code: "custom", path: ["BROWSERBASE_API_KEY"], message: "A nonblank key is required for Browserbase search." });
  }
});

export function readConfig(env: Record<string, string | undefined> = process.env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Report field names only: invalid secret values must never appear in logs.
    throw new Error(`Invalid configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
  }
  return result.data;
}

export type Config = ReturnType<typeof readConfig>;
