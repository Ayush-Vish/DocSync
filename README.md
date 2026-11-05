# DocSync

Create, edit, and share HTML component documents from any MCP-compatible coding agent. The browser app uses **React + Vite + TipTap**; the API runs on **Cloudflare Workers + D1**. A Node/SQLite adapter runs the same API locally.

## Run locally

Requires Node.js **22.18+** and npm.

```sh
npm ci
npm run setup
PORT=8788 npm run dev
```

Open **http://127.0.0.1:8788**. Create an email/password account, or choose **Existing workspace owner** and use `.local/owner-key` to access documents from the original MVP. Setup preserves existing credentials. The default port remains 8787; this workspace uses 8788 because another process occupies 8787.

For frontend hot reload, keep the backend running on 8788 and run `npm run dev:ui` in a second terminal. Open http://localhost:5173. Vite proxies API calls to the local backend and keeps cookies on the frontend origin. Production serves the built frontend and API from one origin.

## Included

- Minimal document library with search, responsive navigation, and an editor.
- Text sections with headings, bold, italic, underline, lists, quotes, tables, and undo/redo through TipTap.
- HTML/CSS/JavaScript component sections with source editing and isolated previews. Existing component HTML is preserved instead of being converted to rich text.
- Explicit saves, immutable revision history, restore, conflict preservation, and JSON draft download.
- Fixed-revision public links, republishing with link rotation, and revocation.
- Two six-slide presentation templates with entrance animation, animated charts, and self-contained interactive examples. The presentation player supports keyboard and touch navigation, slide overview, animation replay, progress, and native fullscreen.
- Library cards show the first saved page or slide. Covers load near the viewport and render without document JavaScript.
- Email/password accounts, server-side sessions, Google OAuth, and account-scoped document access.
- One anonymous document per MCP installation, browser claiming, and account tokens with an explicit publishing grant.
- A self-contained, publishable npm MCP package and a standalone download in **Connect agent**.

Browser requests have a 30-second timeout and clear connection errors. Mutations are never automatically retried, and repeated action clicks produce one request. Save with **Ctrl/Cmd+S**; edits stay open after a conflict or expired session, with sign-in recovery and a draft download. On small screens, the editor keeps the canvas visible and opens outline/properties panels on demand.

Sharing shows the actual published revision. Save before publishing; only returned public links can be copied, and clipboard failures are reported. Publishing again rotates the link. New account tokens default to publishing disabled, and existing token permissions are loaded before changes can be made.

Live multi-user editing, comments, uploads, offline sync, pagination, password reset/email verification, are not implemented in this release. Google Docs-style text editing is included; Google Docs feature parity is not implied. Email/password account emails are not verified and must not be used as proof of ownership for invitations or automatic identity linking.

## Agent onboarding

### Downloadable agent skill and templates

The landing page and **Connect agent** page provide `/downloads/docsync-skill.zip`, an installable `docsync/` skill folder for Codex and Claude Code. Browse the interactive examples at `/templates`. Source lives in `skills/docsync/`; `npm run build` packages it and publishes browsable template previews. ZIP creation uses the build-only `fflate` dependency.

### Public pages and search visibility

The build prerenders the homepage and template gallery from their React components, so their content is readable before JavaScript loads. The guest homepage loads the editor only after a successful session check; authentication and document routes load it when needed.

The Worker adds page-specific titles, descriptions, canonical URLs, Open Graph/Twitter cards, and JSON-LD using the request origin. `/robots.txt` points to `/sitemap.xml`, which lists only `/` and `/templates`. Account pages, document routes, share links, and API responses carry `X-Robots-Tag: noindex, nofollow`; this is a search directive, not access control. Published links remain accessible to anyone who has the link. Unknown app URLs return 404.

After deploying to the preferred public domain, submit `https://YOUR_HOST/sitemap.xml` in Google Search Console and Bing Webmaster Tools. Redirect alternative deployment domains to that preferred domain at the hosting layer so they do not compete in search. Indexing and search rankings depend on the engines; local checks do not submit or deploy the site.

Unzip `docsync/` into `~/.codex/skills/` for Codex or `~/.claude/skills/` for Claude Code. Connect the DocSync MCP separately. The skill includes editorial documents, technical design documents, pitch decks, and project review slides. Each template has HTML/CSS and shares dependency-free JavaScript preview controls. Its Node.js helper converts marked sections into MCP creation payloads.

