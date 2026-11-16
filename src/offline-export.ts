import { validateContent } from "./content.ts";
import { isPresentationContent, type Content } from "./document.ts";
import { artifactFrameHtml } from "./artifact-frame.ts";
import { fittedSlideCss, documentPageCss } from "./artifact-layout.ts";
import { mediaReferences } from "./media-url.ts";
import { maxMediaBytes, mediaTypes } from "./media-config.ts";
import { readBody } from "./request.ts";

// Self-contained literals keep bundled helpers and application credentials out
// of the downloaded file. Authored code runs only in an opaque sandbox.
const offlineRuntime = String.raw`(() => {
  const data = JSON.parse(document.getElementById("offline-data").textContent);
  const presenting = data.format === "presentation";
  const stage = document.getElementById("stage");
  const surface = document.getElementById("surface");
  const select = document.getElementById("page-select");
  const counter = document.getElementById("counter");
  const previous = document.getElementById("previous");
  const next = document.getElementById("next");
  const error = document.getElementById("viewer-error");
  let current = 0, frame = null;
  const last = data.sections.length - 1;
  const label = presenting ? "Slide" : "Page";
  previous.setAttribute("aria-label", "Previous " + label.toLowerCase());
  next.setAttribute("aria-label", "Next " + label.toLowerCase());
  document.getElementById("title").textContent = data.title;
  document.getElementById("format").textContent = presenting ? "Offline presentation" : "Offline document";
  document.body.dataset.format = data.format;
  select.setAttribute("aria-label", "Go to " + label.toLowerCase());
  for (let index = 0; index <= last; index++) select.add(new Option(label + " " + (index + 1), String(index)));
  function fit() {
    if (!presenting) return;
    const scale = Math.max(.01, Math.min((stage.clientWidth - 32) / 1280, (stage.clientHeight - 32) / 720));
    surface.style.transform = "translate(-50%,-50%) scale(" + scale + ")";
  }
  function render(index) {
    current = Math.max(0, Math.min(last, index));
    const section = data.sections[current];
    const nextFrame = document.createElement("iframe");
    nextFrame.title = data.title + " — " + label + " " + (current + 1);
    nextFrame.setAttribute("sandbox", "allow-scripts");
    nextFrame.setAttribute("referrerpolicy", "no-referrer");
    nextFrame.setAttribute("scrolling", "no");
    nextFrame.style.height = presenting ? "720px" : "1056px";
    nextFrame.addEventListener("load", () => {
      const media = {};
      for (const path of section.media) media[path] = data.media[path];
      nextFrame.contentWindow.postMessage({ type: "docsync:render-v1", html: section.html, css: section.css,
        hostCss: data.hostCss, js: section.js || "", media, autoHeight: !presenting, navigation: data.format }, "*");
    }, { once: true });
    nextFrame.srcdoc = data.frame;
    frame = nextFrame;
    surface.replaceChildren(nextFrame);
    stage.scrollTop = 0;
    select.value = String(current);
    counter.textContent = label + " " + (current + 1) + " of " + data.sections.length;
    previous.disabled = current === 0;
    next.disabled = current === last;
    document.getElementById("progress").style.width = ((current + 1) / data.sections.length * 100) + "%";
    fit();
  }
  async function fullscreen() {
    error.textContent = "";
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { error.textContent = "Fullscreen is unavailable. You can continue in this window."; }
  }
  function action(command) {
    if (command === "next" && current < last) render(current + 1);
    else if (command === "previous" && current > 0) render(current - 1);
    else if (command === "first" && current !== 0) render(0);
    else if (command === "last" && current !== last) render(last);
    else if (command === "replay") render(current);
    else if (command === "overview") select.focus();
    else if (command === "exit" && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }
  previous.addEventListener("click", () => action("previous"));
  next.addEventListener("click", () => action("next"));
  select.addEventListener("change", () => render(Number(select.value)));
  document.getElementById("replay").addEventListener("click", () => action("replay"));
  document.getElementById("fullscreen").addEventListener("click", fullscreen);
  document.addEventListener("fullscreenchange", () => {
    document.getElementById("fullscreen").textContent = document.fullscreenElement ? "Exit fullscreen" : "Fullscreen";
    fit();
  });
  window.addEventListener("resize", fit);
  window.addEventListener("message", event => {
    if (!frame || event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === "docsync:height-v1" && !presenting) {
      const height = event.data.height;
      if (typeof height === "number" && Number.isFinite(height) && height > 0 && height <= 100000) frame.style.height = Math.max(1056, Math.ceil(height)) + "px";
    } else if (event.data.type === (presenting ? "docsync:presentation-v1" : "docsync:document-v1")) action(event.data.action);
  });
  window.addEventListener("keydown", event => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target && target.closest("input,select,textarea,[contenteditable]")) return;
    if (target && target.closest("button") && (event.key === " " || event.key === "Enter")) return;
    const keys = { ArrowRight: "next", PageDown: "next", ArrowLeft: "previous", PageUp: "previous", Home: "first", End: "last", r: "replay", R: "replay", Escape: "exit" };
    if (presenting) Object.assign(keys, { ArrowDown: "next", ArrowUp: "previous", " ": "next", Enter: "next", g: "overview", G: "overview" });
    if (keys[event.key]) { event.preventDefault(); action(keys[event.key]); }
  });
  render(0);
})()`;

