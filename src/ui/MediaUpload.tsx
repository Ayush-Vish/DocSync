import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { maxMediaBytes, mediaTypes } from "../media-config";

export function insertPageMedia(html: string, snippet: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  const page = template.content.firstElementChild;
  if (page?.matches("article,main,section,.slide,.page")) page.insertAdjacentHTML("beforeend", snippet);
  else template.innerHTML += "\n" + snippet;
  return template.innerHTML;
}

export function MediaUpload({ documentId, textPage, disabled, onInsert }: { documentId: string; textPage: boolean; disabled: boolean; onInsert: (html: string) => void }) {
  const [asset, setAsset] = useState<{ url: string; html: string; filename: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const file = useRef<HTMLInputElement>(null);
  const upload = async (selected: File) => {
    setError(""); setAsset(null);
    if (selected.size < 1 || selected.size > maxMediaBytes || !(mediaTypes as readonly string[]).includes(selected.type)) { setError("Choose a PNG, JPEG, GIF, WebP, MP4, or WebM file up to 8 MiB."); return; }
    controller.current = new AbortController();
    setBusy(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/media`, { method: "POST", credentials: "same-origin", redirect: "error", signal: AbortSignal.any([controller.current.signal, AbortSignal.timeout(60_000)]), headers: { "Content-Type": selected.type, "X-File-Name": encodeURIComponent(selected.name) }, body: selected });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Upload failed");
      setAsset(result);
    } catch (error) { setError(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(false); }
  };
  return <section className="media-upload" aria-label="Page media"><h3>Images & video</h3><p>PNG, JPEG, GIF, WebP, MP4 or WebM · up to 8 MiB</p>
    <input ref={file} type="file" aria-label="Upload page media" accept={mediaTypes.join(",")} disabled={disabled || busy} onChange={event => { const selected = event.currentTarget.files?.[0]; if (selected) void upload(selected); event.currentTarget.value = ""; }} />
    <Button variant="outline" size="sm" disabled={disabled || busy} onClick={() => file.current?.click()}><Upload size={14} />{busy ? "Uploading…" : "Upload media"}</Button>
    {asset && <><input aria-label="Uploaded media URL" readOnly value={asset.url} onFocus={event => event.target.select()} /><Button size="sm" disabled={disabled} onClick={() => onInsert(asset.html)}>Insert into {textPage ? "HTML page" : "page"}</Button>{textPage && <p>Inserting media preserves the text and switches this page to HTML editing.</p>}</>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
