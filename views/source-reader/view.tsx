import { useHostContext, useOpenExternal, useToolContext } from "mcp-use/react";
import { useState } from "react";
import { ResearchShell, SourceEvidence } from "../shared/components.js";
import "../shared/view.css";

export default function SourceReaderView() {
  const view = useToolContext<"fetch_source">();
  const { theme, hostCapabilities } = useHostContext();
  const openExternal = useOpenExternal();
  const [linkError, setLinkError] = useState<string>();
  function open(url: string) { setLinkError(undefined); void openExternal({ url }).catch(() => setLinkError("The host could not open this source. The URL is shown below.")); }
  return <ResearchShell theme={theme}>
    {view.status === "pending" && view.toolInput ? <div className="loading-panel" role="status"><span className="eyebrow">Inspect the evidence</span><h1>Reading the source.</h1><p>{view.toolInput.url}</p><div className="loading-line" /></div> : view.status === "pending" ? <div className="empty-panel resource-start"><span className="empty-icon" aria-hidden="true">↗</span><span className="eyebrow">Source reader</span><h1>Choose a source to inspect.</h1><p>Run the <strong>Read a source</strong> tool with a public URL to view retrieved text and provenance.</p></div> :
      view.status === "error" ? <div className="empty-panel"><h1>Source unavailable.</h1><p className="error-message" role="alert">{view.error.message}</p><p>Try another source or ask the assistant to retry.</p></div> : <div className="reader-panel"><span className="eyebrow">Source notebook</span><h1>{view.toolOutput.source?.title ?? "Source unavailable"}</h1><SourceEvidence result={view.toolOutput} onOpen={hostCapabilities?.openLinks !== undefined ? open : undefined} />{linkError && <p role="alert">{linkError}</p>}</div>}
  </ResearchShell>;
}
