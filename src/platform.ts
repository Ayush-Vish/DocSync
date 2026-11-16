import type { CloudflareBindings } from "./cloudflare-env";

export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): Statement;
  batch(statements: Statement[]): Promise<{ meta: { changes: number } }[]>;
}
// Shared by Supabase, R2, the local filesystem and tests.
export interface MediaBucket {
  put(key: string, body: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
  delete(key: string): Promise<void>;
}
export interface Env {
  DB: Database;
  MEDIA?: MediaBucket;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_STORAGE_BUCKET?: string;
  EMAIL?: Pick<CloudflareBindings["EMAIL"], "send">;
  DOCSYNC_EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OWNER_KEY_HASH: string;
  SESSION_SECRET: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
