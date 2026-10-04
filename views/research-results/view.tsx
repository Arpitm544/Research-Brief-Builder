import { useCallTool, useHostContext, useToolContext } from "mcp-use/react";
import { useState } from "react";
import type { SearchInput, SearchOutput } from "../../src/schemas/research.js";
import { SearchForm } from "./search-form.js";
import { ResearchWorkspace } from "./research-workspace.js";
import { ResearchShell } from "../shared/components.js";
import "../shared/view.css";

export default function ResearchResultsView() {
  const view = useToolContext<"search_sources">();
  const search = useCallTool("search_sources");
  const { theme } = useHostContext();
  const [latest, setLatest] = useState<SearchOutput>();
  const [searchError, setSearchError] = useState<string>();

  async function runSearch(input: SearchInput) {
    setSearchError(undefined);
    try { setLatest((await search.callTool(input)).structuredContent); }
    catch (error) { setSearchError(error instanceof Error ? error.message : "Search could not be completed."); }
  }
  if (view.status === "pending" && view.toolInput) return <ResearchShell theme={theme}><div className="loading-panel" role="status"><span className="eyebrow">01 / Find sources</span><h1>Following the question.</h1><p>Searching for {view.toolInput.query ?? "public evidence"}…</p><div className="loading-line" /></div></ResearchShell>;
  if (view.status === "pending") return <ResearchShell theme={theme}><div className="empty-panel resource-start"><span className="empty-icon" aria-hidden="true">⌕</span><span className="eyebrow">Research workspace</span><h1>Ready when you are.</h1><p>Run the <strong>Search sources</strong> tool to open this workspace with a research question.</p></div></ResearchShell>;
  const result = latest ?? (view.status === "ready" ? view.toolOutput : undefined);
  return <ResearchShell theme={theme}>
    <div className="hero"><span className="eyebrow">Research workspace</span><h1>Turn a question<br />into a clear brief.</h1><p>Search for reliable sources, inspect the evidence, then bring the strongest findings into your brief.</p><div className="workflow-steps" aria-label="Research workflow"><span className="workflow-step active"><b>1</b> Search</span><i aria-hidden="true" /><span className="workflow-step"><b>2</b> Review</span><i aria-hidden="true" /><span className="workflow-step"><b>3</b> Draft</span></div></div>
    <SearchForm key={result?.query ?? "initial"} query={result?.query ?? view.toolInput?.query ?? ""} pending={search.isPending} onSearch={runSearch} />
    {(searchError || (view.status === "error" && !latest)) && <div className="error-message" role="alert">{searchError ?? view.error?.message}</div>}
    {result && <ResearchWorkspace key={`${result.query}:${result.retrievedAt}`} result={result} searchPending={search.isPending} />}
    {!result && <div className="empty-panel"><span className="empty-icon" aria-hidden="true">⌕</span><h2>Start with one focused question</h2><p>For example: “How do electric vehicles compare with petrol cars on cost and emissions?”</p></div>}
  </ResearchShell>;
}