Signed-in users can also create these presets from the document library: Editorial Report, Technical Blueprint, Sales Dashboard, Bold Pitch, and Delivery Review. The Custom card provides a portable prompt for Codex, Claude, Antigravity, or another connected agent. The Sales Dashboard uses fictional Northstar figures and a simulated local update stream; it is not connected to real company data.

Hosted documents render sanitized HTML/CSS and optional per-section JavaScript. Scripted sections use `/artifact-frame` with an opaque sandbox origin and a response CSP blocking network, external scripts, forms, popups, and access to the parent app. Each frame receives only its section content through a source-checked message; edits recreate the frame. Static sections retain their script-free renderer. Slide templates are HTML presentations; native `.pptx` export is not included. Browser printing supports saving the previews as PDF.

Each presentation page has an independent `html`, `css`, and `js` payload. Slides use a 1280 × 720 design viewport that scales to the available space, including mobile screens. Only the current slide runs in the player; overview, filmstrip, and library thumbnails never execute scripts. Presentations entered from the editor or a shared link use the same player. The gallery's **Present template** button opens it without creating an account or document.

Use **←/→**, **Page Up/Down**, **Space**, **Home/End**, **G** for overview, **R** to replay, and **Esc** to leave. Keyboard and horizontal swipe navigation also work while a slide frame has focus. Buttons, inputs, canvas interactions, and events handled with `preventDefault()` keep their own behavior. The frame bridge accepts only navigation actions from the currently mounted slide and grants no account access. Fullscreen uses the browser's native control; motion respects `prefers-reduced-motion`.

### MCP connection

A fresh installation needs only the server URL. It generates a random local credential, stores it privately, and registers it with DocSync. The first document can be created, edited, and published without a web account. The database enforces a one-document limit atomically.

For local Antigravity CLI (`agy`):

```sh
agy mcp add docsync node /absolute/path/to/DocSync/dist/docsync-mcp.cjs --url http://127.0.0.1:8788
```

Codex CLI:

```sh
codex mcp add docsync -- node /absolute/path/to/DocSync/dist/docsync-mcp.cjs --url http://127.0.0.1:8788
```

Claude Code:

```sh
claude mcp add --scope user --transport stdio docsync -- node /absolute/path/to/DocSync/dist/docsync-mcp.cjs --url http://127.0.0.1:8788
```

Other clients use:

```json
{
  "mcpServers": {
    "docsync": {
      "command": "node",
      "args": ["/absolute/path/to/DocSync/dist/docsync-mcp.cjs", "--url", "http://127.0.0.1:8788"]
    }
  }
}
```

Restart the client and ask:

> Use DocSync to make a report from these notes, verify the saved content, and return its link.

Literal `@DocSync` support depends on the client. Standard MCP tool use works without mention syntax. DocSync does not call a model API; your existing agent generates the content.

The second create request returns `AUTH_REQUIRED`. The agent calls `connect_account` to obtain a 15-minute browser link. Sign up or sign in, explicitly **Claim my document**, then generate a token under **Connect agent**. Claiming moves the trial document into the signed-in account and revokes the trial credential. A used/expired link cannot claim again. Claim links keep the secret in the URL fragment, out of HTTP request paths and referrers.

Save the token in a private file containing only the token (mode 600), then import it outside the agent conversation:

```sh
node dist/docsync-mcp.cjs login --url http://127.0.0.1:8788 --token-stdin < /path/to/private-token-file
```

Delete the temporary token file afterward, then restart the agent. The CLI verifies the token against the server before storing it. Profiles are scoped to the server origin under `~/.config/docsync/servers/` with mode 600. `DOCSYNC_CONFIG_DIR` overrides that directory.

**Existing installations:** `DOCSYNC_AGENT_TOKEN` and `DOCSYNC_CONNECTION_FILE` override the new per-server profile. Remove those client environment overrides when switching to the new login flow. The legacy `npm run mcp:configure -- /private/connection.env` helper remains supported for deployments that explicitly supply a credential. Keep credentials out of chat, command arguments, source control, and MCP tool arguments.

