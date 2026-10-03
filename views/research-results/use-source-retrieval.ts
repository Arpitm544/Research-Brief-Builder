import { ToolError, useCallTool } from "mcp-use/react";
import { useEffect, useRef, useState } from "react";
import type { FetchOutput } from "../../src/schemas/research.js";

export function useSourceRetrieval() {
  const fetchSource = useCallTool("fetch_source");
  const [evidence, setEvidence] = useState<Record<string, FetchOutput>>({});
  const [reading, setReading] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const [batchReading, setBatchReading] = useState(false);
  const active = useRef(true);
  const locked = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function read(url: string) {
    setReading(url);
    try {
      const response = await fetchSource.callTool({ url });
      if (active.current) setEvidence((previous) => ({ ...previous, [url]: response.structuredContent }));
    } catch (error) {
      const toolOutput = error instanceof ToolError ? error.result.structuredContent as FetchOutput | undefined : undefined;
      const failure: FetchOutput = {
        kind: "source", status: "error", requestedUrl: url, warnings: [], isDemo: false, trust: "untrusted",
        error: toolOutput?.kind === "source" && toolOutput.status === "error" && toolOutput.error ? toolOutput.error :
          { code: "FETCH_FAILED", message: error instanceof Error ? error.message : "This source could not be read.", retryable: true },
      };
      if (active.current) setEvidence((previous) => ({ ...previous, [url]: failure }));
    } finally { if (active.current) { setReading(undefined); setExpanded(url); } }
  }

  async function readSources(urls: string[]) {
    if (locked.current) return;
    locked.current = true;
    setBatchReading(true);
    try { for (const url of urls) { if (!active.current) break; await read(url); } }
    finally { locked.current = false; if (active.current) setBatchReading(false); }
  }
  return { evidence, reading, expanded, setExpanded, batchReading, readSources };
}
