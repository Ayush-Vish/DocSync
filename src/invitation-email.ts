import type { Env } from "./platform.ts";
import { HttpError } from "./content.ts";
import { rateLimit } from "./accounts.ts";
import { access, invite } from "./collaboration.ts";

function emailAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email) ? email : null;
}

export function invitationEmailAvailable(env: Env): boolean {
  return Boolean(env.EMAIL && emailAddress(env.DOCSYNC_EMAIL_FROM));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function inviteByEmail(request: Request, env: Env, id: string, accountId: string, role: unknown, email: unknown) {
  await access(env.DB, id, accountId, "owner");
  const recipient = emailAddress(email);
  if (!recipient) throw new HttpError(400, "Enter one valid recipient email address");
  const from = emailAddress(env.DOCSYNC_EMAIL_FROM);
  if (!env.EMAIL || !from) throw new HttpError(503, "Email invitations are not configured. The server owner must configure Email Sending and DOCSYNC_EMAIL_FROM. You can still create a private invitation link.", { code: "EMAIL_NOT_CONFIGURED" });
  const document = await env.DB.prepare("SELECT d.title,a.kind FROM documents d JOIN accounts a ON a.id=d.account_id WHERE d.id=? AND d.account_id=?").bind(id, accountId).first<{ title: string; kind: string }>();
  if (!document) throw new HttpError(404, "Document not found");
  if (document.kind === "trial") throw new HttpError(403, "Sign in and claim your document before sending email invitations", { code: "AUTH_REQUIRED" });
  // Account-wide limits survive invitation revocation and changes of client/IP.
  await rateLimit(request, env, "invitation-email", 10, 3600, accountId);
  const invitation = await invite(env.DB, id, accountId, role, new URL(request.url).origin, recipient);
  const permission = invitation.role === "editor" ? "read and edit" : "read only";
  try {
    const delivery = await env.EMAIL.send({
      from: { email: from, name: "DocSync" },
      to: recipient,
      subject: "You are invited to collaborate in DocSync",
      text: `You have been invited to “${document.title}” with ${permission} access.\n\nSign in as ${recipient} and accept this invitation:\n${invitation.url}\n\nThis private link expires in 24 hours and works once. Your connected agents receive the same access. If you did not expect this invitation, ignore it.`,
      html: `<h1>Join your team in DocSync</h1><p>You have been invited to <strong>${escapeHtml(document.title)}</strong> with ${permission} access.</p><p>Sign in as ${escapeHtml(recipient)} and <a href="${escapeHtml(invitation.url)}">accept your invitation</a>.</p><p>This private link expires in 24 hours and works once. Your connected agents receive the same access. If you did not expect this invitation, ignore it.</p>`,
    });
    return { ...invitation, emailDelivery: { status: "accepted" as const, messageId: delivery.messageId } };
  } catch {
    // Delivery may be uncertain. Revoke the secret so even a late email cannot grant access.
    await env.DB.prepare("DELETE FROM document_invitations WHERE id=? AND document_id=?").bind(invitation.id, id).run();
    throw new HttpError(502, "Email delivery could not be confirmed. This invitation was revoked. Check Email Sending configuration before creating a new invitation.", { code: "EMAIL_SEND_FAILED" });
  }
}
