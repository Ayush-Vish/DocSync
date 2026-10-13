import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import type { Database, Statement } from "../src/platform.ts";

export function sqliteDatabase(path: string) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec(
    "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;",
  );
  type LocalStatement = Statement & {
    execute(): { meta: { changes: number } };
  };
  function statement(sql: string, values: unknown[] = []): LocalStatement {
    const execute = () => ({
      meta: {
        changes: Number(sqlite.prepare(sql).run(...(values as any[])).changes),
      },
    });
    return {
      execute,
      bind: (...params) => statement(sql, params),
      first: async <T>() =>
        (sqlite.prepare(sql).get(...(values as any[])) as T | undefined) ??
        null,
      all: async <T>() => ({
        results: sqlite.prepare(sql).all(...(values as any[])) as T[],
      }),
      run: async () => execute(),
    };
  }
  const db: Database = {
    prepare: statement,
    batch: async (statements) => {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const s of statements)
          results.push((s as LocalStatement).execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  function migrate(directory = "migrations") {
    sqlite.exec(
      "CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY)",
    );
    for (const name of readdirSync(directory)
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      if (sqlite.prepare("SELECT name FROM _migrations WHERE name=?").get(name))
        continue;
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        sqlite.exec(readFileSync(`${directory}/${name}`, "utf8"));
        sqlite.prepare("INSERT INTO _migrations VALUES(?)").run(name);
        sqlite.exec("COMMIT");
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    }
  }
  return { db, sqlite, migrate, close: () => sqlite.close() };
}
