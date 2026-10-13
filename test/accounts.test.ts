import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, sample } from "./helpers.ts";
import { handle } from "../src/worker.ts";
import { hash, randomToken } from "../src/auth.ts";
const origin = "http://127.0.0.1:8787";
function client(env: any) {
  return (
    path: string,
    method = "GET",
    data?: unknown,
    credential = "",
    cookie = "",
    requestOrigin = origin,
  ) =>
    handle(
      new Request(origin + "/api" + path, {
        method,
        headers: {
          ...(data === undefined ? {} : { "Content-Type": "application/json" }),
          ...(credential ? { Authorization: "Bearer " + credential } : {}),
          ...(cookie ? { Cookie: cookie } : {}),
          Origin: requestOrigin,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      }),
      env,
    );
}
async function signup(call: ReturnType<typeof client>, email: string) {
  const r = await call("/auth/signup", "POST", {
    email,
    password: "a long safe password 123!",
  });
  assert.equal(r.status, 200);
  return r.headers.getSetCookie()[0].split(";")[0];
}
test("accounts enforce tenant isolation, session revocation, CSRF and token rotation", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const call = client(f.env);
  const alice = await signup(call, "alice@example.com"),
    bob = await signup(call, "bob@example.com");
  const doc = (await (
    await call("/documents", "POST", sample("Alice private"), "", alice)
  ).json()) as any;
  assert.ok(doc.id);
  assert.deepEqual(
    await (await call("/documents", "GET", undefined, "", bob)).json(),
    [],
  );
  for (const [path, method, data] of [
    [`/documents/${doc.id}`, "GET", undefined],
    [`/documents/${doc.id}`, "PUT", { ...sample(), expectedRevision: 1 }],
    [`/documents/${doc.id}/history`, "GET", undefined],
    [
      `/documents/${doc.id}/restore`,
      "POST",
      { revision: 1, expectedRevision: 1 },
    ],
    [`/documents/${doc.id}/publish`, "POST", { expectedRevision: 1 }],
    [`/documents/${doc.id}/publish`, "DELETE", undefined],
  ] as const) {
    assert.equal((await call(path, method, data, "", bob)).status, 404);
  }
  assert.equal(
    (await call("/documents", "POST", sample(), " ", alice)).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/documents",
        "POST",
        sample(),
        "",
        alice,
        "https://evil.example",
      )
    ).status,
    403,
  );
  const issued = (await (
    await call("/agent-token", "POST", { allowPublishing: true }, "", alice)
  ).json()) as any;
  assert.equal(
    (await call("/documents/" + doc.id, "GET", undefined, issued.token)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/agent-token",
        "POST",
        { allowPublishing: true },
        issued.token,
      )
    ).status,
    403,
  );
  const rotated = (await (
    await call("/agent-token", "POST", { allowPublishing: false }, "", alice)
  ).json()) as any;
  assert.equal(
    (await call("/connection", "GET", undefined, issued.token)).status,
    401,
  );
  assert.equal(
    (
      await call(
        "/documents/" + doc.id + "/publish",
        "POST",
        { expectedRevision: 1 },
        rotated.token,
      )
    ).status,
    403,
  );
  assert.equal((await call("/logout", "POST", {}, "", alice)).status, 200);
  assert.equal(
    (await call("/session", "GET", undefined, "", alice)).status,
    401,
  );
  const login = await call("/auth/signin", "POST", {
    email: "alice@example.com",
    password: "a long safe password 123!",
  });
  assert.equal(login.status, 200);
  assert.equal(
    (
      await call("/auth/signin", "POST", {
        email: "alice@example.com",
        password: "incorrect password 123",
      })
    ).status,
    401,
  );
  // The original workspace is preserved, but does not become visible to new users.
  const legacy = (await (
    await f.call("/documents", "POST", sample("Legacy"))
  ).json()) as any;
  assert.equal(
    (await call("/documents/" + legacy.id, "GET", undefined, "", bob)).status,
    404,
  );
});
test("trial first document is atomic, claim transfers ownership and revokes the installation", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const call = client(f.env),
    trial = randomToken();
  assert.equal(
    (await call("/installations", "POST", { credential: trial })).status,
    200,
  );
  assert.equal(
    (await call("/installations", "POST", { credential: trial })).status,
    200,
  );
  const doc = (await (
    await call("/documents", "POST", sample("First free"), trial)
  ).json()) as any;
  assert.ok(doc.id);
  assert.equal(
    (await call("/documents", "POST", sample("Second"), trial)).status,
    403,
  );
  assert.equal(
    (
      await call(
        "/documents/" + doc.id,
        "PUT",
        { ...sample("Edited free"), expectedRevision: 1 },
        trial,
      )
    ).status,
    200,
  );
  const published = (await (
    await call(
      "/documents/" + doc.id + "/publish",
      "POST",
      { expectedRevision: 2 },
      trial,
    )
  ).json()) as any;
  assert.ok(published.url);
  const other = randomToken();
  await call("/installations", "POST", { credential: other });
  assert.equal(
    (await call("/documents/" + doc.id, "GET", undefined, other)).status,
    404,
  );
  const link = (await (
    await call("/claim-link", "POST", {}, trial)
  ).json()) as any;
  const code = new URLSearchParams(new URL(link.signInUrl).hash.slice(1)).get(
    "claim",
  );
  const account = await signup(call, "claim@example.com");
  assert.equal(
    (await call("/claim", "POST", { code }, "", account)).status,
    200,
  );
  assert.equal(
    (await call("/documents/" + doc.id, "GET", undefined, "", account)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/documents",
        "POST",
        sample("Second authenticated"),
        "",
        account,
      )
    ).status,
    201,
  );
  assert.equal(
    (await call("/claim", "POST", { code }, "", account)).status,
    410,
  );
  await call("/installations", "POST", { credential: trial });
  assert.equal(
    (await call("/connection", "GET", undefined, trial)).status,
    401,
  );
  assert.equal(
    (await call("/shared/" + published.url.split("/").pop())).status,
    200,
  );
  const rows = await f.env.DB.prepare(
    "SELECT count(*) AS n FROM documents",
  ).first<{ n: number }>();
  assert.equal(rows?.n, 2);
});
test("trial quota is enforced inside the database, not a check-then-insert race", async (t) => {
  const f = await fixture();
  t.after(f.close);
  const call = client(f.env),
    trial = randomToken();
  await call("/installations", "POST", { credential: trial });
  const accountId = "trial-" + (await hash(trial));
  const statements = [1, 2].map((i) =>
    f.env.DB.prepare(
      "INSERT INTO documents(id,title,updated_at,account_id) VALUES(?,?,?,?)",
    ).bind(
      crypto.randomUUID(),
      "Concurrent " + i,
      new Date().toISOString(),
      accountId,
    ),
  );
  // Both inserts in a single atomic batch must roll back; no partial quota consumption.
  await assert.rejects(
    () => f.env.DB.batch(statements),
    /trial_document_limit/,
  );
  assert.equal((await call("/documents", "POST", sample(), trial)).status, 201);
  const limited = await call("/documents", "POST", sample(), trial);
  assert.equal(limited.status, 403);
  assert.equal(((await limited.json()) as any).details.code, "AUTH_REQUIRED");
});
test("Google OAuth checks browser state, PKCE, verified identity and one-time callback", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.env.GOOGLE_CLIENT_ID = "client";
  f.env.GOOGLE_CLIENT_SECRET = "secret";
  const call = client(f.env);
  const started = await call("/auth/google");
  assert.equal(started.status, 302);
  const redirect = new URL(started.headers.get("Location")!),
    state = redirect.searchParams.get("state")!;
  assert.equal(redirect.searchParams.get("code_challenge_method"), "S256");
  const cookie = started.headers.getSetCookie()[0].split(";")[0];
  assert.equal(
    (await call("/auth/google/callback?state=" + state + "&code=code")).status,
    400,
  );
  t.mock.method(globalThis, "fetch", async (url: any, init: any) => {
    if (String(url).endsWith("/token")) {
      assert.ok(new URLSearchParams(init.body).get("code_verifier"));
      return Response.json({ access_token: "google-access" });
    }
    assert.equal(init.headers.Authorization, "Bearer google-access");
    return Response.json({
      sub: "google-subject",
      email: "google@example.com",
      email_verified: true,
    });
  });
  const callback = await call(
    "/auth/google/callback?state=" + state + "&code=code",
    "GET",
    undefined,
    "",
    cookie,
  );
  assert.equal(callback.status, 302);
  const session = callback.headers
    .getSetCookie()
    .find((x) => x.startsWith("docsync_account="))!
    .split(";")[0];
  assert.equal(
    (await call("/session", "GET", undefined, "", session)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/auth/google/callback?state=" + state + "&code=code",
        "GET",
        undefined,
        "",
        cookie,
      )
    ).status,
    400,
  );
});
test("Google never automatically links a password account with the same email", async (t) => {
  const f = await fixture();
  t.after(f.close);
  f.env.GOOGLE_CLIENT_ID = "client";
  f.env.GOOGLE_CLIENT_SECRET = "secret";
  const call = client(f.env);
  await signup(call, "existing@example.com");
  const started = await call("/auth/google");
  const state = new URL(started.headers.get("Location")!).searchParams.get(
    "state",
  );
  const cookie = started.headers.getSetCookie()[0].split(";")[0];
  t.mock.method(globalThis, "fetch", async (url: any) =>
    String(url).endsWith("/token")
      ? Response.json({ access_token: "access" })
      : Response.json({
          sub: "another-subject",
          email: "existing@example.com",
          email_verified: true,
        }),
  );
  assert.equal(
    (
      await call(
        "/auth/google/callback?state=" + state + "&code=code",
        "GET",
        undefined,
        "",
        cookie,
      )
    ).status,
    409,
  );
});
