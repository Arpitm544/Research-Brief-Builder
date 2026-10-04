import { useEffect, useRef, useState } from "react";

export function BriefPanel({ selectedCount, readyCount, busy, batchReading, canFollowUp, sending, isDemo, prompt, message, messageError,
  readSelected, draft, usedChars, budgetChars, excerpted }: {
  selectedCount: number; readyCount: number; busy: boolean; batchReading: boolean; canFollowUp: boolean; sending: boolean;
  isDemo: boolean; prompt: string; message?: string; messageError?: string;
  readSelected: () => Promise<void>; draft: () => Promise<void>; usedChars: number; budgetChars: number; excerpted: boolean;
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
    // The Inspector embeds this view in an iframe where Clipboard API access may be denied.
    try {
      if (document.execCommand("copy")) {
        setCopyStatus("Request selected. Paste it into your assistant; if nothing pastes, press Cmd+C or Ctrl+C first.");
        return;
      }
    } catch { /* Try the Clipboard API below. */ }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("Request copied. Paste it into your assistant to draft the brief.");
    } catch {
      selectRequest();
      setCopyStatus("Browser blocked automatic copy. The full request is selected; press Cmd+C or Ctrl+C.");
    }
  }

  return <aside className="brief-panel"><span className="eyebrow">03 / Bring it together</span><h2>Your brief,<br />grounded in sources.</h2><p>Select the sources you want to use, then read their text before asking for a draft.</p><div className="brief-progress"><div><strong>{selectedCount}</strong><span>selected</span></div><div><strong>{readyCount}</strong><span>read & ready</span></div></div><button type="button" className="secondary-button full-width" disabled={busy || !selectedCount || readyCount === selectedCount} onClick={() => void readSelected()}>{batchReading ? "Reading sources…" : "Read selected sources"}</button>
      {canFollowUp && <button type="button" className="primary-button full-width" disabled={busy || !readyCount || readyCount !== selectedCount} onClick={() => void draft()}>{sending ? "Sending request…" : isDemo ? "Draft a demo brief" : "Draft brief in chat"}<span aria-hidden="true">↗</span></button>}
      {selectedCount > readyCount && <p className="small-note">Read every selected source, or deselect any failed sources, to draft.</p>}
      {!canFollowUp && <p className="small-note">This host cannot request a draft directly. Read selected sources, then copy the request into your assistant.</p>}
      {readyCount > 0 && <p className="small-note" role="status">Evidence: {usedChars.toLocaleString("en-US")} / {budgetChars.toLocaleString("en-US")} characters. {excerpted ? "Query-matched excerpts are included; full text remains on source cards." : "All retrieved text fits in the shared budget."}</p>}
      {prompt && (readyCount === selectedCount || !canFollowUp) && <div className="copy-request"><p>This copies a request with the selected evidence. Your assistant will write the finished brief.</p><button type="button" className="secondary-button full-width" disabled={busy} onClick={() => void copyRequest()}>Copy request for assistant</button><details ref={previewRef}><summary>Preview request and evidence</summary><textarea ref={requestRef} aria-label="Brief request with retrieved evidence" readOnly value={prompt} rows={8} /></details>{copyStatus && <p role="status">{copyStatus}</p>}</div>}
      {message && <p className="success-message" role="status">{message}</p>}{messageError && <p className="error-message" role="alert">{messageError}</p>}
      <div className="privacy-note"><span aria-hidden="true">◇</span><p>{isDemo ? "This demo uses invented sources. Switch to live search to research your own question." : "Queries are sent to Browserbase Search. Source text comes from public websites. This app stores no research history."}</p></div>
    </aside>;
}
