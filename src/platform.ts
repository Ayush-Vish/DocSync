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
export interface Env {
  DB: Database;
  OWNER_KEY_HASH: string;
  SESSION_SECRET: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
