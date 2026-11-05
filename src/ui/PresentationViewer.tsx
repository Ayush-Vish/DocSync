import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Grid2X2, Maximize, Minimize, RotateCcw, X } from "lucide-react";
import { ArtifactFrame, ArtifactThumbnail, type PresentationAction } from "./ArtifactFrame";
import type { Content } from "../document";
import "./presentation.css";

export function PresentationViewer({ sections, initialSlide = 0, title = "Presentation", onClose, onSlideChange }: {
  sections: Content["sections"];
  initialSlide?: number;
  title?: string;
  onClose: () => void;
  onSlideChange?: (index: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(() => Math.max(0, Math.min(sections.length - 1, initialSlide)));
  const [replay, setReplay] = useState(0);
  const [overview, setOverview] = useState(false);
  const [visible, setVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const notify = useRef(onSlideChange);
  notify.current = onSlideChange;
  const last = Math.max(0, sections.length - 1);

  const showControls = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 3000);
  }, []);
  const go = useCallback((index: number) => {
    setCurrent(Math.max(0, Math.min(last, index)));
    setOverview(false);
    showControls();
  }, [last, showControls]);

  useEffect(() => {
    const element = dialog.current!;
    const surface = screen.current!;
    element.showModal();
    element.focus();
    const change = () => setFullscreen(document.fullscreenElement === surface);
    document.addEventListener("fullscreenchange", change);
    showControls();
    return () => {
      clearTimeout(timer.current);
      document.removeEventListener("fullscreenchange", change);
      if (document.fullscreenElement === surface) void document.exitFullscreen().catch(() => {});
      element.close();
    };
  }, [showControls]);
  useEffect(() => { notify.current?.(current); }, [current]);
  useEffect(() => {
    if (overview) dialog.current?.querySelector<HTMLButtonElement>('[data-slide][aria-current="true"]')?.focus();
    else dialog.current?.focus();
  }, [overview]);

  const action = useCallback((command: PresentationAction) => {
    showControls();
    if (command === "next") go(current + 1);
    else if (command === "previous") go(current - 1);
    else if (command === "first") go(0);
    else if (command === "last") go(last);
    else if (command === "overview") setOverview(value => !value);
    else if (command === "replay") setReplay(value => value + 1);
    else if (command === "exit") { if (overview) setOverview(false); else onClose(); }
  }, [current, go, last, onClose, overview, showControls]);

  async function toggleFullscreen() {
    setError("");
    try {
      if (document.fullscreenElement === screen.current) await document.exitFullscreen();
      else await screen.current?.requestFullscreen();
    } catch { setError("Fullscreen is unavailable in this browser. You can keep presenting in this window."); }
  }

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable]")) return;
      if (event.key === "Escape") { event.preventDefault(); action("exit"); return; }
      if (event.key.toLowerCase() === "g") { event.preventDefault(); action("overview"); return; }
      if (overview || (target.closest("button") && [" ", "Enter"].includes(event.key))) return;
      const command: Record<string, PresentationAction> = { ArrowRight: "next", ArrowDown: "next", PageDown: "next", " ": "next", Enter: "next", ArrowLeft: "previous", ArrowUp: "previous", PageUp: "previous", Home: "first", End: "last", r: "replay", R: "replay" };
      if (command[event.key]) { event.preventDefault(); action(command[event.key]); }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [action, overview]);

  return <dialog ref={dialog} tabIndex={-1} className={`presentation-viewer ${visible || overview ? "" : "controls-hidden"}`} aria-label={`${title} — presentation`} onPointerMove={showControls}
    onCancel={event => { event.preventDefault(); action("exit"); }}>
    <div ref={screen} className="presentation-shell">
    <header className="presentation-heading">
      <div><span>DOCSYNC / PRESENTATION</span><strong>{title}</strong></div>
      <button className="presentation-ctrl-btn" aria-label="Exit presentation" title="Exit presentation (Esc)" onClick={onClose}><X size={20} /></button>
    </header>
    {error && <p role="alert" className="presentation-error">{error}</p>}
    <div className="presentation-stage">
      {overview ? <section className="presentation-overview" aria-label="Slide overview">
        {sections.map((section, index) => <button key={section.id} data-slide={index} aria-current={current === index ? "true" : undefined} aria-label={`Go to slide ${index + 1}`} onClick={() => go(index)}>
          <div><ArtifactThumbnail section={section} title={`Slide ${index + 1} preview`} /></div><span>{String(index + 1).padStart(2, "0")}</span>
        </button>)}
      </section> : <div className="presentation-canvas" aria-label={`Slide ${current + 1}`}>
        {sections[current] && <div className="presentation-slide-renderer" key={`${sections[current].id}-${replay}`}>
          <ArtifactFrame title={`${title} — Slide ${current + 1}`} section={sections[current]} fitSlide onPresentationAction={action} />
        </div>}
      </div>}
    </div>
    <footer className="presentation-footer">
      <nav className="presentation-controls" aria-label="Presentation navigation" onFocus={showControls}>
        <button className="presentation-ctrl-btn" aria-label="Previous slide" title="Previous slide (←)" disabled={current === 0} onClick={() => go(current - 1)}><ChevronLeft size={20} /></button>
        <output className="presentation-counter" aria-live="polite" aria-atomic="true">Slide {current + 1} of {sections.length}</output>
        <button className="presentation-ctrl-btn" aria-label="Next slide" title="Next slide (→ / Space)" disabled={current >= last} onClick={() => go(current + 1)}><ChevronRight size={20} /></button>
        <i aria-hidden="true" />
        <button className="presentation-ctrl-btn" aria-label="Slide overview" aria-pressed={overview} title="Slide overview (G)" onClick={() => action("overview")}><Grid2X2 size={18} /></button>
        <button className="presentation-ctrl-btn" aria-label="Replay slide animations" title="Replay animations (R)" disabled={overview} onClick={() => action("replay")}><RotateCcw size={18} /></button>
        <button className="presentation-ctrl-btn" aria-label={fullscreen ? "Leave fullscreen" : "Enter fullscreen"} title="Toggle browser fullscreen" disabled={!document.fullscreenEnabled} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}</button>
      </nav>
      <p className="presentation-shortcuts">← → Navigate <span>G Overview</span><span>R Replay</span><span>Esc Exit</span></p>
      <p className="presentation-mobile-hint">Rotate your device for a larger slide.</p>
    </footer>
    <div className="presentation-progress" role="progressbar" aria-label="Presentation progress" aria-valuemin={1} aria-valuemax={sections.length} aria-valuenow={current + 1}><span style={{ width: `${(current + 1) / sections.length * 100}%` }} /></div>
    </div>
  </dialog>;
}
