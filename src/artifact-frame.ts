// Scripted artifacts get a separate response policy and an opaque sandbox origin.
// Only inline scripts are allowed: even scripts created by artifact JS cannot
// load external code. The host's frame-src policy also blocks external navigation.
export const artifactPolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts";

function artifactRuntime() {
  let rendered = false;
  function showError(message: string) {
    const error = document.createElement("pre");
    error.setAttribute("role", "status");
    error.style.cssText = "padding:16px;color:#b42318;white-space:pre-wrap;font:13px system-ui";
    error.textContent = `Artifact JavaScript error: ${message}`;
    document.body.append(error);
  }
  window.addEventListener("error", event => showError(event.message));
  window.addEventListener("unhandledrejection", () => showError("An asynchronous operation failed."));
  window.addEventListener("message", event => {
    if (rendered || event.source !== window.parent || window.parent === window) return;
    const data = event.data;
    if (!data || data.type !== "docsync:render-v1" || typeof data.html !== "string" || typeof data.css !== "string" || typeof data.js !== "string" || data.html.length > 100_000 || data.css.length > 30_000 || data.js.length > 50_000) return;
    rendered = true;
    const styles = document.createElement("style");
    styles.textContent = data.css;
    document.head.append(styles);
    document.getElementById("artifact")!.innerHTML = data.html;
    const script = document.createElement("script");
    // Assign text, never interpolate JS into an HTML <script> tag.
    script.textContent = data.js;
    document.body.append(script);
  });
}

export function artifactFrame(): Response {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:16px/1.6 system-ui;color:#172033;background:white;overflow-wrap:anywhere}*{box-sizing:border-box}table{border-collapse:collapse;max-width:100%}td,th{padding:8px;border:1px solid #ddd}pre{white-space:pre-wrap}</style></head><body><main id="artifact"></main><script>(${artifactRuntime.toString()})()</script></body></html>`, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}
