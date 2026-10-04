# Research Brief Builder Flowchart

## User workflow

```mermaid
flowchart TD
    A([Start]) --> B[User sends a request]
    B --> C{Does the request include a specific website URL?}
    C -- Yes --> J[Host calls fetch_source with the supplied URL]
    C -- No --> D[Host calls search_sources with the question text]
    D --> E{Search successful?}
    E -- No --> F[Show retryable error and keep the question]
    F --> B
    E -- Yes --> G{Any useful sources?}
    G -- No --> H[Suggest narrowing or rephrasing the question]
    H --> B
    G -- Yes --> I[Render source cards in the MCP App]
    I --> K[Host selects relevant result URLs]
    K --> J
    J --> L{Page safely fetched and readable?}
    L -- No --> M[Show source-specific failure or extraction warning]
    M --> B
    L -- Yes --> N[Return bounded text and source metadata]
    N --> O[Host answers using retrieved evidence]
    O --> P[Attach citations using returned source URLs]
    P --> Q[Show answer and source list]
    Q --> R([Finish])
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
