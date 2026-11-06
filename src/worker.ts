import type { Env } from "./platform.ts";
import { HttpError } from "./content.ts";
import {
  authenticate,
  checkOrigin,
  hash,
  login,
  logoutCookie,
  randomToken,
} from "./auth.ts";
import * as accounts from "./accounts.ts";
import * as store from "./store.ts";
import * as collaboration from "./collaboration.ts";
import { handleRemoteMcp } from "./remote-mcp.ts";
import { artifactFrame, artifactPolicy } from "./artifact-frame.ts";
import { jsonBody as body } from "./request.ts";
import { webResponse } from "./web.ts";
import { publicPages } from "./seo.ts";
import { mediaGrant, serveMedia, uploadMedia } from "./media.ts";
import { maxMediaBytes } from "./media-config.ts";
import { readBody } from "./request.ts";
import type { Document } from "./document.ts";
import { agentActivity, collaborators } from "./agents.ts";

const appPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self' about:; img-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

const oauthPolicy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self' about:; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self' http: https:; frame-ancestors 'none'";
function json(data: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1)
    throw new HttpError(400, "A positive expectedRevision is required");
  return Number(value);
}
async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url),
    method = request.method;
  // Hosted MCP calls share the authenticated API handler without Worker self-fetch.
  const remote = await handleRemoteMcp(request, env, (input, init) =>
    handle(new Request(input, init), env),
  );
  if (remote) return remote;
  const mediaMatch = pathname.match(/^\/media\/([a-f0-9-]{36})$/);
  if (mediaMatch) return serveMedia(request, env, mediaMatch[1]);
  if (pathname === "/artifact-frame" && method === "GET") return artifactFrame();
  if (!pathname.startsWith("/api/")) return webResponse(request, env);
  if (
    !/^[a-f0-9]{64}$/.test(env.OWNER_KEY_HASH || "") ||
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 32
  )
    throw new HttpError(503, "Server credentials are not configured");
  if (pathname === "/api/auth/config" && method === "GET")
    return json({
      google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    });
  if (
    ["/api/auth/signup", "/api/auth/signin"].includes(pathname) &&
    method === "POST"
  )
    return json({ ok: true }, 200, {
      "Set-Cookie": await accounts.emailAuth(
        request,
        env,
        await body(request),
        pathname.endsWith("/signup"),
      ),
    });
  if (pathname === "/api/auth/google" && method === "GET")
    return accounts.googleStart(request, env);
  if (pathname === "/api/auth/google/callback" && method === "GET")
    return accounts.googleCallback(request, env);
  if (pathname === "/api/installations" && method === "POST")
    return json(await accounts.bootstrap(request, env, await body(request)));
  if (pathname === "/api/login" && method === "POST") {
    const input = await body(request);
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", await login(request, env, input.key));
    headers.append("Set-Cookie", accounts.sessionCookie(request, "", 0));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }
  if (pathname.startsWith("/api/shared/") && method === "GET") {
    const token = pathname.slice("/api/shared/".length);
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new HttpError(404, "Share link not found or revoked");
    const publication = await hash(token), shared = await store.sharedDocument(env.DB, publication);
    const published = await env.DB.prepare("SELECT document_id FROM publications WHERE token_hash=?").bind(publication).first<{ document_id: string }>();
    if (!published) throw new HttpError(404, "Share link not found or revoked");
    return json({ ...shared, mediaToken: await mediaGrant(env, published.document_id, { publication, revision: shared.revision }) });
  }
  const principal = await authenticate(request, env);
  await agentActivity(env.DB, principal);
  const documentResponse = async (value: Document | Promise<Document>, status = 200) => {
    const doc = await value;
    return json({ ...doc, mediaToken: await mediaGrant(env, doc.id, { accountId: principal.accountId }) }, status);
  };
  const owner = () => {
    if (principal.role !== "owner")
      throw new HttpError(403, "Owner access required");
  };
  const invitationMatch = pathname.match(/^\/api\/invitations\/([a-f0-9]{64})$/);
  if (invitationMatch) {
    owner();
    if (method === "GET") return json(await collaboration.invitation(env.DB, invitationMatch[1]));
    if (method === "POST") {
      await body(request);
      return json(await collaboration.acceptInvitation(env.DB, invitationMatch[1], principal.accountId));
    }
  }
  if (pathname === "/api/mcp-clients" && method === "GET") {
    owner();
    const clients = await env.DB.prepare(
      "SELECT c.client_id,c.client_name,MAX(t.expires_at) AS access_expires FROM oauth_clients c JOIN (SELECT client_id,account_id,expires_at FROM oauth_access_tokens UNION ALL SELECT client_id,account_id,expires_at FROM oauth_refresh_tokens) t ON t.client_id=c.client_id WHERE t.account_id=? AND t.expires_at>? GROUP BY c.client_id,c.client_name ORDER BY c.client_name",
    ).bind(principal.accountId, Math.floor(Date.now()/1000)).all();
    return json(clients.results);
  }
  if (pathname === "/api/mcp-clients" && method === "DELETE") {
    owner(); checkOrigin(request);
    const clientId=(await body(request)).clientId;
    if(typeof clientId!=="string" || !/^[a-f0-9]{64}$/.test(clientId)) throw new HttpError(400,"Invalid MCP client");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM edit_locks WHERE account_id=? AND actor_id=?").bind(principal.accountId, `oauth:${clientId}`),
      env.DB.prepare("DELETE FROM oauth_codes WHERE client_id=? AND account_id=?").bind(clientId,principal.accountId),
      env.DB.prepare("DELETE FROM oauth_access_tokens WHERE client_id=? AND account_id=?").bind(clientId,principal.accountId),
      env.DB.prepare("DELETE FROM oauth_refresh_tokens WHERE client_id=? AND account_id=?").bind(clientId,principal.accountId),
    ]);
    return json({ok:true});
  }
  const linkAccess = ["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(request.url).hostname,
  )
    ? "local_only"
    : "anyone_with_link";
  if (pathname === "/api/connection" && method === "GET")
    return json({
      role: principal.role,
      canPublish: principal.canPublish,
      origin: new URL(request.url).origin,
      linkAccess,
      trial: principal.kind === "trial",
      signInUrl: new URL("/connect", request.url).href,
    });
  if (pathname === "/api/session" && method === "GET") {
    owner();
    return json({
      authenticated: true,
      email:
        (
          await env.DB.prepare("SELECT email FROM accounts WHERE id=?")
            .bind(principal.accountId)
            .first<{ email: string }>()
        )?.email || "Workspace owner",
      legacy: principal.kind === "legacy",
    });
  }
  if (pathname === "/api/logout" && method === "POST") {
    owner();
    checkOrigin(request);
    const cookie = accounts.readCookie(request, "docsync_account");
    await env.DB.batch([
      env.DB.prepare("DELETE FROM edit_locks WHERE account_id=? AND actor_id=?").bind(principal.accountId, principal.actorId),
      env.DB.prepare("DELETE FROM account_sessions WHERE token_hash=?").bind(cookie ? await hash(cookie) : ""),
    ]);
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", logoutCookie(request));
    headers.append("Set-Cookie", accounts.sessionCookie(request, "", 0));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }
  if (pathname === "/api/claim-link" && method === "POST") {
    if (principal.kind !== "trial")
      return json({ signInUrl: new URL("/connect", request.url).href });
    return json(
      await accounts.claimLink(
        env,
        principal.accountId,
        new URL(request.url).origin,
      ),
    );
  }
  if (pathname === "/api/claim" && method === "POST") {
    owner();
    if (principal.kind !== "user")
      throw new HttpError(403, "Sign in to a personal account first.");
    await accounts.claimInstallation(
      env,
      principal.accountId,
      (await body(request)).code,
    );
    return json({ ok: true });
  }
  if (pathname === "/api/agent-token") {
    owner();
    if (principal.kind !== "legacy") {
      if (method === "GET") {
        const c = await env.DB.prepare(
          "SELECT can_publish FROM account_credentials WHERE account_id=?",
        )
          .bind(principal.accountId)
          .first<{ can_publish: number }>();
        return json({
          active: Boolean(c),
          allowPublishing: c?.can_publish === 1,
        });
      }
      if (method === "POST") {
        const input = await body(request);
        if (typeof input.allowPublishing !== "boolean")
          throw new HttpError(400, "Choose whether this token can publish.");
        const token = randomToken();
        await env.DB.batch([
          env.DB.prepare("DELETE FROM edit_locks WHERE account_id=? AND actor_id IN(SELECT 'credential:' || token_hash FROM account_credentials WHERE account_id=?)").bind(principal.accountId, principal.accountId),
          env.DB.prepare(
            "INSERT INTO account_credentials VALUES(?,?,?) ON CONFLICT(account_id) DO UPDATE SET token_hash=excluded.token_hash,can_publish=excluded.can_publish",
          ).bind(principal.accountId, await hash(token), Number(input.allowPublishing)),
        ]);
        return json({ token, allowPublishing: input.allowPublishing });
      }
      if (method === "DELETE") {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM edit_locks WHERE account_id=? AND actor_id IN(SELECT 'credential:' || token_hash FROM account_credentials WHERE account_id=?)").bind(principal.accountId, principal.accountId),
          env.DB.prepare("DELETE FROM account_credentials WHERE account_id=?").bind(principal.accountId),
        ]);
        return json({ ok: true });
      }
    }
    owner();
    if (method === "GET") {
      const credential = await env.DB.prepare(
        "SELECT can_publish FROM agent_credentials WHERE slot=1",
      ).first<{ can_publish: number }>();
      return json({
        active: Boolean(credential),
        allowPublishing: credential?.can_publish === 1,
      });
    }
    if (method === "POST") {
      const input = request.body ? await body(request) : {};
      if (
        input.allowPublishing !== undefined &&
        typeof input.allowPublishing !== "boolean"
      )
        throw new HttpError(400, "allowPublishing must be a boolean");
      const canPublish = input.allowPublishing === true;
      const token = randomToken();
      await env.DB.batch([
        env.DB.prepare("DELETE FROM edit_locks WHERE account_id='legacy' AND actor_id IN(SELECT 'credential:' || token_hash FROM agent_credentials WHERE slot=1)"),
        env.DB.prepare(
          "INSERT INTO agent_credentials(slot,token_hash,created_at,can_publish) VALUES(1,?,?,?) ON CONFLICT(slot) DO UPDATE SET token_hash=excluded.token_hash,created_at=excluded.created_at,can_publish=excluded.can_publish",
        ).bind(await hash(token), new Date().toISOString(), Number(canPublish)),
      ]);
      return json({ token, allowPublishing: canPublish });
    }
    if (method === "DELETE") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM edit_locks WHERE account_id='legacy' AND actor_id IN(SELECT 'credential:' || token_hash FROM agent_credentials WHERE slot=1)"),
        env.DB.prepare("DELETE FROM agent_credentials WHERE slot=1"),
      ]);
      return json({ ok: true });
    }
  }
  if (pathname === "/api/documents") {
    if (method === "GET")
      return json(await store.listDocuments(env.DB, principal.accountId));
    if (method === "POST") {
      const input = await body(request);
      try {
        return await documentResponse(
          store.createDocument(env.DB, input, principal.accountId, principal),
          201,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("trial_document_limit")
        )
          throw new HttpError(
            403,
            "Your free document is ready. Sign in to create more documents.",
            {
              code: "AUTH_REQUIRED",
              signInUrl: new URL("/connect", request.url).href,
            },
          );
        throw error;
      }
    }
  }
  const revokeInvite = pathname.match(/^\/api\/documents\/([a-f0-9-]{36})\/invitations\/([a-f0-9-]{36})$/);
  if (revokeInvite && method === "DELETE") {
    await collaboration.access(env.DB, revokeInvite[1], principal.accountId, "owner");
    await env.DB.prepare("DELETE FROM document_invitations WHERE document_id=? AND id=? AND EXISTS(SELECT 1 FROM documents WHERE id=? AND account_id=?)").bind(revokeInvite[1], revokeInvite[2], revokeInvite[1], principal.accountId).run();
    return json({ ok: true });
  }
  const match = pathname.match(
    /^\/api\/documents\/([a-f0-9-]{36})(?:\/(history|restore|publish|thumbnail|lock|access|compare|media|collaborators))?$/,
  );
  if (match) {
    const [, id, action] = match;
    if (action === "thumbnail" && method === "GET") return json({ ...await store.documentThumbnail(env.DB, id, principal.accountId), mediaToken: await mediaGrant(env, id, { accountId: principal.accountId }) });
    const current = await store.getDocument(env.DB, id, undefined, principal.accountId);
    if (action === "collaborators" && method === "GET") return json(await collaborators(env.DB, id, principal.accountId));
    if (!action && method === "GET") {
      const requested = new URL(request.url).searchParams.get("revision");
      return documentResponse(requested ? store.getDocument(env.DB, id, revision(Number(requested)), principal.accountId) : current);
    }
    if (action === "media" && method === "POST") {
      await collaboration.access(env.DB, id, principal.accountId, "editor");
      let filename: string;
      try {
        const encoded = request.headers.get("X-File-Name") || "";
        if (encoded.length > 2048) throw new Error("Filename too long");
        filename = decodeURIComponent(encoded);
      }
      catch { throw new HttpError(400, "Invalid media filename"); }
      return json(await uploadMedia(env, principal, id, filename, request.headers.get("Content-Type")?.split(";", 1)[0].toLowerCase() || "", await readBody(request, maxMediaBytes), new URL(request.url).origin), 201);
    }
    if (action === "lock") {
      if (method === "GET") return json(await collaboration.lockStatus(env.DB, id, principal.accountId));
      const input = await body(request);
      if (method === "POST") return json(await collaboration.acquireLock(env.DB, id, principal));
      if (method === "PATCH") return json(await collaboration.renewLock(env.DB, id, principal, collaboration.lockToken(input.lockToken)));
      if (method === "DELETE") return json(await collaboration.releaseLock(env.DB, id, principal, collaboration.lockToken(input.lockToken)));
    }
    if (action === "access") {
      if (method === "GET") return json({ ...await collaboration.sharing(env.DB, id, principal.accountId), members: await collaborators(env.DB, id, principal.accountId) });
      await collaboration.access(env.DB, id, principal.accountId, "owner");
      const input = await body(request);
      if (method === "POST") return json(await collaboration.invite(env.DB, id, principal.accountId, input.role, new URL(request.url).origin), 201);
      if (method === "PATCH" && input.role === undefined) throw new HttpError(400, "Choose editor or viewer access");
      if (method === "PATCH" || method === "DELETE") return json(await collaboration.changeMember(env.DB, id, principal.accountId, input.accountId, method === "PATCH" ? input.role : undefined));
    }
    if (action === "compare" && method === "GET") {
      const query = new URL(request.url).searchParams;
      return json(await store.compareVersions(env.DB, id, revision(Number(query.get("from"))), revision(Number(query.get("to"))), principal.accountId));
    }
    if (!action && method === "PUT") {
      const { expectedRevision, lockToken, changeSummary, ...content } = await body(request);
      return documentResponse(
        store.updateDocument(
          env.DB,
          id,
          revision(expectedRevision),
          content,
          principal,
          collaboration.lockToken(lockToken),
          collaboration.summary(changeSummary),
        ),
      );
    }
    if (action === "history" && method === "GET") {
      return json(await store.history(env.DB, id, principal.accountId));
    }
    if (action === "restore" && method === "POST") {
      const input = await body(request);
      const snapshot = await store.getDocument(
        env.DB,
        id,
        revision(input.revision),
        principal.accountId,
      );
      return documentResponse(
        store.updateDocument(
          env.DB,
          id,
          revision(input.expectedRevision),
          { title: snapshot.title, format: snapshot.format, sections: snapshot.sections },
          principal,
          collaboration.lockToken(input.lockToken),
          collaboration.summary(input.changeSummary) || `Restored version ${input.revision}`,
          revision(input.revision),
        ),
      );
    }
    if (action === "publish") {
      if (method === "GET") {
        return json(
          await env.DB.prepare(
            "SELECT revision FROM publications WHERE document_id=?",
          )
            .bind(id)
            .first(),
        );
      }
      if (method === "POST") {
        if (!principal.canPublish)
          throw new HttpError(
            403,
            "Publishing is disabled for this agent token. In DocSync, use Connect agent to generate a token with Allow publishing enabled.",
          );
        const input = await body(request),
          token = randomToken();
        await store.publish(
          env.DB,
          id,
          revision(input.expectedRevision),
          await hash(token),
          principal.accountId,
        );
        return json({
          url: `${new URL(request.url).origin}/share/${token}`,
          revision: input.expectedRevision,
          linkAccess,
        });
      }
      if (method === "DELETE") {
        owner();
        await collaboration.access(env.DB, id, principal.accountId, "owner");
        await env.DB.prepare("DELETE FROM publications WHERE document_id=?")
          .bind(id)
          .run();
        return json({ ok: true });
      }
    }
  }
  throw new HttpError(404, "Route not found");
}
export async function handle(request: Request, env: Env): Promise<Response> {
  let response: Response;
  try {
    response = await route(request, env);
  } catch (error) {
    if (error instanceof HttpError)
      response = json(
        { error: error.message, details: error.details },
        error.status,
      );
    else {
      console.error(
        "DocSync request failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
      response = json(
        { error: "Unexpected server error. Retry or check server logs." },
        500,
      );
    }
  }
  const secured = new Response(response.body, response);
  const url = new URL(request.url);
  const immutableAsset = /^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(url.pathname)
    && secured.status === 200 && ["GET", "HEAD"].includes(request.method);
  secured.headers.set("Cache-Control", immutableAsset ? "public, max-age=31536000, immutable" : "no-store");
  if (url.protocol === "https:") secured.headers.set("Strict-Transport-Security", "max-age=31536000");
  secured.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("Referrer-Policy", "no-referrer");
  const { pathname } = new URL(request.url);
  const publicAsset = pathname.startsWith("/assets/") || ["/favicon.svg", "/social-card.png", "/social-card.svg"].includes(pathname);
  if ((!Object.hasOwn(publicPages, pathname) && !publicAsset) || secured.status >= 400)
    secured.headers.set("X-Robots-Tag", "noindex, nofollow");
  const templatePreview = /^\/downloads\/docsync\/assets\/templates\/[a-z-]+\/(?:index\.html)?$/.test(pathname);
  secured.headers.set(
    "Content-Security-Policy",
    pathname === "/artifact-frame" ? artifactPolicy(url.origin) : pathname.startsWith("/oauth/") ? oauthPolicy : templatePreview
      ? appPolicy.replace("frame-ancestors 'none'", "frame-ancestors 'self'")
      : appPolicy,
  );
  secured.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return secured;
}
export default { fetch: handle };
