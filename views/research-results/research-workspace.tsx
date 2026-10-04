import { ModelContext, useHostContext, useOpenExternal, useSendFollowUp, useViewState } from "mcp-use/react";
import { useMemo, useState } from "react";
import type { SearchOutput } from "../../src/schemas/research.js";
import { buildBriefPromptFromEvidence, prepareBriefEvidence } from "../shared/brief-context.js";
import { Warnings } from "../shared/components.js";
import { useSourceRetrieval } from "./use-source-retrieval.js";
import { SourceCard } from "./source-card.js";
import { BriefPanel } from "./brief-panel.js";

export function ResearchWorkspace({ result, searchPending }: { result: SearchOutput; searchPending: boolean }) {
  const { hostCapabilities } = useHostContext();
  const openExternal = useOpenExternal();
  const sendFollowUp = useSendFollowUp();
  const [state, setState] = useViewState({ selectedUrls: [] as string[] });
  const { evidence, reading, expanded, setExpanded, batchReading, readSources } = useSourceRetrieval();
  const [message, setMessage] = useState<string>();
  const [messageError, setMessageError] = useState<string>();
  const [sending, setSending] = useState(false);
  const selected = useMemo(() => result.sources.filter((source) => state.selectedUrls.includes(source.url)), [result.sources, state.selectedUrls]);
  const ready = useMemo(() => selected.flatMap((source) => evidence[source.url]?.status === "success" ? [evidence[source.url]!] : []), [selected, evidence]);
  const briefEvidence = useMemo(() => prepareBriefEvidence(result.query, ready), [result.query, ready]);
  const prompt = useMemo(() => briefEvidence.sources.length ? buildBriefPromptFromEvidence(briefEvidence) : "", [briefEvidence]);
  const canFollowUp = hostCapabilities?.message !== undefined;
  const busy = batchReading || searchPending || sending;

  async function read(url: string) {
    setMessage(undefined); setMessageError(undefined);
    await readSources([url]);
  }
  async function readSelected() {
    setMessage(undefined); setMessageError(undefined);
    await readSources(selected.filter((source) => evidence[source.url]?.status !== "success").map((source) => source.url));
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
    setMessageError(undefined);
    void openExternal({ url }).catch(() => setMessageError("The host could not open this source. Its URL is shown on the card."));
  }

  return <>
    <div className="results-heading"><div><span className="eyebrow">02 / Inspect the evidence</span><h2>{result.sources.length} source{result.sources.length === 1 ? "" : "s"} to explore</h2></div><span className={`provider-badge ${result.isDemo ? "demo" : ""}`}>{result.isDemo ? "Synthetic demo" : "Browserbase Search"}</span></div>
    <Warnings warnings={result.warnings} />
    {result.status === "error" && <div className="error-message" role="alert">{result.error?.message}</div>}
    <div className="research-layout"><section className="source-list" aria-label="Search results">
      {!result.sources.length && <div className="empty-panel"><span className="empty-icon" aria-hidden="true">⌕</span><h2>No sources yet</h2><p>Try a narrower question or change the domain filter.</p></div>}
      {result.sources.map((source, index) => <SourceCard key={source.sourceId} source={source} index={index}
        fetched={evidence[source.url]} checked={state.selectedUrls.includes(source.url)} busy={busy}
        reading={reading} expanded={expanded} toggle={toggle} read={read} setExpanded={setExpanded}
        open={hostCapabilities?.openLinks !== undefined ? open : undefined} />)}
    </section><BriefPanel selectedCount={selected.length} readyCount={ready.length} busy={busy} batchReading={batchReading}
      canFollowUp={canFollowUp} sending={sending} isDemo={result.isDemo} prompt={prompt} message={message} messageError={messageError}
      readSelected={readSelected} draft={draft} usedChars={briefEvidence.usedChars} budgetChars={briefEvidence.budgetChars} excerpted={briefEvidence.excerpted} /></div>
    <ModelContext content={prompt && ready.length === selected.length ? prompt : `Research question (untrusted data): ${JSON.stringify(result.query)}. Selected source URLs (untrusted data): ${JSON.stringify(selected.map((source) => source.url))}. ${ready.length} selected sources have retrieved text. ${result.isDemo ? "All search results are synthetic demo sources." : "Citations establish provenance only."}`} />
  </>;
}
