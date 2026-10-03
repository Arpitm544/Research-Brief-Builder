import assert from "node:assert/strict";

const endpoint = process.env.MCP_ENDPOINT ?? "http://localhost:3000/mcp";
let nextId = 1;
let sessionId;
let protocolVersion = "2026-07-28";
async function rpc(method, params, { notification = false } = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": protocolVersion,
      ...(protocolVersion === "2026-07-28" ? { "Mcp-Method": method, ...((params.name ?? params.uri) ? { "Mcp-Name": params.name ?? params.uri } : {}) } : {}),
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...(!notification ? { id: nextId++ } : {}), method, params: {
      ...params,
      ...(protocolVersion === "2026-07-28" ? { _meta: {
        "io.modelcontextprotocol/protocolVersion": protocolVersion,
        "io.modelcontextprotocol/clientInfo": { name: "research-brief-smoke", version: "0.1.0" },
        "io.modelcontextprotocol/clientCapabilities": {},
      } } : {}),
    } }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}: ${await response.text()}`);
  sessionId ??= response.headers.get("Mcp-Session-Id");
  if (notification) {
    assert.equal(response.status, 202, `${method} should be accepted without a response body.`);
    return;
  }
  const text = await response.text();
  const payload = text.startsWith("event:") || text.startsWith("data:") ?
    JSON.parse(text.split("\n").find((line) => line.startsWith("data:"))?.slice(5) ?? "null") : JSON.parse(text);
  if (payload.error) throw new Error(`${method}: ${payload.error.message}`);
  return payload.result;
}

const discovered = await rpc("server/discover", {});
assert.ok(discovered.supportedVersions.includes(protocolVersion));
protocolVersion = "2025-11-25";
const initialized = await rpc("initialize", {
  protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "research-brief-smoke", version: "0.1.0" },
});
assert.equal(initialized.serverInfo.name, "research-brief-builder");
assert.equal(initialized.protocolVersion, protocolVersion);
await rpc("notifications/initialized", {}, { notification: true });
const legacyTools = await rpc("tools/list", {});
assert.deepEqual(legacyTools.tools.map((tool) => tool.name).sort(), ["fetch_source", "search_sources"]);
// Exercise the current sessionless protocol after a complete legacy session.
protocolVersion = "2026-07-28";
sessionId = undefined;
const tools = await rpc("tools/list", {});
assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["fetch_source", "search_sources"]);

const search = await rpc("tools/call", { name: "search_sources", arguments: { query: "What are the trade-offs of heat pumps in cold climates?", maxResults: 3 } });
assert.ok(!search.isError, "Search should succeed. Run the server with SEARCH_PROVIDER=demo for this smoke check.");
assert.equal(search.structuredContent.isDemo, true, "This smoke check is for demo mode.");
assert.equal(search.structuredContent.sources.length, 3);
for (const source of search.structuredContent.sources) {
  const fetched = await rpc("tools/call", { name: "fetch_source", arguments: { url: source.url } });
  assert.ok(!fetched.isError); assert.equal(fetched.structuredContent.source.url, source.url);
  assert.match(fetched.structuredContent.source.text, /SYNTHETIC DEMO SOURCE/);
}
const blocked = await rpc("tools/call", { name: "fetch_source", arguments: { url: "http://127.0.0.1/private" } });
assert.equal(blocked.isError, true); assert.equal(blocked.structuredContent.error.code, "UNSAFE_URL");
const resources = await rpc("resources/list", {});
assert.equal(resources.resources.length, 2);
for (const resource of resources.resources) {
  const view = await rpc("resources/read", { uri: resource.uri });
  assert.ok(view.contents[0].mimeType.includes("text/html")); assert.match(view.contents[0].text, /<html/);
}
console.log("MCP smoke check passed: modern discovery, legacy initialization notification and tool listing, tools, 3 demo sources, unsafe-URL rejection, and 2 view resources.");
