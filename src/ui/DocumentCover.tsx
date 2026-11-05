import { useEffect, useRef, useState } from "react";
import { FileText, Presentation } from "lucide-react";
import { api } from "./api";
import { ArtifactThumbnail } from "./ArtifactFrame";
import type { Content } from "../document";

export function DocumentCover({ id, revision, title, presentation }: { id: string; revision: number; title: string; presentation: boolean }) {
  const cover = useRef<HTMLSpanElement>(null);
  const [section, setSection] = useState<Content["sections"][number] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setSection(null);
    setFailed(false);
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      void api<{ section: Content["sections"][number] }>(`/documents/${id}/thumbnail`, "GET", undefined, controller.signal)
        .then(result => { if (!controller.signal.aborted) setSection(result.section); })
        .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    }, { rootMargin: "200px" });
    observer.observe(cover.current!);
    return () => { controller.abort(); observer.disconnect(); };
  }, [id, revision]);
  return <span ref={cover} className="document-cover">
    {section ? <ArtifactThumbnail section={section} title={`${title} — first ${presentation ? "slide" : "page"}`} slide={presentation} /> : <span className="document-cover-placeholder">{presentation ? <Presentation size={28} /> : <FileText size={28} />}<small>{failed ? "Open to view" : "Loading preview…"}</small></span>}
  </span>;
}
