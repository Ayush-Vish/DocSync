import { cleanCss, cleanHtml, frameSource } from "../content";
import type { Content } from "../document";

export function ArtifactFrame({ section, title }: { section: Content["sections"][number]; title: string }) {
  try {
    if (!section.js) return <iframe title={title} sandbox="" srcDoc={frameSource(section)} />;
    const payload = { type: "docsync:render-v1", html: cleanHtml(section.html), css: cleanCss(section.css), js: section.js };
    return <iframe
      key={JSON.stringify(payload)}
      title={title}
      src="/artifact-frame"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      onLoad={event => {
        // Opaque sandbox origins require '*'; the specific contentWindow is the
        // destination. No credentials or parent-page state enter the frame.
        event.currentTarget.contentWindow?.postMessage(payload, "*");
      }}
    />;
  } catch {
    return <iframe title={title} sandbox="" srcDoc="<!doctype html><p>Invalid HTML or CSS. Check the source before previewing.</p>" />;
  }
}
