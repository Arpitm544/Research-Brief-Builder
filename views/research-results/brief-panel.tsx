import { useEffect, useRef, useState } from "react";

export function BriefPanel({ selectedCount, readyCount, busy, batchReading, isDemo, prompt, linkError,
  readSelected, usedChars, budgetChars, excerpted }: {
  selectedCount: number; readyCount: number; busy: boolean; batchReading: boolean;
  isDemo: boolean; prompt: string; linkError?: string;
  readSelected: () => Promise<void>; usedChars: number; budgetChars: number; excerpted: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const previewRef = useRef<HTMLDetailsElement>(null);
  const requestRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setCopyStatus(""), [prompt]);

  function selectRequest() {
    if (previewRef.current) previewRef.current.open = true;
    requestRef.current?.focus();
    requestRef.current?.select();
  }

  async function copyRequest() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Request copied. Paste it into your assistant to draft the brief.");
    } catch {
      // The Inspector embeds this view in an iframe where Clipboard API access may be denied.
      selectRequest();
      try {
        if (document.execCommand("copy")) {
          setCopyStatus("Request selected. Paste it into your assistant; if nothing pastes, press Cmd+C or Ctrl+C first.");
          return;
        }
      } catch { /* Show the selected request for manual copying. */ }
      setCopyStatus("Browser blocked automatic copy. The full request is selected; press Cmd+C or Ctrl+C.");
    }
  }

  return <aside className="brief-panel"><span className="eyebrow">03 / Build your brief</span><h2>Bring the evidence together.</h2><p>Choose the sources that best answer your question. Read their full text before drafting.</p><div className="brief-progress"><div><strong>{selectedCount}</strong><span>selected</span></div><div><strong>{readyCount}</strong><span>read & ready</span></div></div>{selectedCount > 0 && <div className="brief-progress-track" role="progressbar" aria-label="Selected sources read" aria-valuemin={0} aria-valuemax={selectedCount} aria-valuenow={readyCount}><span style={{ width: `${Math.min(100, readyCount / selectedCount * 100)}%` }} /></div>}<button type="button" className="secondary-button full-width" disabled={busy || !selectedCount || readyCount === selectedCount} onClick={() => void readSelected()}>{batchReading ? "Reading sources…" : "Read selected sources"}</button>
      {selectedCount > readyCount && <p className="small-note">Read every selected source, or deselect any failed sources, to draft.</p>}
      {readyCount > 0 && <div className="evidence-budget" role="status"><span className="budget-dot" aria-hidden="true" /><p><strong>{excerpted ? "Selected passages included" : "Full source text included"}</strong><span>{usedChars.toLocaleString("en-US")} of {budgetChars.toLocaleString("en-US")} evidence characters{excerpted ? " · inspect cards for full text" : ""}</span></p></div>}
      {prompt && readyCount === selectedCount && <div className="copy-request"><p>Copy this request only when you want to ask for a separate draft in chat.</p><button type="button" className="secondary-button full-width" disabled={busy} onClick={() => void copyRequest()}>Copy request for assistant</button><details ref={previewRef}><summary>Preview request and evidence</summary><textarea ref={requestRef} aria-label="Brief request with retrieved evidence" readOnly value={prompt} rows={8} /></details>{copyStatus && <p role="status">{copyStatus}</p>}</div>}
      {linkError && <p className="error-message" role="alert">{linkError}</p>}
      <div className="privacy-note"><span aria-hidden="true">◇</span><p>{isDemo ? "This demo uses invented sources. Switch to live search to research your own question." : "Queries are sent to Browserbase Search. Source text comes from public websites. This app stores no research history."}</p></div>
    </aside>;
}
