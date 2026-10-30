import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/mcp-server.ts";
import { handle } from "../src/worker.ts";
import { fixture, sample } from "./helpers.ts";

test("official MCP client exercises document tools and real Worker API in-process", async (t) => {
  const f = await fixture(true);
  t.after(f.close);
  t.mock.method(globalThis, "fetch", async (input: any, init: any) => {
    assert.equal(init?.redirect, "manual");
    return handle(new Request(input, init), f.env);
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = createMcpServer("http://127.0.0.1:8787", f.agentToken);
  const client = new Client({ name: "docsync-acceptance", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(() => client.close());
  t.after(() => server.close());
  assert.ok(client.getInstructions()?.includes("publish_document"));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((t) => t.name).sort(), [
    "connect_account",
    "create_document",
    "get_connection",
    "get_document",
    "get_template_options",
    "list_documents",
    "publish_document",
    "update_document",
  ]);
  const parse = (r: any) => JSON.parse(r.content[0].text);
  for (const format of ["document", "presentation", "all"]) {
    const options = parse(await client.callTool({ name: "get_template_options", arguments: { format } }));
    assert.equal(options.galleryUrl, `http://127.0.0.1:8787/templates?format=${format}`);
    assert.equal(options.linkAccess, "local_only");
    assert.ok(options.templates.length > 0);
    assert.ok(options.templates.every((theme: any) => format === "all" || theme.format === format));
    assert.match(options.guidance, /custom design/);
  }
  const connection = parse(
    await client.callTool({ name: "get_connection", arguments: {} }),
  );
  assert.equal(connection.canPublish, true);
  assert.equal(connection.linkAccess, "local_only");
  const created = await client.callTool({
    name: "create_document",
    arguments: sample("From MCP"),
  });
  assert.equal(created.isError, false);
  const doc = parse(created);
  assert.equal(doc.revision, 1);
  const read = parse(
    await client.callTool({ name: "get_document", arguments: { id: doc.id } }),
  );
  assert.equal(read.title, "From MCP");
  const updated = await client.callTool({
    name: "update_document",
    arguments: { id: doc.id, expectedRevision: 1, ...sample("MCP updated") },
  });
  assert.equal(parse(updated).revision, 2);
  const conflict = await client.callTool({
    name: "update_document",
    arguments: { id: doc.id, expectedRevision: 1, ...sample("Stale") },
  });
  assert.equal(conflict.isError, true);
  assert.equal(parse(conflict).details.currentRevision, 2);
  const list = parse(
    await client.callTool({ name: "list_documents", arguments: {} }),
  );
  assert.equal(list[0].title, "MCP updated");
  const published = await client.callTool({
    name: "publish_document",
    arguments: { id: doc.id, expectedRevision: 2 },
  });
  assert.equal(published.isError, false);
  const publication = parse(published);
  assert.match(
    publication.url,
    /^http:\/\/127\.0\.0\.1:8787\/share\/[a-f0-9]{64}$/,
  );
  const shared = (await (
    await f.call(
      "/shared/" + publication.url.split("/").at(-1),
      "GET",
      undefined,
      "anonymous",
    )
  ).json()) as any;
  assert.equal(shared.title, "MCP updated");
  assert.equal(shared.revision, 2);
  const stalePublication = await client.callTool({
    name: "publish_document",
    arguments: { id: doc.id, expectedRevision: 1 },
  });
  assert.equal(stalePublication.isError, true);
});
