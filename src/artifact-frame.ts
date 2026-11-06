// Scripted artifacts get a separate response policy and an opaque sandbox origin.
// Only inline scripts are allowed: even scripts created by artifact JS cannot
// load external code. The host's frame-src policy also blocks external navigation.
import { mediaPolicy } from "./media-url.ts";
export const artifactPolicy = (origin: string) => `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; ${mediaPolicy(origin)}; font-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; sandbox allow-scripts`;

// Keep this script literal self-contained. Serializing a bundled function with
// toString() can leak esbuild helpers that do not exist inside the sandbox.
const artifactRuntime = String.raw`(() => {
  let rendered = false;
  function showError(message) {
    const error = document.createElement("pre");
    error.setAttribute("role", "status");
    error.style.cssText = "padding:16px;color:#b42318;white-space:pre-wrap;font:13px system-ui";
    error.textContent = "Artifact JavaScript error: " + message;
    document.body.append(error);
  }
  window.addEventListener("error", event => showError(event.message));
  window.addEventListener("unhandledrejection", () => showError("An asynchronous operation failed."));
  window.addEventListener("message", event => {
    if (rendered || event.source !== window.parent || window.parent === window) return;
    const data = event.data;
    if (!data || data.type !== "docsync:render-v1" || typeof data.html !== "string" || typeof data.css !== "string" || typeof data.js !== "string" || data.html.length > 100000 || data.css.length > 30000 || data.js.length > 50000) return;
    if (data.hostCss !== undefined && (typeof data.hostCss !== "string" || data.hostCss.length > 4096)) return;
    if (data.mediaToken !== undefined && (typeof data.mediaToken !== "string" || data.mediaToken.length > 1000)) return;
    rendered = true;
    // The iframe loads before its payload arrives. Wait for the host viewport's
    // layout, then start CSS and JavaScript together on the active page.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const styles = document.createElement("style");
      styles.textContent = data.css + (data.hostCss || "");
      document.head.append(styles);
      const template = document.createElement("template");
      template.innerHTML = data.html;
      for (const element of template.content.querySelectorAll("img,video,source")) {
        for (const attr of ["src", "poster"]) {
          const path = element.getAttribute(attr);
          if (!path) continue;
          if (data.mediaToken && /^\/media\/[a-f0-9-]{36}$/.test(path)) element.setAttribute(attr, new URL(path, document.URL).href + "?access=" + encodeURIComponent(data.mediaToken));
          else element.removeAttribute(attr);
        }
      }
      document.getElementById("artifact").replaceChildren(template.content);
      void document.getElementById("artifact").offsetWidth;
      const script = document.createElement("script");
      script.textContent = data.js;
      document.body.append(script);
      // Authored scripts missed the sandbox's native ready events. Deliver them
      // once after insertion, including document/window listeners and onload.
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
      window.dispatchEvent(new Event("load"));
      if (data.navigation === "presentation" || data.navigation === "document") {
        const presenting = data.navigation === "presentation";
        const send = action => window.parent.postMessage({ type: presenting ? "docsync:presentation-v1" : "docsync:document-v1", action }, "*");
        const interactive = target => target instanceof Element && target.closest("button,input,select,textarea,a,summary,canvas,video,[contenteditable],[role=button]");
        window.addEventListener("keydown", event => {
          if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
          const target = event.target instanceof Element ? event.target : null;
          if (target && target.closest("input,select,textarea,canvas,video,[contenteditable],[role=slider],[role=tablist],[role=listbox],[role=menu],[role=tree],[role=grid],[role=spinbutton]")) return;
          if (interactive(target) && (event.key === " " || event.key === "Enter")) return;
          const keys = presenting
            ? { ArrowRight: "next", ArrowDown: "next", PageDown: "next", " ": "next", Enter: "next", ArrowLeft: "previous", ArrowUp: "previous", PageUp: "previous", Home: "first", End: "last", Escape: "exit", g: "overview", G: "overview", r: "replay", R: "replay" }
            : { ArrowRight: "next", PageDown: "next", ArrowLeft: "previous", PageUp: "previous", Home: "first", End: "last", r: "replay", R: "replay" };
          const action = keys[event.key];
          if (action) { event.preventDefault(); send(action); }
        });
        if (presenting) {
          let touch = null, lastSwipe = -Infinity, lastMove = 0;
          document.addEventListener("touchstart", event => {
            if (!interactive(event.target) && event.touches.length === 1) touch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            else touch = null;
          }, { passive: true });
          document.addEventListener("touchend", event => {
            if (!touch || !event.changedTouches.length) return;
            const dx = event.changedTouches[0].clientX - touch.x, dy = event.changedTouches[0].clientY - touch.y;
            touch = null;
            if (Math.abs(dx) > Math.max(60, innerWidth * .12) && Math.abs(dx) > Math.abs(dy) * 1.5) {
              if (event.cancelable) event.preventDefault();
              lastSwipe = performance.now(); send(dx < 0 ? "next" : "previous");
            }
          }, { passive: false });
          document.addEventListener("click", event => {
            if (!event.defaultPrevented && event.button === 0 && !interactive(event.target) && performance.now() - lastSwipe > 500) send("next");
          });
          document.addEventListener("pointermove", () => {
            if (performance.now() - lastMove > 200) { lastMove = performance.now(); send("activity"); }
          }, { passive: true });
        }
      }
      if (data.autoHeight === true) {
        let queued = false;
        let previous = 0;
        const measure = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            const body = document.body;
            const artifact = document.getElementById("artifact");
            const height = Math.ceil(Math.max(body.getBoundingClientRect().height,
              artifact.getBoundingClientRect().top + artifact.scrollHeight + parseFloat(getComputedStyle(body).paddingBottom)));
            if (height !== previous) {
              previous = height;
              window.parent.postMessage({ type: "docsync:height-v1", height }, "*");
            }
          });
        };
        const observer = new ResizeObserver(measure);
        observer.observe(document.body);
        observer.observe(document.getElementById("artifact"));
        measure();
      }
    }));
  });
})()`;

export function artifactFrame(): Response {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;font:16px/1.6 system-ui;color:#172033;background:white;overflow-wrap:anywhere}*{box-sizing:border-box}img,video{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{padding:8px;border:1px solid #ddd}pre{white-space:pre-wrap}</style></head><body><main id="artifact"></main><script>${artifactRuntime}</script></body></html>`, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}
