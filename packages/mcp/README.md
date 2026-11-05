# DocSync MCP

A local stdio bridge for MCP-compatible coding agents, including Codex, Claude Code, and Antigravity. Create, edit, and share HTML reports, interactive dashboards, and animated presentations. Your agent generates the content; your DocSync deployment stores revisions and serves the browser editor and presentation player. This package does not need a model API key.

Package: `@ayush-vish/docsync-mcp`. Source: https://github.com/Ayush-Vish/DocSync. The stdio bridge requires Node **22.18+** and a running DocSync backend. Replace the example origin with your deployment; the package does not bundle a backend.

Configure a stdio MCP client:

```json
{
  "mcpServers": {
    "docsync": {
      "command": "npx",
      "args": ["-y", "@ayush-vish/docsync-mcp", "--url", "https://your-docsync.example"]
    }
  }
}
```

Or configure your client from its CLI:

```sh
codex mcp add docsync -- npx -y @ayush-vish/docsync-mcp --url https://your-docsync.example
claude mcp add --scope user --transport stdio docsync -- npx -y @ayush-vish/docsync-mcp --url https://your-docsync.example
agy mcp add docsync npx -y @ayush-vish/docsync-mcp --url https://your-docsync.example
```

For a local package before publishing, use `node /absolute/path/to/docsync-mcp.cjs --url http://127.0.0.1:8788` as the command instead.

For clients with remote HTTP MCP and OAuth support, connect directly to your deployment's `/mcp` endpoint. This route does not require the npm bridge or a copied token:

```sh
codex mcp add docsync --url https://your-docsync.example/mcp
codex mcp login docsync
claude mcp add --transport http docsync https://your-docsync.example/mcp
agy mcp add --type http docsync https://your-docsync.example/mcp
```

Complete sign-in and approval in the browser. Publishing is a separate opt-in permission. Revoke remote client access from **Connect agent**. `connect_account` handles stdio trial claiming; it does not replace the remote OAuth flow.

Ask your agent to create a report or presentation from your facts. `get_template_options` returns the template gallery and each template's preview and content URLs. Choose Editorial Report, Technical Blueprint, Sales Dashboard, Bold Pitch, or Delivery Review, or ask for a custom design. Both presentation templates contain six slides. Preview them at `/templates` using **Present template**. Bundled Northstar figures are fictional examples; replace them with your information.

Each page or slide has independent **HTML, CSS, and optional JavaScript**. Set `format` to `document` or `presentation`, and provide ordered `pages` or `sections` with stable IDs. Use one of those array fields per request; reads return `sections`. Each item accepts `{id, kind?, html, css, js?}`. For example, pass this to `create_document`:

```json
{
  "title": "Project review",
  "format": "presentation",
  "pages": [
    {
      "id": "cover",
      "kind": "html",
      "html": "<article class=\"slide\"><h1>Project review</h1><p>Approved findings and next steps.</p></article>",
      "css": ".slide{height:100%;padding:64px;background:#122126;color:#f3f6ef;font:24px/1.5 system-ui}h1{font-size:76px;line-height:1.05}",
      "js": "if (!matchMedia('(prefers-reduced-motion: reduce)').matches) document.querySelector('h1').animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'translateY(0)'}],{duration:600,easing:'ease-out'});"
    },
    {
      "id": "next-steps",
      "kind": "html",
      "html": "<article class=\"slide\"><h2>Make the next move clear.</h2><p>Agree on owners and milestones.</p><button id=\"show-action\" type=\"button\">Show the action</button><output id=\"action\" aria-live=\"polite\"></output></article>",
      "css": ".slide{height:100%;padding:64px;background:#fcfaf5;color:#282f2b;font:24px/1.5 system-ui}h2{font-size:56px;line-height:1.1}button{padding:12px 20px;font:inherit}output{display:block;margin-top:20px}",
      "js": "document.getElementById('show-action').addEventListener('click', () => { document.getElementById('action').textContent = 'Confirm the owner of the next milestone.'; });"
    }
  ]
}
```

