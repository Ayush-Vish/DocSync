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

Documents use a separate portrait workspace with one active page, an outline in the editor, and a scrolling shared reader. **←/→**, **Page Up/Down**, and **Home/End** turn pages; **R** or the replay button restarts the current page. Space and up/down arrows keep normal scrolling and control behavior. Each visit starts the page’s own script from its initial data. The saved `format` selects the workspace.

Author presentations against a **1280 × 720** canvas. The player scales the design for desktop and mobile, with fullscreen, keyboard and swipe navigation, slide overview, progress, and animation replay. **←/→**, **Space**, and **Page Up/Down** navigate; **Home/End** jump; **G** opens overview; **R** replays; **Esc** exits. Interactive controls keep their own behavior. Library cards show the first saved page or slide.

Animate with the Web Animations API, `requestAnimationFrame()`, or CSS `@keyframes`, and respect `prefers-reduced-motion`. Keep meaningful content in the initial HTML: cover, filmstrip, and overview previews never run scripts. Only the active page or slide runs in its viewer. JavaScript starts after that page’s HTML/CSS has been laid out. Initialize immediately or register `DOMContentLoaded`/`load` listeners; the host delivers these ready events once per visit or replay. Call `event.preventDefault()` when a custom widget consumes a navigation key. Text fields, range inputs, canvas, and ARIA keyboard widgets retain their keys; ordinary buttons allow arrow navigation while keeping native Space/Enter activation. Put executable code in `js` and attach handlers with `addEventListener`; HTML script tags and inline event attributes are removed. Each script is sandboxed without access to another slide, the parent app, cookies, storage, fetch/XHR, external code, or navigation outside the app. Include required styles, data, and code in each page. These are HTML presentations; browser printing supports PDF, while native `.pptx` export is not included.

The downloadable agent skill at `/downloads/docsync-skill.zip` includes templates and a conversion helper. It converts marked HTML sections to independent page payloads and supports optional `slides/SECTION_ID.css` and `slides/SECTION_ID.js` overrides. Install the skill separately from the MCP connection. Use a 0.5.0 backend and bridge with migration `0007_media_and_agents.sql` and the `MEDIA` R2 binding for uploads and collaborator activity. Reconnect your client after upgrading to refresh the tool schema.

Twenty tools are available (bridge 0.5.0 and a backend migrated through `0007_media_and_agents.sql`):

| Tool | Purpose |
| --- | --- |
| `get_connection` | Check connectivity, trial status, publishing permission, and link access. |
| `get_template_options` | Discover templates, themes, gallery links, and self-contained content URLs. |
| `list_documents` | Find owned documents and private documents shared with the account. |
| `get_document` | Read content, page IDs, revision, and document role. Optional `revision` reads a historical snapshot. |
| `upload_media` | Upload document-owned images, GIFs, or video; returns a URL, canonical `src`, and HTML snippet. See the media workflow below. |
| `create_document` | Create a private document or presentation from `pages` or `sections`. |
| `update_document` | Save a complete snapshot with `id`, `expectedRevision`, and `lockToken`; optional `changeSummary` is at most 300 characters. |
| `publish_document` | Publish a verified saved revision as the document owner, with a publishing grant. |
| `connect_account` | Request a browser link to claim a stdio installation's trial document. |
| `get_document_access` | List collaborators, access roles, connected agents, and pending invitation IDs for a document you own. |
| `invite_document_collaborator` | Create a one-time editor/viewer invitation link for a document you own; share it with the recipient privately. |
| `update_document_collaborator_access` | Change a member to editor/viewer or remove their access. |
| `revoke_document_invitation` | Revoke a pending invitation by ID. |
| `get_document_lock` | Read the current holder and lease expiry; never returns the lease secret. |
| `acquire_document_lock` | Acquire an exclusive five-minute lease with `id`; returns `lockToken`, `leaseId`, expiry, and current revision. |
| `renew_document_lock` | Extend an unexpired lease using `id` and `lockToken`. |
| `release_document_lock` | Release the lease using `id` and `lockToken`. |
| `get_document_history` | Read authors, agent labels, summaries, timestamps, and restore ancestry. |
| `compare_document_versions` | Compare `fromRevision` and `toRevision` for an `id`, including page order and HTML/CSS/JS changes. |
| `restore_document` | Create a new revision from a historical `revision`, with `id`, `expectedRevision`, `lockToken`, and optional `changeSummary`. |

For an existing document, acquire a lease **before starting the edit**, then read the current content. Renew at least once a minute during long work. Save with the returned `lockToken`, a fresh `expectedRevision`, and a short `changeSummary`; read back to verify and release the lease when finished or abandoning the edit. Keep lease secrets inside the agent session. Two sessions using the same account still require separate leases and cannot write simultaneously.

