import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./LandingPage";
import { api, type Session } from "./api";
import "./style.css";
import "./home.css";
import "./flow.css";

const App = lazy(() => import("./main"));
const TemplateGallery = lazy(() => import("./TemplateGallery").then(module => ({ default: module.TemplateGallery })));

class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <main className="loading"><h1>DocSync couldn’t open.</h1><p>Check your connection and reload to continue.</p><button className="home-button" onClick={() => location.reload()}>Reload DocSync</button></main>
      : this.props.children;
  }
}

function Entry() {
  const [workspace, setWorkspace] = useState(location.pathname !== "/");
  const [session, setSession] = useState<Session>();
  useEffect(() => {
    if (location.pathname !== "/") return;
    const controller = new AbortController();
    void api<Session>("/session", "GET", undefined, controller.signal)
      .then(session => { setSession(session); setWorkspace(true); })
      .catch(() => { /* Public content remains usable when the API is unavailable. */ });
    return () => controller.abort();
  }, []);
  if (location.pathname === "/templates") return <Suspense fallback={<p className="loading">Opening templates…</p>}><TemplateGallery initialFormat={new URLSearchParams(location.search).get("format")} initialTemplate={new URLSearchParams(location.search).get("template")} /></Suspense>;
  if (!workspace) return <LandingPage />;
  return <Suspense fallback={<p className="loading" role="status">Opening your workspace…</p>}><App initialSession={session} /></Suspense>;
}

createRoot(document.getElementById("root")!).render(<AppBoundary><Entry /></AppBoundary>);
