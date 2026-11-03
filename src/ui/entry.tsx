import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./LandingPage";
import "./style.css";
import "./home.css";

const App = lazy(() => import("./main"));
const TemplateGallery = lazy(() => import("./TemplateGallery").then(module => ({ default: module.TemplateGallery })));

function Entry() {
  const [workspace, setWorkspace] = useState(location.pathname !== "/");
  useEffect(() => {
    if (location.pathname !== "/") return;
    const controller = new AbortController();
    void fetch("/api/session", { signal: controller.signal, credentials: "same-origin" })
      .then(async response => {
        const session = await response.json();
        if (response.ok && session.authenticated) setWorkspace(true);
      })
      .catch(() => { /* Public content remains usable when the API is unavailable. */ });
    return () => controller.abort();
  }, []);
  if (location.pathname === "/templates") return <Suspense fallback={<p className="loading">Opening templates…</p>}><TemplateGallery initialFormat={new URLSearchParams(location.search).get("format")} initialTemplate={new URLSearchParams(location.search).get("template")} /></Suspense>;
  if (!workspace) return <LandingPage />;
  return <Suspense fallback={<p className="loading">Opening your workspace…</p>}><App /></Suspense>;
}

createRoot(document.getElementById("root")!).render(<Entry />);
