import assert from "node:assert/strict";
import { test } from "node:test";
import { hash, randomToken } from "../src/auth.ts";
import type { Document, EditLease, PageLockRequest, PageLockState } from "../src/document.ts";
import { handle } from "../src/worker.ts";
import { fixture } from "./helpers.ts";

const page = (id: string) => ({ id, kind: "html" as const, html: `<h2>${id}</h2>`, css: "" });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

test("selected pages stay with their IDs and only the assigned credential can edit them", async t => {
  const f = await fixture(); t.after(f.close);
  const sections = ["intro", "methods", "results"].map(page);
  const content = { title: "Page lock example", format: "presentation", sections };
  const doc = await (await f.call("/documents", "POST", content)).json() as Document;
  const path = `/documents/${doc.id}`, locks = path + "/page-locks";
  const state = async () => (await (await f.call(locks)).json()) as PageLockState;
  const initial = await state();
  assert.deepEqual(initial.locks, []);
  assert.equal(initial.agents.length, 1);
  assert.equal((await f.call(locks, "POST", { pageIds: ["intro", "missing"], agentId: initial.agents[0].id })).status, 409);
  assert.deepEqual((await state()).locks, [], "bulk lock is atomic");
  assert.equal((await f.call(locks, "POST", { pageIds: ["intro", "methods"], agentId: initial.agents[0].id })).status, 200);
  assert.equal((await f.call(locks, "DELETE", { pageIds: ["intro"] }, "agent")).status, 403);

  const browser = await (await f.call(path + "/lock", "POST", {})).json() as EditLease;
  const browserSave = (sections: Document["sections"]) => f.call(path, "PUT", { ...content, sections, expectedRevision: 1, lockToken: browser.lockToken });
  const denied = await browserSave([{ ...sections[0], js: "console.log('changed')" }, ...sections.slice(1)]);
  assert.equal(denied.status, 423);
  assert.equal((await denied.json() as any).details.code, "PAGE_LOCKED");
  assert.equal((await browserSave(sections.slice(1))).status, 423);
  const reordered = [page("new"), sections[1], sections[0], { ...sections[2], css: "h2{color:red}" }];
  const saved = await browserSave(reordered);
  assert.equal(saved.status, 200);
  assert.deepEqual((await saved.json() as Document).sections.map(section => section.id), ["new", "methods", "intro", "results"]);
  assert.deepEqual((await state()).locks.map(lock => lock.pageId).sort(), ["intro", "methods"]);
  await f.call(path + "/lock", "DELETE", { lockToken: browser.lockToken });

  const agentLease = await (await f.call(path + "/lock", "POST", {}, "agent")).json() as EditLease;
  const agentSave = await f.call(path, "PUT", { ...content, expectedRevision: 2, lockToken: agentLease.lockToken,
    sections: reordered.map(section => section.id === "intro" ? { ...section, html: "<h2>Assigned update</h2>" } : section) }, "agent");
  assert.equal(agentSave.status, 200);
  await f.call(path + "/lock", "DELETE", { lockToken: agentLease.lockToken }, "agent");
  const secondBrowser = await (await f.call(path + "/lock", "POST", {})).json() as EditLease;
  assert.equal((await f.call(path + "/restore", "POST", { revision: 2, expectedRevision: 3, lockToken: secondBrowser.lockToken })).status, 423);
  assert.equal((await f.call(locks, "DELETE", { pageIds: ["intro"] })).status, 200);
  assert.equal((await f.call(path + "/restore", "POST", { revision: 2, expectedRevision: 3, lockToken: secondBrowser.lockToken })).status, 200);
  assert.deepEqual((await state()).locks.map(lock => lock.pageId), ["methods"]);
});

test("hosted MCP sends deduplicated requests to the assigned agent and browser owner", async t => {
  const f = await fixture(); t.after(f.close);
  const doc = await (await f.call("/documents", "POST", { title: "Requests", sections: [page("intro"), page("methods")] })).json() as Document;
  await f.env.DB.prepare("INSERT INTO accounts(id,kind,email,created_at) VALUES('collaborator','user','editor@example.com',datetime('now'))").run();
  await f.env.DB.prepare("INSERT INTO document_members(document_id,account_id,role) VALUES(?,'collaborator','editor')").bind(doc.id).run();
  async function connect(clientId: string, accountId: string) {
    const token = randomToken();
    await f.env.DB.prepare("INSERT INTO oauth_clients VALUES(?,?,'[]',unixepoch())").bind(clientId, clientId).run();
    await f.env.DB.prepare("INSERT INTO oauth_access_tokens VALUES(?,?,?,0,unixepoch()+3600)").bind(await hash(token), accountId, clientId).run();
    return async (name: string, args: unknown) => {
      const response = await handle(new Request("http://127.0.0.1:8787/mcp", {
        method: "POST", headers: { ...auth(token), "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
      }), f.env);
      const rpc = await response.json() as { result: { content: { text: string }[]; isError?: boolean } };
      return { ...rpc.result, data: JSON.parse(rpc.result.content[0].text) };
    };
  }
  const holder = await connect("Assigned agent", "legacy");
  const sameAccount = await connect("Another owner agent", "legacy");
  const collaborator = await connect("Editor agent", "collaborator");
  const options = { id: doc.id, pageIds: ["intro"] };
  assert.equal((await holder("lock_pages", options)).isError, false);
  assert.equal((await collaborator("lock_pages", { ...options, pageIds: ["methods"] })).isError, true);
  assert.equal((await sameAccount("lock_pages", { ...options, pageIds: ["intro", "methods"] })).isError, true);
  const otherLease = (await sameAccount("acquire_document_lock", { id: doc.id })).data as EditLease;
  const blocked = await sameAccount("update_document", { id: doc.id, title: doc.title,
    sections: [{ ...page("intro"), html: "<h2>Unauthorized edit</h2>" }, page("methods")],
    expectedRevision: 1, lockToken: otherLease.lockToken,
  });
  assert.equal(blocked.data.details.code, "PAGE_LOCKED");
  await sameAccount("release_document_lock", { id: doc.id, lockToken: otherLease.lockToken });
  assert.equal((await collaborator("request_page_unlock", options)).isError, false);
  assert.equal((await collaborator("request_page_unlock", options)).isError, false);
  const inbox = (await holder("get_page_lock_requests", {})).data as PageLockRequest[];
  assert.deepEqual(inbox.map(({ pageId, requester }) => [pageId, requester]), [["intro", "Editor agent"]]);
  assert.deepEqual((await holder("get_document", { id: doc.id })).data.pageLockRequests, inbox);
  assert.deepEqual((await sameAccount("get_page_lock_requests", {})).data, []);
  assert.deepEqual((await collaborator("get_page_lock_requests", {})).data, []);
  assert.deepEqual(await (await f.call("/page-lock-requests")).json(), inbox);
  assert.equal((await f.call(`/documents/${doc.id}/page-locks`, "DELETE", options)).status, 200);
  assert.deepEqual((await holder("get_page_lock_requests", {})).data, []);
});
