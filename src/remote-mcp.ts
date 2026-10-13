import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate, hash, randomToken } from "./auth.ts";
import { HttpError } from "./content.ts";
import { createMcpServer } from "./mcp-server.ts";
import type { Env } from "./platform.ts";

const json = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
const now = () => Math.floor(Date.now() / 1000);
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const html = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function page(client: string, fields: Record<string, string>, error = "", signedIn = "") {
  const hidden = Object.entries(fields).map(([k,v]) => `<input type="hidden" name="${html(k)}" value="${html(v)}">`).join("");
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect ${html(client)} to DocSync</title><style>body{font:16px system-ui;max-width:440px;margin:12vh auto;padding:24px;color:#202124}form{display:grid;gap:14px}input{padding:12px;border:1px solid #bbb;border-radius:8px}button{padding:12px;background:#171717;color:white;border:0;border-radius:8px;cursor:pointer}.error{color:#b42318}</style><h1>Connect ${html(client)} to DocSync</h1><p>Authorize this agent to read and edit your DocSync documents. You can revoke access from Connect agent.</p>${error ? `<p class="error">${html(error)}</p>` : ""}<form method="post">${hidden}${signedIn ? `<p>Signed in as ${html(signedIn)}</p>` : `<label>Email<br><input required type="email" name="email" autocomplete="username"></label><label>Password<br><input required type="password" name="password" autocomplete="current-password"></label>`}<label><input type="checkbox" name="publish" value="yes"> Allow this agent to publish share links</label><button>Authorize DocSync</button></form><p><a href="/">Create an account in DocSync first</a></p>`, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
}
async function retryPage(env: Env, client: string, fields: Record<string, string>, error: string) {
  const csrf = randomToken();
  await env.DB.prepare("INSERT INTO oauth_authorizations VALUES(?,?,?,?,?,?)")
    .bind(await hash(csrf), fields.client_id, fields.redirect_uri, fields.code_challenge, fields.state || null, now() + 600)
    .run();
  return page(client, { ...fields, csrf }, error);
}
function expiredPage() {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Authorization expired</title><style>body{font:16px system-ui;max-width:440px;margin:12vh auto;padding:24px;color:#202124}</style><h1>Authorization expired</h1><p>This DocSync authorization request expired or was already used. Return to your agent and start the connection again.</p>`, { status: 403, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
}
function redirect(url: string, values: Record<string,string>) {
  const to = new URL(url); for (const [k,v] of Object.entries(values)) to.searchParams.set(k,v);
  return Response.redirect(to.toString(),302);
}
function loopbackRedirect(uri: string) {
  try { const u = new URL(uri); return u.protocol === "https:" || (u.protocol === "http:" && ["localhost","127.0.0.1","[::1]"].includes(u.hostname)); } catch { return false; }
}

export async function handleRemoteMcp(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname, origin = url.origin, method = request.method;
  if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp")
    return json({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["docsync", "docsync:publish"] });
  if (path === "/.well-known/oauth-authorization-server")
    return json({ issuer: origin, authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`, registration_endpoint: `${origin}/oauth/register`, revocation_endpoint: `${origin}/oauth/revoke`, response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["docsync", "docsync:publish"] });
  if (path === "/oauth/register" && method === "POST") {
    const input = await request.json() as { redirect_uris?: unknown; client_name?: unknown; token_endpoint_auth_method?: string };
    if (!Array.isArray(input.redirect_uris) || input.redirect_uris.length < 1 || input.redirect_uris.length > 10 || input.redirect_uris.some(x => typeof x !== "string" || !loopbackRedirect(x))) return json({ error: "invalid_redirect_uri" },400);
    if (input.token_endpoint_auth_method && input.token_endpoint_auth_method !== "none") return json({ error: "invalid_client_metadata" },400);
    const clientId = randomToken();
    await env.DB.prepare("INSERT INTO oauth_clients VALUES(?,?,?,?)").bind(clientId, typeof input.client_name === "string" ? input.client_name.slice(0,100) : "MCP client", JSON.stringify(input.redirect_uris), now()).run();
    return json({ client_id: clientId, client_name: typeof input.client_name === "string" ? input.client_name.slice(0,100) : "MCP client", redirect_uris: input.redirect_uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code","refresh_token"], response_types: ["code"] }, 201);
  }
  if (path === "/oauth/authorize" && method === "GET") {
    const clientId = url.searchParams.get("client_id") || "", redirectUri = url.searchParams.get("redirect_uri") || "", challenge = url.searchParams.get("code_challenge") || "", state = url.searchParams.get("state") || "", resource = url.searchParams.get("resource");
    const client = await env.DB.prepare("SELECT client_name,redirect_uris FROM oauth_clients WHERE client_id=?").bind(clientId).first<{client_name:string;redirect_uris:string}>();
    if (!client || !(JSON.parse(client.redirect_uris) as string[]).includes(redirectUri) || url.searchParams.get("response_type") !== "code" || url.searchParams.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || (resource && resource !== `${origin}/mcp`)) return json({error:"invalid_request"},400);
    await env.DB.prepare("DELETE FROM oauth_authorizations WHERE expires_at<?").bind(now()).run();
    const csrf=randomToken();
    await env.DB.prepare("INSERT INTO oauth_authorizations VALUES(?,?,?,?,?,?)").bind(await hash(csrf),clientId,redirectUri,challenge,state||null,now()+600).run();
    let signedIn="";
    try { const user=await authenticate(request,env); if(user.role==="owner"&&user.kind==="user") signedIn=(await env.DB.prepare("SELECT email FROM accounts WHERE id=?").bind(user.accountId).first<{email:string}>())?.email||""; } catch {}
    return page(client.client_name,{csrf},"",signedIn);
  }
  if (path === "/oauth/authorize" && method === "POST") {
    const form = await request.formData(), csrf=String(form.get("csrf")||"");
    const authorization=await env.DB.prepare("DELETE FROM oauth_authorizations WHERE csrf_hash=? RETURNING client_id,redirect_uri,code_challenge,state,expires_at").bind(await hash(csrf)).first<{client_id:string;redirect_uri:string;code_challenge:string;state:string|null;expires_at:number}>();
    if(!authorization||authorization.expires_at<=now()) return expiredPage();
    const fields={client_id:authorization.client_id,redirect_uri:authorization.redirect_uri,code_challenge:authorization.code_challenge,state:authorization.state||""};
    const client = await env.DB.prepare("SELECT client_name,redirect_uris FROM oauth_clients WHERE client_id=?").bind(fields.client_id).first<{client_name:string;redirect_uris:string}>();
    if (!client || !(JSON.parse(client.redirect_uris) as string[]).includes(fields.redirect_uri) || !/^[A-Za-z0-9_-]{43}$/.test(fields.code_challenge)) return json({error:"invalid_request"},400);
    // OAuth authorization uses a one-time request-bound CSRF token, so a
    // reverse proxy may safely preserve a different browser-facing Origin.
    let accountId: string, sessionCookie = "";
    const email=String(form.get("email")||""),password=String(form.get("password")||"");
    if (email && password) {
      try { sessionCookie = await (await import("./accounts.ts")).emailAuth(new Request(`${origin}/oauth/authorize`,{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"}}),env,{email,password},false); }
      catch(error) { if(error instanceof HttpError && error.status===401) return retryPage(env,client.client_name,fields,"Email or password is incorrect."); throw error; }
      const value=sessionCookie.split(";")[0].slice("docsync_account=".length);
      const session=await env.DB.prepare("SELECT account_id FROM account_sessions WHERE token_hash=? AND expires_at>?").bind(await hash(value),now()).first<{account_id:string}>();
      if(!session) return retryPage(env,client.client_name,fields,"Sign-in failed; check your credentials.");
      accountId=session.account_id;
    } else {
      try {
        const authHeaders=new Headers(request.headers); authHeaders.set("Origin",origin);
        const authRequest=new Request(request.url,{method:request.method,headers:authHeaders});
        const user=await authenticate(authRequest,env); if(user.role!=="owner" || user.kind!=="user") throw new Error(); accountId=user.accountId;
      }
      catch { return retryPage(env,client.client_name,fields,"Enter your DocSync email and password to continue."); }
    }
    const code=randomToken(), canPublish=form.get("publish")==="yes", scope=canPublish?"docsync docsync:publish":"docsync";
    await env.DB.prepare("DELETE FROM oauth_codes WHERE expires_at<?").bind(now()).run();
    await env.DB.prepare("INSERT INTO oauth_codes VALUES(?,?,?,?,?,?,?)").bind(await hash(code),fields.client_id,accountId,fields.redirect_uri,fields.code_challenge,scope,now()+300).run();
    const headers = new Headers();
    const callback = new URL(fields.redirect_uri);
    callback.searchParams.set("code", code);
    if (fields.state) callback.searchParams.set("state", fields.state);
    headers.set("Location", callback.toString());
    headers.set("Content-Type", "text/html;charset=utf-8");
    if (sessionCookie) headers.append("Set-Cookie", sessionCookie);
    const callbackUrl = callback.toString();
    const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connecting to agent...</title><meta http-equiv="refresh" content="0;url=${html(callbackUrl)}"><style>body{font:16px system-ui;max-width:480px;margin:12vh auto;padding:24px;color:#202124}a.button{display:inline-block;padding:12px 18px;background:#171717;color:white;text-decoration:none;border-radius:8px;margin:16px 0;font-weight:500}pre{background:#f4f4f4;padding:12px;border-radius:6px;word-break:break-all;white-space:pre-wrap;font-size:13px}</style><h1>Authorization granted</h1><p>Connecting to your agent...</p><p><a class="button" href="${html(callbackUrl)}">Complete connection ↗</a></p><p style="font-size:13px;color:#666">If your terminal asks for the callback URL, copy and paste this into your terminal:</p><pre>${html(callbackUrl)}</pre><script>location.href=${JSON.stringify(callbackUrl)};</script>`;
    return new Response(body, { status: 302, headers });
  }
  if (path === "/oauth/token" && method === "POST") {
    const form=await request.formData(), grant=String(form.get("grant_type")||""), clientId=String(form.get("client_id")||"");
    if(grant==="authorization_code") {
      const code=String(form.get("code")||""),redirectUri=String(form.get("redirect_uri")||""),verifier=String(form.get("code_verifier")||"");
      if(!/^[A-Za-z0-9_-]{43,128}$/.test(verifier))return json({error:"invalid_grant"},400);
      const row=await env.DB.prepare("DELETE FROM oauth_codes WHERE code_hash=? AND client_id=? AND redirect_uri=? RETURNING account_id,client_id,redirect_uri,code_challenge,scope,expires_at").bind(await hash(code),clientId,redirectUri).first<{account_id:string;client_id:string;redirect_uri:string;code_challenge:string;scope:string;expires_at:number}>();
      if(!row||row.expires_at<=now()||row.code_challenge!==b64(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(verifier))))return json({error:"invalid_grant"},400);
      return issue(env,row.account_id,clientId,row.scope.includes("docsync:publish"),row.scope);
    }
    if(grant==="refresh_token") {
      const token=String(form.get("refresh_token")||""), row=await env.DB.prepare("DELETE FROM oauth_refresh_tokens WHERE token_hash=? AND client_id=? RETURNING account_id,client_id,can_publish,expires_at").bind(await hash(token),clientId).first<{account_id:string;client_id:string;can_publish:number;expires_at:number}>();
      if(!row||row.expires_at<=now())return json({error:"invalid_grant"},400);
      return issue(env,row.account_id,clientId,row.can_publish===1,row.can_publish?"docsync docsync:publish":"docsync");
    }
    return json({error:"unsupported_grant_type"},400);
  }
  if(path==="/oauth/revoke"&&method==="POST") { const f=await request.formData(),token=String(f.get("token")||""),clientId=String(f.get("client_id")||""); await env.DB.batch([env.DB.prepare("DELETE FROM oauth_access_tokens WHERE token_hash=? AND client_id=?").bind(await hash(token),clientId),env.DB.prepare("DELETE FROM oauth_refresh_tokens WHERE token_hash=? AND client_id=?").bind(await hash(token),clientId)]); return new Response(null,{status:200}); }
  if(path==="/mcp") {
    const auth=request.headers.get("Authorization")||"", match=auth.match(/^Bearer ([a-f0-9]{64})$/); if(!match)return json({error:"unauthorized"},401,{"WWW-Authenticate":`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="docsync"`});
    const valid=await env.DB.prepare("SELECT 1 AS ok FROM oauth_access_tokens WHERE token_hash=? AND expires_at>?").bind(await hash(match[1]),now()).first(); if(!valid)return json({error:"invalid_token"},401,{"WWW-Authenticate":`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`});
    const server=createMcpServer(origin,match[1]),transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true}); await server.connect(transport); return transport.handleRequest(request);
  }
  return null;
}
async function issue(env:Env,accountId:string,clientId:string,canPublish:boolean,scope:string){
  const access=randomToken(),refresh=randomToken(),at=now()+900,rt=now()+2592000;
  await env.DB.batch([env.DB.prepare("DELETE FROM oauth_access_tokens WHERE expires_at<?").bind(now()),env.DB.prepare("DELETE FROM oauth_refresh_tokens WHERE expires_at<?").bind(now()),env.DB.prepare("DELETE FROM oauth_codes WHERE expires_at<?").bind(now())]);
  await env.DB.batch([env.DB.prepare("INSERT INTO oauth_access_tokens VALUES(?,?,?,?,?)").bind(await hash(access),accountId,clientId,canPublish?1:0,at),env.DB.prepare("INSERT INTO oauth_refresh_tokens VALUES(?,?,?,?,?)").bind(await hash(refresh),accountId,clientId,canPublish?1:0,rt)]);
  return json({access_token:access,token_type:"Bearer",expires_in:900,refresh_token:refresh,scope});
}