const offlineCss = `
*{box-sizing:border-box}html,body{margin:0;height:100%;font:14px/1.5 system-ui,-apple-system,sans-serif;color:#172033;background:#f4f5f7}
.shell{height:100dvh;display:flex;flex-direction:column}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 24px;background:#fff;border-bottom:1px solid #e2e8f0}
header p{margin:0 0 2px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;font-size:10px;font-weight:600}h1{font-size:15px;line-height:1.4;margin:0;overflow-wrap:anywhere}.offline-badge{flex-shrink:0;border:1px solid #b7d9c5;border-radius:999px;padding:4px 10px;font-size:11px;color:#216342;background:#eff8f2}
#stage{position:relative;flex:1;min-height:0;overflow:auto}#surface{width:min(816px,calc(100% - 32px));margin:24px auto;background:white;box-shadow:0 4px 24px #1720330d;border-radius:4px;overflow:hidden}iframe{display:block;width:100%;border:0}
footer{flex-shrink:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;padding:12px;background:#fff;border-top:1px solid #e2e8f0}button,select{border:1px solid #dce1e8;border-radius:8px;background:white;color:inherit;font:500 12px/1.4 system-ui;padding:8px 12px;cursor:pointer}button:hover:not(:disabled){background:#f1f3f8}button:disabled{opacity:.35;cursor:default}button:focus-visible,select:focus-visible{outline:2px solid #6366f1;outline-offset:3px}output{min-width:100px;text-align:center;font-size:12px;color:#64748b}#viewer-error:empty{display:none}#viewer-error{margin:0;padding:8px 16px;background:#fff0ee;color:#a12e23;font-size:12px}.progress-track{height:2px;background:#e2e8f0}#progress{height:100%;background:#6366f1}
body[data-format=presentation]{background:#0c0e13}body[data-format=presentation] #stage{overflow:hidden}body[data-format=presentation] #surface{position:absolute;top:50%;left:50%;width:1280px;height:720px;margin:0;transform-origin:center;border-radius:8px}
@media(max-width:600px){header{padding:12px 16px}.offline-badge{display:none}footer{gap:6px;padding:8px}button,select{padding:8px}output{min-width:80px}#surface{width:calc(100% - 20px);margin:12px auto}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function base64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32768) parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32768)));
  return btoa(parts.join(""));
}

export async function exportOfflineHtml(input: Content, fetchApi: typeof fetch = fetch): Promise<{ html: string; filename: string }> {
  // Select content fields explicitly: never serialize account/session data,
  // edit-lease secrets, or the expiring media grant attached to API responses.
  const content = validateContent({ title: input.title, format: isPresentationContent(input) ? "presentation" : "document", sections: input.sections });
  const required = content.sections.flatMap(section => mediaReferences(section.html));
  const ids = [...new Set(required.map(ref => ref.id))];
  if (ids.length > 50) throw new Error("This export exceeds the 50-file document media limit.");
  const media: Record<string, string> = {};
  let total = 0;
  for (const id of ids) {
    let response: Response;
    try { response = await fetchApi(`/media/${id}`, { credentials: "same-origin", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(60_000) }); }
    catch { throw new Error("Cannot download media for this offline file. Check your connection and try again. No HTML file was created."); }
    if (!response.ok) throw new Error(`Cannot include document media (${response.status}). Sign in and check access to the original files, then try again. No HTML file was created.`);
    const mime = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() || "";
    if (!(mediaTypes as readonly string[]).includes(mime) || required.some(ref => ref.id === id && !mime.startsWith(ref.kind + "/"))) {
      await response.body?.cancel();
      throw new Error("A media file has an unsupported or mismatched type. No HTML file was created.");
    }
    let bytes: Uint8Array;
    try { bytes = await readBody(response, maxMediaBytes); }
    catch { throw new Error("A media file could not be read or exceeds 8 MiB. No HTML file was created."); }
    if (!bytes.length || (total += bytes.length) > 100 * 1024 * 1024) throw new Error("Offline media must be non-empty and fit within the 100 MiB document limit.");
    media[`/media/${id}`] = `data:${mime};base64,${base64(bytes)}`;
  }
  const payload = {
    ...content,
    sections: content.sections.map(section => ({ ...section, media: [...new Set(mediaReferences(section.html).map(ref => `/media/${ref.id}`))] })),
    media,
    frame: artifactFrameHtml(true),
    hostCss: content.format === "presentation" ? fittedSlideCss : documentPageCss,
  };
  // Escaping '<' prevents authored HTML/JS from closing this JSON script block.
  const encoded = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src data:; frame-src 'self' about:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>${escapeHtml(content.title)}</title><style>${offlineCss}</style></head><body><div class="shell"><header><div><p id="format">Offline document</p><h1 id="title">${escapeHtml(content.title)}</h1></div><span class="offline-badge">Available offline</span></header><p id="viewer-error" role="alert"></p><main id="stage" aria-label="Offline content"><div id="surface"></div></main><footer><button id="previous" type="button" aria-label="Previous page" title="Previous (←)">←</button><output id="counter" aria-live="polite" aria-atomic="true"></output><button id="next" type="button" aria-label="Next page" title="Next (→)">→</button><select id="page-select" aria-label="Go to page"></select><button id="replay" type="button" title="Replay animations (R)">Replay</button><button id="fullscreen" type="button">Fullscreen</button></footer><div class="progress-track" aria-hidden="true"><div id="progress"></div></div></div><noscript>Enable JavaScript to navigate the pages in this offline file.</noscript><script id="offline-data" type="application/json">${encoded}</script><script>${offlineRuntime}</script></body></html>`;
  const slug = content.title.normalize("NFKC").replace(/[^\p{L}\p{N} -]/gu, "").trim().replace(/\s+/g, "-").slice(0, 100) || "document";
  return { html, filename: `docsync-${slug}.html` };
}
