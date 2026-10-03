import { useState, type FormEvent } from "react";
import type { SearchInput } from "../../src/schemas/research.js";

export function SearchForm({ query, pending, onSearch }: { query: string; pending: boolean; onSearch: (input: SearchInput) => Promise<void> }) {
  const [question, setQuestion] = useState(query);
  const [domains, setDomains] = useState("");
  const [count, setCount] = useState(5);
  const [questionError, setQuestionError] = useState<string>();
  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 3 || trimmedQuestion.length > 400) {
      setQuestionError("Enter a research question of 3–400 characters, excluding surrounding spaces.");
      return;
    }
    setQuestionError(undefined);
    const domainList = domains.split(",").map((domain) => domain.trim()).filter(Boolean);
    void onSearch({ query: trimmedQuestion, maxResults: count, ...(domainList.length ? { domains: domainList } : {}) });
  }
  return <form className="search-form" onSubmit={submit}>
    <label htmlFor="research-question" className="eyebrow">01 / Your research question</label>
    <div className="search-field"><input id="research-question" value={question} onChange={(event) => { setQuestion(event.target.value); setQuestionError(undefined); }} minLength={3} maxLength={400} required placeholder="What are the trade-offs of…?" disabled={pending} aria-invalid={questionError ? true : undefined} aria-describedby={questionError ? "research-question-error" : undefined} /><button className="primary-button" disabled={pending} type="submit">{pending ? "Searching…" : "Find sources"}<span aria-hidden="true">↗</span></button></div>
    {questionError && <p id="research-question-error" className="error-message" role="alert">{questionError}</p>}
    <details className="search-options"><summary>Search options</summary><div><label>Domains <input value={domains} onChange={(event) => setDomains(event.target.value)} placeholder="energy.gov, nrel.gov" disabled={pending} /></label><label>Source limit <select value={count} onChange={(event) => setCount(Number(event.target.value))} disabled={pending}>{[3, 5, 10].map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><p>Use up to five comma-separated domains. The server may return fewer sources.</p></details>
  </form>;
}

