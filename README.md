# Research Brief Builder

An MCP app for researching a focused question, inspecting public sources, and handing retrieved evidence to the connected assistant for a cited brief.

**Status:** runnable MVP with two MCP tools, React views, a Browserbase Search adapter, and bounded public-page retrieval.

## Run locally

Requires Node.js **22.22.2 or later**.

```bash
npm ci
npm run dev
```

Run these commands from the project directory. The development server prints the Inspector and MCP endpoint URLs when it starts. By default, the Inspector is at [http://localhost:3000/mcp/inspector](http://localhost:3000/mcp/inspector), and the MCP endpoint is `http://localhost:3000/mcp`.

If port 3000 is already in use, the server automatically tries the next available port (for example, 3001). Use the URLs printed in the terminal. To choose a port yourself, pass `--port`:

```bash
npm run dev -- --port 3001
```

Then open `http://localhost:3001/mcp/inspector`. The MCP endpoint is `http://localhost:3001/mcp`.

The app defaults to an **offline demo** with three clearly labeled synthetic sources. Invoke `search_sources` with:

```json
{ "query": "What are the main trade-offs of heat pumps in cold climates?" }
```

Use the **play button** in the Inspector's tool form to execute it. In a compatible chat host, the assistant answers in the original turn after retrieving relevant sources. The view does not send an extra chat message. Select sources with **Use in brief**, then choose **Read selected sources** to inspect evidence. If you intentionally want a separate draft from the selected evidence, choose **Copy request for assistant** and paste it into your assistant. If the host blocks automatic copying, the button opens the preview and selects the entire request so you can press **Cmd+C** or **Ctrl+C**. The preview shows a formatted evidence payload and the requested brief outline; it is a prompt, not a finished brief. The server itself does not call a model or generate a brief.

Demo text is invented for exercising the workflow; it is not public evidence. Other questions return empty demo results. Arbitrary public URLs can still be retrieved with `fetch_source`.

## Enable live search

Create a Browserbase account and API key in the [Browserbase dashboard](https://www.browserbase.com/). Copy `.env.example` to `.env`, then set:

```dotenv
SEARCH_PROVIDER=browserbase
BROWSERBASE_API_KEY=your_browserbase_key
```

Restart the server after changing `.env`. Browserbase's free plan currently includes 1,000 Search calls per month; check its [pricing](https://www.browserbase.com/pricing) for current limits. This app uses the [Search API](https://docs.browserbase.com/platform/search/overview) only for discovery and fetches selected public pages itself. Keys never appear in tool output.

Live questions are sent to Browserbase, and selected pages are requested from public websites. This server does not persist questions, source text, or research history. The connected host and provider may have their own retention policies. Browserbase Search accepts at most 200 characters per query; longer questions are shortened with a warning. Domain filters are enforced on returned results, so restrictive filters may yield fewer sources.

## Tools

| Tool | Input | Result |
|---|---|---|
| `search_sources` | Required `query`; optional `domains` (up to 5) and `maxResults` (1–10) | Source IDs, titles, URLs, snippets, publication dates when available, provider, timestamp, and warnings |
| `fetch_source` | Required public `url` | Final URL, title, publication date when available, bounded text, timestamp, quality/truncation warnings, or a source-specific error |

Tool routing is based on the user's request: topic or question text without a website URL goes to `search_sources`; a request that includes a specific website URL goes to `fetch_source`, with that URL passed in the required `url` field. `fetch_source` cannot run without a URL. Both tools return model-facing context and structured evidence. Search snippets, page text, and metadata are untrusted data. The assistant is instructed to cite only successfully retrieved URLs, distinguish inference, and report evidence gaps. This establishes provenance; it does not automatically verify claim support or a generated brief's correctness.

## Retrieval limits

Defaults: **3 search results**, **20,000 extracted characters**, a **10-second retrieval deadline**, **2 MB for both encoded and decoded responses**, and **3 redirects**. Configuration values have hard upper bounds; see `.env.example`.

- Only HTTP/HTTPS on standard ports; URLs containing credentials are rejected.
- Private, loopback, link-local, reserved, and transition addresses are blocked. All DNS answers are checked, the connection uses a checked address, and every redirect is revalidated.
- HTML, plain text, and text-bearing PDFs are supported, including gzip, deflate, and Brotli responses. PDFs served as generic binary data require a PDF header in the first 1,024 bytes. Unsupported/stacked encodings are rejected. Authenticated/paywalled pages and sites blocking automated access may be unavailable. No credentials or cookies are sent to source sites.
- Mozilla Readability and JSDOM extract text without executing scripts or loading external resources. JavaScript-only pages may return little or no text.
- PDF.js extracts PDF text in a memory-limited worker using the remaining retrieval deadline, at most 20 pages, and the same extracted-character limit. At most two PDF extractions run per server process; additional requests return a retryable busy error. It loads only the already retrieved bytes, disables evaluation, and terminates the worker on cancellation or timeout. Recoverable PDF damage permits readable text extraction; scanned PDFs need OCR, and encrypted/unreadable documents return a source-specific error. Tables, figures, and text order may be incomplete.
- Missing dates, partial extraction, redirects, and truncation are visible.

## Brief evidence budget

Brief requests share a **32,000-character budget for formatted JSON evidence**, including metadata, indentation, and JSON escaping. Successfully read sources are deduplicated by final URL and receive shares of the remaining budget. Keyword-matched text excerpts retain offsets into the retrieved text, source metadata, and partial-extraction flags. Matching selects passages; it does not verify relevance or claims. Full retrieved text stays available on source cards. The sidebar shows budget usage and whether text was omitted. Instructions add fewer than 2,000 characters to the request and ask for an answer, findings, trade-offs, uncertainty, and linked sources.

The research view is split into the search form, source cards, brief panel, workspace coordinator, and a retrieval hook. The hook keeps successful and failed reads separately, guards against overlapping batches, and stops UI updates when its workspace unmounts.

## Check and build

```bash
npm run check
```

Runs TypeScript checks, regression tests, and a production build. Tests cover URL/DNS/redirect restrictions, the pinned native connection, deadlines and byte limits, provider normalization and failures, extraction, the offline workflow, and brief provenance.

With a demo server running in another terminal:

```bash
npm run test:smoke
```

The smoke check exercises MCP discovery/handshake, tools, three demo retrievals, unsafe-URL rejection, and both view resources. Run production locally with `npm run build` followed by `npm start`. No public deployment is configured.

The app follows the generated [mcp-use quickstart](https://docs.mcp-use.com/v2/typescript/getting-started/quickstart) conventions: exported tool definitions in `index.ts`, typed hooks in `views/`, and a replaceable provider interface in `src/`.

## Project docs

- [High-Level Design](docs/HLD.md)
- [Flowchart](docs/flowchart.md)
- [Implemented folder structure](docs/PROJECT_STRUCTURE.md)
