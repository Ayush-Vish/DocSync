import { cleanCss, cleanHtml, frameSource } from "../content";
import type { Content } from "../document";
import { useEffect, useRef, useState } from "react";

const fittedSlideCss = `
html,body{width:100%;height:100%;overflow:hidden!important}
body{display:flex!important;padding:16px!important}
#artifact{width:100%;height:100%;display:flex}
body>.slide,#artifact>.slide{width:100%!important;height:100%!important;min-height:0!important;margin:0!important;aspect-ratio:auto!important;overflow:hidden!important}
`;

const documentPageCss = `
html,body,*{scrollbar-width:none!important}
::-webkit-scrollbar{display:none!important}
body>nav[aria-label="Preview controls"]{display:none!important}
body:has(>.page),body:has(>#artifact>.page){padding:0!important;background:white!important}
body>.page,#artifact>.page{margin:0!important;max-width:none!important;min-height:1056px;box-shadow:none!important}
`;

export function ArtifactFrame({ section, title, fitSlide = false, documentPage = false }: { section: Content["sections"][number]; title: string; fitSlide?: boolean; documentPage?: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1056);
  useEffect(() => {
    if (!documentPage) return;
    const resize = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== "docsync:height-v1") return;
      const next = event.data.height;
      if (typeof next === "number" && Number.isFinite(next) && next > 0 && next <= 100000)
        setHeight(Math.max(1056, Math.ceil(next)));
    };
    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, [documentPage]);
  try {
    const framed = { ...section, css: section.css + (fitSlide ? fittedSlideCss : documentPage ? documentPageCss : "") };
    if (!framed.js && !documentPage) return <iframe title={title} sandbox="" scrolling={fitSlide ? "no" : undefined} srcDoc={frameSource(framed)} />;
    const payload = { type: "docsync:render-v1", html: cleanHtml(framed.html), css: cleanCss(framed.css), js: framed.js || "", autoHeight: documentPage };
    return <iframe
      ref={frame}
      style={documentPage ? { height } : undefined}
      key={JSON.stringify(payload)}
      title={title}
      src="/artifact-frame"
      sandbox="allow-scripts"
      scrolling={fitSlide || documentPage ? "no" : undefined}
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
