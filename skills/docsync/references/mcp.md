# MCP contract and renderer limits

Before designing a new artifact, call `get_template_options` and share its gallery URL.
Ask the user to reply with a template name or let the agent choose a custom design.
Skip this question if the user already chose a template or delegated design.
Gallery previews do not send a choice back to the agent; the user replies in chat.
For a selected template, fetch its `contentUrl` and adapt the content to the user's
facts. Otherwise create a custom design from their request. The gallery is at
`/templates` and requires no sign-in. These are DocSync templates, not third-party branded templates.

## Paged documents and slide decks

Create reports or slides with `format: "document"` or `format: "presentation"`.
Use `pages` or `sections` interchangeably (each item has `{id, kind?, html, css, js?}`).
Each item represents one paper page (for documents) or one 16:9 slide (for presentations).
Do not provide both `pages` and `sections` in the same call.
Split long prose at semantic boundaries; keep each page self-contained.
The server runs automatic design linting on save and returns non-blocking `warnings` (e.g. excessive words, missing headings, tiny fonts, color clashes).

### Design themes and tokens

DocSync includes 6 built-in themes: `midnight` (dark high-contrast), `aurora` (vibrant gradient accents), `clean` (minimal light), `warm` (editorial serif), `corporate` (navy enterprise), and `neon` (electric dark).
Include `assets/templates/theme-base.css` or set `--ds-*` custom properties:
- `--ds-bg`, `--ds-surface`, `--ds-text`, `--ds-text-secondary`, `--ds-accent`, `--ds-border`
- Use typed layouts: `.slide.cover`, `.slide.two-column`, `.slide.big-stat`, `.slide.quote`, `.slide.section-divider`, `.slide.closing`
- Use built-in visual components: `.metric-tile`, `.card`, `.callout`, `.flow-diagram`, `.timeline`, `.bar-chart`, `.donut-chart`, `.progress-bar`, `.code-block`

Use the DocSync tools exposed by the current client; prefixes vary between Codex and Claude. Skills and MCP connections are installed separately.

| Tool | Inputs / purpose |
| --- | --- |
| `get_document_access` | `id`. List members, access roles, connected agents, and pending invitation IDs for an owned document. |
| `invite_document_collaborator` | `id`, `role`. Create a one-time invitation link for a document you own. |
| `update_document_collaborator_access` | `id`, `accountId`, `role`: `editor`, `viewer`, or `remove`. Manage member access. |
| `revoke_document_invitation` | `id`, `invitationId`. Revoke a pending invite. |
| `get_document_lock` | `id`. Read holder and expiry without exposing the lease secret. |
| `acquire_document_lock` | `id`. Acquire an exclusive five-minute lease; returns `lockToken` and current revision. |
| `renew_document_lock` | `id`, `lockToken`. Extend an unexpired lease. |
| `release_document_lock` | `id`, `lockToken`. Release your lease. |
| `get_document_history` | `id`. Read saved version metadata and restore ancestry. |
| `compare_document_versions` | `id`, `fromRevision`, `toRevision`. Read page/order and HTML/CSS/JS changes. |
| `restore_document` | `id`, historical `revision`, current `expectedRevision`, `lockToken`, optional `changeSummary`. Restore as a new revision. |
| `get_connection` | No arguments. Check permissions and local-only vs public links. |
| `get_template_options` | `format`: `document`, `presentation`, or `all`. Returns the public template gallery, preview and content links, and a template-or-custom question. |
| `list_documents` | No arguments. Find existing documents. |
| `get_document` | `id`, optional `revision`. Read content, revision, and document role. |
| `upload_media` | `id`, `mimeType`, and either local `filePath` or `filename` + plain `dataBase64`. Returns `url`, `src`, and HTML. |
| `create_document` | `title`, `sections`. Creates a private draft. |
| `update_document` | `id`, `expectedRevision`, `lockToken`, `title`, complete `sections`, optional `changeSummary` (300 characters max). Saves a new revision, without publishing. |
| `publish_document` | `id`, `expectedRevision`. Publishes a read-only snapshot. Requires publishing permission. |
| `connect_account` | No arguments. Trial-account claim link when the server requests account claiming; this does not authenticate a remote OAuth connection. |