This trial identifies a local installation, **not physical hardware**. Deleting the profile can start another installation. Per-IP registration limits reduce casual abuse; this is not a billing or hardware-attestation boundary. No fingerprinting is performed.

## Google sign-in

Create a **Web application OAuth client** in Google Cloud. Configure an exact authorized redirect URI:

- Local built app: `http://127.0.0.1:8788/api/auth/google/callback`
- Vite development: `http://localhost:5173/api/auth/google/callback`
- Production: `https://YOUR_HOST/api/auth/google/callback`

Configure `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the server. Locally they can be supplied through environment variables or the ignored private `.local/config.json`. Never expose the secret through `VITE_*` variables. In production, use Wrangler secrets. The Google button appears only when both credentials exist.

The flow uses authorization code exchange with PKCE, a single-use expiring state record, and an HttpOnly state cookie. The server fetches the verified Google identity directly from Google's userinfo endpoint. A Google identity is never automatically linked to an existing password account merely because the email matches; sign in using that account's password instead.

Google credentials are not included. Automated tests mock Google's endpoints; a real Google sign-in must be checked with your OAuth client before launch.

## Publish the MCP package

```sh
npm run pack:mcp
```

Produces `dist/ayush-vish-docsync-mcp-0.3.0.tgz`. The package source is `packages/mcp/`; the archive includes a Node executable, package metadata, README, MIT license, and dependency notices. The executable is bundled and requires no runtime dependency installation. The `prepack` hook rebuilds when packing/publishing directly from the package directory.

The npm package is **`@ayush-vish/docsync-mcp`**. Packaging does not publish to npm. Maintainers can publish a new version after updating the manifest and authenticating to the authorized npm account:

```sh
npm publish ./packages/mcp --access public
```

Clients can install the npm package with:

```sh
agy mcp add docsync npx -y @ayush-vish/docsync-mcp --url https://YOUR_HOST
```

A deployed DocSync URL is always required; there is no bundled public service. The local standalone artifact is also available through **Connect agent → Download MCP server**. Downloading an executable does not include credentials. Eight tools are exposed: `get_connection`, `get_template_options`, `connect_account`, `list_documents`, `get_document`, `create_document`, `update_document`, and `publish_document`.

### Hosted MCP (OAuth)

For clients with remote MCP and OAuth support, connect directly without installing Node.js or copying a token:

```sh
codex mcp add docsync --url https://YOUR_HOST/mcp
codex mcp login docsync
agy mcp add --type http docsync https://YOUR_HOST/mcp
claude mcp add --transport http docsync https://YOUR_HOST/mcp
```

The browser authorization page grants document access and lets the user separately allow publishing. OAuth uses authorization code with PKCE, short-lived access tokens, rotating refresh tokens, and account-scoped revocation from **Connect agent**. Approval is bound to the initiating browser by a single-use token and HttpOnly cookie. Registration, authorization, and token exchange have per-IP limits; OAuth JSON/forms are capped at 16 KiB, and API/MCP bodies at 550,000 bytes, including streamed bodies. OAuth pages block inline executable scripts, HTTPS responses use HSTS, and sensitive responses are not cached. Hosted MCP requires migrations through `0004_remote_mcp_oauth.sql`. Local stdio with private agent tokens remains available for clients without remote OAuth.

## Content and sharing

The document model is `{title, format?, sections: [{id, kind?, html, css, js?}]}`. Use `pages` instead of `sections` for the equivalent ordered page input, and set `format` to `document` or `presentation` explicitly. `kind: "text"` is for supported rich text; `kind: "html"` (or omitted for older documents) preserves arbitrary supported components. Agents should use HTML mode for layouts, custom classes, or CSS. Text sections are edited through TipTap's schema and should contain only supported headings, paragraphs, inline formatting, lists, quotes, code blocks, and tables.

`parse5` and `css-tree` validate content on the server. Component previews also validate drafts in the browser. Static content and thumbnails use empty-sandbox iframes; optional per-page `js` uses an opaque `allow-scripts` sandbox with restrictive CSP. HTML script tags and inline event attributes, navigation outside the app, external images, SVG, forms, embeds, remote fonts, and CSS resource requests are disabled. CSS keyframes and self-contained JavaScript animations are supported. HTML components never enter the application DOM.

Limits: 40 sections; 100,000 HTML, 30,000 CSS, and 50,000 JavaScript characters per section; 500,000 bytes per document JSON; 550,000-byte API/MCP request bodies. History shows the latest 100 revisions; the library lists the latest 200 documents per account.

Save before sharing. A link points to a saved revision, so later private edits do not change it. Republishing rotates the URL and revokes its predecessor. The raw link is shown only when publishing. Revocation stops future reads but cannot erase copies already downloaded. Share responses use `no-store`, prioritizing revocation over CDN caching. Localhost links are previews accessible only on the host machine.

## Deploy to Cloudflare

1. Run `npm run build` and authenticate with `npx wrangler@4 login`.
2. Create a database using `npx wrangler@4 d1 create docsync` and replace the database ID placeholder in `wrangler.jsonc`.
3. Apply all migrations with `npx wrangler@4 d1 migrations apply docsync --remote`.
4. Generate production credentials using `node scripts/production-secrets.mjs`. It writes private files under `.local/production-*` without deploying anything.
5. Set `OWNER_KEY_HASH` and `SESSION_SECRET` using `npx wrangler@4 secret put NAME`, using the generated hash and session-secret files. Keep the owner key privately for the legacy workspace.
6. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` if enabling Google sign-in. Register the correct deployed callback URL with Google.
7. Run `npx wrangler@4 deploy` and verify sign-up, Google sign-in, anonymous installation, claim, token connection, publication, and revocation on the hosted origin.

