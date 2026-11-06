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
// The small R2-compatible seam also supports the local filesystem and tests.
export interface MediaBucket {
  put(key: string, body: Uint8Array, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string, options?: { range?: { offset: number; length: number } }): Promise<{ body: ReadableStream<Uint8Array>; size: number } | null>;
  delete(key: string): Promise<void>;
}
export interface Env {
  DB: Database;
  MEDIA?: MediaBucket;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  OWNER_KEY_HASH: string;
  SESSION_SECRET: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
