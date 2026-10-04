import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { FetchOutput } from "../src/schemas/research.js";
import { draftBrief } from "../views/research-results/draft-brief.js";
import { BRIEF_EVIDENCE_BUDGET, buildBriefPrompt, buildBriefPromptFromEvidence, prepareBriefEvidence } from "../views/shared/brief-context.js";

function evidence(index: number, text: string): FetchOutput {
  return { kind: "source", status: "success", warnings: [], isDemo: false, trust: "untrusted", source: {
    sourceId: String(index), url: `https://public.org/${index}`, requestedUrl: `https://public.org/${index}`,
    title: `Paper ${index}`, domain: "public.org", snippet: text.slice(0, 300), text,
    retrievedAt: "2026-10-04T00:00:00.000Z", contentType: "text/plain", truncated: false, extractionQuality: "plain-text",
  } };
}

test("the evidence budget includes JSON escaping and metadata across ten long sources", () => {
  const results = Array.from({ length: 10 }, (_, index) => evidence(index, ('"\\\n\u0000Evidence. ').repeat(2500)));
  const prepared = prepareBriefEvidence("Evidence?", results);
  assert.ok(prepared.usedChars <= BRIEF_EVIDENCE_BUDGET);
  assert.equal(prepared.usedChars, JSON.stringify(JSON.parse(prepared.serialized), null, 2).length);
  assert.equal(prepared.sources.length, 10);
  assert.equal(prepared.excerpted, true);
  for (const [index, source] of prepared.sources.entries()) {
    assert.ok(source.excerpts.length > 0);
    for (const excerpt of source.excerpts) assert.equal(excerpt.text, results[index]!.source!.text.slice(excerpt.start, excerpt.end));
  }
  assert.ok(buildBriefPrompt("Evidence?", results).length < BRIEF_EVIDENCE_BUDGET + 2000);
});

test("query-matched passages near the end survive the shared budget", () => {
  const results = Array.from({ length: 10 }, (_, index) => evidence(index, "Unrelated filler. ".repeat(1500) + "\n\nGeothermal efficiency improves heating."));
  const prepared = prepareBriefEvidence("Geothermal efficiency heating", results);
  for (const source of prepared.sources) assert.ok(source.excerpts.some((excerpt) => excerpt.text.includes("Geothermal efficiency")));
});

test("query matches survive excerpts smaller than a scored window", () => {
  const results = Array.from({ length: 10 }, (_, index) => evidence(index, "\u0000".repeat(570) + " geothermal " + "\u0000".repeat(40)));
  const prepared = prepareBriefEvidence("geothermal", results);
  assert.ok(prepared.usedChars <= BRIEF_EVIDENCE_BUDGET);
  for (const [index, source] of prepared.sources.entries()) {
    assert.ok(source.excerpts.some((excerpt) => excerpt.text.includes("geothermal")));
    assert.ok(source.excerpts.every((excerpt) => excerpt.text.length < 600));
    for (const excerpt of source.excerpts) assert.equal(excerpt.text, results[index]!.source!.text.slice(excerpt.start, excerpt.end));
  }
});

