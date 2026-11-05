import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Globe, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ShareDialog({ title, revision, published, share, presentation, dirty, busy, copied, error, onCopy, onPublish, onRevoke, onClose }: {
  title: string; revision: number; published: number | null; share: string;
  presentation: boolean; dirty: boolean; busy: boolean; copied: string; error: string;
  onCopy: (url: string) => void; onPublish: () => Promise<void>; onRevoke: () => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId(), descriptionId = useId();
  const [present, setPresent] = useState(false);
  const url = share ? share + (present ? "#present" : "") : "";
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="share-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="share-dialog-content">
      <header><h2 id={titleId}>Share “{title}”</h2><Button variant="ghost" size="icon" aria-label="Close sharing" onClick={onClose} disabled={busy}><X size={18} /></Button></header>
      <p id={descriptionId}>Publish a saved version for anyone with its link to view. Editing stays in your workspace.</p>
      <div className="share-access-state">
        {published ? <Globe size={20} aria-hidden="true" /> : <Lock size={20} aria-hidden="true" />}
        <div><strong>{published ? `Version ${published} is published` : "Private draft"}</strong><p>{published ? "Anyone with the published link can view that version." : "No public link is active. Only your account and its authorized agents can access this draft."}</p></div>
      </div>
      {dirty && <p className="share-warning">You have unsaved changes. Close this panel and save before publishing your latest work.</p>}
      {published && !share && <p>The existing link remains active. For security, its URL cannot be retrieved. Publishing again issues a new link and revokes the old one.</p>}
      {published && share && <div className="share-link"><label htmlFor={`${titleId}-url`}>Published link</label><input id={`${titleId}-url`} readOnly value={url} onFocus={event => event.currentTarget.select()} /><a href={url} target="_blank" rel="noreferrer">Open published version ↗</a></div>}
      {presentation && share && <label className="share-present"><input type="checkbox" checked={present} onChange={event => setPresent(event.currentTarget.checked)} />Open link in presentation mode</label>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="share-note">Private edits don’t change a published version. Revoking a link stops future access but cannot remove downloaded copies.</p>
      <footer>
        {published && <Button variant="outline" disabled={busy} onClick={() => void onRevoke()}>Revoke link</Button>}
        <Button variant="outline" disabled={busy || !url} onClick={() => onCopy(url)}>{copied && copied === url ? <Check size={15} /> : <Copy size={15} />}{copied === url && url ? "Copied" : "Copy link"}</Button>
        <Button disabled={busy || dirty} onClick={() => void onPublish()}>{busy ? "Please wait…" : published ? `Publish v${revision} with new link` : "Publish saved version"}</Button>
      </footer>
    </div>
  </dialog>;
}
