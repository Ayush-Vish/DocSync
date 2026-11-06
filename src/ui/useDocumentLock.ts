import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { EditLease, EditLock, DocumentAccess } from "../document";

type Status = { revision: number; lock: EditLock | null; access: DocumentAccess };
type State = { documentId: string | null; lease: EditLease | null; lock: EditLock | null; pending: boolean; error: string; access?: DocumentAccess };

export function useDocumentLock(id: string | null, editing: boolean, onAcquired: (revision: number) => Promise<void>) {
  const [state, setState] = useState<State>({ documentId: null, lease: null, lock: null, pending: false, error: "" });
  const callback = useRef(onAcquired);
  callback.current = onAcquired;
  const controls = useRef<{ start: () => Promise<void>; renew: () => Promise<EditLease> } | null>(null);
  useEffect(() => {
    if (!id) { controls.current = null; setState({ documentId: null, lease: null, lock: null, pending: false, error: "" }); return; }
    let disposed = false, lease: EditLease | null = null, inFlight: Promise<void> | null = null, polling = false, renewing = false;
    const path = `/documents/${id}/lock`;
    const update = (next: Partial<State>) => { if (!disposed) setState(current => ({ ...current, ...next, documentId: id })); };
    const report = (error: unknown) => update({ lease: null, pending: false, error: error instanceof Error ? error.message : "Cannot check edit access. Your draft is still here." });
    const release = (value: EditLease) => {
      // Small keepalive request also works during pagehide/reload. Leases still
      // expire on the server if closing the browser prevents delivery.
      void fetch(`/api${path}`, { method: "DELETE", credentials: "same-origin", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lockToken: value.lockToken }) }).catch(() => {});
    };
    const poll = async () => {
      if (polling || disposed || inFlight || renewing) return;
      polling = true;
      const observed = lease?.leaseId;
      try {
        const status = await api<Status>(path);
        if (lease?.leaseId !== observed) return;
        if (lease && (status.lock?.leaseId !== lease.leaseId || lease.expiresAt <= Date.now() / 1000)) {
          lease = null;
          update({ lease: null, error: "Your edit lock ended. Your draft is still here; start editing to acquire a new lock." });
        }
        update({ lock: status.lock, access: status.access });
      } catch (error) { report(error); }
      finally { polling = false; }
    };
    const renew = async (): Promise<EditLease> => {
      if (!lease || disposed) throw new ApiError(423, "Start editing to acquire an edit lock. Your draft is still here.");
      const current = lease;
      try {
        const status = await api<Status>(path, "PATCH", { lockToken: current.lockToken });
        if (!status.lock || status.lock.leaseId !== current.leaseId) throw new ApiError(423, "Your edit lock ended. Your draft is still here.");
        lease = { ...current, ...status.lock, revision: status.revision };
        update({ lease, lock: status.lock, access: status.access, error: "" });
        return lease;
      } catch (error) {
        // Retain the secret privately for a renewed login or uncertain response;
        // writing stays disabled until a successful renewal proves ownership.
        report(error);
        throw error;
      }
    };
    const start = () => {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        update({ pending: true, error: "" });
        try {
          if (lease) {
            try { await renew(); }
            catch (error) { if (!(error instanceof ApiError) || error.status !== 423) throw error; lease = null; }
          }
          if (!lease) lease = await api<EditLease>(path, "POST", {});
          if (disposed) { release(lease); lease = null; return; }
          await callback.current(lease.revision);
          update({ lease, lock: lease, pending: false, error: "" });
        } catch (error) { report(error); throw error; }
      })().finally(() => { inFlight = null; void poll(); });
      return inFlight;
    };
    controls.current = { start, renew };
    setState({ documentId: id, lease: null, lock: null, pending: editing, error: "" });
    if (editing) void start().catch(() => {});
    else void poll();
    const statusTimer = setInterval(() => void poll(), 5000);
    const renewalTimer = setInterval(() => {
      if (lease && editing && !renewing) {
        renewing = true;
        void renew().catch(() => {}).finally(() => { renewing = false; });
      }
    }, 60_000);
    const check = () => { if (!document.hidden) void poll(); };
    const leave = () => { if (lease) release(lease); };
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", check);
    return () => {
      disposed = true;
      controls.current = null;
      clearInterval(statusTimer); clearInterval(renewalTimer);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", check);
      if (lease) release(lease);
    };
  }, [id, editing]);
  return {
    ...state,
    canWrite: editing && state.documentId === id && Boolean(state.lease && state.lease.expiresAt > Date.now() / 1000),
    start: () => controls.current?.start() ?? Promise.reject(new ApiError(423, "Open the editor first")),
    renew: () => controls.current?.renew() ?? Promise.reject(new ApiError(423, "Open the editor first")),
  };
}
