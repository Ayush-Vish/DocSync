import { cleanCss, cleanHtml, frameSource } from "../content";
import type { Content } from "../document";

const fittedSlideCss = `
html,body{width:100%;height:100%;overflow:hidden!important}
body{display:flex!important;padding:16px!important}
#artifact{width:100%;height:100%;display:flex}
body>.slide,#artifact>.slide{width:100%!important;height:100%!important;min-height:0!important;margin:0!important;aspect-ratio:auto!important;overflow:hidden!important}
`;

export function ArtifactFrame({ section, title, fitSlide = false }: { section: Content["sections"][number]; title: string; fitSlide?: boolean }) {
  try {
    const framed = fitSlide ? { ...section, css: section.css + fittedSlideCss } : section;
    if (!framed.js) return <iframe title={title} sandbox="" scrolling={fitSlide ? "no" : undefined} srcDoc={frameSource(framed)} />;
    const payload = { type: "docsync:render-v1", html: cleanHtml(framed.html), css: cleanCss(framed.css), js: framed.js };
    return <iframe
      key={JSON.stringify(payload)}
      title={title}
      src="/artifact-frame"
      sandbox="allow-scripts"
      scrolling={fitSlide ? "no" : undefined}
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

export function ArtifactThumbnail({ section, title }: { section: Content["sections"][number]; title: string }) {
  try {
    return <iframe title={title} sandbox="" loading="lazy" srcDoc={frameSource(section)} />;
  } catch {
    return <iframe title={title} sandbox="" srcDoc="<!doctype html><p>Preview unavailable.</p>" />;
  }
}