Author presentations against a **1280 × 720** canvas. The player scales the design for desktop and mobile, with fullscreen, keyboard and swipe navigation, slide overview, progress, and animation replay. **←/→**, **Space**, and **Page Up/Down** navigate; **Home/End** jump; **G** opens overview; **R** replays; **Esc** exits. Interactive controls keep their own behavior. Library cards show the first saved page or slide.

Animate with the Web Animations API, `requestAnimationFrame()`, or CSS `@keyframes`, and respect `prefers-reduced-motion`. Keep meaningful content in the initial HTML: cover, filmstrip, and overview previews never run scripts. Only the active slide runs in the player. Put executable code in `js` and attach handlers with `addEventListener`; HTML script tags and inline event attributes are removed. Each script is sandboxed without access to another slide, the parent app, cookies, storage, network requests, external code, or navigation outside the app. Include required styles, data, and code in each page. These are HTML presentations; browser printing supports PDF, while native `.pptx` export is not included.

The downloadable agent skill at `/downloads/docsync-skill.zip` includes templates and a conversion helper. It converts marked HTML sections to independent page payloads and supports optional `slides/SECTION_ID.css` and `slides/SECTION_ID.js` overrides. Install the skill separately from the MCP connection. Use a current backend and bridge; reconnect your client after upgrading if its tool schema does not include `js`.

Eight tools are available:

| Tool | Purpose |
| --- | --- |
| `get_connection` | Check connectivity, trial status, publishing permission, and link access. |
| `get_template_options` | Discover templates, themes, gallery links, and self-contained content URLs. |
| `list_documents` | Find documents in the connected account. |
| `get_document` | Read saved content, stable page IDs, and the current revision. |
| `create_document` | Create a private document or presentation from `pages` or `sections`. |
| `update_document` | Save a complete snapshot with `id` and `expectedRevision`. |
| `publish_document` | Publish a verified saved revision and return its read-only URL. |
| `connect_account` | Request a browser link to claim a stdio installation's trial document. |

Create and update responses may include non-blocking design warnings. Read the saved result back before publishing. Preserve page IDs and include the current `expectedRevision` when updating. A revision conflict requires reading and reconciling the latest document; after an uncertain write, inspect the saved state before retrying. Publishing requires `canPublish: true`; later draft edits do not change the published snapshot. Anyone with a hosted share link can read it, and republishing rotates the URL and revokes the old link. Owners can revoke links in the web app.

Limits: 1–40 pages; title 1–200 characters; unique page IDs of 1–80 letters, digits, underscores, or hyphens; at most 100,000 HTML, 30,000 CSS, and 50,000 JavaScript characters per page; document JSON at most 500,000 bytes. Payload HTML is a fragment, without document wrappers, scripts, or stylesheet links. External images, SVG markup, embeds, fonts, and CSS resource requests are blocked.

The bridge stores a random private installation credential under `~/.config/docsync/servers/`, separately for each server origin. The backend permits one document per installation, including edits and publication. This is a convenience trial, not hardware identification: deleting the profile can create another installation. Server-side rate limits reduce casual abuse.

On the next stdio document, ask your agent to call `connect_account`. Open the link, sign up or sign in, and explicitly claim your trial document. Generate an account token under **Connect agent → Generate or revoke a private token**. Publishing is disabled by default for new account tokens; explicitly enable it if you want the agent to return public share links. Import the token outside the agent conversation:

```sh
npx -y @ayush-vish/docsync-mcp login --url https://your-docsync.example --token-stdin < /path/to/private-token-file
```

The file contains only the token. Use a file with mode 600, then delete it after login. You can also pipe securely from a password manager. Never put tokens in chat or command arguments. Restart your agent after login. If you previously set `DOCSYNC_AGENT_TOKEN` or `DOCSYNC_CONNECTION_FILE`, remove those overrides to use the saved account profile.

Environment overrides: `DOCSYNC_URL`, `DOCSYNC_AGENT_TOKEN`, `DOCSYNC_CONNECTION_FILE` (private dotenv file), `DOCSYNC_CONFIG_DIR` (private per-server profile directory). Explicit credentials take precedence. Credentials are sent only to the configured origin; redirects are rejected. Localhost links work only on the machine hosting DocSync.
