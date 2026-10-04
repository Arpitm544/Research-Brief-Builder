# Research Brief Builder

An MCP app for finding public sources, reading their evidence, and preparing a cited research brief inside your chat.

[Built with **mcp-use**](https://github.com/mcp-use/mcp-use)

The assistant searches for sources, lets you inspect and select them, and can use the retrieved evidence to write a brief. The app returns source material and brief instructions to the connected assistant; it does not generate the brief itself.

## Try it locally

Requirements: Node.js **22.22.2 or later**.

```bash
git clone https://github.com/Arpitm544/Research-Brief-Builder.git
cd Research-Brief-Builder
npm ci
npm run dev
```

The development server prints its URLs. By default, the Inspector is at [http://localhost:3000/mcp/inspector](http://localhost:3000/mcp/inspector), and the MCP endpoint is `http://localhost:3000/mcp`. If port 3000 is occupied, use the port printed by the server. You can also choose one with `npm run dev -- --port 3001`.

The app starts in offline demo mode with three clearly labeled synthetic sources. In the Inspector, run `search_sources` with:

```json
{ "query": "What are the main trade-offs of heat pumps in cold climates?" }
```

Use the play button in the tool form. Demo text is invented for exercising the workflow, not public evidence; other questions return no demo results. In a compatible chat host, the assistant continues its answer in the same turn after retrieving sources.

## Connect to a chat host

Run the server and use the MCP endpoint printed in the terminal (`http://localhost:3000/mcp` by default) when adding a custom MCP connector in your host. Your host must be able to reach the machine running the server. Start a new conversation and enable the Research Brief Builder connector for that chat.

There is no public hosted endpoint configured for this repository yet.

## Features

- **Topic search** — discover sources with the offline demo provider or live Browserbase Search.
- **Source inspection** — review source cards, snippets, URLs, publication dates when available, and retrieval warnings.
- **Evidence retrieval** — read public HTML, plain text, and text-bearing PDF pages with bounded extraction.
- **Brief workspace** — select sources, read their evidence, and provide a formatted evidence payload and outline to the assistant.
- **Source provenance** — preserve source URLs and metadata in the evidence returned to the assistant.
- **Safe retrieval** — reject private network targets, recheck redirects, and limit response sizes, extraction time, and PDF work.

## Tools

| Tool | Description |
| --- | --- |
| `search_sources` | Search a topic or question. Optional domain filters and result-count limits are available. Returns source IDs, titles, URLs, snippets, dates when available, provider, timestamp, and warnings. |
| `fetch_source` | Retrieve a specific public URL. Returns the final URL, title, date when available, bounded text, timestamp, and extraction warnings. A URL is required. |

Requests with question or topic text go to `search_sources`. Requests to read a specific URL go to `fetch_source`, with that URL supplied in its `url` field. After searching, the assistant should retrieve relevant result pages before writing from their contents. Source text and search snippets are untrusted input; the assistant is instructed to cite retrieved URLs and describe evidence gaps.

## Available views

| View | Purpose |
| --- | --- |
| `research-results` | Search sources, inspect cards, choose evidence, and prepare a brief request. |
| `source-reader` | Inspect retrieved text, source details, and extraction warnings. |

## Testing in Claude

**Claude test video:** https://github.com/user-attachments/assets/87b9f3b3-1f3c-4725-9448-e41c699a98be


## Enable live search

Create a [Browserbase](https://www.browserbase.com/) account and API key. Copy `.env.example` to `.env`, then configure:

```dotenv
SEARCH_PROVIDER=browserbase
BROWSERBASE_API_KEY=your_browserbase_key
```

Restart the server after changing `.env`. The app uses the [Browserbase Search API](https://docs.browserbase.com/platform/search/overview) to discover sources, then retrieves selected public pages itself. API keys do not appear in tool output. Search accepts queries up to 200 characters; longer questions are shortened with a warning, and domain filters apply to returned results.

The server does not persist questions, source text, or research history. The connected host and search provider may have their own retention policies.

## Retrieval limits and source support

- Only HTTP and HTTPS on standard ports are allowed. URLs with credentials are rejected.
- Private, loopback, link-local, reserved, and transition addresses are blocked. DNS answers and redirects are checked.
- HTML, plain text, and text-bearing PDFs are supported. Authenticated or paywalled pages and sites that block automated access may not be readable. No credentials or cookies are sent to source sites.
- JavaScript-only pages may return little or no text. Scanned PDFs need OCR. PDF extraction is limited to 20 pages, and tables, figures, or text order may be incomplete.
- Retrieval has bounded time, response size, redirect count, extracted text, and PDF concurrency. Missing dates, partial extraction, redirects, and truncation appear as warnings.

The brief workspace shares a 32,000-character budget for formatted JSON evidence. Successfully read sources are deduplicated by final URL; excerpts preserve offsets into retrieved text. Excerpt matching finds passages but does not verify claims.

## Development

Run the checks and production build:

```bash
npm run check
```

With a demo server running in another terminal, run the MCP smoke check:

```bash
npm run test:smoke
```

Run a production build locally with `npm run build`, then start it with `npm start`.

## Project docs

- [High-Level Design](docs/HLD.md)
- [Flowchart](docs/flowchart.md)
- [Project structure](docs/PROJECT_STRUCTURE.md)

## Built with

- [mcp-use](https://github.com/mcp-use/mcp-use) — MCP server framework and Inspector integration
- [Mozilla Readability](https://github.com/mozilla/readability) and [JSDOM](https://github.com/jsdom/jsdom) — readable page text extraction
- [PDF.js](https://github.com/mozilla/pdf.js) — PDF text extraction
