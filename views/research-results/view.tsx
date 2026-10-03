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
  if (view.status === "pending") return <ResearchShell theme={theme}><div className="loading-panel" role="status"><span className="eyebrow">01 / Find sources</span><h1>Following the question.</h1><p>Searching for {view.toolInput?.query ?? "public evidence"}…</p><div className="loading-line" /></div></ResearchShell>;
  const result = latest ?? (view.status === "ready" ? view.toolOutput : undefined);
  return <ResearchShell theme={theme}>
    <div className="hero"><span className="eyebrow">The research desk</span><h1>A good brief starts<br />with better evidence.</h1><p>Find a few useful sources, read what they say, and bring the evidence into your brief.</p></div>
    <SearchForm key={result?.query ?? "initial"} query={result?.query ?? view.toolInput?.query ?? ""} pending={search.isPending} onSearch={runSearch} />
    {(searchError || (view.status === "error" && !latest)) && <div className="error-message" role="alert">{searchError ?? view.error?.message}</div>}
    {result && <ResearchWorkspace key={`${result.query}:${result.retrievedAt}`} result={result} searchPending={search.isPending} />}
    {!result && <div className="empty-panel"><h2>Try a focused question</h2><p>You can refine the question above and search again.</p></div>}
  </ResearchShell>;
}
