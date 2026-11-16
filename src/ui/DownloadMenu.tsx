import { useEffect, useRef } from "react";
import { ChevronDown, Download, FileJson, LoaderCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DownloadMenu({ disabled, exporting, onHtml, onJson }: {
  disabled: boolean;
  exporting: boolean;
  onHtml: () => void;
  onJson: () => void;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) menu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return <div className="document-download">
    <Button variant="outline" size="sm" className="h-8 text-xs px-2.5" disabled={disabled} onClick={onHtml}>
      {exporting ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
      {exporting ? "Preparing HTML…" : "Download HTML"}
    </Button>
    <details ref={menu} className="download-options" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); menu.current?.removeAttribute("open"); menu.current?.querySelector("summary")?.focus(); }
    }}>
      <summary className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 px-2")} aria-label="More download options" aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault(); }}><ChevronDown className="size-3.5" aria-hidden="true" /></summary>
      <div className="download-options-panel">
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => { menu.current?.removeAttribute("open"); onJson(); }}><FileJson className="size-3.5" aria-hidden="true" />Download JSON backup</Button>
        <p>HTML opens offline with animations and media. Both downloads include your current draft.</p>
      </div>
    </details>
  </div>;
}
