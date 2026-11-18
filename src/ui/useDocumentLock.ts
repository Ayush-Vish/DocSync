import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import type { EditLease, EditLock, DocumentAccess } from "../document";

type Status = { revision: number; lock: EditLock | null; access: DocumentAccess };
type State = { documentId: string | null; lease: EditLease | null; lock: EditLock | null; pending: boolean; stopping: boolean; releaseUncertain: boolean; error: string; notice: string; access?: DocumentAccess };
const initialState: State = { documentId: null, lease: null, lock: null, pending: false, stopping: false, releaseUncertain: false, error: "", notice: "" };

export function useDocumentLock(id: string | null, editing: boolean, onAcquired: (revision: number) => Promise<void>, dirty = false) {
  const [state, setState] = useState<State>(initialState);
  const callback = useRef(onAcquired);
  callback.current = onAcquired;
  const unsaved = useRef(dirty);
  unsaved.current = dirty;
  const controls = useRef<{ start: () => Promise<void>; stop: () => Promise<void>; renew: () => Promise<EditLease> } | null>(null);
  useEffect(() => {
    if (!id) { controls.current = null; setState(initialState); return; }
    let disposed = false, lease: EditLease | null = null, inFlight: Promise<void> | null = null, polling = false, releaseRequested = false;
    let renewing: Promise<EditLease> | null = null;
    let lastActivity = Date.now();
    const path = `/documents/${id}/lock`;
    const update = (next: Partial<State>) => { if (!disposed) setState(current => ({ ...current, ...next, documentId: id })); };
    const report = (error: unknown) => {
      if (!releaseRequested) update({ lease, pending: false, error: error instanceof Error ? error.message : "Cannot check edit access. Your draft is still here." });
    };
    // Navigation/unload can only make a best-effort request. The explicit Stop
    // editing action below waits for the server and verifies the handoff.
    const releaseOnLeave = (value: EditLease) => {
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
          const stopped = releaseRequested;
          lease = null;
          releaseRequested = false;
          update({ lease: null, stopping: false, releaseUncertain: false, error: stopped ? "" : "Your edit lock ended. Your draft is still here; start editing to acquire a new lock.", notice: stopped ? "Editing stopped. Other sessions can now edit." : "" });
        }
        update({ lock: status.lock, access: status.access });
      } catch (error) { report(error); }
      finally { polling = false; }
    };
    const renew = (): Promise<EditLease> => {
      if (renewing) return renewing;
      if (!lease || disposed || releaseRequested) return Promise.reject(new ApiError(423, "Start editing to acquire an edit lock. Your draft is still here."));
      const current = lease;
      renewing = (async () => {
        try {
          const status = await api<Status>(path, "PATCH", { lockToken: current.lockToken });
          if (!status.lock || status.lock.leaseId !== current.leaseId) throw new ApiError(423, "Your edit lock ended. Your draft is still here.");
          lease = { ...current, ...status.lock, revision: status.revision };
          update({ lease, lock: status.lock, access: status.access, error: "" });
          return lease;
        } catch (error) {
          // Retain the secret for sign-in recovery or an uncertain response.
          report(error);
          throw error;
        }
      })().finally(() => { renewing = null; });
      return renewing;
    };
    const start = () => {
      if (inFlight) return inFlight;
      if (releaseRequested) return Promise.reject(new ApiError(423, "Confirm the previous lock was released before starting another edit session."));
      inFlight = (async () => {
        update({ pending: true, error: "", notice: "" });
        try {
          if (lease) {
            try { await renew(); }
            catch (error) { if (!(error instanceof ApiError) || error.status !== 423) throw error; lease = null; }
          }
          if (!lease) lease = await api<EditLease>(path, "POST", {});
          if (disposed) { releaseOnLeave(lease); lease = null; return; }
          await callback.current(lease.revision);
          lastActivity = Date.now();
          update({ lease, lock: lease, pending: false, error: "" });
        } catch (error) { report(error); throw error; }
      })().finally(() => { inFlight = null; void poll(); });
      return inFlight;
    };
    const stop = (idle = false) => {
      if (inFlight) return inFlight;
      releaseRequested = true;
      update({ stopping: true, releaseUncertain: false, error: "", notice: "" });
      inFlight = (async () => {
        try {
          // A renewal already sent may finish, but no new renewal starts once
          // releaseRequested is set. Release only after it finishes.
          await renewing?.catch(() => {});
          const current = lease;
          let failure: unknown;
          if (current) {
            try { await api(path, "DELETE", { lockToken: current.lockToken }); }
            catch (error) { failure = error; }
          }
          const status = await api<Status>(path);
          if (current && status.lock?.leaseId === current.leaseId) throw failure || new Error("The server still reports this tab's edit lock.");
          lease = null;
          releaseRequested = false;
          update({ lease: null, lock: status.lock, access: status.access, stopping: false, releaseUncertain: false, error: "", notice: idle ? "Editing stopped after five minutes of inactivity. Start editing to make changes." : "Editing stopped. Your draft stays in this tab; other sessions can now edit." });
        } catch {
          const error = new Error("Release not confirmed. This tab may still hold the lock. Check your connection and retry release; your draft is preserved.");
          update({ stopping: false, releaseUncertain: true, error: error.message });
          throw error;
        }
      })().finally(() => { inFlight = null; });
      return inFlight;
    };
    controls.current = { start, stop: () => stop(), renew };
    setState({ ...initialState, documentId: id, pending: editing });
    if (editing) void start().catch(() => {});
    else void poll();
    const statusTimer = setInterval(() => void poll(), 5000);
    const renewalTimer = setInterval(() => {
      if (!lease || !editing || releaseRequested || inFlight || renewing) return;
      if (!unsaved.current && Date.now() - lastActivity >= 300_000) void stop(true).catch(() => {});
      else void renew().catch(() => {});
    }, 60_000);
    const activity = () => { lastActivity = Date.now(); };
    const check = () => { if (!document.hidden) void poll(); };
    const leave = () => { if (lease) releaseOnLeave(lease); };
    window.addEventListener("pointerdown", activity, true);
    window.addEventListener("keydown", activity, true);
    window.addEventListener("input", activity, true);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", check);
    return () => {
      disposed = true;
      controls.current = null;
      clearInterval(statusTimer); clearInterval(renewalTimer);
      window.removeEventListener("pointerdown", activity, true);
      window.removeEventListener("keydown", activity, true);
      window.removeEventListener("input", activity, true);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", check);
      if (lease) releaseOnLeave(lease);
    };
  }, [id, editing]);
  return {
    ...state,
    canWrite: editing && state.documentId === id && Boolean(state.lease && state.lease.expiresAt > Date.now() / 1000) && !state.pending && !state.stopping && !state.releaseUncertain && !state.error,
    start: () => controls.current?.start() ?? Promise.reject(new ApiError(423, "Open the editor first")),
    stop: () => controls.current?.stop() ?? Promise.reject(new ApiError(423, "Open the editor first")),
    renew: () => controls.current?.renew() ?? Promise.reject(new ApiError(423, "Open the editor first")),
  };
}
