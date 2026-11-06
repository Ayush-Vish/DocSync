import type { Env, Database } from "./platform.ts";
import type { Content } from "./document.ts";
import type { Principal } from "./auth.ts";
import { authenticate, hash, signature, verifySignature } from "./auth.ts";
import { access, editableDocument } from "./collaboration.ts";
import { HttpError } from "./content.ts";
import { mediaReferences } from "./media-url.ts";

import { maxMediaBytes } from "./media-config.ts";
type Asset = { id: string; document_id: string; filename: string; content_type: string; byte_size: number; storage_key: string; status: string };
type Grant = { documentId: string; expires: number; accountId?: string; publication?: string; revision?: number };

export async function mediaGrant(env: Env, documentId: string, scope: { accountId: string } | { publication: string; revision: number }) {
  const payload = btoa(JSON.stringify({ documentId, ...scope, expires: Math.floor(Date.now() / 1000) + 86400 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${payload}.${await signature(env.SESSION_SECRET, `media:${payload}`)}`;
}
async function readGrant(env: Env, value: string): Promise<Grant> {
  const match = value.match(/^([A-Za-z0-9_-]{1,900})\.([a-f0-9]{64})$/);
  if (!match || !await verifySignature(env.SESSION_SECRET, `media:${match[1]}`, match[2])) throw new HttpError(403, "Media access expired or invalid");
  let grant: Grant;
  try { grant = JSON.parse(atob(match[1].replace(/-/g, "+").replace(/_/g, "/"))); }
  catch { throw new HttpError(403, "Invalid media access"); }
  if (!grant || typeof grant.documentId !== "string" || !Number.isSafeInteger(grant.expires) || grant.expires <= Date.now() / 1000 || Boolean(grant.accountId) === Boolean(grant.publication)) throw new HttpError(403, "Media access expired or invalid");
  return grant;
}

function sniff(bytes: Uint8Array): string | null {
  const text = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, i) => value === [137, 80, 78, 71, 13, 10, 26, 10][i])) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (["GIF87a", "GIF89a"].includes(text(0, 6))) return "image/gif";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && text(4, 8) === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && bytes.slice(0, 4).every((value, i) => value === [26, 69, 223, 163][i])) return "video/webm";
  return null;
}
function result(asset: Asset, origin: string) {
  const src = `/media/${asset.id}`;
  return { id: asset.id, documentId: asset.document_id, filename: asset.filename, mimeType: asset.content_type, size: asset.byte_size, url: `${origin}${src}`, src,
    html: asset.content_type.startsWith("image/") ? `<img src="${src}" alt="" loading="lazy">` : `<video src="${src}" controls playsinline preload="metadata"></video>` };
}
export async function uploadMedia(env: Env, principal: Principal, documentId: string, filename: string, contentType: string, bytes: Uint8Array, origin: string) {
  await access(env.DB, documentId, principal.accountId, "editor");
  if (!env.MEDIA) throw new HttpError(503, "Media storage is not configured");
  if (!bytes.byteLength || bytes.byteLength > maxMediaBytes) throw new HttpError(413, "Media must contain 1 byte to 8 MiB");
  if (!filename || filename.length > 160 || /[\x00-\x1f\x7f/\\]/.test(filename)) throw new HttpError(400, "Use a filename of 1–160 characters without a path");
  const detected = sniff(bytes);
  if (!detected || detected !== contentType) throw new HttpError(415, "File bytes must match PNG, JPEG, GIF, WebP, MP4, or WebM content type");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)), value => value.toString(16).padStart(2, "0")).join("");
  const id = crypto.randomUUID(), key = `${documentId}/${id}`;
  const inserted = await env.DB.prepare(`INSERT OR IGNORE INTO media_assets(id,document_id,uploaded_by,filename,content_type,byte_size,digest,storage_key,status,created_at)
    SELECT ?,d.id,?,?,?,?,?,?,'pending',? FROM documents d WHERE d.id=? AND ${editableDocument}
    AND (SELECT COUNT(*) FROM media_assets WHERE document_id=d.id)<50 AND (SELECT COALESCE(SUM(byte_size),0) FROM media_assets WHERE document_id=d.id)+?<=104857600`)
    .bind(id, principal.accountId, filename, contentType, bytes.byteLength, digest, key, new Date().toISOString(), documentId, principal.accountId, principal.accountId, bytes.byteLength).run();
  if (!inserted.meta.changes) {
    await access(env.DB, documentId, principal.accountId, "editor");
    const previous = await env.DB.prepare("SELECT * FROM media_assets WHERE document_id=? AND digest=?").bind(documentId, digest).first<Asset>();
    if (previous?.status === "ready") return result(previous, origin);
    if (previous) throw new HttpError(409, "This file is already uploading. Wait before checking it again.");
    throw new HttpError(413, "Document media limit reached: 50 files or 100 MiB");
  }
  try {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType } });
    const ready = await env.DB.prepare(`UPDATE media_assets SET status='ready' WHERE id=? AND EXISTS(SELECT 1 FROM documents d WHERE d.id=media_assets.document_id AND ${editableDocument})`).bind(id, principal.accountId, principal.accountId).run();
    if (!ready.meta.changes) throw new HttpError(403, "Edit access changed during upload");
    return result({ id, document_id: documentId, filename, content_type: contentType, byte_size: bytes.byteLength, storage_key: key, status: "ready" }, origin);
  } catch (error) {
    // A failed cleanup retains its quota reservation and remains unservable.
    try { await env.MEDIA.delete(key); await env.DB.prepare("DELETE FROM media_assets WHERE id=? AND status='pending'").bind(id).run(); } catch {}
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, "Media upload failed. No embeddable link was created.");
  }
}

export async function validateMedia(db: Database, documentId: string | null, content: Content) {
  const refs = content.sections.flatMap(section => mediaReferences(section.html));
  if (!refs.length) return;
  if (!documentId) throw new HttpError(400, "Create the draft first, upload media to it, then update its HTML");
  const assets = await db.prepare("SELECT id,content_type FROM media_assets WHERE document_id=? AND status='ready'").bind(documentId).all<{ id: string; content_type: string }>();
  for (const ref of refs) if (!assets.results.some(asset => asset.id === ref.id && asset.content_type.startsWith(`${ref.kind}/`))) throw new HttpError(400, "Media must be uploaded to this document and match the HTML media element");
  if (content.sections.some(section => section.kind === "text" && mediaReferences(section.html).length)) throw new HttpError(400, "Use kind html for pages containing images or video");
}

export async function serveMedia(request: Request, env: Env, id: string) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(503, "Server credentials are not configured");
  if (!["GET", "HEAD"].includes(request.method)) throw new HttpError(405, "Media links support GET and HEAD");
  const asset = await env.DB.prepare("SELECT * FROM media_assets WHERE id=? AND status='ready'").bind(id).first<Asset>();
  if (!asset) throw new HttpError(404, "Media not found");
  const token = new URL(request.url).searchParams.get("access");
  if (token) {
    const grant = await readGrant(env, token);
    if (grant.documentId !== asset.document_id) throw new HttpError(403, "Media belongs to another document");
    if (grant.accountId) await access(env.DB, asset.document_id, grant.accountId);
    else {
      const published = await env.DB.prepare("SELECT r.content FROM publications p JOIN revisions r ON r.document_id=p.document_id AND r.revision=p.revision WHERE p.document_id=? AND p.revision=? AND p.token_hash=?")
        .bind(asset.document_id, grant.revision, grant.publication).first<{ content: string }>();
      if (!published || !(JSON.parse(published.content) as Content).sections.some(section => mediaReferences(section.html).some(ref => ref.id === id))) throw new HttpError(403, "Media is not in this published version");
    }
  } else await access(env.DB, asset.document_id, (await authenticate(request, env)).accountId);
  if (!env.MEDIA) throw new HttpError(503, "Media storage is not configured");
  const headers = new Headers({ "Content-Type": asset.content_type, "Accept-Ranges": "bytes", "Content-Length": String(asset.byte_size), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}` });
  let range: { offset: number; length: number } | undefined;
  const input = request.method === "GET" ? request.headers.get("Range") : null;
  if (input) {
    const match = input.match(/^bytes=(\d*)-(\d*)$/);
    const start = match?.[1] ? Number(match[1]) : Math.max(0, asset.byte_size - Number(match?.[2]));
    const end = match?.[1] && match[2] ? Math.min(asset.byte_size - 1, Number(match[2])) : asset.byte_size - 1;
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= asset.byte_size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.byte_size}` } });
    range = { offset: start, length: end - start + 1 };
    headers.set("Content-Range", `bytes ${start}-${end}/${asset.byte_size}`); headers.set("Content-Length", String(range.length));
  }
  if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers });
  const object = await env.MEDIA.get(asset.storage_key, range ? { range } : undefined);
  if (!object) throw new HttpError(404, "Media file not found");
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
