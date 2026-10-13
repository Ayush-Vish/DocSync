# DocSync MCP

A local stdio bridge for any MCP-compatible coding agent. Node 22.18 or newer is required. Your agent generates the HTML; your DocSync deployment stores and shares it. No model API key is needed by this package.

Package: `@ayush-vish/docsync-mcp`. Source: https://github.com/Ayush-Vish/DocSync. There is no public DocSync backend bundled with this package: replace the example URL with your deployment.

```json
{"mcpServers":{"docsync":{"command":"npx","args":["-y","@ayush-vish/docsync-mcp","--url","https://your-docsync.example"]}}}
```

Antigravity CLI:

```sh
agy mcp add docsync npx -y @ayush-vish/docsync-mcp --url https://your-docsync.example
```

For a local package before publishing, use `node /absolute/path/to/docsync-mcp.cjs --url http://127.0.0.1:8788` as the command instead.

The bridge stores a random private installation credential under `~/.config/docsync/servers/`, separately for each server origin. The backend permits one document per installation, including edits and publication. This is a convenience trial, not hardware identification: deleting the profile can create another installation. Server-side rate limits reduce casual abuse.

Ask your agent: “Use DocSync to make a report from these facts and return its link.” On the next document, ask it to call `connect_account`. Open the link, sign up or sign in, and explicitly claim your trial document. Generate a token from Connect agent. Import it outside the agent conversation:

```sh
npx @ayush-vish/docsync-mcp login --url https://your-docsync.example --token-stdin < /path/to/private-token-file
```

The file contains only the token. Use a file with mode 600, then delete it after login. You can also pipe securely from a password manager. Never put tokens in chat or command arguments. Restart your agent after login. If you previously set `DOCSYNC_AGENT_TOKEN` or `DOCSYNC_CONNECTION_FILE`, remove those overrides to use the saved account profile.

Environment overrides: `DOCSYNC_URL`, `DOCSYNC_AGENT_TOKEN`, `DOCSYNC_CONNECTION_FILE` (private dotenv file), `DOCSYNC_CONFIG_DIR` (private per-server profile directory). Explicit credentials take precedence. Credentials are sent only to the configured origin; redirects are rejected. Localhost links work only on the machine hosting DocSync.

Tools: `get_connection`, `connect_account`, `list_documents`, `get_document`, `create_document`, `update_document`, `publish_document`.
