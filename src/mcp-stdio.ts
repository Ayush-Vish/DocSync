import { AsyncLocalStorage } from "node:async_hooks";
import { arch, hostname, platform } from "node:os";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isJSONRPCErrorResponse, isJSONRPCRequest, isJSONRPCResultResponse } from "@modelcontextprotocol/sdk/types.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer, mcpClientHeaders } from "./mcp-server.ts";
import { readMediaFile } from "./local-media.ts";

type LocalToolCall = {
  id: string | number;
  tool: string;
  started: number;
  documentId?: string;
  format?: string;
  apiRequestId?: string;
};

export function connectLocalMcp(origin: string, token: string) {
  // Each SDK request can overlap other calls on the same stdio connection.
  const calls = new AsyncLocalStorage<LocalToolCall>();
  const device = { deviceName: hostname(), platform: `${platform()} ${arch()}; Node ${process.version}` };
  const fetchTool: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    const call = calls.getStore();
    const requestId = response.headers.get("X-DocSync-Request-Id");
    if (call && requestId) call.apiRequestId = requestId;
    return response;
  };
  const server = createMcpServer(origin, token, fetchTool, readMediaFile, device);

  class AuditedStdioTransport extends StdioServerTransport {
    override start() {
      const receive = this.onmessage!;
      this.onmessage = message => {
        if (!isJSONRPCRequest(message) || message.method !== "tools/call") return receive(message);
        const { name, arguments: args } = (message.params ?? {}) as { name?: unknown; arguments?: Record<string, unknown> };
        calls.run({
          id: message.id,
          tool: typeof name === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(name) ? name : "invalid_tool_call",
          started: performance.now(),
          documentId: typeof args?.id === "string" && /^[a-f0-9-]{36}$/.test(args.id) ? args.id : undefined,
          format: typeof args?.format === "string" && ["all", "document", "presentation"].includes(args.format) ? args.format : undefined,
        }, () => receive(message));
      };
      return super.start();
    }

    override async send(message: JSONRPCMessage) {
      const call = calls.getStore();
      if (call && (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) && message.id === call.id) {
        // Stop the timer before reporting it, so audit delivery is outside tool time.
        const localDurationMs = Math.round(performance.now() - call.started);
        const event = call.apiRequestId ? { requestId: call.apiRequestId } : {
          tool: call.tool, failed: isJSONRPCErrorResponse(message) || message.result.isError === true,
          id: call.documentId, format: call.format,
        };
        try {
          const response = await fetch(new URL("/api/audit-events", origin), {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(2_000),
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
              ...mcpClientHeaders(server.server.getClientVersion(), device),
            },
            body: JSON.stringify({ ...event, localDurationMs }),
          });
          await response.body?.cancel();
          if (!response.ok) console.error("DocSync could not report local tool timing:", response.status);
        } catch {
          console.error("DocSync could not report local tool timing");
        }
      }
      await super.send(message);
    }
  }

  return server.connect(new AuditedStdioTransport());
}
