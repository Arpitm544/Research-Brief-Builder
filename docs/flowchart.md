# Research Brief Builder Flowchart

## User workflow

```mermaid
flowchart TD
    A([Start]) --> B[User enters a focused research question]
    B --> C[Host calls search_sources]
    C --> D{Search successful?}
    D -- No --> E[Show retryable error and keep the question]
    E --> B
    D -- Yes --> F{Any useful sources?}
    F -- No --> G[Suggest narrowing or rephrasing the question]
    G --> B
    F -- Yes --> H[Render source cards in the MCP App]
    H --> I[User reviews/selects sources]
    I --> J[Host calls fetch_source for selected URLs]
    J --> K{Page safely fetched and readable?}
    K -- No --> L[Show source-specific failure or extraction warning]
    L --> I
    K -- Yes --> M[Return bounded text and source metadata]
    M --> N[Host drafts a brief using retrieved evidence]
    N --> O[Attach citations using returned source URLs]
    O --> P[Show brief and source list]
    P --> Q{Need more or conflicting evidence?}
    Q -- Yes --> B
    Q -- No --> R([Finish])
```

## Trust boundary

```mermaid
flowchart LR
    A[Untrusted search result] --> B[Validate URL and metadata]
    B --> C[Safe fetcher: protocol, DNS/IP, redirects, timeout, size]
    C --> D[Untrusted page text]
    D --> E[Bounded extraction and warning metadata]
    E --> F[Assistant synthesis with source text treated as data]
    F --> G[Brief cites only returned source URLs]
    G --> H[User inspects the cited sources]
```

The citation check in the MVP is about **provenance**: citations must point to sources returned by the tools. It does not automatically prove that a source supports a claim.
