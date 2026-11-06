import { useEffect, useState } from "react";
import { api } from "./api";
import { Button } from "@/components/ui/button";

import type { Collaborator } from "../agent-client";
import { AgentIdentity } from "./AgentIdentity";

type Sharing = { members: Collaborator[]; invitations: { id: string; role: string; recipientEmail: string | null; expiresAt: number }[]; emailInvitationsAvailable: boolean };

export function Collaborators({ documentId }: { documentId: string }) {
  const [data, setData] = useState<Sharing | null>(null), [role, setRole] = useState("editor"), [url, setUrl] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [copied, setCopied] = useState(false);
  const [email, setEmail] = useState(""), [notice, setNotice] = useState("");
  const path = `/documents/${documentId}/access`;
  useEffect(() => {
    const controller = new AbortController();
    void api<Sharing>(path, "GET", undefined, controller.signal).then(setData).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [path]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await action(); setData(await api(path)); }
    catch (error) { setError(error instanceof Error ? error.message : "Cannot update access"); }
    finally { setBusy(false); }
  };
  return <section className="collaborators" aria-label="Collaborator access">
    <h3>People with access</h3>
    <p>Invite a signed-in user to this draft. Their connected agents receive the same document access. Editors take turns using an edit lock.</p>
    {data?.members.map(member => <div className="collaborator-row" key={member.accountId}>
      <span>{member.name}<span className="collaborator-agents">{member.agents.map(agent => <AgentIdentity key={agent.name} agent={agent} />)}</span></span>
      {member.role === "owner" ? <small>Owner</small> : <>
        <select aria-label={`Access for ${member.name}`} disabled={busy} value={member.role} onChange={event => void run(async () => { await api(path, "PATCH", { accountId: member.accountId, role: event.target.value }); })}><option value="editor">Editor · read and write</option><option value="viewer">Viewer · read only</option></select>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(async () => { await api(path, "DELETE", { accountId: member.accountId }); })}>Remove</Button>
      </>}
    </div>)}
    <form className="collaborator-invite" onSubmit={event => { event.preventDefault(); void run(async () => {
      const recipient = email.trim();
      const invite = await api<{ url: string; recipientEmail: string | null; emailDelivery?: { status: string } }>(path, "POST", { role, ...(recipient ? { email: recipient } : {}) });
      setUrl(invite.url); setCopied(false);
      if (invite.emailDelivery?.status === "accepted") setNotice(`Invitation submitted for delivery to ${invite.recipientEmail}. They must sign in with that email address to accept.`);
    }); }}>
      {data?.emailInvitationsAvailable && <label>Email address (optional)<input type="email" aria-label="Invitation email address" autoComplete="email" placeholder="teammate@example.com" maxLength={254} value={email} disabled={busy} onChange={event => setEmail(event.target.value)} /></label>}
      <div className="collaborator-row">
        <select aria-label="Invitation access" value={role} disabled={busy} onChange={event => setRole(event.target.value)}><option value="editor">Editor · read and write</option><option value="viewer">Viewer · read only</option></select>
        <Button type="submit" variant="outline" size="sm" disabled={busy || !data}>{busy ? "Working…" : email.trim() ? "Send invitation" : "Create invitation link"}</Button>
      </div>
    </form>
    <p className="share-note">Invitations expire after 24 hours and work once. Emailed invitations can only be accepted with the recipient’s email address. Other invitation links grant access to the first signed-in account that accepts them; share them privately.</p>
    {data && !data.emailInvitationsAvailable && <p className="share-note">Email delivery is not set up for this server. Create an invitation link and share it privately.</p>}
    {notice && <p role="status">{notice}</p>}
    {url && <div className="invitation-link"><label>Invitation link<input aria-label="Invitation link" readOnly value={url} onFocus={event => event.target.select()} /></label><Button variant="outline" size="sm" disabled={busy} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setError("Select the invitation link and copy it manually."); } }}>{copied ? "Invitation copied" : "Copy invitation"}</Button></div>}
    {data?.invitations.map(invite => <div className="collaborator-row" key={invite.id}><small>{invite.recipientEmail || "Private link"} · {invite.role} · expires {new Date(invite.expiresAt * 1000).toLocaleString()}</small><Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(async () => { await api(`/documents/${documentId}/invitations/${invite.id}`, "DELETE"); setUrl(""); })}>Revoke invitation</Button></div>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function AcceptInvitation({ token, onAccepted, onDismiss }: { token: string; onAccepted: (id: string) => Promise<void>; onDismiss: () => void }) {
  const [invite, setInvite] = useState<{ title: string; role: string; recipientEmail: string | null } | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ title: string; role: string; recipientEmail: string | null }>(`/invitations/${token}`, "GET", undefined, controller.signal).then(setInvite).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [token]);
  return <section className="invitation-card"><h1>{invite ? `Join “${invite.title}”` : "Document invitation"}</h1><p>{invite ? `You have been invited as an ${invite.role}. Your connected agents will inherit this access.` : "Checking invitation…"}</p>
    {invite?.recipientEmail && <p>Accept using your {invite.recipientEmail} account.</p>}
    {error && <p role="alert">{error}</p>}
    <div><Button variant="outline" disabled={busy} onClick={onDismiss}>Dismiss</Button><Button disabled={busy || !invite} onClick={async () => { setBusy(true); setError(""); try { const accepted = await api<{ documentId: string }>(`/invitations/${token}`, "POST", {}); await onAccepted(accepted.documentId); } catch (error) { setError(error instanceof Error ? error.message : "Cannot accept invitation"); } finally { setBusy(false); } }}>Accept invitation</Button></div>
  </section>;
}
