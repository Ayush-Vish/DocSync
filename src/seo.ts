export const publicPages = {
  "/": {
    title: "DocSync — AI Documents, Reports & Presentations",
    description: "Turn your AI agent’s work into documents, visual reports, and presentations. Save time drafting, refine in your browser, and share reviewed versions with your team.",
  },
  "/templates": {
    title: "Document & Presentation Templates | DocSync",
    description: "Explore DocSync templates for reports, technical documents, dashboards, pitch decks, and team reviews. Create with your AI agent and share from one workspace.",
  },
} as const;

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function pageMetadata(path: string, origin?: string) {
  const page = publicPages[path as keyof typeof publicPages];
  if (!page) return '<title>Workspace | DocSync</title><meta name="robots" content="noindex, nofollow" />';
  const title = escapeHtml(page.title), description = escapeHtml(page.description);
  const url = origin ? escapeHtml(origin + path) : null;
  const image = origin ? escapeHtml(origin + "/social-card.png") : null;
  // JSON-LD is data only; escape '<' so it can never close its script element.
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": path === "/" ? "SoftwareApplication" : "CollectionPage",
    name: path === "/" ? "DocSync" : "DocSync templates",
    description: page.description,
    ...(origin ? { url: origin + path } : {}),
    ...(path === "/" ? { applicationCategory: "ProductivityApplication", operatingSystem: "Web browser", featureList: ["AI agent integration through MCP", "Document and presentation templates", "Browser editing", "Revision history", "Saved-revision sharing"] } : {}),
  }).replace(/</g, "\\u003c");
  return `<title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    ${url ? `<link rel="canonical" href="${url}" />` : ""}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="DocSync" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    ${url ? `<meta property="og:url" content="${url}" />` : ""}
    ${image ? `<meta property="og:image" content="${image}" /><meta property="og:image:width" content="1200" /><meta property="og:image:height" content="630" /><meta property="og:image:alt" content="DocSync: Less busywork. More shared clarity. Documents, reports, and presentations with your AI agent." />` : ""}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${image ? `<meta name="twitter:image" content="${image}" /><meta name="twitter:image:alt" content="DocSync: Less busywork. More shared clarity." />` : ""}
    <script type="application/ld+json">${structured}</script>`;
}
