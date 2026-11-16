import type { Env, MediaBucket } from "./platform.ts";
import { HttpError } from "./content.ts";
import { readBody } from "./request.ts";

// Keep Supabase credentials and object URLs behind the authenticated media gateway.
export function mediaBucket(env: Env): MediaBucket | undefined {
  const { SUPABASE_URL: project, SUPABASE_SECRET_KEY: secret, SUPABASE_STORAGE_BUCKET: bucket } = env;
  if (project === undefined && secret === undefined && bucket === undefined) return env.MEDIA;
  if (!project || !secret || !bucket) throw new HttpError(503, "Set SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_STORAGE_BUCKET to enable media storage");
  let origin: URL;
  try { origin = new URL(project); }
  catch { throw new HttpError(503, "SUPABASE_URL must be an HTTPS project URL"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)
    throw new HttpError(503, "SUPABASE_URL must be an HTTPS project URL without a path, query or credentials");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(bucket) || /[\r\n]/.test(secret)) throw new HttpError(503, "Invalid Supabase storage configuration");

  const base = `${origin.origin}/storage/v1/object/${encodeURIComponent(bucket)}`;
  const objectUrl = (key: string) => {
    const parts = key.split("/");
    if (parts.some(part => !part || part === "." || part === "..")) throw new Error("Invalid media key");
    return `${base}/${parts.map(encodeURIComponent).join("/")}`;
  };
  const unavailable = () => new HttpError(503, "Media storage is unavailable. Check the Supabase project, bucket and server key.");
  const request = async (url: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("apikey", secret);
    try {
      // Workers supports manual/follow only. Inspect 3xx responses without forwarding the key.
      return await fetch(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    } catch { throw unavailable(); }
  };
  const discard = async (response: Response) => { await response.body?.cancel(); };
  return {
    async put(key, bytes, options) {
      const response = await request(objectUrl(key), {
        method: "POST", headers: { "Content-Type": options.httpMetadata.contentType, "x-upsert": "false", "Cache-Control": "no-store" }, body: bytes.slice().buffer,
      });
      await discard(response);
      if (!response.ok) throw unavailable();
    },
    async get(key, options) {
      const range = options?.range;
      const response = await request(objectUrl(key), { headers: range ? { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` } : {} });
      if (response.status === 404) { await discard(response); return null; }
      if (response.status === 400) {
        // Older Storage versions report a missing object as HTTP 400 / statusCode 404.
        try {
          const error = JSON.parse(new TextDecoder().decode(await readBody(response, 16_384)));
          if (error.code === "NoSuchKey" || String(error.statusCode) === "404") return null;
        } catch { /* Provider details must never reach the client. */ }
        throw unavailable();
      }
      const length = Number(response.headers.get("Content-Length"));
      const contentRange = response.headers.get("Content-Range")?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      const size = range ? Number(contentRange?.[3]) : length;
      if (response.status !== (range ? 206 : 200) || !response.body || !Number.isSafeInteger(size) || size < 1 ||
        (range && (!contentRange || Number(contentRange[1]) !== range.offset || Number(contentRange[2]) !== range.offset + range.length - 1 || length !== range.length || size < range.offset + range.length))) {
        await discard(response);
        throw unavailable();
      }
      return { body: response.body, size };
    },
    async delete(key) {
      objectUrl(key); // Validate the same key shape used for uploads and reads.
      const response = await request(base, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [key] }) });
      await discard(response);
      if (!response.ok) throw unavailable();
    },
  };
}