test("brief prompts reuse the exact serialized evidence prepared for the view", () => {
  const results = [evidence(1, "Readable geothermal evidence.")];
  const prepared = prepareBriefEvidence("geothermal", results);
  const prompt = buildBriefPromptFromEvidence(prepared);
  assert.ok(prompt.includes(`BEGIN UNTRUSTED RESEARCH DATA\n\n${prepared.serialized}\n\nEND UNTRUSTED RESEARCH DATA`));
  assert.match(prompt, /## Key findings/);
  assert.match(prompt, /## Trade-offs/);
  assert.match(prompt, /## What remains uncertain/);
  assert.match(prompt, /## Sources/);
  assert.match(prompt, /Answer the user's original question directly/);
  assert.match(prompt, /Do not describe the tools, MCP, prompts/);
  assert.match(prepared.serialized, /\n  "sources": \[/);
  assert.equal(prompt, buildBriefPrompt("geothermal", results));
  assert.throws(() => buildBriefPromptFromEvidence(prepareBriefEvidence("geothermal", [])), /Read at least one/);
});

test("the workspace keeps ModelContext summary-only while delivering the full prompt via follow-up", async () => {
  const workspace = await readFile(new URL("../views/research-results/research-workspace.tsx", import.meta.url), "utf8");
  const content = workspace.match(/<ModelContext\s+content=\{([\s\S]*?)\}\s*\/>/)?.[1];
  assert.ok(content, "the workspace has a ModelContext content expression");
  const interpolations = [...content.matchAll(/\$\{([^}]*)\}/g)].map((match) => match[1]!.trim());
  assert.ok(interpolations.length > 0, "ModelContext has summary interpolations");
  for (const expression of interpolations) {
    assert.doesNotMatch(expression, /\b(?:prompt|briefEvidence|evidence|serialized|excerpts|text|snippet)\b/);
    assert.ok(
      expression === "JSON.stringify(result.query)" ||
      expression === "JSON.stringify(selected.map((source) => source.url))" ||
      expression === "ready.length" ||
      /^result\.isDemo\s*\?\s*"(?:[^"\\]|\\.)*"\s*:\s*"(?:[^"\\]|\\.)*"$/.test(expression),
      `Unexpected ModelContext interpolation: ${expression}`,
    );
  }
  assert.match(workspace, /draftBrief\(\s*\{\s*prompt\s*,/);
  const draft = await readFile(new URL("../views/research-results/draft-brief.ts", import.meta.url), "utf8");
  assert.match(draft, /sendFollowUp\(\s*\{\s*prompt\s*\}\s*\)/);
});

test("drafting twice while a request is pending sends one follow-up", async () => {
  let resolveSend!: () => void;
  const pendingSend = new Promise<void>((resolve) => { resolveSend = resolve; });
  const sent: string[] = [];
  const draftInFlight = { current: false };
  const sending: boolean[] = [];
  const draft = () => draftBrief({
    prompt: "full brief request", draftInFlight,
    sendFollowUp: ({ prompt }) => { sent.push(prompt); return pendingSend; },
    setSending: (value) => { sending.push(value); },
    setMessage: () => {}, setMessageError: () => {},
  });

  const first = draft();
  await draft();
  assert.deepEqual(sent, ["full brief request"]);
  assert.equal(draftInFlight.current, true);
  resolveSend();
  await first;
  assert.equal(draftInFlight.current, false);
  assert.deepEqual(sending, [true, false]);
});

test("short sources retain all text while failures and duplicate final URLs are excluded", () => {
  const source = evidence(1, "Small complete source.");
  const failure: FetchOutput = { kind: "source", status: "error", warnings: [], isDemo: false, trust: "untrusted" };
  const prepared = prepareBriefEvidence("A question", [source, source, failure]);
  assert.equal(prepared.sources.length, 1);
  assert.equal(prepared.excerpted, false);
  assert.equal(prepared.sources[0]!.excerpts.map((excerpt) => excerpt.text).join(""), source.source!.text);
});

test("long escaped metadata remains bounded without losing final URLs or extraction warnings", () => {
  const results = Array.from({ length: 10 }, (_, index) => {
    const result = evidence(index, "Readable evidence. ".repeat(2000));
    result.source!.url = `https://public.org/${index}/` + "x".repeat(2000);
    result.source!.title = "\u0000".repeat(300);
    result.warnings = ["PDF layout incomplete", "Text partial", "Pages omitted"];
    return result;
  });
  const prepared = prepareBriefEvidence("\u0000".repeat(400), results);
  assert.ok(prepared.usedChars <= BRIEF_EVIDENCE_BUDGET);
  for (const [index, source] of prepared.sources.entries()) assert.equal(source.url, results[index]!.source!.url);
  const ordinary = prepareBriefEvidence("A question", [results[0]!]);
  assert.deepEqual(ordinary.sources[0]!.warnings, results[0]!.warnings);
});
