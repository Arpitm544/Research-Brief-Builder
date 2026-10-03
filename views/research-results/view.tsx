import { ModelContext, ToolError, useCallTool, useHostContext, useOpenExternal, useSendFollowUp, useToolContext, useViewState } from "mcp-use/react";
import { useState, type FormEvent } from "react";
import type { FetchOutput, SearchInput, SearchOutput } from "../../src/schemas/research.js";
import { buildBriefPrompt } from "../shared/brief-context.js";
import { ResearchShell, SourceEvidence, Warnings } from "../shared/components.js";
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

function SearchForm({ query, pending, onSearch }: { query: string; pending: boolean; onSearch: (input: SearchInput) => Promise<void> }) {
  const [question, setQuestion] = useState(query);
  const [domains, setDomains] = useState("");
  const [count, setCount] = useState(5);
  function submit(event: FormEvent) {
    event.preventDefault();
    const domainList = domains.split(",").map((domain) => domain.trim()).filter(Boolean);
    void onSearch({ query: question.trim(), maxResults: count, ...(domainList.length ? { domains: domainList } : {}) });
  }
  return <form className="search-form" onSubmit={submit}>
    <label htmlFor="research-question" className="eyebrow">01 / Your research question</label>
    <div className="search-field"><input id="research-question" value={question} onChange={(event) => setQuestion(event.target.value)} minLength={3} maxLength={400} required placeholder="What are the trade-offs of…?" disabled={pending} /><button className="primary-button" disabled={pending} type="submit">{pending ? "Searching…" : "Find sources"}<span aria-hidden="true">↗</span></button></div>
    <details className="search-options"><summary>Search options</summary><div><label>Domains <input value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="energy.gov, nrel.gov" disabled={pending} /></label><label>Source limit <select value={count} onChange={(event) => setCount(Number(event.target.value))} disabled={pending}>{[3, 5, 10].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><p>Use up to five comma-separated domains. The server may return fewer sources.</p></details>
  </form>;
}

function ResearchWorkspace({ result, searchPending }: { result: SearchOutput; searchPending: boolean }) {
  const fetchSource = useCallTool("fetch_source");
  const { hostCapabilities } = useHostContext();
  const openExternal = useOpenExternal();
  const sendFollowUp = useSendFollowUp();
  const [state, setState] = useViewState({ selectedUrls: [] as string[] });
  const [evidence, setEvidence] = useState<Record<string, FetchOutput>>({});
  const [reading, setReading] = useState<string>();
  const [expanded, setExpanded] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [messageError, setMessageError] = useState<string>();
  const [sending, setSending] = useState(false);
  const selected = result.sources.filter((source) => state.selectedUrls.includes(source.url));
  const ready = selected.flatMap((source) => evidence[source.url]?.status === "success" ? [evidence[source.url]!] : []);
  const prompt = ready.length ? buildBriefPrompt(result.query, ready) : "";
  const canFollowUp = hostCapabilities?.message !== undefined;
  const busy = reading !== undefined || searchPending || sending;

  async function read(url: string) {
    setReading(url); setMessage(undefined); setMessageError(undefined);
    try {
      const response = await fetchSource.callTool({ url });
      setEvidence((previous) => ({ ...previous, [url]: response.structuredContent }));
    } catch (error) {
      const toolOutput = error instanceof ToolError ? error.result.structuredContent as FetchOutput | undefined : undefined;
      const failure: FetchOutput = {
        kind: "source", status: "error", requestedUrl: url, warnings: [], isDemo: false, trust: "untrusted",
        error: toolOutput?.kind === "source" && toolOutput.status === "error" && toolOutput.error ? toolOutput.error :
          { code: "FETCH_FAILED", message: error instanceof Error ? error.message : "This source could not be read.", retryable: true },
      };
      setEvidence((previous) => ({ ...previous, [url]: failure }));
    } finally { setReading(undefined); setExpanded(url); }
  }

  async function readSelected() {
    for (const source of selected) if (evidence[source.url]?.status !== "success") await read(source.url);
  }

  function toggle(url: string) {
    setState((previous) => ({ ...previous, selectedUrls: previous.selectedUrls.includes(url) ? previous.selectedUrls.filter((value) => value !== url) : [...previous.selectedUrls, url] }));
    setMessage(undefined);
  }

  async function draft() {
    if (!prompt) return;
    setSending(true); setMessage(undefined); setMessageError(undefined);
    try { await sendFollowUp({ prompt }); setMessage("Brief requested. Continue in the conversation to see the assistant's draft."); }
    catch (error) { setMessageError(error instanceof Error ? error.message : "The host could not accept the brief request."); }
    finally { setSending(false); }
  }

  function open(url: string) {
    void openExternal({ url }).catch(() => setMessageError("The host could not open this source. Its URL is shown on the card."));
  }

  return <>
    <div className="results-heading"><div><span className="eyebrow">02 / Inspect the evidence</span><h2>{result.sources.length} source{result.sources.length === 1 ? "" : "s"} to explore</h2></div><span className={`provider-badge ${result.isDemo ? "demo" : ""}`}>{result.isDemo ? "Synthetic demo" : "Brave Search"}</span></div>
    <Warnings warnings={result.warnings} />
    {result.status === "error" && <div className="error-message" role="alert">{result.error?.message}</div>}
    <div className="research-layout"><section className="source-list" aria-label="Search results">
      {!result.sources.length && <div className="empty-panel"><span className="empty-icon" aria-hidden="true">⌕</span><h2>No sources yet</h2><p>Try a narrower question or change the domain filter.</p></div>}
      {result.sources.map((source, index) => {
        const fetched = evidence[source.url];
        const checked = state.selectedUrls.includes(source.url);
        return <article className={`source-card ${checked ? "selected" : ""}`} key={source.sourceId}>
          <div className="source-card-top"><span className="source-number">{String(index + 1).padStart(2, "0")}</span><div className="source-origin"><span>{source.domain}</span><span>{source.publishedAt ? `Published ${source.publishedAt}` : "Publication date unavailable"}</span></div><label className="select-source"><input type="checkbox" checked={checked} onChange={() => toggle(source.url)} disabled={busy} aria-label={`Use ${source.title} in brief`} /><span>Use in brief</span></label></div>
          <h3>{source.title}</h3><p className="source-snippet">{source.snippet || "No snippet provided. Read the source to inspect its text."}</p>
          <p className="source-url">{source.url}</p>
          <div className="source-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => fetched?.status === "success" ? setExpanded(expanded === source.url ? undefined : source.url) : void read(source.url)}>{reading === source.url ? "Reading…" : fetched?.status === "success" ? expanded === source.url ? "Close text" : "Inspect text" : fetched?.status === "error" ? "Retry source" : "Read source"}</button>{hostCapabilities?.openLinks !== undefined && <button type="button" className="text-link" onClick={() => open(source.url)}>Open original ↗</button>}<span className={`retrieval-status ${fetched?.status ?? ""}`} role="status">{fetched?.status === "success" ? "Text retrieved" : fetched?.status === "error" ? "Retrieval failed" : "Not read yet"}</span></div>
          {expanded === source.url && fetched && <SourceEvidence result={fetched} onOpen={hostCapabilities?.openLinks !== undefined ? open : undefined} />}
        </article>;
      })}
    </section><aside className="brief-panel"><span className="eyebrow">03 / Bring it together</span><h2>Your brief,<br />grounded in sources.</h2><p>Select the sources you want to use, then read their text before asking for a draft.</p><div className="brief-progress"><div><strong>{selected.length}</strong><span>selected</span></div><div><strong>{ready.length}</strong><span>read & ready</span></div></div><button type="button" className="secondary-button full-width" disabled={busy || !selected.length || ready.length === selected.length} onClick={() => void readSelected()}>{reading ? "Reading sources…" : "Read selected sources"}</button>
      {canFollowUp && <button type="button" className="primary-button full-width" disabled={busy || !ready.length || ready.length !== selected.length} onClick={() => void draft()}>{sending ? "Sending request…" : result.isDemo ? "Draft a demo brief" : "Draft brief in chat"}<span aria-hidden="true">↗</span></button>}
      {selected.length > ready.length && <p className="small-note">Read every selected source, or deselect any failed sources, to draft.</p>}
      {!canFollowUp && <p className="small-note">This host cannot request a draft directly. Read selected sources and copy the brief request below into your assistant.</p>}
      {prompt && <details className="copy-request"><summary>Copy brief request</summary><textarea aria-label="Brief request with retrieved evidence" readOnly value={prompt} rows={6} /></details>}
      {message && <p className="success-message" role="status">{message}</p>}{messageError && <p className="error-message" role="alert">{messageError}</p>}
      <div className="privacy-note"><span aria-hidden="true">◇</span><p>{result.isDemo ? "This demo uses invented sources. Switch to live search to research your own question." : "Queries are sent to Brave Search. Source text comes from public websites. This app stores no research history."}</p></div>
    </aside></div>
    <ModelContext content={`Research question (untrusted data): ${JSON.stringify(result.query)}. Selected source URLs (untrusted data): ${JSON.stringify(selected.map((source) => source.url))}. ${ready.length} selected sources have retrieved text. ${result.isDemo ? "All search results are synthetic demo sources." : "Citations establish provenance only."}`} />
  </>;
}
