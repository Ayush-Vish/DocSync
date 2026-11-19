import type { Env } from "./platform.ts";
import { escapeHtml, pageMetadata, publicPageAsset, publicPages } from "./seo.ts";

/** Serve discoverable public pages while keeping account and token URLs out of search. */
export async function webResponse(request: Request, env: Env) {
  const url = new URL(request.url), path = url.pathname;
  if (!["GET", "HEAD"].includes(request.method)) return env.ASSETS.fetch(request);
  const respond = (body: string, type: string) => new Response(request.method === "HEAD" ? null : body, { headers: { "Content-Type": type } });
  if (path === "/robots.txt") {
    // Allow crawling app routes so crawlers can see their noindex response headers.
    return respond(`User-agent: *\nAllow: /\n\nSitemap: ${url.origin}/sitemap.xml\n`, "text/plain; charset=utf-8");
  }
  if (path === "/sitemap.xml") {
    return respond(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(publicPages).map(page => `<url><loc>${escapeHtml(url.origin + page)}</loc></url>`).join("")}</urlset>`, "application/xml; charset=utf-8");
  }
  if (/^\/google[0-9a-f]{16}\.html$/.test(path)) {
    // Support Search Console's HTML file verification on workers.dev and custom domains.
    const asset = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
    const content = asset.ok ? await asset.text() : "";
    if (content.trim() === `google-site-verification: ${path.slice(1)}`)
      return respond(content, "text/html; charset=utf-8");
    return new Response(null, { status: 404 });
  }
  const canonicalPath = path.replace(/\/(?:index\.html)?$/, "") || "/";
  if (canonicalPath !== path && Object.hasOwn(publicPages, canonicalPath)) {
    return Response.redirect(url.origin + canonicalPath + url.search, 301);
  }
  const isPublic = Object.hasOwn(publicPages, path);
  const isApp = ["/login", "/signup", "/connect", "/agents", "/workspace/templates", "/invite", "/audit"].includes(path) || /^\/share\/[a-f0-9]{64}$/.test(path) || /^\/documents\/[a-f0-9-]{36}(\/preview)?$/.test(path);
  if (!isPublic && !isApp) {
    // Preserve directory links to downloadable examples while owning app routing here.
    const assetRequest = path.startsWith("/downloads/") && path.endsWith("/")
      ? new Request(new URL(path + "index.html", url), request)
      : request;
    const asset = await env.ASSETS.fetch(assetRequest);
    // Also reject SPA fallbacks from alternate asset adapters, rather than returning soft 404s.
    if (asset.headers.get("Content-Type")?.includes("text/html") && !path.startsWith("/downloads/")) {
      return new Response(request.method === "HEAD" ? null : "Page not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return asset;
  }
  const assetUrl = new URL(publicPageAsset(isPublic ? path : "/"), url);
  const asset = await env.ASSETS.fetch(new Request(assetUrl, { method: "GET" }));
  if (!asset.ok) return asset;
  // This is our bounded, build-generated HTML shell, never user document content.
  let html = await asset.text();
  html = html.replace(/<!--seo:start-->[\s\S]*?<!--seo:end-->/, () => `<!--seo:start-->${pageMetadata(path, url.origin)}<!--seo:end-->`);
  if (!isPublic) html = html.replace(/<!--app:start-->[\s\S]*?<!--app:end-->/, '<p class="loading">Opening DocSync…</p><noscript>Enable JavaScript to use your workspace.</noscript>');
  const headers = new Headers(asset.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  // The asset's byte length and validators no longer describe the rewritten response.
  for (const name of ["Content-Length", "ETag", "Last-Modified", "Content-Encoding"]) headers.delete(name);
  return new Response(request.method === "HEAD" ? null : html, { status: asset.status, headers });
}
