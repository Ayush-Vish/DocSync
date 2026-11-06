import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "./api";
import type { Revision } from "../document";
import type { compareVersions } from "../store";

export function VersionHistory({ documentId, history, currentRevision, busy, dirty, canRestore, onRestore, onClose }: {
  documentId: string; history: Revision[]; currentRevision: number; busy: boolean; dirty: boolean; canRestore: boolean;
  onRestore: (revision: number) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof compareVersions>> | null>(null), [error, setError] = useState(""), [comparing, setComparing] = useState(false);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="version-history" aria-label="Version history" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2>Version history</h2><Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>Close history</Button></header>
    {!canRestore && <p>Start editing with an active lock to restore a version.</p>}
    {history.map(row => <div className="revision-row" key={row.revision}>
      <div><strong>Version {row.revision}{row.revision === currentRevision ? " · Current" : ""}</strong><small>{new Date(row.created_at).toLocaleString()} · {row.author || "Workspace member"}{row.agent ? ` · ${row.agent}` : ""}</small><p>{row.summary || "Saved version"}{row.restored_from ? ` · Restored from v${row.restored_from}` : ""}</p></div>
      <div><Button variant="outline" size="sm" disabled={busy || comparing || row.revision === currentRevision} onClick={async () => { setComparing(true); setError(""); try { setComparison(await api(`/documents/${documentId}/compare?from=${row.revision}&to=${currentRevision}`)); } catch (error) { setError(error instanceof Error ? error.message : "Cannot compare versions"); } finally { setComparing(false); } }}>Compare</Button><Button variant="outline" size="sm" disabled={busy || dirty || !canRestore || row.revision === currentRevision} onClick={() => void onRestore(row.revision)}>Restore</Button></div>
    </div>)}
    {error && <p role="alert">{error}</p>}
    {comparison && <section className="version-comparison" aria-label="Version comparison"><h3>Version {comparison.from} → {comparison.to}</h3>
      {comparison.title.before !== comparison.title.after && <p>Title: {comparison.title.before} → {comparison.title.after}</p>}
      {comparison.format.before !== comparison.format.after && <p>Format: {comparison.format.before} → {comparison.format.after}</p>}
      {!comparison.pages.length && <p>No page content or order changes.</p>}
      {comparison.pages.map(page => <details key={page.id}><summary>{page.id} · {page.fromIndex < 0 ? "Added" : page.toIndex < 0 ? "Removed" : `Page ${page.fromIndex + 1} → ${page.toIndex + 1}`}</summary>
        {page.changes.map(change => <div key={change.field}><h4>{change.field.toUpperCase()}</h4><div className="comparison-columns"><div><strong>Before</strong><pre>{change.before || "(empty)"}</pre></div><div><strong>After</strong><pre>{change.after || "(empty)"}</pre></div></div></div>)}
      </details>)}
    </section>}
  </dialog>;
}
