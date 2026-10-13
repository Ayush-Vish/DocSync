#!/bin/sh
# Known dummy token is confined to the in-memory test fixture.
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"acceptance","version":"1"}}}' \
'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
'{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"create_document","arguments":{"title":"Stdio acceptance","sections":[{"id":"intro","html":"<h1>Hello</h1>","css":""}]}}}' \
| DOCSYNC_AGENT_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa node --experimental-strip-types test/mcp-fixture.ts \
| node --input-type=module -e '
import assert from "node:assert/strict";
let input = ""; for await (const chunk of process.stdin) input += chunk;
const rows = input.trim().split("\n").map(line => JSON.parse(line));
assert.equal(rows.find(row => row.id === 1).result.serverInfo.name, "docsync");
assert.equal(rows.find(row => row.id === 2).result.tools.length, 7);
const created = rows.find(row => row.id === 3).result;
assert.equal(created.isError, false);
assert.equal(JSON.parse(created.content[0].text).title, "Stdio acceptance");
console.log("Real stdio smoke test passed: initialization, tools, document creation.");
'
