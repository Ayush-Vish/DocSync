export const publicPages = {
  "/": {
    title: "AI Documents, Reports & Presentations with MCP | DocSync",
    description: "Draft documents, reports, and interactive presentations with Codex, Claude, Gemini, or another MCP-compatible AI agent. Review and share a saved version in DocSync.",
    schema: "SoftwareApplication",
  },
  "/templates": {
    title: "Document & Presentation Templates | DocSync",
    description: "Explore DocSync templates for reports, technical documents, dashboards, pitch decks, and team reviews. Create with your AI agent and share from one workspace.",
    schema: "CollectionPage",
  },
  "/guides": {
    title: "DocSync Guides for MCP, AI Reports & Presentations",
    description: "Learn how to connect an AI agent to DocSync, write a technical report with Codex, and create a presentation with ChatGPT.",
    schema: "CollectionPage",
  },
  "/guides/connect-mcp": {
    title: "Connect ChatGPT, Codex, Claude & Gemini to DocSync MCP",
    description: "Set up DocSync as a remote MCP server in ChatGPT, Codex, Claude Code, Gemini, or Antigravity. Find terminal commands, web setup, OAuth sign-in, and connection checks.",
    schema: "Article",
  },
  "/guides/chatgpt-presentations": {
    title: "How to Create a Presentation with ChatGPT and DocSync",
    description: "Connect DocSync to ChatGPT, give it a slide brief, and review a presentation with speaker notes. Follow an example prompt and share the saved deck or export a PDF.",
    schema: "Article",
  },
  "/guides/codex-documentation": {
    title: "How to Write Technical Documentation with Codex and DocSync",
    description: "Use Codex to turn repository evidence into a technical document. Follow an example prompt with source references, review the draft, and share the approved version.",
    schema: "Article",
  },
} as const;

export type PublicPagePath = keyof typeof publicPages;

export function publicPageAsset(path: string) {
  return path === "/" ? "/index.html" : `${path}/index.html`;
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function pageMetadata(path: string, origin?: string) {
  if (!Object.hasOwn(publicPages, path)) return '<title>Workspace | DocSync</title><meta name="robots" content="noindex, nofollow" />';
  const page = publicPages[path as PublicPagePath];
  const title = escapeHtml(page.title), description = escapeHtml(page.description);
  const url = origin ? escapeHtml(origin + path) : null;
  const image = origin ? escapeHtml(origin + "/assets/landing/social-card.png") : null;
  const imageAlt = "DocSync. Turn agent drafts into work worth sharing. An illustrative project review deck.";
  // JSON-LD is data only; escape '<' so it can never close its script element.
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": page.schema,
    name: path === "/" ? "DocSync" : page.title,
    description: page.description,
    ...(origin ? { url: origin + path } : {}),
    ...(path === "/" ? { applicationCategory: "ProductivityApplication", operatingSystem: "Web browser", featureList: ["AI agent integration through MCP", "Document and presentation templates", "Browser review and presentation", "Revision history", "Saved-revision sharing"] } : {}),
    ...(page.schema === "Article" ? { headline: page.title, author: { "@type": "Organization", name: "DocSync", ...(origin ? { url: origin + "/" } : {}) } } : {}),
  }).replace(/</g, "\\u003c");
  return `<title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    ${url ? `<link rel="canonical" href="${url}" />` : ""}
    <meta property="og:type" content="${page.schema === "Article" ? "article" : "website"}" />
    <meta property="og:site_name" content="DocSync" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    ${url ? `<meta property="og:url" content="${url}" />` : ""}
    ${image ? `<meta property="og:image" content="${image}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:alt" content="${imageAlt}" />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${image ? `<meta name="twitter:image" content="${image}" /><meta name="twitter:image:alt" content="${imageAlt}" />` : ""}
    <script type="application/ld+json">${structured}</script>`;
}
