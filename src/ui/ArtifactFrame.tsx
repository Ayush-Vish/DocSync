import { cleanCss, cleanHtml, frameSource } from "../content";
import type { Content } from "../document";
import { useEffect, useRef, useState, type ReactNode } from "react";

export type PresentationAction = "next" | "previous" | "first" | "last" | "overview" | "replay" | "exit" | "activity";
const presentationActions: readonly string[] = ["next", "previous", "first", "last", "overview", "replay", "exit", "activity"];

// Keep the authored viewport stable. Resize the canvas, never reflow a slide into a mobile document.
function FrameViewport({ children, slide = true }: { children: ReactNode; slide?: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const width = slide ? 1280 : 816, height = slide ? 720 : 1056;
  useEffect(() => {
    const element = viewport.current!;
    const measure = () => setScale(slide ? Math.min(element.clientWidth / width, element.clientHeight / height) : element.clientWidth / width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [slide, width, height]);
  return <div ref={viewport} className="artifact-viewport" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
    <div style={{ position: "absolute", width, height, left: "50%", top: slide ? "50%" : 0, transformOrigin: "top left", transform: `scale(${scale}) translate(-50%, ${slide ? "-50%" : "0"})`, visibility: scale ? "visible" : "hidden" }}>{children}</div>
  </div>;
}

const fittedSlideCss = `
html,body{width:100%!important;height:100%!important;margin:0!important;padding:0!important;overflow:hidden!important;background:transparent!important}
body{display:flex!important;align-items:stretch!important;justify-content:stretch!important}
#artifact{width:100%!important;height:100%!important;display:flex!important;flex:1!important}
body>.slide,#artifact>.slide,.slide{width:100%!important;height:100%!important;min-height:0!important;max-width:none!important;margin:0!important;border:none!important;border-radius:0!important;aspect-ratio:auto!important;box-shadow:none!important;overflow:hidden!important}
body>nav[aria-label="Preview controls"],body>nav[aria-label="Presentation controls"],#ds-progress,#ds-float-bar,#ds-grid-overlay,.speaker-notes{display:none!important}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
`;

const documentPageCss = `
html,body,*{scrollbar-width:none!important}
::-webkit-scrollbar{display:none!important}
body>nav[aria-label="Preview controls"],body>nav[aria-label="Presentation controls"],#ds-progress,#ds-float-bar,#ds-grid-overlay{display:none!important}
body:has(>.page),body:has(>#artifact>.page){padding:0!important;background:white!important}
body>.page,#artifact>.page{margin:0!important;max-width:none!important;min-height:1056px;box-shadow:none!important}
`;

const interactiveBlockCss = `
html,body{margin:0!important;padding:0!important;width:100%!important;min-width:0!important;background:transparent!important;overflow:hidden!important;scrollbar-width:none!important}
::-webkit-scrollbar{display:none!important}
body>nav[aria-label="Preview controls"],body>nav[aria-label="Presentation controls"],#ds-progress,#ds-float-bar,#ds-grid-overlay{display:none!important}
#artifact{width:100%!important;min-width:0!important;margin:0!important;padding:0!important;display:block!important}
body>.page,#artifact>.page,.page{width:100%!important;max-width:100%!important;min-width:0!important;margin:0!important;padding:clamp(16px,2.5vw,28px)!important;box-shadow:none!important;border-top:none!important}
table{width:100%!important;max-width:100%!important}
.metric-grid,.grid,.region-grid{width:100%!important;max-width:100%!important}
`;

export function ArtifactFrame({
  section,
  title,
  fitSlide = false,
  documentPage = false,
  fitBlock = false,
  minHeight = 240,
  onPresentationAction,
}: {
  section: Content["sections"][number];
  title: string;
  fitSlide?: boolean;
  documentPage?: boolean;
  fitBlock?: boolean;
  minHeight?: number;
  onPresentationAction?: (action: PresentationAction) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(fitBlock ? minHeight : 1056);
  useEffect(() => {
    if (!onPresentationAction) return;
    const receive = (event: MessageEvent) => {
      if (event.source === frame.current?.contentWindow && event.data?.type === "docsync:presentation-v1" && presentationActions.includes(event.data.action))
        onPresentationAction(event.data.action);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onPresentationAction]);
  useEffect(() => {
    if (!documentPage && !fitBlock) return;
    const resize = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.data?.type !== "docsync:height-v1"
      )
        return;
      const next = event.data.height;
      if (typeof next === "number" && Number.isFinite(next) && next > 0 && next <= 100000) {
        const floor = fitBlock ? minHeight : 1056;
        setHeight(Math.max(floor, Math.ceil(next)));
      }
    };
    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, [documentPage, fitBlock, minHeight]);
  try {
    const extraCss = fitSlide
      ? fittedSlideCss
      : fitBlock
      ? interactiveBlockCss
      : documentPage
      ? documentPageCss
      : "";
    const framed = { ...section, css: section.css + extraCss };
    const shouldAutoHeight = documentPage || fitBlock;

    const wrap = (element: ReactNode) => fitSlide ? <FrameViewport>{element}</FrameViewport> : element;
    if (!framed.js && !shouldAutoHeight && !onPresentationAction) {
      return wrap(
        <iframe
          title={title}
          sandbox=""
          scrolling={fitSlide ? "no" : undefined}
          srcDoc={frameSource(framed)}
          className="block w-full border-0"
          style={{ width: "100%", height: fitSlide ? "100%" : undefined, border: 0, display: "block" }}
        />
      );
    }

    const payload = {
      type: "docsync:render-v1",
      html: cleanHtml(framed.html),
      css: cleanCss(section.css),
      hostCss: cleanCss(extraCss),
      js: framed.js || "",
      autoHeight: shouldAutoHeight,
      presenting: Boolean(onPresentationAction),
    };

    return wrap(
      <iframe
        ref={frame}
        style={{
          width: "100%",
          height: fitSlide ? "100%" : `${height}px`,
          minHeight: fitBlock ? `${minHeight}px` : undefined,
          border: 0,
          display: "block",
        }}
        key={JSON.stringify(payload)}
        title={title}
        src="/artifact-frame"
        sandbox="allow-scripts"
        scrolling={fitSlide || fitBlock || documentPage ? "no" : undefined}
        referrerPolicy="no-referrer"
        className="block w-full border-0"
        onLoad={(event) => {
          event.currentTarget.contentWindow?.postMessage(payload, "*");
        }}
      />
    );
  } catch {
    return (
      <iframe
        title={title}
        sandbox=""
        srcDoc="<!doctype html><p>Invalid HTML or CSS. Check the source before previewing.</p>"
        className="block w-full border-0"
        style={{ width: "100%", minHeight: "120px", border: 0 }}
      />
    );
  }
}

export function ArtifactThumbnail({ section, title, slide = true }: { section: Content["sections"][number]; title: string; slide?: boolean }) {
  try {
    const css = section.css + (slide ? fittedSlideCss : documentPageCss) + "*{animation:none!important;transition:none!important}.speaker-notes{display:none!important}";
    return <FrameViewport slide={slide}><iframe title={title} tabIndex={-1} sandbox="" loading="lazy" scrolling="no" srcDoc={frameSource({ ...section, css })} style={{ width: "100%", height: "100%", border: 0, display: "block", pointerEvents: "none", transform: "none" }} /></FrameViewport>;
  } catch {
    return <iframe title={title} sandbox="" srcDoc="<!doctype html><p>Preview unavailable.</p>" />;
  }
}
