import type { Source } from "../schemas/source.js";
import type { SearchInput } from "../schemas/research.js";

export interface SearchProvider {
  readonly name: "demo" | "brave";
  search(input: SearchInput & { maxResults: number }, signal?: AbortSignal): Promise<{
    sources: Source[];
    warnings: string[];
  }>;
}
