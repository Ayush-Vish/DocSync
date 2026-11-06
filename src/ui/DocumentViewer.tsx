import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { ArtifactFrame, type NavigationAction } from "./ArtifactFrame";
import type { Content } from "../document";
import "./document-viewer.css";

// Documents keep their portrait layout and normal scrolling. Only the selected
// page is mounted, so other pages cannot run scripts or consume animation time.
export function DocumentViewer({ sections, page, onPageChange, title, children, actions }: {
  sections: Content["sections"];
  page: number;
  onPageChange: (index: number) => void;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [replay, setReplay] = useState(0);
  const last = Math.max(0, sections.length - 1);
  const current = Math.max(0, Math.min(last, page));
  const section = sections[current];
  const action = useCallback((command: NavigationAction) => {
    if (command === "next") onPageChange(Math.min(last, current + 1));
    else if (command === "previous") onPageChange(Math.max(0, current - 1));
    else if (command === "first") onPageChange(0);
    else if (command === "last") onPageChange(last);
    else if (command === "replay") setReplay(value => value + 1);
  }, [current, last, onPageChange]);

  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 0;
  }, [section?.id, replay]);
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector('dialog[open], [role="dialog"]')) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input,textarea,select,canvas,[contenteditable],[role=slider],[role=tablist],[role=listbox],[role=menu],[role=tree],[role=grid],[role=spinbutton]")) return;
      const keys: Record<string, NavigationAction> = { ArrowLeft: "previous", PageUp: "previous", ArrowRight: "next", PageDown: "next", Home: "first", End: "last", r: "replay", R: "replay" };
      if (keys[event.key]) { event.preventDefault(); action(keys[event.key]); }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [action]);

  if (!section) return null;
  return <section className="document-viewer" aria-label="Document viewer">
    <div className="document-page-toolbar">
      <nav aria-label="Document page navigation">
        <button type="button" aria-label="Previous page" title="Previous page (←)" disabled={current === 0} onClick={() => action("previous")}><ChevronLeft size={18} /></button>
        <output aria-live="polite" aria-atomic="true">Page {current + 1} of {sections.length}</output>
        <button type="button" aria-label="Next page" title="Next page (→)" disabled={current === last} onClick={() => action("next")}><ChevronRight size={18} /></button>
        <button type="button" aria-label="Replay page animations" title="Replay page animations (R)" onClick={() => action("replay")}><RotateCcw size={16} /></button>
      </nav>
      {actions && <div className="document-page-actions">{actions}</div>}
    </div>
    <div ref={scroll} className="document-pages-scroll">
      <article className="document-paper document-page-enter" key={`${section.id}-${replay}`} aria-label={`Page ${current + 1}`}>
        {children || <ArtifactFrame section={section} title={`${title} — Page ${current + 1}`} documentPage navigation="document" onNavigate={action} />}
      </article>
    </div>
  </section>;
}
