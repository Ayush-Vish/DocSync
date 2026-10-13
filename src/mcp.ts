import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, validateMcpConnection } from "./mcp-server.ts";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  renameSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "DocSync MCP\n  docsync-mcp --url https://your-docsync.example\n  docsync-mcp login --url https://your-docsync.example --token-stdin\n\nThe first document is free per installation. Sign in on the web to create more.\nSet DOCSYNC_CONFIG_DIR to choose a private profile directory.",
    );
    return;
  }
  const index = args.indexOf("--url"),
    explicit = index >= 0 ? args[index + 1] : undefined;
  if (index >= 0 && !explicit)
    throw new Error("--url requires a server origin");
  if (!explicit && !process.env.DOCSYNC_AGENT_TOKEN) {
    const file =
      process.env.DOCSYNC_CONNECTION_FILE ||
      join(homedir(), ".config", "docsync", "connection.env");
    if (existsSync(file)) process.loadEnvFile(file);
  } else if (
    process.env.DOCSYNC_CONNECTION_FILE &&
    !process.env.DOCSYNC_AGENT_TOKEN
  )
    process.loadEnvFile(process.env.DOCSYNC_CONNECTION_FILE);
  const origin = explicit || process.env.DOCSYNC_URL;
  if (!origin) throw new Error("Pass --url with your deployed DocSync origin");
  // Validate the origin before sending any credentials, including bootstrap.
  const url = validateMcpConnection(origin, "0".repeat(64));
  if (
    explicit &&
    process.env.DOCSYNC_AGENT_TOKEN &&
    process.env.DOCSYNC_URL &&
    new URL(process.env.DOCSYNC_URL).origin !== url.origin
  )
    throw new Error(
      "Explicit server differs from the credential profile. Remove the old profile environment before connecting.",
    );
  const directory =
    process.env.DOCSYNC_CONFIG_DIR ||
    join(homedir(), ".config", "docsync", "servers");
  const file = join(
    directory,
    createHash("sha256").update(url.origin).digest("hex") + ".json",
  );
  const save = (value: unknown, exclusive = false) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    if (exclusive)
      writeFileSync(file, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    else {
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
      renameSync(temp, file);
    }
    chmodSync(file, 0o600);
  };
  if (args[0] === "login") {
    if (!args.includes("--token-stdin"))
      throw new Error(
        "Use --token-stdin; paste the web token through stdin, never in command arguments.",
      );
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 512) throw new Error("Token input too large");
    }
    const token = input.trim();
    validateMcpConnection(url.origin, token);
    const response = await fetch(new URL("/api/connection", url), {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(
        "Token could not be verified. Check the server and token.",
      );
    const connection = (await response.json()) as { trial: boolean };
    if (connection.trial)
      throw new Error("Use a token generated from your signed-in web account.");
    save({ token, trial: false });
    console.log("Account token saved. Restart your MCP client.");
    return;
  }
  let token = process.env.DOCSYNC_AGENT_TOKEN;
  if (!token) {
    if (!existsSync(file)) {
      try {
        save({ token: randomBytes(32).toString("hex"), trial: true }, true);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    const profile = JSON.parse(readFileSync(file, "utf8")) as {
      token: string;
      trial: boolean;
    };
    token = profile.token;
    validateMcpConnection(url.origin, token);
    if (profile.trial) {
      const response = await fetch(new URL("/api/installations", url), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: token }),
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          `Cannot register installation (${response.status}). Check the server or try again later.`,
        );
    }
  }
  await createMcpServer(url.origin, token).connect(new StdioServerTransport());
}
void main().catch((error) => {
  console.error(
    `DocSync could not start: ${error instanceof Error ? error.message : "Unknown error"}`,
  );
  process.exitCode = 1;
});
