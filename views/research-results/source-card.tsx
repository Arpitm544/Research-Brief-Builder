import type { Source } from "../../src/schemas/source.js";
import type { FetchOutput } from "../../src/schemas/research.js";
import { SourceEvidence } from "../shared/components.js";

export function SourceCard({ source, index, fetched, checked, busy, reading, expanded, toggle, read, setExpanded, open }: {
  source: Source; index: number; fetched?: FetchOutput; checked: boolean; busy: boolean;
  reading?: string; expanded?: string; toggle: (url: string) => void; read: (url: string) => Promise<void>;
  setExpanded: (url: string | undefined) => void; open?: (url: string) => void;
}) {
  return <article className={`source-card ${checked ? "selected" : ""}`} key={source.sourceId}>
          <div className="source-card-top"><span className="source-number">{String(index + 1).padStart(2, "0")}</span><div className="source-origin"><span>{source.domain}</span><span>{source.publishedAt ? `Published ${source.publishedAt}` : "Publication date unavailable"}</span></div><span className={`source-state ${fetched?.status === "success" ? "ready" : fetched?.status === "error" ? "failed" : ""}`}>{fetched?.status === "success" ? "Read" : fetched?.status === "error" ? "Unavailable" : "Search result"}</span><label className="select-source"><input type="checkbox" checked={checked} onChange={() => toggle(source.url)} disabled={busy} aria-label={`${checked ? "Remove" : "Add"} ${source.title} ${checked ? "from" : "to"} the brief`} /><span>{checked ? "Selected" : "Use in brief"}</span></label></div>
          <h3>{source.title}</h3><p className="source-snippet">{source.snippet || "No snippet provided. Read the source to inspect its text."}</p>
          <p className="source-url"><span>Source</span> {source.url}</p>
          <div className="source-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => fetched?.status === "success" ? setExpanded(expanded === source.url ? undefined : source.url) : void read(source.url)}>{reading === source.url ? "Reading…" : fetched?.status === "success" ? expanded === source.url ? "Close text" : "Inspect text" : fetched?.status === "error" ? "Retry source" : "Read source"}</button>{open !== undefined && <button type="button" className="text-link" onClick={() => open(source.url)}>Open original ↗</button>}<span className={`retrieval-status ${fetched?.status ?? ""}`} role="status">{fetched?.status === "success" ? "Text retrieved" : fetched?.status === "error" ? "Retrieval failed" : "Not read yet"}</span></div>
          {expanded === source.url && fetched && <SourceEvidence result={fetched} onOpen={open !== undefined ? open : undefined} />}
        </article>;
}
