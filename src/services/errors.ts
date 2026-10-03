import { z } from "zod";

export const errorSchema = z.object({
  code: z.enum([
    "INVALID_INPUT", "UNSAFE_URL", "DNS_FAILED", "FETCH_TIMEOUT", "FETCH_FAILED",
    "HTTP_ERROR", "ACCESS_BLOCKED", "TOO_MANY_REDIRECTS", "RESPONSE_TOO_LARGE",
    "UNSUPPORTED_CONTENT", "UNREADABLE_SOURCE", "PROVIDER_NOT_CONFIGURED",
    "SEARCH_TIMEOUT", "SEARCH_RATE_LIMITED", "SEARCH_UNAVAILABLE",
  ]),
  message: z.string(),
  retryable: z.boolean(),
});

export type ResearchError = z.infer<typeof errorSchema>;

export class ResearchFailure extends Error {
  constructor(
    public readonly code: ResearchError["code"],
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "ResearchFailure";
  }
}

export function publicError(error: unknown, fallback: ResearchError): ResearchError {
  if (error instanceof ResearchFailure) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof z.ZodError) {
    return { code: "INVALID_INPUT", message: "Check required inputs, domain formatting, and server limits.", retryable: false };
  }
  // Never forward raw network/provider errors, which may contain credentials.
  return fallback;
}
