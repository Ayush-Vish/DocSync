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
    "acquire_document_lock",
    "compare_document_versions",
    "connect_account",
    "create_document",
    "get_connection",
    "get_document",
    "get_document_access",
    "get_document_history",
    "get_document_lock",
    "get_template_options",
    "invite_document_collaborator",
    "list_documents",
    "publish_document",
    "release_document_lock",
    "renew_document_lock",
    "restore_document",
    "revoke_document_invitation",
    "update_document",
    "update_document_collaborator_access",
    "upload_media",
  ]);
  const parse = (r: any) => JSON.parse(r.content[0].text);
  for (const format of ["document", "presentation", "all"]) {
    const options = parse(await client.callTool({ name: "get_template_options", arguments: { format } }));
    assert.equal(options.galleryUrl, `http://127.0.0.1:8787/templates?format=${format}`);
    assert.equal(options.linkAccess, "local_only");
    assert.ok(options.templates.length > 0);
    assert.ok(options.templates.every((theme: any) => format === "all" || theme.format === format));
    assert.ok(Array.isArray(options.themes) && options.themes.includes("midnight"));
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
  const media = parse(await client.callTool({ name: "upload_media", arguments: { id: doc.id, filename: "image.png", mimeType: "image/png", dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSAAAAABJRU5ErkJggg==" } }));
  assert.equal(media.size, 67);
  assert.match(media.src, /^\/media\//);
  assert.equal(media.url, "http://127.0.0.1:8787" + media.src);
  for (const arguments_ of [
    { filePath: "/server/secret.png" },
    { dataBase64: "not base64!", filename: "bad.png" },
    { dataBase64: "aGVsbG8=", filePath: "/local/image.png", filename: "both.png" },
  ]) assert.equal((await client.callTool({ name: "upload_media", arguments: { id: doc.id, mimeType: "image/png", ...arguments_ } })).isError, true);
  const read = parse(
    await client.callTool({ name: "get_document", arguments: { id: doc.id } }),
  );
  assert.equal(read.title, "From MCP");
  const { lockToken } = parse(await client.callTool({ name: "acquire_document_lock", arguments: { id: doc.id } }));
  assert.equal(typeof lockToken, "string");
  const updated = await client.callTool({
    name: "update_document",
    arguments: { id: doc.id, expectedRevision: 1, lockToken, ...sample("MCP updated") },
  });
  assert.equal(parse(updated).revision, 2);
  const conflict = await client.callTool({
    name: "update_document",
    arguments: { id: doc.id, expectedRevision: 1, lockToken, ...sample("Stale") },
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
  assert.equal((await client.callTool({ name: "renew_document_lock", arguments: { id: doc.id, lockToken } })).isError, false);
  const versions = parse(await client.callTool({ name: "get_document_history", arguments: { id: doc.id } }));
  assert.deepEqual(versions.map((row: any) => row.revision), [2, 1]);
  const comparison = parse(await client.callTool({ name: "compare_document_versions", arguments: { id: doc.id, fromRevision: 1, toRevision: 2 } }));
  assert.equal(comparison.title.after, "MCP updated");
  const oldVersion = parse(await client.callTool({ name: "get_document", arguments: { id: doc.id, revision: 1 } }));
  assert.equal(oldVersion.title, "From MCP");
  const restored = parse(await client.callTool({ name: "restore_document", arguments: { id: doc.id, revision: 1, expectedRevision: 2, lockToken, changeSummary: "Reverted after review" } }));
  assert.equal(restored.revision, 3);
  assert.equal((await client.callTool({ name: "release_document_lock", arguments: { id: doc.id, lockToken } })).isError, false);
  assert.equal(parse(await client.callTool({ name: "get_document_lock", arguments: { id: doc.id } })).lock, null);
});

test("stdio media capability uploads exactly the chosen local file bytes", async t => {
  const f = await fixture(); t.after(f.close);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const image = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  const server = createMcpServer("http://127.0.0.1:8787", f.agentToken, async (input, init) => handle(new Request(input, init), f.env), async path => {
    assert.equal(path, "/local/motion.gif"); return { bytes: image, filename: "motion.gif" };
  });
  const client = new Client({ name: "Codex", version: "1" });
  await server.connect(b); await client.connect(a); t.after(() => client.close()); t.after(() => server.close());
  const parse = (result: any) => JSON.parse(result.content[0].text);
  const doc = parse(await client.callTool({ name: "create_document", arguments: sample() }));
  const result = await client.callTool({ name: "upload_media", arguments: { id: doc.id, mimeType: "image/gif", filePath: "/local/motion.gif" } });
  assert.equal(result.isError, false); assert.equal(parse(result).size, image.byteLength);
  const people = await (await f.call(`/documents/${doc.id}/collaborators`)).json() as any[];
  assert.equal(people[0].agents[0].name, "Codex");
});
