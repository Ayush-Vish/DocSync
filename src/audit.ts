import type { Env } from "./platform.ts";
import type { Principal } from "./auth.ts";
import { hash } from "./auth.ts";
import { HttpError } from "./content.ts";
import { readBody } from "./request.ts";

export const auditRetentionDays = 90;
export function auditText(value: unknown, limit = 200): string {
  return typeof value === "string" ? value.slice(0, limit + 256).replace(/[\x00-\x1f\x7f]/g, " ").replace(/Bearer\s+\S+|sb_(?:secret|publishable)_[\w-]+|[a-f0-9]{64}/gi, "[redacted]").slice(0, limit) : "";
}
export type AuditEvent = {
  id: number; requestId: string; createdAt: string; clientName: string; clientVersion: string; credentialId: string;
  tool: string; source: "api" | "mcp" | "client"; documentId: string | null; method: string; path: string;
  outcome: "pending" | "success" | "error"; status: number | null; durationMs: number | null; error: string;
  deviceName: string; platform: string; ip: string; userAgent: string; details: Record<string, unknown>;
};
export type AuditPage = { items: AuditEvent[]; nextCursor: number | null; retentionDays: number };
function header(request: Request, name: string, limit = 200) {
  try { return auditText(decodeURIComponent(request.headers.get(name) || ""), limit); }
  catch { return ""; }
}
// Explicit summaries exclude document contents, passwords, tokens, media bytes,
// local file paths, authorization URLs, and arbitrary client-supplied fields.
export function auditDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>, details: Record<string, unknown> = {};
  for (const key of ["title", "format", "role", "accountId", "invitationId", "email", "filename", "mimeType"]) {
    if (typeof input[key] === "string") details[key] = auditText(input[key], key === "email" ? 254 : 200);
  }
  for (const key of ["revision", "expectedRevision", "fromRevision", "toRevision", "size"]) {
    if (Number.isSafeInteger(input[key]) && Number(input[key]) >= 0) details[key] = input[key];
  }
  if (typeof input.allowPublishing === "boolean") details.allowPublishing = input.allowPublishing;
  const pages = input.pages ?? input.sections;
  if (Array.isArray(pages)) {
    details.pageCount = pages.length;
    const bounded = pages.slice(0, 40);
    details.htmlCharacters = bounded.reduce((n, page) => n + (typeof page?.html === "string" ? page.html.length : 0), 0);
    details.cssCharacters = bounded.reduce((n, page) => n + (typeof page?.css === "string" ? page.css.length : 0), 0);
    details.jsCharacters = bounded.reduce((n, page) => n + (typeof page?.js === "string" ? page.js.length : 0), 0);
  }
  return details;
}
function operation(request: Request): string {
  const path = new URL(request.url).pathname, method = request.method;
  if (path === "/api/documents") return method === "POST" ? "create_document" : "list_documents";
  if (path === "/api/connection") return "get_connection";
  if (path === "/api/claim-link") return "connect_account";
  if (/\/invitations\//.test(path)) return "revoke_document_invitation";
  if (/^\/api\/documents\/[a-f0-9-]{36}$/.test(path)) return method === "GET" ? "get_document" : "update_document";
  const action = path.split("/").at(-1);
  if (action === "lock") return ({ GET: "get_document_lock", POST: "acquire_document_lock", PATCH: "renew_document_lock", DELETE: "release_document_lock" } as Record<string, string>)[method] || "document_lock";
  if (action === "access") return method === "GET" ? "get_document_access" : method === "POST" ? "invite_document_collaborator" : "update_document_collaborator_access";
  return ({ history: "get_document_history", compare: "compare_document_versions", restore: "restore_document", publish: "publish_document", media: "upload_media", collaborators: "get_document_collaborators" } as Record<string, string>)[action || ""] || `${method} ${auditText(path, 180)}`;
}

type AuditOptions = { source?: "api" | "mcp" | "client"; tool?: string; args?: unknown; clientError?: boolean };
export async function withAgentAudit(request: Request, env: Env, principal: Principal, action: (request: Request) => Promise<Response>, options: AuditOptions = {}): Promise<Response> {
  if (principal.role !== "agent") return action(request);
  const started = Date.now(), requestId = crypto.randomUUID(), url = new URL(request.url);
  let args = options.args, actionRequest = request, bodyError: unknown;
  if (args === undefined && request.body && request.headers.get("Content-Type")?.startsWith("application/json")) {
    try {
      const bytes = await readBody(request, 550_000);
      actionRequest = new Request(request, { body: bytes });
      try { args = JSON.parse(new TextDecoder().decode(bytes)); } catch { /* The API still returns its normal JSON validation error. */ }
    } catch (error) { bodyError = error; }
  }
  const details = auditDetails(args);
  const tool = auditText(options.tool || operation(request), 120);
  for (const key of ["revision", "from", "to"]) {
    const value = url.searchParams.get(key);
    if (value && /^\d{1,10}$/.test(value)) details[key] = Number(value);
  }
  if (url.pathname.endsWith("/media")) {
    details.filename = header(request, "X-File-Name", 160);
    details.mimeType = auditText(request.headers.get("Content-Type"), 80);
    const size = Number(request.headers.get("Content-Length"));
    if (Number.isSafeInteger(size) && size > 0) details.size = size;
  }
  details.publishingAllowed = principal.canPublish;
  let documentId = url.pathname.match(/^\/api\/documents\/([a-f0-9-]{36})/)?.[1] || (args && typeof args === "object" && "id" in args && typeof args.id === "string" && /^[a-f0-9-]{36}$/.test(args.id) ? args.id : null);
  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM agent_audit_events WHERE account_id=? AND created_at<strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')").bind(principal.accountId),
      env.DB.prepare(`INSERT INTO agent_audit_events(request_id,account_id,created_at,client_name,client_version,credential_id,tool,source,document_id,method,path,outcome,device_name,platform,ip,user_agent,details)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?)`).bind(requestId, principal.accountId, new Date(started).toISOString(), auditText(principal.actorLabel, 100), header(request, "X-DocSync-Client-Version", 80), (await hash(principal.actorId)).slice(0, 16), tool, options.source || "api", documentId, request.method, auditText(url.pathname, 250), header(request, "X-DocSync-Device", 120), header(request, "X-DocSync-Platform", 160), auditText(request.headers.get("CF-Connecting-IP"), 64), auditText(request.headers.get("User-Agent"), 500), JSON.stringify(details)),
    ]);
  } catch { throw new HttpError(503, "Audit logging is unavailable. This action was not executed."); }
  const finish = async (outcome: string, status: number, error = "") => {
    try {
      await env.DB.prepare("UPDATE agent_audit_events SET outcome=?,status=?,duration_ms=?,error=?,details=?,document_id=? WHERE request_id=? AND account_id=?")
        .bind(outcome, status, Date.now() - started, auditText(error, 500), JSON.stringify(details), documentId, requestId, principal.accountId).run();
      return true;
    } catch { console.error("Audit completion pending", { requestId }); return false; }
  };
  let response: Response;
  try { if (bodyError) throw bodyError; response = await action(actionRequest); }
  catch (error) { await finish("error", error instanceof HttpError ? error.status : 500, error instanceof HttpError ? error.message : "Unexpected server error"); throw error; }
  let failed = !response.ok || Boolean(options.clientError), error = options.clientError ? "Client-side media validation failed; no upload was sent." : "";
  if (response.headers.get("Content-Type")?.includes("application/json")) {
    try {
      let result = await response.clone().json() as Record<string, unknown>;
      if (options.source === "mcp") {
        const rpc = result as { error?: { message?: string }; result?: { isError?: boolean; content?: { text?: string }[] } };
        failed ||= Boolean(rpc.error || rpc.result?.isError);
        if (rpc.error) error = auditText(rpc.error.message, 500);
        try { result = JSON.parse(rpc.result?.content?.[0]?.text || "{}"); } catch { result = {}; if (failed) error ||= "Tool reported an error"; }
      }
      if (failed) error ||= auditText(result.error, 500);
      const summary = auditDetails(result);
      if (typeof result.id === "string" && /^[a-f0-9-]{36}$/.test(result.id)) {
        if (tool === "create_document") documentId = result.id;
        if (tool === "upload_media") summary.assetId = result.id;
        if (tool === "invite_document_collaborator") summary.invitationId = result.id;
      }
      if (Object.keys(summary).length) details.result = summary;
    } catch { /* HTTP status remains available when a transport response is not JSON. */ }
  }
  const complete = await finish(failed ? "error" : "success", response.status, error);
  const headers = new Headers(response.headers);
  headers.set("X-DocSync-Request-Id", requestId);
  if (!complete) headers.set("X-DocSync-Audit", "pending");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export async function listAuditEvents(request: Request, env: Env, principal: Principal) {
  if (principal.role !== "owner") throw new HttpError(403, "Open Audit Log in your signed-in DocSync account");
  const query = new URL(request.url).searchParams, before = query.get("before"), outcome = query.get("outcome"), search = query.get("q") || "";
  if ((before && (!/^\d{1,16}$/.test(before) || !Number.isSafeInteger(Number(before)))) || (outcome && !["success", "error", "pending"].includes(outcome)) || search.length > 100) throw new HttpError(400, "Invalid audit filters");
  const pattern = "%" + search.replace(/[\\%_]/g, "\\$&") + "%";
  const rows = await env.DB.prepare(`SELECT id,request_id AS requestId,created_at AS createdAt,client_name AS clientName,client_version AS clientVersion,credential_id AS credentialId,tool,source,document_id AS documentId,method,path,outcome,status,duration_ms AS durationMs,error,device_name AS deviceName,platform,ip,user_agent AS userAgent,details
    FROM agent_audit_events WHERE account_id=? AND created_at>=strftime('%Y-%m-%dT%H:%M:%fZ','now','-90 days')
    AND (? IS NULL OR id<?) AND (? IS NULL OR outcome=?)
    AND (tool LIKE ? ESCAPE '\\' OR client_name LIKE ? ESCAPE '\\' OR device_name LIKE ? ESCAPE '\\') ORDER BY id DESC LIMIT 51`)
    .bind(principal.accountId, before ? Number(before) : null, before ? Number(before) : null, outcome || null, outcome || null, pattern, pattern, pattern).all<Omit<AuditEvent, "details"> & { details: string }>();
  return { items: rows.results.slice(0, 50).map(row => ({ ...row, details: JSON.parse(row.details) })), nextCursor: rows.results.length > 50 ? rows.results[49].id : null, retentionDays: auditRetentionDays };
}
