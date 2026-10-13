import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { handle } from "../src/worker.ts";
import { sqliteDatabase } from "./sqlite.ts";

if (!existsSync(".local/config.json"))
  throw new Error("Run npm run setup first.");
if (!existsSync("dist/public/index.html"))
  throw new Error("Run npm run build first.");
const config = JSON.parse(readFileSync(".local/config.json", "utf8"));
const database = sqliteDatabase(".local/docsync.sqlite");
database.migrate();
const port = Number(process.env.PORT || 8787);
const assets = {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    const root = resolve("dist/public");
    const candidate = resolve(root, "." + path);
    const file =
      candidate.startsWith(root + "/") &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
        ? candidate
        : path === "/" || path === "/connect" || path.startsWith("/share/")
          ? resolve(root, "index.html")
          : null;
    if (!file) return new Response("Not found", { status: 404 });
    const extension = file.split(".").pop() || "";
    const types: Record<string, string> = {
      html: "text/html; charset=utf-8",
      js: "text/javascript",
      css: "text/css",
      svg: "image/svg+xml",
      cjs: "application/octet-stream",
    };
    return new Response(request.method === "HEAD" ? null : readFileSync(file), {
      headers: {
        "Content-Type": types[extension] || "application/octet-stream",
      },
    });
  },
};
const server = createServer(async (incoming, outgoing) => {
  try {
    if (
      ![
        `127.0.0.1:${port}`,
        `localhost:${port}`,
        "localhost:5173",
        "127.0.0.1:5173",
      ].includes(incoming.headers.host || "")
    ) {
      outgoing.writeHead(403);
      outgoing.end("Invalid host");
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 550_000) {
        outgoing.writeHead(413);
        outgoing.end("Request too large");
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers))
      if (value !== undefined)
        headers.set(key, Array.isArray(value) ? value.join(",") : value);
    const method = incoming.method || "GET";
    const request = new Request(
      `http://${incoming.headers.host}${incoming.url}`,
      {
        method,
        headers,
        ...(["GET", "HEAD"].includes(method)
          ? {}
          : { body: Buffer.concat(chunks) }),
      },
    );
    const response = await handle(request, {
      ...config,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || config.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET:
        process.env.GOOGLE_CLIENT_SECRET || config.GOOGLE_CLIENT_SECRET,
      DB: database.db,
      ASSETS: assets,
    });
    const responseHeaders = Object.fromEntries(
      [...response.headers].filter(([key]) => key !== "set-cookie"),
    );
    const cookies = response.headers.getSetCookie();
    if (cookies.length) outgoing.setHeader("Set-Cookie", cookies);
    outgoing.writeHead(response.status, responseHeaders);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500);
    outgoing.end("Local server error");
  }
});
server.on("error", (error) => {
  console.error(`Cannot start local server: ${error.message}`);
  database.close();
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () =>
  console.log(`DocSync running at http://127.0.0.1:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      database.close();
      process.exit(0);
    }),
  );
