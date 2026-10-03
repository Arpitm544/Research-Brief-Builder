# Project Structure

The MVP follows the generated `mcp-use` MCP Apps conventions. Browser runtime helpers live under `views/` so the development pipeline can serve them. Server schemas and services stay under `src/`.

```text
research-brief-builder/
├── index.ts                         # Register and export tools with their views
├── package.json                     # Scripts and pinned framework dependency
├── package-lock.json                # Reproducible dependency tree
├── tsconfig.json                    # Server, view, and test type checking
├── mcp-env.d.ts                     # Generated typed tool registrations
├── .env.example                     # Configuration names, defaults, and bounds
├── src/
│   ├── schemas/
│   │   ├── research.ts              # Zod tool input/output schemas
│   │   └── source.ts                # Source and retrieved-evidence contracts
│   ├── tools/
│   │   ├── search-sources.ts        # Stateless search handler
│   │   └── fetch-source.ts          # Stateless retrieval handler
│   ├── services/
│   │   ├── search-provider.ts       # Replaceable provider interface
│   │   ├── web-search-adapter.ts    # Brave integration and normalization
│   │   ├── safe-fetch.ts            # DNS pinning, redirects, deadlines, byte limits
│   │   ├── extract-pdf.ts           # Worker-isolated, bounded PDF text extraction
│   │   ├── extract-text.ts          # HTML/plain-text extraction and metadata
│   │   ├── source-utils.ts          # Identities, domain/date normalization
│   │   └── errors.ts                # Provider-neutral, secret-safe errors
│   ├── config/env.ts                # Bounded environment parsing
│   └── demo/fixtures.ts             # Synthetic offline scenario
├── views/
│   ├── research-results/view.tsx    # Search, selection, inspection, brief handoff
│   ├── source-reader/view.tsx       # Standalone fetch_source view
│   └── shared/                      # Components, CSS, and brief handoff helper
├── public/icon.svg                  # Server identity
├── scripts/smoke.mjs                # End-to-end MCP smoke check
├── tests/                           # Retrieval, provider, and workflow regressions
└── docs/                            # Design and implementation documentation
```

Generated files in `.mcp-use/` are excluded from Git. Secrets belong in ignored `.env` files.

## Workflow

1. `index.ts` constructs the configured provider and stateless handlers.
2. `search_sources` returns bounded records and renders `research-results`.
3. `fetch_source` checks the URL and DNS, pins the connection, validates redirects, bounds the response, and extracts text. Known synthetic demo sources require no network request.
4. The view retains successful and failed retrievals separately for its mounted workflow.
5. The brief handoff includes selected, successfully retrieved evidence excerpts and final URLs within a shared serialized-character budget. The connected assistant performs synthesis.
6. Regression tests and an MCP smoke check verify tool behavior and resources.
