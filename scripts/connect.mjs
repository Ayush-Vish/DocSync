import { readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { validateMcpConnection } from '../src/mcp-server.ts';

const source = process.argv[2];
if (!source) throw new Error('Provide the path to a private file containing DOCSYNC_URL and DOCSYNC_AGENT_TOKEN. Tokens should not be passed on the command line.');
const config = parseEnv(readFileSync(resolve(source), 'utf8'));
const url = validateMcpConnection(config.DOCSYNC_URL || '', config.DOCSYNC_AGENT_TOKEN || '');
const destination = process.env.DOCSYNC_CONNECTION_FILE || join(homedir(), '.config', 'docsync', 'connection.env');
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
const temporary = `${destination}.${process.pid}.tmp`;
writeFileSync(temporary, `DOCSYNC_URL=${url.origin}\nDOCSYNC_AGENT_TOKEN=${config.DOCSYNC_AGENT_TOKEN}\n`, { mode: 0o600, flag: 'wx' });
renameSync(temporary, destination); chmodSync(destination, 0o600);
console.log(`DocSync connection saved to ${destination}. Restart your MCP-compatible coding agent after adding DocSync. No credentials were printed.`);
