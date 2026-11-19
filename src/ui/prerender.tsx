import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { LandingPage } from "./LandingPage";
import { TemplateGallery } from "./TemplateGallery";
import { ChatGptPresentationGuide, CodexDocumentationGuide, ConnectMcpGuide, GuidesIndex } from "./Guides";
import { pageMetadata, publicPageAsset, publicPages, type PublicPagePath } from "../seo";

const content: Record<PublicPagePath, ReactNode> = {
  "/": <LandingPage />,
  "/templates": <TemplateGallery />,
  "/guides": <GuidesIndex />,
  "/guides/connect-mcp": <ConnectMcpGuide />,
  "/guides/chatgpt-presentations": <ChatGptPresentationGuide />,
  "/guides/codex-documentation": <CodexDocumentationGuide />,
};

export const pages = (Object.keys(publicPages) as PublicPagePath[]).map(path => ({
  file: publicPageAsset(path).slice(1),
  content: renderToStaticMarkup(content[path]),
  metadata: pageMetadata(path),
  interactive: path === "/" || path === "/templates",
}));
