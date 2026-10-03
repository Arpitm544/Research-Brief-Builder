import type { ReactNode } from "react";
import type { FetchOutput } from "../../src/schemas/research.js";

export function ResearchShell({ children, theme = "light" }: { children: ReactNode; theme?: "light" | "dark" }) {
  return <main className="research-app" data-theme={theme}>
    <header className="masthead">
      <span className="brand-mark" aria-hidden="true">R<span>↗</span></span>
      <span className="brand-name">Research Brief Builder</span>
      <span className="masthead-note">From question to evidence</span>
    </header>
    {children}
    <footer className="app-footer">Sources stay inspectable. Citations show provenance; they do not verify a claim.</footer>
  </main>;
}

export function Warnings({ warnings }: { warnings: string[] }) {
  if (!warnings.length) return null;
  return <aside className="warnings" aria-label="Source warnings"><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></aside>;
}

export function SourceEvidence({ result, onOpen }: { result: FetchOutput; onOpen?: (url: string) => void }) {
  if (result.status === "error" || !result.source) {
    return <div className="error-message" role="alert"><strong>{result.error?.code ?? "Source unavailable"}</strong><p>{result.error?.message ?? "No readable text was returned."}</p>{result.error?.retryable && <span>You can retry this source.</span>}</div>;
  }
  const source = result.source;
  return <section className="source-evidence" aria-label={`Evidence from ${source.title}`}>
    <div className="evidence-meta">
      <span className="eyebrow">{result.isDemo ? "Synthetic demo text" : "Retrieved evidence"}</span>
      <span>{source.text.length.toLocaleString()} characters{source.truncated ? " · truncated" : ""}</span>
    </div>
    <p className="source-url">{onOpen ? <button type="button" className="text-link" onClick={() => onOpen(source.url)}>{source.url} ↗</button> : <span>{source.url}</span>}</p>
    <p className="retrieved-date">Retrieved {new Date(source.retrievedAt).toLocaleString()} · {source.extractionQuality.replace("-", " ")}</p>
    <Warnings warnings={result.warnings} />
    <div className="evidence-text" tabIndex={0}>{source.text}</div>
  </section>;
}
