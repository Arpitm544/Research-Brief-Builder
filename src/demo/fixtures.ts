import type { SearchProvider } from "../services/search-provider.js";
import { domainMatches, sourceId } from "../services/source-utils.js";
import type { Page } from "../services/safe-fetch.js";

export const demoWarning = "DEMO: These are synthetic examples for the heat-pump workflow, not retrieved public evidence. Do not cite them as factual sources.";
export const demoQuestion = "What are the main trade-offs of heat pumps in cold climates?";

const fixtures = [
  {
    path: "cold-climate-performance", title: "Cold-weather performance and efficiency",
    snippet: "An illustrative look at how outdoor temperature, equipment selection, and backup heating affect a home.",
    text: "SYNTHETIC DEMO SOURCE — NOT PUBLIC EVIDENCE.\n\nIn this invented example, a homeowner is comparing a cold-climate heat pump with their existing heating system. The example assumes the unit can continue operating in cold conditions, while its efficiency and available heating output vary with outdoor temperature.\n\nThe fictional homeowner checks the equipment's rated heating capacity at their local design temperature. They also asks an installer about sizing, insulation, and the hours during which backup heating might run.\n\nThis example illustrates why a research brief should distinguish equipment performance from whole-home results. It supplies no measured performance data and cannot establish the efficiency of any actual product.",
  },
  {
    path: "installation-costs", title: "Installation costs and household savings",
    snippet: "A fictional household weighs installation work, electricity prices, and the cost of its current fuel.",
    text: "SYNTHETIC DEMO SOURCE — NOT PUBLIC EVIDENCE.\n\nThis fictional household receives two hypothetical installation proposals. One reuses existing distribution equipment; the other calls for changes to the electrical panel and interior units. The proposals are intentionally left without prices.\n\nIn the example, the household's running-cost comparison depends on local electricity tariffs, its existing fuel, equipment efficiency, and how often backup heat is needed. The household also considers maintenance and comfort.\n\nA real research brief would need dated local quotes, current tariff information, and evidence about the home's heating demand before making a savings claim. This demo provides none of those measurements, so the question of savings remains open.",
  },
  {
    path: "evidence-gaps", title: "What to check before drawing a conclusion",
    snippet: "An example checklist highlights climate, home condition, and the limits of generalized savings claims.",
    text: "SYNTHETIC DEMO SOURCE — NOT PUBLIC EVIDENCE.\n\nThe fictional reviewer asks for primary sources describing field performance in a climate similar to the homeowner's. The reviewer wants to know whether reported energy use includes backup heating, and whether studies separate different home types.\n\nThe reviewer also asks whether comfort, noise, and installation quality are documented, rather than assumed. A regional average may not describe a particular home.\n\nThe demo illustrates an evidence gap: the first two fictional sources discuss possible trade-offs, but neither contains independent test results or actual cost data. A responsible brief would state this limitation and ask for additional evidence. These examples are a software demonstration, not a recommendation about heating equipment.",
  },
];

export const demoSources = fixtures.map((fixture) => {
  const url = `https://example.org/demo/${fixture.path}`;
  return { sourceId: sourceId(url), title: fixture.title, url, domain: "example.org", snippet: fixture.snippet };
});

export class DemoSearchProvider implements SearchProvider {
  readonly name = "demo" as const;
  async search(input: Parameters<SearchProvider["search"]>[0]) {
    const matchesScenario = /heat\s*pumps?|cold\s*climates?/i.test(input.query);
    const sources = matchesScenario ? demoSources.filter((source) => domainMatches(source.domain, input.domains)).slice(0, input.maxResults) : [];
    return {
      sources,
      warnings: [demoWarning, ...(!sources.length ? [`Demo mode contains only the heat-pump scenario. Try: ${demoQuestion}`] : [])],
    };
  }
}

export function demoPage(url: string): Page | undefined {
  const index = demoSources.findIndex((source) => source.url === url);
  if (index < 0) return;
  const fixture = fixtures[index]!;
  return {
    url, contentType: "text/plain", retrievedAt: new Date().toISOString(),
    body: `${fixture.title}\n\n${fixture.text}`,
  };
}