A `423` response means the lease is missing, expired, or belongs to another session. A `409` means the revision changed. Preserve generated content; acquire a new lease if needed, read current state, and reconcile. Never replace `expectedRevision` without reconciling the actual content. Release an owned lease after errors when possible; a disconnected client’s lease expires automatically after five minutes. An uncertain acquisition may have created a lease even if its response was lost; check status and wait for expiry rather than repeatedly acquiring.

The document owner invites signed-in editors/viewers through **Share → People with access**. Invitation links grant access to the first account accepting them, expire after 24 hours, and work once. Share them privately. Connected agents inherit their account’s document role. Viewers can read the draft and version history; editors can edit/restore while holding a lease. Only owners manage access or publish public snapshots; their connected agents can use the four access tools above from a terminal. Membership changes immediately end the affected account’s lease. Public viewing links never grant editing rights.

Create and update responses may include non-blocking design warnings. Read the saved result back before publishing. Preserve page IDs and include the current `expectedRevision` and active `lockToken` when updating. A revision conflict requires reading and reconciling the latest document; after an uncertain write, inspect the saved state before retrying. Publishing requires `canPublish: true`; later draft edits do not change the published snapshot. Anyone with a hosted share link can read it, and republishing rotates the URL and revokes the old link. Owners can revoke links in the web app.

### Upload images, GIFs, and video

1. Create a draft with `create_document` (or choose an existing document you can edit).
2. Call `upload_media`, for example with `{"id":"DOCUMENT_UUID","mimeType":"image/png","filePath":"/absolute/path/photo.png"}` from local stdio. For hosted MCP use `{"id":"DOCUMENT_UUID","mimeType":"image/png","filename":"photo.png","dataBase64":"BASE64_BYTES"}`. Supply exactly one source; use plain padded base64 without a `data:` prefix. Hosted MCP cannot read server-local paths.
3. Embed its returned `src` or HTML in a `kind: "html"` page, adding meaningful alt text. The absolute `url` can also be pasted into HTML; saved content is normalized to the canonical path. Acquire a lease, read the latest document, save the complete updated snapshot with `lockToken` and `expectedRevision`, verify it, then release the lease.

Supported types: PNG, JPEG, animated GIF, WebP, MP4, WebM. Limits: **8 MiB/file; 50 files or 100 MiB/document**. Bytes are checked against MIME signatures. Browser codecs determine video support. Repeated uploads of identical bytes to the same document return the same asset. Uploading requires owner/editor access and does not create a revision; inserting/saving follows the usual edit lock rules. Media stays available to historical revisions, so removing HTML does not reclaim quota. No deletion tool is provided.

`url` and `src` are authenticated document media links, not unrestricted public downloads. The renderer adds temporary signed access for sandboxed pages. Published viewers can load only assets referenced by their published snapshot; rotation/revocation invalidates that publication's media grant. Private grants recheck membership. Render grants expire after 24 hours; reload to refresh them. Never store signed render query strings in authored HTML or return them as share links. External media and embedded players remain blocked.

The authenticated toolbar and sharing panel show document collaborators with client names, company labels, and icons. Green marks authenticated agent use in the last five minutes; OAuth authorization can remain idle. Stdio identity is reported by the MCP host after an authenticated tool call. Names are metadata, not verified vendor identity. Revoked credentials disappear. Public viewers do not see these identities.

Limits: 1–40 pages; title 1–200 characters; unique page IDs of 1–80 letters, digits, underscores, or hyphens; at most 100,000 HTML, 30,000 CSS, and 50,000 JavaScript characters per page; document JSON at most 500,000 bytes. Payload HTML is a fragment, without document wrappers, scripts, or stylesheet links. External images, SVG markup, embeds, fonts, and CSS resource requests are blocked.

The bridge stores a random private installation credential under `~/.config/docsync/servers/`, separately for each server origin. The backend permits one document per installation, including edits and publication. This is a convenience trial, not hardware identification: deleting the profile can create another installation. Server-side rate limits reduce casual abuse.

On the next stdio document, ask your agent to call `connect_account`. Open the link, sign up or sign in, and explicitly claim your trial document. Generate an account token under **Connect agent → Generate or revoke a private token**. Publishing is disabled by default for new account tokens; explicitly enable it if you want the agent to return public share links. Import the token outside the agent conversation:

```sh
npx -y @ayush-vish/docsync-mcp login --url https://your-docsync.example --token-stdin < /path/to/private-token-file
```

The file contains only the token. Use a file with mode 600, then delete it after login. You can also pipe securely from a password manager. Never put tokens in chat or command arguments. Restart your agent after login. If you previously set `DOCSYNC_AGENT_TOKEN` or `DOCSYNC_CONNECTION_FILE`, remove those overrides to use the saved account profile.

Environment overrides: `DOCSYNC_URL`, `DOCSYNC_AGENT_TOKEN`, `DOCSYNC_CONNECTION_FILE` (private dotenv file), `DOCSYNC_CONFIG_DIR` (private per-server profile directory). Explicit credentials take precedence. Credentials are sent only to the configured origin; redirects are rejected. Localhost links work only on the machine hosting DocSync.
