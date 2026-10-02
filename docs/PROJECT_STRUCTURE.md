# Planned Project Structure

This is the intended application layout after scaffolding with the current `mcp-use` MCP Apps template. It is a planning structure; implementation files will be added phase by phase.

```text
research-brief-builder/
├── index.ts                         # MCP server entry; registers tools and views
├── package.json                     # Generated scripts and dependencies
├── tsconfig.json                    # Generated TypeScript configuration
├── .env.example                     # Names of required configuration values (no secrets)
├── src/
│   ├── schemas/
│   │   ├── research.ts              # Zod input/output schemas
│   │   └── source.ts                # Normalized source metadata schema
│   ├── tools/
│   │   ├── search-sources.ts        # search_sources MCP tool
│   │   └── fetch-source.ts          # fetch_source MCP tool
│   ├── services/
│   │   ├── search-provider.ts       # Provider-neutral interface
│   │   ├── web-search-adapter.ts    # Chosen provider integration
│   │   ├── safe-fetch.ts            # URL/network and response limits
│   │   └── extract-text.ts          # HTML-to-readable-text extraction
│   └── config/
│       └── env.ts                   # Environment parsing and validation
├── views/
│   └── research-results/
│       └── view.tsx                 # Search result/source inspection UI
├── public/                          # Static assets, if needed
└── docs/
    ├── HLD.md
    ├── flowchart.md
    └── PROJECT_STRUCTURE.md
```

The official scaffold may use a slightly different layout. Keep its generated server entry, scripts, and view conventions; adapt the `src/` organization around them rather than replacing the scaffold blindly.

## Build order

1. Scaffold the MCP Apps template and run its Inspector.
2. Add schemas and `search_sources` with mock results.
3. Render structured results in the React view.
4. Add the search-provider adapter.
5. Add safe page fetching and text extraction.
6. Exercise the end-to-end workflow and refine error states.