Free-tier deployment is quota-limited. HTML parsing and password hashing consume CPU; check actual usage against [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/). Production traffic may need paid capacity. No model API is billed by DocSync; your coding agent's subscription is separate.

Account sessions use opaque hashed server-side tokens with a seven-day expiry, HttpOnly cookies, and Secure in HTTPS deployments. Cookie-authenticated mutations require the matching Origin. Password and installation requests are rate-limited. Passwords use a random salt, a server-side HMAC pepper, and WebCrypto PBKDF2-SHA256 at 100,000 iterations, matching Workers' WebCrypto iteration ceiling. **`SESSION_SECRET` is currently also the password pepper: changing it invalidates password verification as well as legacy owner sessions. Preserve it across deployments and backups.** To invalidate account sessions, delete their `account_sessions` records. Do not casually rotate the pepper without a password-migration/reset strategy.

## Backups and migration safety

Before upgrading the local database, run `npm run backup`. It uses SQLite's consistent backup API. Migration `0003_accounts.sql` preserves existing documents under the `legacy` account and keeps legacy credentials functional. New accounts cannot see legacy or other users' documents.

Stop the server before restoring with `npm run restore-backup -- /absolute/path/to/backup.sqlite`. The restore helper checks integrity, refuses live WAL/SHM files, and preserves the old database. Protect backups and the original `.local/config.json`, which contains the password pepper.

Before production migrations, export D1:

```sh
npx wrangler@4 d1 export docsync --remote --output=/private/path/docsync-backup.sql
```

**Do not roll back to the pre-account Worker after admitting multiple users.** The old API lacks tenant filtering and is incompatible with multi-user data. Prefer a forward fix, or restore a matching pre-upgrade database and code together while preserving the current database separately.

## Verification

```sh
npm run check
npm test
npm run test:browser
npm run pack:mcp
```

The API tests cover isolation across accounts and all document operations, CSRF, session revocation, token rotation, trial quota enforcement, claiming/replay, Google state/PKCE and identity linking, snapshots, concurrency, publication, and HTML/CSS security. Stdio tests exercise both development and bundled MCP entry points.

The browser test launches an isolated in-memory API server and installed Chrome (`CHROME_PATH` overrides `/usr/bin/google-chrome`). It does not modify your local database. It exercises the actual packaged MCP executable and private CLI profiles through the entire free-document → browser signup → claim → account token → next document workflow, then editor behavior, duplicate save protection, session recovery, sharing and clipboard failures, conflicts, revocation, logout, and mobile layout. Screenshots go to `/tmp/docsync-*.png`.

Google's live service, Cloudflare deployment, npm publication, and live model sessions are separate checks; local acceptance does not claim those have happened.