Example creation payload:

```json
{
  "title": "Project overview",
  "sections": [{
    "id": "overview",
    "kind": "html",
    "html": "<article class=\"page\"><h1>Project overview</h1><p>Approved content.</p></article>",
    "css": ".page{max-width:760px;margin:auto;color:#172033}",
    "js": "document.querySelector('.page').addEventListener('click', () => document.querySelector('h1').textContent = 'Overview selected');"
  }]
}
```

Limits: title 1–200 characters; 1–40 sections; unique section IDs of 1–80 letters, digits, underscores, or hyphens; HTML at most 100,000 characters, CSS at most 30,000, and optional JavaScript at most 50,000 characters per section; total JSON at most 500 KB. `kind` is `html` for designed layouts or `text` for text-editor content. Put JavaScript source in the optional `js` field. Older documents without it remain static.

Each section is rendered in an isolated frame. Include all required CSS and JavaScript in that section and do not rely on another section's DOM or styles. Use only fragment HTML in payloads, without `html`, `head`, `body`, `script`, or stylesheet links. External fonts, images, SVG markup, embeds, fetch/XHR, external scripts, and eval are blocked. Canvas, buttons, range inputs, select/option, and labels are supported. HTML script tags and event attributes are removed; use the separate `js` field and `addEventListener`. Avoid CSS `url()` and imports. Media queries and CSS `@keyframes` are supported. Animate with the Web Animations API or `requestAnimationFrame()` in `js`, respecting reduced motion. Presentations use a 1280 × 720 design viewport; the player scales it to fit. Keep useful content in the initial HTML because thumbnails do not run scripts. Use CSS grid/flex, canvas, text, shapes, borders, and tables for diagrams. Scripts cannot read parent DOM, cookies, or account credentials. They may manipulate only their own section. The app re-creates the frame on an edit or animation replay, so initialize state from the section’s data rather than relying on persistent browser storage.

Publishing makes a snapshot readable by anyone with the hosted link. Later draft edits do not change that snapshot until republished. Localhost links are previews accessible only on that machine. Never claim a draft is published or invent a share URL after a failed tool call.

Acquire a document lease before editing, read after acquisition, renew at least once a minute during long work, save with the token and current revision, verify, then release. On `423` preserve generated work and wait for/reacquire a lease; on `409` read and reconcile. Never blindly retry mutations or change only the expected revision. Leases expire five minutes after their last renewal. If acquisition’s result is uncertain, check status and allow expiry instead of repeatedly acquiring.

The owner shares the private draft through one-time, 24-hour invitations accepted by a signed-in account. Account-connected agents inherit owner/editor/viewer access. Viewers can read current content and history. Editors can edit/restore with a lease. Only document owners can publish or manage access; their connected agents can manage invitations and member roles through MCP; publishing also requires the credential’s grant. Public viewing links remain read-only. Use backend/bridge 0.5.0 or reconnect remote MCP to discover these tools.


## Uploaded media

Create the draft before uploading. Call `upload_media` with its document `id`, an allowed `mimeType`, and exactly one source: an absolute `filePath` for local stdio, or plain padded `dataBase64` plus `filename` for hosted MCP. Hosted MCP cannot read server-local files. PNG, JPEG, animated GIF, WebP, MP4 and WebM are supported (8 MiB/file; 50 files or 100 MiB/document). Use its returned `src` or HTML snippet in a `kind: "html"` page; add image alt text and video captions. Video uses `controls playsinline preload="metadata"`. Upload does not save a revision; acquire/read/update/verify/release as usual to insert it. Preserve all other pages and their IDs.

Only media uploaded to this document can be embedded. Canonical URLs require authentication; DocSync adds temporary scoped render grants. Published media is limited to the actual published snapshot. Reload after 24 hours for fresh grants. Never persist grant query strings or use them as share links. Assets remain for version history; removing HTML does not reclaim quota. Arbitrary external media, SVG, remote CSS, and embedded players stay blocked. Use backend/bridge 0.5.0, migration `0007_media_and_agents.sql`, and a configured MEDIA bucket.
