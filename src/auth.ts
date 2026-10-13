import type { Env } from "./platform.ts";
import { HttpError } from "./content.ts";
import { readCookie } from "./accounts.ts";

export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export async function hash(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
async function signature(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function checkOrigin(request: Request) {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    throw new HttpError(403, "Same-origin request required");
}
function cookie(request: Request, value: string, age: number) {
  const url = new URL(request.url);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !local)
    throw new HttpError(400, "HTTPS required");
  return `docsync_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${url.protocol === "https:" ? "; Secure" : ""}`;
}
export async function login(
  request: Request,
  env: Env,
  key: unknown,
): Promise<string> {
  checkOrigin(request);
  const now = Math.floor(Date.now() / 1000),
    ip = await hash(request.headers.get("CF-Connecting-IP") || "local");
  await env.DB.prepare(
    "INSERT INTO login_limits(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END",
  )
    .bind(ip, now, now - 900, now - 900)
    .run();
  const limit = await env.DB.prepare(
    "SELECT attempts FROM login_limits WHERE key=?",
  )
    .bind(ip)
    .first<{ attempts: number }>();
  if (limit && limit.attempts > 10)
    throw new HttpError(429, "Too many login attempts. Retry in 15 minutes.");
  if (
    typeof key !== "string" ||
    key.length > 200 ||
    !same(await hash(key), env.OWNER_KEY_HASH)
  )
    throw new HttpError(401, "Invalid owner key");
  await env.DB.prepare(
    "DELETE FROM login_limits WHERE key=? OR window_start < ?",
  )
    .bind(ip, now - 900)
    .run();
  const payload = `${now + 8 * 3600}.${randomToken()}`;
  return cookie(
    request,
    `${payload}.${await signature(env.SESSION_SECRET, payload)}`,
    8 * 3600,
  );
}
export const logoutCookie = (request: Request) => cookie(request, "", 0);
export type Principal = {
  role: "owner" | "agent";
  canPublish: boolean;
  accountId: string;
  kind: "legacy" | "user" | "trial";
};
export async function authenticate(
  request: Request,
  env: Env,
): Promise<Principal> {
  const bearer = request.headers.get("Authorization");
  if (bearer) {
    if (!/^Bearer [a-f0-9]{64}$/.test(bearer))
      throw new HttpError(401, "Invalid agent token");
    const credential = await env.DB.prepare(
      "SELECT c.account_id,c.can_publish,a.kind FROM account_credentials c JOIN accounts a ON a.id=c.account_id WHERE c.token_hash=?",
    )
      .bind(await hash(bearer.slice(7)))
      .first<{
        account_id: string;
        can_publish: number;
        kind: Principal["kind"];
      }>();
    if (credential)
      return {
        role: "agent",
        canPublish: credential.can_publish === 1,
        accountId: credential.account_id,
        kind: credential.kind,
      };
    const stored = await env.DB.prepare(
      "SELECT token_hash,can_publish FROM agent_credentials WHERE slot=1",
    ).first<{ token_hash: string; can_publish: number }>();
    if (!stored || !same(await hash(bearer.slice(7)), stored.token_hash))
      throw new HttpError(401, "Invalid or revoked agent token");
    return {
      role: "agent",
      canPublish: stored.can_publish === 1,
      accountId: "legacy",
      kind: "legacy",
    };
  }
  const accountToken = readCookie(request, "docsync_account");
  if (accountToken) {
    const session = await env.DB.prepare(
      "SELECT s.account_id,a.kind FROM account_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>?",
    )
      .bind(await hash(accountToken), Math.floor(Date.now() / 1000))
      .first<{ account_id: string; kind: Principal["kind"] }>();
    if (!session) throw new HttpError(401, "Session expired");
    if (!["GET", "HEAD"].includes(request.method)) checkOrigin(request);
    return {
      role: "owner",
      canPublish: true,
      accountId: session.account_id,
      kind: session.kind,
    };
  }
  const token = request.headers
    .get("Cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("docsync_session="))
    ?.slice("docsync_session=".length);
  if (!token || !/^\d+\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, "Sign in required");
  const [expiry, nonce, sig] = token.split(".");
  if (
    Number(expiry) <= Math.floor(Date.now() / 1000) ||
    !same(await signature(env.SESSION_SECRET, `${expiry}.${nonce}`), sig)
  )
    throw new HttpError(401, "Session expired");
  if (!["GET", "HEAD"].includes(request.method)) checkOrigin(request);
  return {
    role: "owner",
    canPublish: true,
    accountId: "legacy",
    kind: "legacy",
  };
}
