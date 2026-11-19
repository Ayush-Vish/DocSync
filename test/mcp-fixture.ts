// Transport fixture: real stdio, real Worker + SQLite, no TCP listener required.
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { sqliteDatabase } from "../scripts/sqlite.ts";
import { handle } from "../src/worker.ts";
import { hash, randomToken } from "../src/auth.ts";
process.env.DOCSYNC_URL = "http://127.0.0.1:8787";
const database = sqliteDatabase(":memory:");
database.migrate();
await database.db
  .prepare(
    "INSERT INTO agent_credentials(slot,token_hash,created_at,can_publish) VALUES(1,?,?,1)",
  )
  .bind(await hash(process.env.DOCSYNC_AGENT_TOKEN!), new Date().toISOString())
  .run();
const env = {
  DB: database.db,
  OWNER_KEY_HASH: await hash(randomToken()),
  SESSION_SECRET: randomToken(),
  ASSETS: { fetch: async () => new Response("app") },
};
globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const response = await handle(request, env);
  // An API round trip includes elapsed time outside the Worker.
  if (request.method === "POST" && new URL(request.url).pathname === "/api/documents") await setTimeout(50);
  return response;
};
process.once("beforeExit", () => {
  const rows = database.sqlite.prepare("SELECT tool,source,outcome,status,duration_ms,local_duration_ms,details FROM agent_audit_events ORDER BY tool").all();
  assert.deepEqual(rows.map(row => [row.tool, row.source, row.outcome]), [
    ["create_document", "api", "success"],
    ["get_document", "api", "error"],
    ["get_template_options", "api", "success"],
    ["update_document", "client", "error"],
    ["upload_media", "client", "error"],
  ]);
  for (const row of rows) assert.ok(typeof row.local_duration_ms === "number" && row.local_duration_ms >= 0);
  assert.ok(Number(rows[0].local_duration_ms) >= Number(rows[0].duration_ms) + 40);
  assert.equal(rows[1].status, 404);
  assert.equal(rows[2].status, 200);
  assert.ok(rows.slice(3).every(row => row.duration_ms === null));
  assert.ok(!JSON.stringify(rows).includes("private.png"));
  database.close();
});
await import(
  new URL(
    process.env.DOCSYNC_TEST_BUNDLE === "1"
      ? "../dist/docsync-mcp.cjs"
      : "../dist/mcp.mjs",
    import.meta.url,
  ).href
);
