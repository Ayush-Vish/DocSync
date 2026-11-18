import { useEffect, useRef, useState, type ReactNode } from "react";
import { Lock, LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Document, PageLockRequest, PageLockState } from "../document";
import { api } from "./api";

export type PageLockControls = {
  lockedIds: ReadonlySet<string>;
  button: (pageId: string, title: string) => ReactNode;
};

export function usePageLockFeed<T>(path: string | null) {
  const [snapshot, setSnapshot] = useState<{ path: string; value: T | null; error: string } | null>(null);
  const [revision, refresh] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let loading = false;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const value = await api<T>(path, "GET", undefined, controller.signal);
        if (!controller.signal.aborted) setSnapshot({ path, value, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) setSnapshot(old => ({
          path, value: old?.path === path ? old.value : null,
          error: error instanceof Error ? error.message : "Could not load page locks",
        }));
      } finally { loading = false; }
    };
    void load();
    const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.clearInterval(interval); window.removeEventListener("focus", load); };
  }, [path, revision]);
  return {
    data: snapshot?.path === path ? snapshot.value : null,
    error: snapshot?.path === path ? snapshot.error : "",
    refresh: () => refresh(n => n + 1),
  };
}

export function PageLockButton({ title, locked, onClick }: { title: string; locked: boolean; onClick: () => void }) {
  const label = `${title} ${locked ? "locked" : "unlocked"} · page lock settings`;
  return <button type="button" className={`page-lock-button${locked ? " is-locked" : ""}`}
    aria-label={label} title={label} onClick={event => { event.stopPropagation(); onClick(); }}>
    {locked ? <Lock size={14} aria-hidden="true" /> : <LockOpen size={14} aria-hidden="true" />}
  </button>;
}

function LockDialog({ title, onClose, busy, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="version-history page-lock-dialog" aria-label={title}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><h2>{title}</h2><Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Button></header>
    {children}
  </dialog>;
}

export function PageLockDialog({ doc, pageId, slide, dirty, state, loadError, onClose, onUpdate }: {
  doc: Document; pageId: string; slide: boolean; dirty: boolean; state: PageLockState | null; loadError: string;
  onClose: () => void; onUpdate: (action: "lock" | "unlock" | "request") => void;
}) {
  const [selected, setSelected] = useState([pageId]);
  const [chosenAgent, setChosenAgent] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const byId = new Map(state?.locks.map(lock => [lock.pageId, lock]));
  const current = byId.get(pageId);
  const title = `${slide ? "Slide" : "Page"} ${doc.sections.findIndex(section => section.id === pageId) + 1}`;
  const action = current
    ? state?.canManage ? "unlock" : state?.canRequest ? "request" : null
    : state?.canManage ? "lock" : null;
  const agentId = chosenAgent || state?.agents[0]?.id || "";
  const pageIds = selected.filter(id => Boolean(byId.get(id)) === Boolean(current));

  async function submit() {
    if (!action || !pageIds.length) return;
    setWorking(true); setError("");
    try {
      await api(`/documents/${doc.id}/${action === "request" ? "page-lock-requests" : "page-locks"}`,
        action === "unlock" ? "DELETE" : "POST", { pageIds, ...(action === "lock" ? { agentId } : {}) });
      onUpdate(action);
    } catch (error) {
      setError(error instanceof Error ? error.message : "The page lock could not be updated");
    } finally { setWorking(false); }
  }

  return <LockDialog title={`${title} lock`} busy={working} onClose={onClose}>
    {loadError && <p role="alert">{loadError}</p>}
    {!state && !loadError && <p role="status">Loading page locks…</p>}
    {state && <p>{current ? `Reserved for ${current.agent}. Only the document owner can unlock it.` : "This page is unlocked."}</p>}
    {action && <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={working} className="page-lock-selection">
        <legend>{slide ? "Select slides" : "Select pages"}</legend>
        {doc.sections.flatMap((section, index) => Boolean(byId.get(section.id)) === Boolean(current) ?
          [<label key={section.id}>
            <input type="checkbox" checked={selected.includes(section.id)} onChange={event => {
              const checked = event.target.checked;
              setSelected(previous => checked ? [...previous, section.id] : previous.filter(id => id !== section.id));
            }} />
            <span>{slide ? "Slide" : "Page"} {index + 1} <small>{section.id}</small></span>
          </label>] : [])}
      </fieldset>
      {action === "lock" && (state!.agents.length ? <label className="page-lock-agent">
        Assigned agent <select value={agentId} disabled={working} onChange={event => setChosenAgent(event.target.value)}>
          {state!.agents.map(agent => <option key={agent.id} value={agent.id}>{agent.label}</option>)}
        </select>
      </label> : <p>Connect an agent to your account to assign a lock.</p>)}
      {action === "lock" && dirty && <p>Save your draft before reserving pages.</p>}
      {error && <p role="alert">{error}</p>}
      <Button type="submit" size="sm" disabled={working || !pageIds.length || (action === "lock" && (!agentId || dirty))}>
        {action === "lock" ? "Lock selected" : action === "unlock" ? "Unlock selected" : "Send unlock request"}
      </Button>
    </form>}
  </LockDialog>;
}

export function PageLockInbox({ requests, error, onClose, onReview }: {
  requests: PageLockRequest[] | null; error: string; onClose: () => void; onReview: (request: PageLockRequest) => void;
}) {
  return <LockDialog title="Page lock requests" onClose={onClose}>
    {error && <p role="alert">{error}</p>}
    {requests?.length ? <ul className="page-lock-inbox">
      {requests.map((request, index) => <li key={index}>
        <div><strong>{request.title}</strong><p>{request.requester} requested page <code>{request.pageId}</code> from {request.agent}.</p></div>
        <Button variant="outline" size="sm" onClick={() => onReview(request)}>Review</Button>
      </li>)}
    </ul> : !error && <p role="status">{requests ? "No pending unlock requests." : "Checking for unlock requests…"}</p>}
  </LockDialog>;
}
