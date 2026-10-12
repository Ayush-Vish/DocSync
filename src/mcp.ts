import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp-server.ts';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

async function main() {
  if (!process.env.DOCSYNC_AGENT_TOKEN) {
    const file = process.env.DOCSYNC_CONNECTION_FILE || join(homedir(), '.config', 'docsync', 'connection.env');
    if (existsSync(file)) process.loadEnvFile(file);
  }
  await createMcpServer(process.env.DOCSYNC_URL || 'http://127.0.0.1:8787', process.env.DOCSYNC_AGENT_TOKEN || '').connect(new StdioServerTransport());
}
void main().catch(error => {
  console.error(`DocSync could not start: ${error instanceof Error ? error.message : 'Unknown error'}. Configure the MCP connection as described in README.md.`);
  process.exitCode = 1;
});
