import { renderToStaticMarkup } from "react-dom/server";
import { LandingPage } from "./LandingPage";
import { TemplateGallery } from "./TemplateGallery";
import { pageMetadata } from "../seo";

export const pages = [
  { path: "/", file: "index.html", content: renderToStaticMarkup(<LandingPage />), metadata: pageMetadata("/") },
  { path: "/templates", file: "templates/index.html", content: renderToStaticMarkup(<TemplateGallery />), metadata: pageMetadata("/templates") },
];
