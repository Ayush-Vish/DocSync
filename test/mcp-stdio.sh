#!/bin/sh
# Known dummy token is confined to the in-memory test fixture.
rows=$(
  DOCSYNC_AGENT_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa node --experimental-strip-types test/mcp-fixture.ts <<'MCP'
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"acceptance","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_document","arguments":{"title":"Stdio acceptance","sections":[{"id":"intro","html":"<h1>Hello</h1>","css":""}]}}}
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_template_options","arguments":{"format":"document"}}}
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"get_document","arguments":{"id":"99999999-9999-4999-8999-999999999999"}}}
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"upload_media","arguments":{"id":"99999999-9999-4999-8999-999999999999","mimeType":"image/png","filePath":"relative/private.png"}}}
{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"update_document","arguments":{"id":"invalid"}}}
MCP
) || exit $?
printf '%s\n' "$rows" | node --input-type=module -e '
import assert from "node:assert/strict";
let input = ""; for await (const chunk of process.stdin) input += chunk;
const rows = input.trim().split("\n").map(line => JSON.parse(line));
assert.equal(rows.find(row => row.id === 1).result.serverInfo.name, "docsync");
assert.equal(rows.find(row => row.id === 2).result.tools.length, 20);
const created = rows.find(row => row.id === 3).result;
assert.equal(created.isError, false);
assert.equal(JSON.parse(created.content[0].text).title, "Stdio acceptance");
assert.equal(JSON.parse(rows.find(row => row.id === 4).result.content[0].text).galleryUrl, "http://127.0.0.1:8787/templates?format=document");
assert.equal(rows.find(row => row.id === 5).result.isError, true);
assert.equal(rows.find(row => row.id === 6).result.isError, true);
assert.equal(rows.find(row => row.id === 7).result.isError, true);
console.log("Real stdio smoke test passed: tool results and local audit timing.");
'
