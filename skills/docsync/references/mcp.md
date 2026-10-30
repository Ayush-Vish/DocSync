# MCP contract and renderer limits

## Paged documents

Create reports with `format: "document"` and `pages: [{id, kind, html, css, js?}, ...]`.
Each item is one paper page, in reading order. Split long prose at semantic boundaries;
do not put an entire report in one HTML string. Keep each page self-contained and
within the visible paper height (1056 CSS pixels). Verify every page after saving.
Use `format: "presentation"` with `sections` for slides.
Send either `pages` or `sections`, never both. The server normalizes pages to the
existing `sections` field in saved responses; preserve those IDs and `format` when updating.
Legacy documents remain readable as one paper page per section. Existing long HTML
is not automatically split, because doing so can break interactive scripts.

Use the DocSync tools exposed by the current client; prefixes vary between Codex and Claude. Skills and MCP connections are installed separately.

| Tool | Inputs / purpose |
| --- | --- |
| `get_connection` | No arguments. Check permissions and local-only vs public links. |
| `list_documents` | No arguments. Find existing documents. |
| `get_document` | `id`. Read title, sections, and current revision. |
| `create_document` | `title`, `sections`. Creates a private draft. |
| `update_document` | `id`, `expectedRevision`, `title`, complete `sections`. Saves a new revision, without publishing. |
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

Each section is rendered in an isolated frame. Include all required CSS and JavaScript in that section and do not rely on another section's DOM or styles. Use only fragment HTML in payloads, without `html`, `head`, `body`, `script`, or stylesheet links. External fonts, images, SVG markup, embeds, network requests, external scripts, and eval are blocked. Canvas, buttons, range inputs, select/option, and labels are supported. HTML script tags and event attributes are removed; use the separate `js` field and `addEventListener`. Avoid CSS `url()`, imports, and animation keyframes. Media queries are supported. Use CSS grid/flex, canvas, text, shapes, borders, and tables for diagrams. Scripts cannot read parent DOM, cookies, or account credentials. They may manipulate only their own section. The app re-creates the frame on an edit, so initialize state from the section’s data rather than relying on persistent browser storage.

Publishing makes a snapshot readable by anyone with the hosted link. Later draft edits do not change that snapshot until republished. Localhost links are previews accessible only on that machine. Never claim a draft is published or invent a share URL after a failed tool call.
