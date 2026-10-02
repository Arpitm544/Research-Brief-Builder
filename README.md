# Research Brief Builder

An MCP app that helps a user research a question, inspect public sources, and produce a concise evidence-backed brief with traceable citations.

> **Project status:** planning scaffold. The folders and design docs are in place; application tools and UI are not implemented yet.

## MVP

1. Search the public web for a focused research question.
2. Show a small set of source cards with titles, dates, URLs, and snippets.
3. Fetch selected public pages and return readable source text.
4. Help the connected assistant draft a brief using the retrieved evidence, with citations linked to the supplied sources.

The first release should use one search provider and a small source limit. It should not require accounts, save research history, or make claims that are not tied to retrieved evidence.

## Planned technology

- TypeScript and `mcp-use` for the MCP server and tools.
- React for the MCP App view.
- Zod schemas for tool inputs and structured outputs.
- A replaceable search-provider adapter so the research workflow is not tied to one vendor.

## Start the implementation

The current `mcp-use` project scaffold can generate the server, development scripts, Inspector, and view pipeline:

```bash
npx -y create-mcp-use-app@latest research-brief-builder --template mcp-apps
```

Review the generated files before merging them into this planning scaffold. The CLI and starter template can evolve, so follow the current [mcp-use TypeScript quickstart](https://github.com/mcp-use/mcp-use) if the command changes.

## Project docs

- [High-Level Design](docs/HLD.md)
- [Flowchart](docs/flowchart.md)
- [Planned folder structure](docs/PROJECT_STRUCTURE.md)

## Development principles

- Make source provenance visible at every step.
- Treat fetched page content as untrusted input.
- Keep search and page-fetching behind small service interfaces.
- Return clear errors for blocked, unavailable, or unreadable sources.
- Do not imply that a citation has been independently verified just because it appears in the brief.
