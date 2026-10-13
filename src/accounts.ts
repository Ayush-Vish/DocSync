import type { Env } from "./platform.ts";
import { HttpError } from "./content.ts";
import { checkOrigin, hash, randomToken } from "./auth.ts";

const now = () => Math.floor(Date.now() / 1000);
export function sessionCookie(
  request: Request,
  token: string,
  age = 60 * 60 * 24 * 7,
) {
  const url = new URL(request.url);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new HttpError(400, "HTTPS required");
  return `docsync_account=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${url.protocol === "https:" ? "; Secure" : ""}`;
}
export function readCookie(request: Request, name: string) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + "="))
    ?.slice(name.length + 1);
}
export async function rateLimit(
  request: Request,
  env: Env,
  category: string,
  max: number,
  seconds = 900,
) {
  const key = await hash(
      `${category}:${request.headers.get("CF-Connecting-IP") || "local"}`,
    ),
    time = now();
  await env.DB.prepare(
    "INSERT INTO login_limits(key,attempts,window_start) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start < ? THEN 1 ELSE attempts+1 END, window_start=CASE WHEN window_start < ? THEN excluded.window_start ELSE window_start END",
  )
    .bind(key, time, time - seconds, time - seconds)
    .run();
  const row = await env.DB.prepare(
    "SELECT attempts FROM login_limits WHERE key=?",
  )
    .bind(key)
    .first<{ attempts: number }>();
  if (row && row.attempts > max)
    throw new HttpError(429, "Too many attempts. Please try again later.");
}
async function passwordHash(password: string, salt: string, secret: string) {
  // Workers WebCrypto caps PBKDF2 at 100,000 iterations. A server-side pepper
  // protects database-only leaks; changing SESSION_SECRET invalidates passwords.
  const pepper = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const input = await crypto.subtle.sign(
    "HMAC",
    pepper,
    new TextEncoder().encode(password),
  );
  const key = await crypto.subtle.importKey("raw", input, "PBKDF2", false, [
    "deriveBits",
  ]);
  const bytes = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
export async function newSession(
  request: Request,
  env: Env,
  accountId: string,
) {
  const token = randomToken();
  await env.DB.prepare("DELETE FROM account_sessions WHERE expires_at < ?")
    .bind(now())
    .run();
  await env.DB.prepare("INSERT INTO account_sessions VALUES(?,?,?)")
    .bind(await hash(token), accountId, now() + 604800)
    .run();
  return sessionCookie(request, token);
}
export async function emailAuth(
  request: Request,
  env: Env,
  input: Record<string, unknown>,
  signup: boolean,
) {
  checkOrigin(request);
  await rateLimit(request, env, "password", 10);
  const email =
    typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 12 ||
    password.length > 256
  )
    throw new HttpError(
      400,
      "Use a valid email and a password of 12–256 characters.",
    );
  const existing = await env.DB.prepare(
    "SELECT id,password_hash FROM accounts WHERE email=?",
  )
    .bind(email)
    .first<{ id: string; password_hash: string | null }>();
  if (signup) {
    if (existing)
      throw new HttpError(
        409,
        "Unable to create this account. Try signing in.",
      );
    const salt = randomToken(),
      id = crypto.randomUUID(),
      value = await passwordHash(password, salt, env.SESSION_SECRET);
    try {
      await env.DB.prepare(
        "INSERT INTO accounts(id,kind,email,password_hash,created_at) VALUES(?,'user',?,?,?)",
      )
        .bind(id, email, `${salt}:${value}`, new Date().toISOString())
        .run();
    } catch {
      throw new HttpError(
        409,
        "Unable to create this account. Try signing in.",
      );
    }
    return newSession(request, env, id);
  }
  const [salt, expected] = (
    existing?.password_hash || `${"0".repeat(64)}:${"0".repeat(64)}`
  ).split(":");
  const actual = await passwordHash(password, salt, env.SESSION_SECRET);
  if (!existing?.password_hash || !equal(actual, expected))
    throw new HttpError(401, "Invalid email or password.");
  return newSession(request, env, existing.id);
}
export async function bootstrap(
  request: Request,
  env: Env,
  input: Record<string, unknown>,
) {
  if (
    typeof input.credential !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.credential)
  )
    throw new HttpError(400, "A random installation credential is required.");
  const digest = await hash(input.credential),
    id = `trial-${digest}`;
  const existing = await env.DB.prepare("SELECT id FROM accounts WHERE id=?")
    .bind(id)
    .first();
  if (!existing) {
    await rateLimit(request, env, "installations", 10, 86400);
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO accounts(id,kind,created_at) VALUES(?,'trial',?)",
      ).bind(id, new Date().toISOString()),
      env.DB.prepare(
        "INSERT OR IGNORE INTO account_credentials(account_id,token_hash,can_publish) VALUES(?,?,1)",
      ).bind(id, digest),
    ]);
  }
  // Existing installations never get a revoked credential recreated.
  return { ok: true };
}
export async function claimLink(env: Env, accountId: string, origin: string) {
  const token = randomToken();
  await env.DB.prepare(
    "DELETE FROM installation_claims WHERE account_id=? OR expires_at<?",
  )
    .bind(accountId, now())
    .run();
  await env.DB.prepare("INSERT INTO installation_claims VALUES(?,?,?)")
    .bind(await hash(token), accountId, now() + 900)
    .run();
  return { signInUrl: `${origin}/connect#claim=${token}`, expiresIn: 900 };
}
export async function claimInstallation(
  env: Env,
  accountId: string,
  code: unknown,
) {
  if (typeof code !== "string" || !/^[a-f0-9]{64}$/.test(code))
    throw new HttpError(400, "Invalid connection code.");
  const digest = await hash(code);
  const claim = await env.DB.prepare(
    "SELECT account_id FROM installation_claims WHERE token_hash=? AND expires_at>?",
  )
    .bind(digest, now())
    .first<{ account_id: string }>();
  if (!claim)
    throw new HttpError(
      410,
      "Connection link expired or already used. Request a new link from your agent.",
    );
  const result = await env.DB.batch([
    env.DB.prepare(
      "UPDATE documents SET account_id=? WHERE account_id=? AND EXISTS(SELECT 1 FROM installation_claims WHERE token_hash=? AND expires_at>?)",
    ).bind(accountId, claim.account_id, digest, now()),
    env.DB.prepare(
      "DELETE FROM account_credentials WHERE account_id=? AND EXISTS(SELECT 1 FROM installation_claims WHERE token_hash=? AND expires_at>?)",
    ).bind(claim.account_id, digest, now()),
    env.DB.prepare("DELETE FROM installation_claims WHERE account_id=?").bind(
      claim.account_id,
    ),
  ]);
  if (!result[1].meta.changes)
    throw new HttpError(410, "Connection link already used.");
}
const googleCookie = (request: Request, value: string, age: number) =>
  `docsync_google=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
export async function googleStart(request: Request, env: Env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
    throw new HttpError(
      503,
      "Google sign-in is not configured. Use email and password.",
    );
  await rateLimit(request, env, "google", 20);
  const state = randomToken(),
    verifier = randomToken();
  await env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<?")
    .bind(now())
    .run();
  await env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?)")
    .bind(await hash(state), verifier, now() + 600)
    .run();
  const challenge = btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(verifier),
        ),
      ),
    ),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: new URL("/api/auth/google/callback", request.url).href,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.href,
      "Set-Cookie": googleCookie(request, state, 600),
    },
  });
}
export async function googleCallback(request: Request, env: Env) {
  const url = new URL(request.url),
    state = url.searchParams.get("state"),
    code = url.searchParams.get("code");
  if (
    !state ||
    !code ||
    !equal(state, readCookie(request, "docsync_google") || "") ||
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET
  )
    throw new HttpError(400, "Google sign-in failed. Start again.");
  const digest = await hash(state);
  const saved = await env.DB.prepare(
    "SELECT verifier FROM oauth_states WHERE state_hash=? AND expires_at>?",
  )
    .bind(digest, now())
    .first<{ verifier: string }>();
  const used = await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash=?",
  )
    .bind(digest)
    .run();
  if (!saved || !used.meta.changes)
    throw new HttpError(400, "Google sign-in expired. Start again.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: new URL("/api/auth/google/callback", request.url).href,
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
  });
  const result = (await response.json()) as { access_token?: string };
  if (!response.ok || !result.access_token)
    throw new HttpError(401, "Google sign-in failed.");
  const userResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${result.access_token}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  const user = (await userResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
  };
  if (
    !userResponse.ok ||
    !user.sub ||
    !user.email ||
    user.email_verified !== true
  )
    throw new HttpError(401, "A verified Google email is required.");
  const email = user.email.toLowerCase();
  let account = await env.DB.prepare(
    "SELECT id FROM accounts WHERE google_sub=?",
  )
    .bind(user.sub)
    .first<{ id: string }>();
  if (!account) {
    if (
      await env.DB.prepare("SELECT id FROM accounts WHERE email=?")
        .bind(email)
        .first()
    )
      throw new HttpError(
        409,
        "This email already has an account. Sign in using your password.",
      );
    account = { id: crypto.randomUUID() };
    await env.DB.prepare(
      "INSERT INTO accounts(id,kind,email,google_sub,created_at) VALUES(?,'user',?,?,?)",
    )
      .bind(account.id, email, user.sub, new Date().toISOString())
      .run();
  }
  const headers = new Headers({ Location: "/connect" });
  headers.append("Set-Cookie", await newSession(request, env, account.id));
  headers.append("Set-Cookie", googleCookie(request, "", 0));
  return new Response(null, { status: 302, headers });
}
