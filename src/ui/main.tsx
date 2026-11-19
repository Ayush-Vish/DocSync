import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { api, ApiError, type Session } from "./api";
import { LandingPage } from "./LandingPage";
import { ShareDialog } from "./ShareDialog";
import { AcceptInvitation } from "./Collaborators";
import { VersionHistory } from "./VersionHistory";
import { useDocumentLock } from "./useDocumentLock";
import { MediaContext } from "./MediaContext";
import { CollaboratorPresence } from "./CollaboratorPresence";
import { WorkspaceTemplates } from "./WorkspaceTemplates";
import { AgentConnectionGuide } from "./AgentConnectionGuide";
import { DownloadMenu } from "./DownloadMenu";
import { AuditLog } from "./AuditLog";
import { PageLockButton, PageLockDialog, PageLockInbox, usePageLockFeed, type PageLockControls } from "./PageLocks";
import type { PageLockRequest, PageLockState } from "../document";
import { exportOfflineHtml } from "../offline-export";
import { ArtifactFrame, ArtifactThumbnail } from "./ArtifactFrame";
import { PresentationViewer } from "./PresentationViewer";
import { DocumentViewer } from "./DocumentViewer";
import { DocumentCover } from "./DocumentCover";
import {
  FileText,
  Plus,
  Search,
  Bot,
  LayoutTemplate,
  Sparkles,
  Share2,
  Download,
  History,
  Eye,
  EyeOff,
  LogOut,
  Copy,
  ArrowRight,
  Shield,
  Presentation,
  Play,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isPresentationContent, type Document, type Revision, type RenderedContent } from "../document";

type Summary = {
  id: string;
  title: string;
  revision: number;
  updated_at: string;
  format?: "document" | "presentation";
};
const workspaceRoutes = { library: "/", agents: "/agents", templates: "/workspace/templates", audit: "/audit" } as const;
type WorkspaceView = keyof typeof workspaceRoutes;
type McpClient = { client_id: string; client_name: string; allowPublishing: boolean };

function workspaceView(path: string): WorkspaceView {
  if (path === "/connect" || path === workspaceRoutes.agents) return "agents";
  if (path === workspaceRoutes.templates) return "templates";
  if (path === workspaceRoutes.audit) return "audit";
  return "library";
}

const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";

const brand = (
  <span className="brand select-none">
    <span className="brand-mark">d.</span>DocSync
  </span>
);

const documentRoute = () => {
  const match = location.pathname.match(
    /^\/documents\/([a-f0-9-]{36})(\/preview)?$/,
  );
  return match ? { id: match[1], preview: Boolean(match[2]) } : null;
};

// Speaker notes are stored in the slide HTML; show them as plain text under the active slide.
function speakerNotes(html: string): string {
  const notes = /<aside\b[^>]*class=["'][^"']*\bspeaker-notes\b[^"']*["'][^>]*>([\s\S]*?)<\/aside>/i.exec(html)?.[1] ?? "";
  return notes.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}

const screenShapes = {
  widescreen: { label: "Widescreen (16:9)", aspect: "16 / 9" },
  projector: { label: "Projector (4:3)", aspect: "4 / 3" },
  phone: { label: "Portrait phone (9:16)", aspect: "9 / 16" },
} as const;

// Read-only viewer shared by published links and the signed-in workspace (agents make every edit).
// In the workspace it also offers page assignment: reserving a page for an agent or releasing it.
function SharedViewer({
  content,
  slideshow,
  onSlideshowChange,
  pageLocks,
  page: controlledPage,
  onPageChange,
  footer,
  screenPreview = false,
}: {
  content: RenderedContent;
  slideshow: boolean;
  onSlideshowChange: (open: boolean) => void;
  pageLocks?: PageLockControls;
  page?: number;
  onPageChange?: (index: number) => void;
  footer?: (section: RenderedContent["sections"][number], index: number) => ReactNode;
  screenPreview?: boolean;
}) {
  const [ownPage, setOwnPage] = useState(0);
  const [screen, setScreen] = useState<keyof typeof screenShapes>("widescreen");
  const page = controlledPage ?? ownPage;
  const setPage = useCallback((next: number) => {
    if (onPageChange) onPageChange(next); else setOwnPage(next);
  }, [onPageChange]);
  const isPresentation = isPresentationContent(content);
  const lastPage = content.sections.length - 1;
  const current = content.sections[Math.min(page, lastPage)];

  useEffect(() => {
    if (!isPresentation) return;
    const navigate = (event: KeyboardEvent) => {
      if (slideshow || event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (document.querySelector("dialog[open]") || (event.target instanceof Element && event.target.closest("input,textarea,select,[contenteditable]"))) return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setPage(Math.max(0, page - 1));
      } else if (
        event.key === "ArrowRight" ||
        event.key === "PageDown"
      ) {
        event.preventDefault();
        setPage(Math.min(lastPage, page + 1));
      }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [isPresentation, lastPage, page, setPage, slideshow]);

  const controls = (
    <div className="shared-viewer-toolbar" aria-label="Slide navigation">
      <Button
        variant="ghost"
        size="sm"
        className="shared-slide-arrow"
        aria-label="Previous slide"
        disabled={page === 0}
        onClick={() => setPage(Math.max(0, page - 1))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="shared-page-indicator" aria-live="polite">
        Slide {page + 1} of {content.sections.length}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="shared-slide-arrow"
        aria-label="Next slide"
        disabled={page === lastPage}
        onClick={() => setPage(Math.min(lastPage, page + 1))}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
      <Button size="sm" onClick={() => onSlideshowChange(true)}><Play size={14} /> Present</Button>
      {screenPreview && (
        <label className="slide-screen-choice">
          Screen preview
          <select value={screen} onChange={event => setScreen(event.currentTarget.value as keyof typeof screenShapes)}>
            {Object.entries(screenShapes).map(([value, shape]) => <option key={value} value={value}>{shape.label}</option>)}
          </select>
        </label>
      )}
    </div>
  );

  if (isPresentation) return (
    <section className="shared-viewer shared-slide-viewer" aria-label="Presentation viewer">
      {controls}
      <div className="shared-slide-layout">
        <aside className="shared-slide-filmstrip" aria-label="Slides">
          {content.sections.map((section, index) => (
            <div key={section.id} className={cn("shared-slide-item", pageLocks?.lockedIds.has(section.id) && "reserved")}>
              <button
                type="button"
                className={cn("shared-slide-thumbnail", index === page && "active")}
                aria-label={`Show slide ${index + 1}`}
                aria-current={index === page ? "page" : undefined}
                onClick={() => setPage(index)}
              >
                <span>{index + 1}</span>
                <span className="shared-slide-thumbnail-preview">
                  <ArtifactThumbnail title={`Slide ${index + 1} thumbnail`} section={section} />
                </span>
              </button>
              {pageLocks && <span className="shared-slide-lock">{pageLocks.button(section.id, `Slide ${index + 1}`)}</span>}
            </div>
          ))}
        </aside>
        <div className="shared-slide-workarea">
          <div className={cn("shared-page-stage", screenPreview && "slide-screen-stage")}>
            <div className={cn("shared-page", screenPreview && "slide-screen")}
              style={screenPreview ? { "--screen-aspect": screenShapes[screen].aspect } as CSSProperties : undefined}>
              {slideshow ? <ArtifactThumbnail section={current} title={`Slide ${page + 1}`} /> : <ArtifactFrame
                key={current.id}
                title={`Slide ${page + 1}: ${content.title}`}
                section={current}
                fitSlide
              />}
            </div>
          </div>
          <div className="shared-speaker-notes">{footer ? footer(current, Math.min(page, lastPage)) : "Shared presentation · Read only"}</div>
        </div>
      </div>
      {slideshow && (
        <PresentationViewer
          sections={content.sections}
          initialSlide={page}
          title={content.title}
          startFullscreen={screenPreview}
          onClose={() => onSlideshowChange(false)}
          onSlideChange={(idx) => setPage(idx)}
        />
      )}
    </section>
  );

  return <div className="shared-viewer shared-document-viewer">
    <DocumentViewer sections={content.sections} page={page} onPageChange={setPage} title={content.title}
      actions={pageLocks?.button(current.id, `Page ${Math.min(page, lastPage) + 1}`)} />
  </div>;
}

function SharedWorkspace({ content, error }: { content: RenderedContent | null; error: string }) {
  const isPresentation = content ? isPresentationContent(content) : false;
  const [slideshow, setSlideshow] = useState(() =>
    typeof window !== "undefined" && (location.hash === "#present" || new URLSearchParams(location.search).get("mode") === "present")
  );

  const changeSlideshow = setSlideshow;

  return (
    <MediaContext.Provider value={content?.mediaToken}><div className="app-shell shared-app-shell document-shell">
      <aside className="sidebar shared-sidebar">
        {brand}
        <div className="shared-sidebar-item">
          <Eye className="w-4 h-4" />
          <span>Shared {isPresentation ? "presentation" : "document"}</span>
        </div>
        <div className="sidebar-note mt-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
            <span className="status-dot w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
            Read-only shared view
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">
            Content and interactive controls are available. Editing remains private.
          </p>
        </div>
      </aside>
      <main className="workspace document-workspace shared-workspace">
        <header className="topbar">
          <strong className="shared-document-title">{content?.title || "Shared document"}</strong>
          <div className="shared-header-actions">
            {isPresentation && (
              <Button variant="outline" size="sm" onClick={() => changeSlideshow(true)}>
                <Presentation className="w-3.5 h-3.5" /> Slideshow
              </Button>
            )}
            <Badge variant="outline" className="text-muted-foreground text-xs font-normal gap-1.5">
              <Eye className="w-3 h-3" /> Read only
            </Badge>
          </div>
        </header>
        {error && (
          <div role="alert" className="error banner">
            {error}
          </div>
        )}
        <section className="shared-editor-page">
          <div className="shared-editor-heading">
            <div className="shared-editor-actions">
              <span className="shared-format-chip">
                {isPresentation ? <Presentation className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                {isPresentation ? "Slides (PPT)" : "Document"}
              </span>
              <span className="shared-format-chip active"><Eye className="w-3.5 h-3.5" /> Preview</span>
            </div>
          </div>
          <main className="shared">
            {content && (
              <SharedViewer
                content={content}
                slideshow={slideshow}
                onSlideshowChange={changeSlideshow}
              />
            )}
          </main>
        </section>
      </main>
    </div></MediaContext.Provider>
  );
}

function LoginPage({
  authMode,
  setAuthMode,
  error,
  setError,
  google,
  googleUrl,
  busy,
  claim,
  authenticate,
  onBackToLanding,
  recovering = false,
  recoveryEmail,
  resumeGoogleSession,
}: {
  authMode: "signin" | "signup" | "legacy";
  setAuthMode: (mode: "signin" | "signup" | "legacy") => void;
  error: string;
  setError: (err: string) => void;
  google: boolean | null;
  googleUrl?: string;
  busy: boolean;
  claim: string;
  authenticate: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onBackToLanding: () => void;
  recovering?: boolean;
  recoveryEmail?: string;
  resumeGoogleSession?: () => void;
}) {
  const formId = useId();
  const googleOnly = authMode === "signup" || Boolean(resumeGoogleSession);
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => setShowPassword(false), [authMode]);
  function switchMode(mode: "signin" | "signup" | "legacy") {
    setAuthMode(mode);
    setError("");
    if (["/login", "/signup"].includes(location.pathname))
      window.history.replaceState(null, "", mode === "signup" ? "/signup" : "/login");
  }
  return (
    <div className="auth-centered-layout">
      <div className="mb-4 sm:mb-6 flex items-center justify-between w-full max-w-[420px]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2"
          onClick={onBackToLanding}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {recovering ? "Keep draft open" : "Back to DocSync"}
        </Button>
        <span className="text-xs text-muted-foreground font-mono">v0.5.0</span>
      </div>

      <div className="auth-centered-card">
        <div className="mb-6">
          <div className="mb-3">{brand}</div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {recovering ? "Sign in to continue." : authMode === "signup"
              ? "Create a DocSync account"
              : authMode === "legacy"
                ? "Workspace Owner Key"
                : "Welcome back."}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {recovering ? "Your session expired. Your draft stays open while you sign in again." : claim
              ? "Sign in to bring your first document into your workspace."
              : "A quiet place to do your best thinking."}
          </p>
        </div>

        {error && (
          <div id={`${formId}-error`} role="alert" className="error mb-4">
            {error}
          </div>
        )}

        {google && googleUrl && authMode !== "legacy" && (
          <>
            <Button
              variant={googleOnly ? "default" : "outline"}
              className="w-full justify-between h-10 mb-3 text-xs font-medium"
              asChild
            >
              <a href={googleUrl} target={recovering ? "_blank" : undefined} rel={recovering ? "noopener" : undefined}>
                Continue with Google <ArrowRight className="w-4 h-4 ml-1" />
              </a>
            </Button>
            {!googleOnly && <div className="or mb-3">or sign in with an existing password</div>}
            {resumeGoogleSession && <>
              <p className="text-xs text-muted-foreground mb-3">Sign in as {recoveryEmail} in the new tab, then return here.</p>
              <Button type="button" variant="outline" disabled={busy} onClick={resumeGoogleSession}>Resume workspace</Button>
            </>}
          </>
        )}
        {googleOnly && google === false && (
          <p role="status" className="text-xs text-muted-foreground">Google sign-in is currently unavailable. Try again later.</p>
        )}

        {!googleOnly && <form onSubmit={authenticate} className="space-y-3.5" aria-busy={busy} aria-describedby={error ? `${formId}-error` : undefined}>
          <fieldset disabled={busy} className="space-y-3.5">
          {authMode === "legacy" ? (
            <div className="space-y-1.5">
              <label htmlFor={`${formId}-key`} className="text-xs font-medium text-muted-foreground">
                Workspace owner key
              </label>
              <Input
                id={`${formId}-key`}
                name="key"
                maxLength={200}
                type="password"
                required
                autoComplete="current-password"
                className="h-9 text-xs"
              />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor={`${formId}-email`} className="text-xs font-medium text-muted-foreground">
                  Email address
                </label>
                <Input
                  id={`${formId}-email`}
                  name="email"
                  maxLength={254}
                  defaultValue={recoveryEmail}
                  readOnly={recovering}
                  autoFocus={!recovering}
                  type="email"
                  placeholder="you@company.com"
                  required
                  autoComplete="email"
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${formId}-password`} className="text-xs font-medium text-muted-foreground">
                  Password
                </label>
                <div className="password-field"><Input
                  id={`${formId}-password`}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 12 characters"
                  minLength={12}
                  maxLength={256}
                  required
                  autoComplete="current-password"
                  className="h-9 text-xs"
                  autoFocus={recovering}
                /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}</button></div>
              </div>
            </>
          )}

          </fieldset>
          <Button
            type="submit"
            className="w-full justify-between h-9 text-xs font-medium mt-1"
            disabled={busy}
          >
            {busy ? "Please wait…" : "Sign in →"}
          </Button>
        </form>}

        {!recovering && <><p className="auth-switch text-xs text-muted-foreground mt-5 text-center">
          {authMode === "signup"
            ? "Already have an account?"
            : "New to DocSync?"}{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer"
            onClick={() => {
              switchMode(authMode === "signup" ? "signin" : "signup");
            }}
          >
            {authMode === "signup" ? "Sign in" : "Create an account"}
          </button>
        </p>

        <div className="text-center mt-3 pt-3 border-t border-border">
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            onClick={() => {
              switchMode(authMode === "legacy" ? "signin" : "legacy");
            }}
          >
            {authMode === "legacy"
              ? "Use email instead"
              : "Existing workspace owner"}
          </button>
        </div></>}
      </div>
    </div>
  );
}

export default function App({ initialSession }: { initialSession?: Session }) {
  const isAuthRoute = () => {
    const p = location.pathname;
    return (
      p === "/login" ||
      p === "/signup" ||
      workspaceView(p) !== "library" ||
      p === "/invite" ||
      Boolean(sessionStorage.getItem("docsync_invite")) ||
      Boolean(sessionStorage.getItem("docsync_claim")) ||
      location.hash.includes("claim=") || location.hash.includes("invite=")
    );
  };
  const [authPage, setAuthPage] = useState(isAuthRoute);
  const [session, setSession] = useState<Session | null>(initialSession || null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "legacy">(
      location.pathname === "/signup" ? "signup" : "signin",
    ),
    [google, setGoogle] = useState<boolean | null>(null);
  const [documents, setDocuments] = useState<Summary[]>([]),
    [doc, setDoc] = useState<Document | null>(null),
    [dirty, setDirty] = useState(false),
    [search, setSearch] = useState(""),
    [view, setView] = useState(() => workspaceView(location.pathname));
  const [preview, setPreview] = useState(false),
    [activeSlide, setActiveSlide] = useState(0),
    [activeSectionIndex, setActiveSectionIndex] = useState(0),
    [fullscreen, setFullscreen] = useState(false),
    [history, setHistory] = useState<Revision[] | null>(null),
    [share, setShare] = useState(""),
    [published, setPublished] = useState<number | null>(null),
    [token, setToken] = useState(""),
    [allowPublishing, setAllowPublishing] = useState(false),
    [tokenActive, setTokenActive] = useState(false),
    [shareModalOpen, setShareModalOpen] = useState(false),
    [copiedLink, setCopiedLink] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pageLockTarget, setPageLockTarget] = useState<{ documentId: string; pageId: string } | null>(null);
  const [pageLockInboxOpen, setPageLockInboxOpen] = useState(false);
  const pageLockFeed = usePageLockFeed<PageLockState>(doc ? `/documents/${doc.id}/page-locks` : null);
  const pageRequestFeed = usePageLockFeed<PageLockRequest[]>(session ? "/page-lock-requests" : null);
  const lockedPageIds = new Set(pageLockFeed.data?.locks.map(item => item.pageId));
  const pageLockControls: PageLockControls = {
    lockedIds: lockedPageIds,
    button: (pageId, title) => <PageLockButton title={title} locked={lockedPageIds.has(pageId)}
      onClick={() => { if (doc) setPageLockTarget({ documentId: doc.id, pageId }); }} />,
  };
  const editorMode = doc && isPresentationContent(doc) ? "slide" : "doc";
  const showPageLockInbox = () => { pageRequestFeed.refresh(); setPageLockInboxOpen(true); };
  const safeActiveSlide = doc && doc.sections.length > 0
    ? Math.min(activeSlide, doc.sections.length - 1)
    : 0;
  const [claim, setClaim] = useState(() => {
    const code = new URLSearchParams(location.hash.slice(1)).get("claim");
    if (code && /^[a-f0-9]{64}$/.test(code)) {
      sessionStorage.setItem("docsync_claim", code);
      window.history.replaceState(null, "", location.pathname);
    }
    return sessionStorage.getItem("docsync_claim") || "";
  });
  const [invitation, setInvitation] = useState(() => {
    const token = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      sessionStorage.setItem("docsync_invite", token);
      window.history.replaceState(null, "", location.pathname);
    }
    return sessionStorage.getItem("docsync_invite") || "";
  });
  const [shared, setShared] = useState<RenderedContent | null>(null);
  const [mcpClients, setMcpClients] = useState<McpClient[]>([]);
  const sharePath = location.pathname.startsWith("/share/");
  const running = useRef(false);
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  const draftVersion = useRef(0);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const lock = useDocumentLock(doc?.id ?? null, false, async (revision) => {
    const current = latestDoc.current;
    if (!current || current.revision === revision) return;
    if (dirtyRef.current) { setError("A newer version was saved. Your draft is preserved. Compare version history before reconciling your changes."); return; }
    const version = draftVersion.current;
    const fresh = await api<Document>(`/documents/${current.id}`);
    if (latestDoc.current?.id === current.id && draftVersion.current === version && !dirtyRef.current) {
      latestDoc.current = fresh;
      setDoc(fresh);
    }
  }, dirty);
  useEffect(() => {
    if (lock.documentId === doc?.id && lock.access && lock.access !== doc.access) {
      setDoc(current => current?.id === lock.documentId ? { ...current, access: lock.access } : current);
    }
  }, [lock.documentId, lock.access, doc?.id, doc?.access]);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [authenticationNeeded, setAuthenticationNeeded] = useState(false);
  const recoveryDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!sessionExpired) return;
    const dialog = recoveryDialog.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, [sessionExpired]);

  const [connectionLoading, setConnectionLoading] = useState(false);

  function fail(error: unknown) {
    if (error instanceof ApiError && error.status === 401 && session) {
      setAuthMode(session.legacy ? "legacy" : "signin");
      setAuthenticationNeeded(true);
      setSessionExpired(true);
    }
    setError(message(error));
  }

  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      fail(e);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  async function refresh() {
    setDocuments(await api("/documents"));
  }

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        if (sharePath) {
          setShared(await api("/shared/" + location.pathname.split("/").pop(), "GET", undefined, signal));
          return;
        }
        void api<{ google: boolean }>("/auth/config", "GET", undefined, signal)
          .then(config => { if (!signal.aborted) setGoogle(config.google); })
          .catch(() => { if (!signal.aborted) setGoogle(false); });
        const currentSession = initialSession || await api<Session>("/session", "GET", undefined, signal);
        if (signal.aborted) return;
        setSession(currentSession);
        const route = documentRoute();
        await Promise.all([
          api<Summary[]>("/documents", "GET", undefined, signal).then(items => { if (!signal.aborted) setDocuments(items); }),
          route ? loadDocument(route.id, false, route.preview, signal) : Promise.resolve(),
        ]);
      } catch (e) {
        if (signal.aborted) return;
        if (e instanceof ApiError && e.status === 401) setAuthPage(true);
        else setError(message(e));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (view !== "agents" || !session) return;
    const controller = new AbortController();
    const { signal } = controller;
    setConnectionLoading(true);
    void Promise.all([
      api<{ active: boolean; allowPublishing: boolean }>("/agent-token", "GET", undefined, signal),
      api<McpClient[]>("/mcp-clients", "GET", undefined, signal),
    ]).then(([credential, clients]) => {
      if (signal.aborted) return;
      setTokenActive(credential.active);
      setAllowPublishing(credential.active && credential.allowPublishing);
      setMcpClients(clients);
    }).catch(error => { if (!signal.aborted) fail(error); })
      .finally(() => { if (!signal.aborted) setConnectionLoading(false); });
    return () => { controller.abort(); setToken(""); };
  }, [view, session]);

  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);


  useEffect(() => {
    const handlePop = () => {
      if (running.current && doc) {
        window.history.pushState(null, "", `/documents/${doc.id}${preview ? "/preview" : ""}`);
        setNotice("Please wait for the current request to finish.");
        return;
      }
      setAuthPage(isAuthRoute());
      if (location.pathname === "/signup") setAuthMode("signup");
      else if (location.pathname === "/login") setAuthMode("signin");
      if (!session) return;
      const route = documentRoute();
      if (dirty && doc && !confirm("Discard your unsaved changes? Download a draft first if you want to keep them.")) {
        window.history.pushState(null, "", `/documents/${doc.id}${preview ? "/preview" : ""}`);
        return;
      }
      if (route) {
        void run(() => loadDocument(route.id, false, route.preview));
      } else {
        const next = workspaceView(location.pathname);
        if (next === "library" && location.pathname !== workspaceRoutes.library) return;
        setDoc(null);
        setDirty(false);
        setPreview(false);
        setView(next);
        setError("");
        setNotice("");
      }
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [dirty, doc, preview, session]);

  const goToLanding = () => {
    setError("");
    setAuthPage(false);
    window.history.pushState(null, "", "/");
  };

  const leave = () => {
    if (running.current) { setNotice("Please wait for the current request to finish."); return false; }
    return !dirty || confirm("Discard your unsaved changes? Download a draft first if you want to keep them.");
  };

  async function loadDocument(id: string, navigate: boolean, openPreview: boolean, signal?: AbortSignal) {
    const [next, pub] = await Promise.all([
      api<Document>("/documents/" + id, "GET", undefined, signal),
      api<{ revision: number } | null>("/documents/" + id + "/publish", "GET", undefined, signal),
    ]);
    if (signal?.aborted) return;
    setDoc(next);
    setPreview(openPreview || next.access === "viewer");
    setActiveSlide(0);
    setActiveSectionIndex(0);
    setDirty(false);
    setShare("");
    setCopiedLink("");
    setHistory(null);
    setView("library");
    setPublished(pub?.revision ?? null);
    if (navigate) window.history.pushState(null, "", `/documents/${id}${openPreview ? "/preview" : ""}`);
  }

  async function open(id: string) {
    if (!leave()) return;
    await run(() => loadDocument(id, true, false));
  }

  function exportDraft() {
    if (!doc) return;
    const { mediaToken, ...draft } = doc;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "docsync-draft.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadHtml() {
    if (!doc) return;
    await run(async () => {
      setExporting(true);
      try {
        const { html, filename } = await exportOfflineHtml(doc);
        const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setNotice("Offline HTML downloaded with your current draft, including unsaved changes.");
      } finally { setExporting(false); }
    });
  }

  function openWorkspace(next: WorkspaceView) {
    if (!leave()) return;
    setDoc(null);
    setDirty(false);
    setPreview(false);
    setError("");
    setNotice("");
    setView(next);
    if (location.pathname !== workspaceRoutes[next]) window.history.pushState(null, "", workspaceRoutes[next]);
  }

  async function finishSignIn() {
    const signedIn = await api<Session>("/session");
    if (doc && session && signedIn.accountId !== session.accountId)
      throw new ApiError(403, `Sign back in as ${session.email} to continue with this draft.`);
    setSession(signedIn);
    setSessionExpired(false);
    setAuthenticationNeeded(false);
    if (!doc) {
      const route = documentRoute();
      await Promise.all([refresh(), route ? loadDocument(route.id, false, route.preview) : Promise.resolve()]);
    }
    setAuthPage(false);
    if (!doc && !documentRoute()) {
      const next = claim ? "agents" : view;
      setView(next);
      window.history.replaceState(null, "", workspaceRoutes[next]);
    }
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api(
        authMode === "legacy" ? "/login" : "/auth/signin",
        "POST",
        authMode === "legacy"
          ? { key: form.get("key") }
          : { email: form.get("email"), password: form.get("password") },
      );
      await finishSignIn();
    });
  }

  if (loading && location.pathname === "/" && !authPage) return <LandingPage />;

  if (loading)
    return (
      <main className="loading">
        {brand}
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          <p>Opening your workspace…</p>
        </div>
      </main>
    );

  if (sharePath)
    return <SharedWorkspace content={shared} error={error} />;

  if (!session) {
    if (!authPage) {
      return (
        <LandingPage />
      );
    }
    return (
      <LoginPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        error={error}
        setError={setError}
        google={google}
        googleUrl={"/api/auth/google?" + new URLSearchParams({
          returnTo: invitation ? "/invite" : documentRoute() ? location.pathname : workspaceRoutes[claim ? "agents" : view],
        })}
        busy={busy}
        claim={claim}
        authenticate={authenticate}
        onBackToLanding={goToLanding}
      />
    );
  }

  const list = documents.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase()),
  );
  // The web app is read-only: agents hold the edit leases. Say who is editing right now, if anyone.
  const lockDescription = lock.lock
    ? `${lock.lock.holder} is editing with ${lock.lock.agent} right now.`
    : doc?.access === "viewer"
      ? "You have view access. The owner's connected agents make the edits."
      : "Your connected agent makes every edit. Reserve pages for it with the lock buttons, or review its work in the audit log.";

  return (
    <MediaContext.Provider value={doc?.mediaToken}><div className={cn("app-shell", doc && "document-shell")}>
      <aside className="sidebar">
        {brand}
        <Button
          className="new-button w-full justify-start gap-2 h-9 font-medium shadow-none"
          disabled={busy}
          onClick={() => openWorkspace("agents")}
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>New with your agent</span>
        </Button>
        <nav className="space-y-1">
          <button
            type="button"
            disabled={busy}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors cursor-pointer border-0 bg-transparent text-left",
              view === "library" && !doc
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
            onClick={() => openWorkspace("library")}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <span>My documents</span>
            </span>
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">
              <small>{documents.length}</small>
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            className={cn(
              "w-full flex items-center justify-start gap-2 px-3 py-2 text-sm rounded-md transition-colors cursor-pointer border-0 bg-transparent text-left",
              view === "agents"
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
            aria-current={view === "agents" ? "page" : undefined}
            onClick={() => openWorkspace("agents")}
          >
            <Bot className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Agents</span>
          </button>
          <button type="button" disabled={busy} aria-current={view === "templates" ? "page" : undefined}
            className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors cursor-pointer border-0 bg-transparent text-left", view === "templates" ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}
            onClick={() => openWorkspace("templates")}>
            <LayoutTemplate className="w-4 h-4 text-muted-foreground shrink-0" /><span>Templates</span>
          </button>
          <button type="button" disabled={busy} className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors cursor-pointer border-0 bg-transparent text-left", view === "audit" ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}
            onClick={() => openWorkspace("audit")}>
            <Shield className="w-4 h-4 text-muted-foreground shrink-0" /><span>Audit log</span>
          </button>
          {!doc && <button type="button" aria-label="Page lock requests" className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md cursor-pointer border-0 bg-transparent text-left text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            onClick={showPageLockInbox}>
            <Lock className="w-4 h-4 shrink-0" aria-hidden="true" /> Page lock requests
            {!!pageRequestFeed.data?.length && <Badge variant="outline" className="ml-auto">{pageRequestFeed.data.length}</Badge>}
          </button>}
        </nav>
        <div className="sidebar-note mt-auto rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground mb-1">
            <span className="status-dot w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
            Your next idea starts here.
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground mt-1">
            Ask your agent to make a document, then make it your own.
          </p>
        </div>
        <div className="account border-t border-border pt-3 flex items-center gap-2.5 text-xs text-muted-foreground">
          <span className="avatar w-7 h-7 rounded-full bg-secondary text-foreground font-semibold flex items-center justify-center text-xs shrink-0 select-none">
            {session.email[0].toUpperCase()}
          </span>
          <span className="truncate flex-1 font-medium text-foreground text-xs" title={session.email}>
            {session.email}
          </span>
          <button
            type="button"
            className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent flex items-center justify-center"
            title="Sign out"
            aria-label="Sign out"
            disabled={busy}
            onClick={() => {
              if (!leave()) return;
              void run(async () => {
                await api("/logout", "POST", {});
                setSession(null);
                setDoc(null);
                setDirty(false);
                setToken("");
                setAuthPage(true);
                setAuthMode("signin");
                window.history.pushState(null, "", "/login");
              });
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>
      <main className={cn("workspace", doc && "document-workspace")}>
        <header className="topbar">
          {doc ? (
            <div className="document-toolbar flex items-center justify-between w-full gap-3 min-w-0">
              {/* Left Breadcrumb & Title */}
              <div className="document-identity flex items-center gap-2 min-w-0 shrink">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 font-semibold text-foreground flex items-center gap-1.5 shrink-0"
                  onClick={() => {
                    if (!leave()) return;
                    setDoc(null);
                    setDirty(false);
                    setView("library");
                    setPreview(false);
                    window.history.pushState(null, "", "/");
                  }}
                >
                  {brand}
                </Button>
                <span className="text-muted-foreground select-none">/</span>
                <button
                  type="button"
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0 cursor-pointer border-0 bg-transparent"
                  onClick={() => {
                    if (!leave()) return;
                    setDoc(null);
                    setDirty(false);
                    setView("library");
                    setPreview(false);
                    window.history.pushState(null, "", "/");
                  }}
                >
                  My documents
                </button>
                <span className="text-muted-foreground select-none">/</span>
                <h1 className="document-title-text" title={doc.title}>{doc.title || "Untitled document"}</h1>
                <span className="shared-format-chip document-format-label">
                  {editorMode === "slide" ? <Presentation size={13} /> : <FileText size={13} />}
                  {editorMode === "slide" ? "Presentation" : "Document"}
                </span>
              </div>

              {/* Right Status & Actions */}
              <div className="document-actions flex items-center gap-2 shrink-0">
                <CollaboratorPresence key={doc.id} documentId={doc.id} />
                <Badge variant="outline" className="version-badge text-xs font-normal gap-1.5 hidden sm:inline-flex">
                  <span className="version-dot" aria-hidden="true" />
                  Version {doc.revision}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2.5"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      setHistory(await api(`/documents/${doc.id}/history`));
                    })
                  }
                >
                  <History className="w-3.5 h-3.5 mr-1" />
                  History
                </Button>
                <DownloadMenu disabled={busy} exporting={exporting} onHtml={() => void downloadHtml()} onJson={exportDraft} />
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 text-xs px-3 font-medium"
                  disabled={busy || doc.access !== "owner"}
                  onClick={() => { setError(""); setCopiedLink(""); setShareModalOpen(true); }}
                >
                  <Share2 className="w-3.5 h-3.5 mr-1.5" />
                  Share
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
                <span>Workspace</span>
                <span className="slash">/</span>
                <span className="text-foreground truncate">
                  {view === "audit" ? "Audit log" : view === "agents" ? "Agents" : view === "templates" ? "Templates" : "My documents"}
                </span>
              </div>
              <div className="shrink-0">
                <span className="muted text-xs">A clear space for your ideas</span>
              </div>
            </>
          )}
        </header>
        {doc && <div className="edit-lock-status read-only-status">
          <div className="edit-lock-summary" role="status" aria-live="polite" aria-atomic="true">
            <Badge variant="outline" className="edit-lock-badge"><Eye className="size-3.5" aria-hidden="true" />Read only</Badge>
            <span className="edit-lock-description">{lockDescription}</span>
          </div>
          <Button type="button" variant="ghost" size="sm" className="edit-lock-action" aria-label="Page lock requests" onClick={showPageLockInbox}>
            Page lock requests{!!pageRequestFeed.data?.length && <Badge variant="outline">{pageRequestFeed.data.length}</Badge>}
          </Button>
        </div>}
        {busy && <div className="request-progress" role="status" aria-label="Request in progress"><span /></div>}
        {error && (
          <div role="alert" className="error banner flex items-center justify-between gap-4">
            <div>
              {error}
              {!dirty && !authenticationNeeded && <Button variant="outline" size="sm" className="ml-2" disabled={busy} onClick={() => location.reload()}>Reload saved version</Button>}
              {session && authenticationNeeded && <Button variant="outline" size="sm" className="ml-2" onClick={() => { setAuthMode(session.legacy ? "legacy" : "signin"); setSessionExpired(true); }}>Sign in again</Button>}
              {dirty && (
                <span className="ml-2">
                  Your edits are still here.{" "}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2 ml-1"
                    onClick={exportDraft}
                  >
                    Download draft
                  </Button>
                </span>
              )}
            </div>
          </div>
        )}
        {notice && (
          <div role="status" className="notice banner">
            {notice}
          </div>
        )}
        {pageLockInboxOpen && <PageLockInbox requests={pageRequestFeed.data} error={pageRequestFeed.error}
          onClose={() => setPageLockInboxOpen(false)} onReview={request => {
            if (doc?.id === request.documentId) {
              setPageLockInboxOpen(false);
              setPageLockTarget({ documentId: request.documentId, pageId: request.pageId });
            } else if (leave()) {
              setPageLockInboxOpen(false);
              void run(async () => {
                await loadDocument(request.documentId, true, false);
                setPageLockTarget({ documentId: request.documentId, pageId: request.pageId });
              });
            }
          }} />}
        {doc && pageLockTarget?.documentId === doc.id && doc.sections.some(section => section.id === pageLockTarget.pageId) &&
          <PageLockDialog key={doc.id + ":" + pageLockTarget.pageId} doc={doc} pageId={pageLockTarget.pageId}
            slide={editorMode === "slide"} dirty={dirty} state={pageLockFeed.data} loadError={pageLockFeed.error}
            onClose={() => setPageLockTarget(null)} onUpdate={action => {
              pageLockFeed.refresh();
              pageRequestFeed.refresh();
              setPageLockTarget(null);
              setNotice(action === "request" ? "Unlock request sent." : action === "lock" ? "Selected pages reserved for the agent." : "Selected pages unlocked.");
            }} />}
        {invitation ? <AcceptInvitation token={invitation} onDismiss={() => { sessionStorage.removeItem("docsync_invite"); setInvitation(""); window.history.replaceState(null, "", "/"); }} onAccepted={async id => {
          await loadDocument(id, true, false);
          sessionStorage.removeItem("docsync_invite"); setInvitation("");
          await refresh();
        }} /> : view === "audit" ? <AuditLog /> : view === "templates" ? (
          <WorkspaceTemplates busy={busy} onCopyPrompt={prompt => void run(async () => {
            await navigator.clipboard.writeText(prompt);
            setNotice("Custom theme prompt copied.");
          })} />
        ) : view === "agents" ? (
          <section className="connect-page" aria-busy={connectionLoading}>
            {connectionLoading && <p role="status">Checking your agent connection…</p>}
            <h1 className="tracking-tight">Agents</h1>
            <p className="subtitle">
              Connect DocSync to the agent you use in your terminal, browser, or desktop app.
            </p>
            {claim && (
              <div className="claim-card">
                <h3 className="tracking-tight">Bring your first document home.</h3>
                <p>
                  Claim the document from the installation that created this
                  link. Its old trial credential will be revoked.
                </p>
                <Button
                  className="primary"
                  disabled={busy || connectionLoading || session.legacy}
                  onClick={() =>
                    void run(async () => {
                      await api("/claim", "POST", { code: claim });
                      setClaim("");
                      sessionStorage.removeItem("docsync_claim");
                      await refresh();
                      setNotice(
                        "Document added to your workspace. Connect your MCP client from this page.",
                      );
                    })
                  }
                >
                  Claim my document
                </Button>
                {session.legacy && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Sign in with a personal account to claim a trial.
                  </p>
                )}
              </div>
            )}
            <AgentConnectionGuide origin={location.origin} busy={busy} onCopy={(value, notice) => void run(async () => {
              await navigator.clipboard.writeText(value);
              setNotice(notice);
            })} />
            <section className="connect-card" aria-labelledby="authorized-clients-title">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="authorized-clients-title" className="text-base font-semibold">Authorized MCP clients</h2>
                <Button variant="outline" size="sm" disabled={busy || connectionLoading}
                  onClick={() => void run(async () => setMcpClients(await api<McpClient[]>("/mcp-clients")))}>Refresh clients</Button>
              </div>
              <p className="text-xs text-muted-foreground">Enable publishing after connecting. Anyone with a published link can view that document.</p>
              {mcpClients.length ? mcpClients.map(client => (
                <div key={client.client_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{client.client_name}</p>
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={client.allowPublishing} disabled={busy || connectionLoading}
                        aria-label={`Allow ${client.client_name} to publish share links`}
                        onChange={event => {
                          const allowPublishing = event.currentTarget.checked;
                          void run(async () => {
                            const saved = await api<{ allowPublishing: boolean }>("/mcp-clients", "PATCH", { clientId: client.client_id, allowPublishing });
                            setMcpClients(clients => clients.map(item => item.client_id === client.client_id ? { ...item, ...saved } : item));
                            setNotice(saved.allowPublishing ? `Publishing enabled for ${client.client_name}.` : `Publishing disabled for ${client.client_name}.`);
                          });
                        }} />
                      Allow publishing
                    </label>
                  </div>
                  <Button variant="outline" size="sm" disabled={busy || connectionLoading} onClick={() => void run(async () => {
                    await api("/mcp-clients", "DELETE", { clientId: client.client_id });
                    setMcpClients(clients => clients.filter(item => item.client_id !== client.client_id));
                    setNotice(`${client.client_name} access revoked.`);
                  })}>Revoke access</Button>
                </div>
              )) : <p className="text-xs text-muted-foreground">No remote MCP clients authorized yet.</p>}
            </section>
            <section className="connect-card" aria-labelledby="local-mcp-title">
              <h2 id="local-mcp-title" className="mb-2 text-base font-semibold">Local MCP bridge</h2>
              <p>
                Use the bridge for clients that connect through a local command.
              </p>
              <details id="local-mcp-setup" className="mt-3">
                <summary>Set up the local bridge</summary>
                <p className="mt-2">With Node.js 22.18 or later, download the bridge and add this entry to the client's MCP configuration using the absolute path to the file.</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="/downloads/docsync-mcp.cjs" download>
                    <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Download MCP server
                  </a>
                </Button>
                <pre>{JSON.stringify({ mcpServers: { docsync: { command: "node", args: ["/absolute/path/to/docsync-mcp.cjs", "--url", location.origin] } } }, null, 2)}</pre>
                <p>To connect your DocSync account, generate a private token below and run this command. Paste the token into the terminal, press Enter, then press Ctrl+D on macOS or Linux, or Ctrl+Z followed by Enter on Windows. Restart your agent after setup.</p>
                <pre>{`node /absolute/path/to/docsync-mcp.cjs login --url ${location.origin} --token-stdin`}</pre>
              </details>
              <details id="local-mcp-token" className="mt-3">
                <summary>Generate or revoke a private token</summary>
                <label className="checkbox flex items-center gap-2 text-xs font-normal cursor-pointer my-4">
                  <input
                    type="checkbox"
                    className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                    checked={allowPublishing}
                    onChange={(e) => setAllowPublishing(e.target.checked)}
                  />
                  Allow my agent to publish share links
                </label>
                {tokenActive && (
                  <p className="text-xs text-muted-foreground mb-3">
                    An active token exists. Generating another revokes it.
                  </p>
                )}
                <div className="actions flex items-center gap-2">
                  <Button
                    className="primary"
                    disabled={busy || connectionLoading}
                    onClick={() =>
                      void run(async () => {
                        if (
                          tokenActive &&
                          !confirm(
                            "Replace your existing token? Agents using it will need the new token.",
                          )
                        )
                          return;
                        setToken(
                          (await api("/agent-token", "POST", { allowPublishing }))
                            .token,
                        );
                        setTokenActive(true);
                      })
                    }
                  >
                    Generate token
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || connectionLoading}
                    onClick={() =>
                      void run(async () => {
                        if (!confirm("Revoke your agent token?")) return;
                        await api("/agent-token", "DELETE");
                        setToken("");
                        setTokenActive(false);
                        setNotice("Agent token revoked.");
                      })
                    }
                  >
                    Revoke token
                  </Button>
                </div>
                {token && (
                  <div className="token mt-4">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Copy now — shown once
                      <Input
                        aria-label="New agent token"
                        type="password"
                        readOnly
                        value={token}
                        className="font-mono text-xs mt-1"
                      />
                    </label>
                    <Button
                      variant="outline"
                      onClick={() =>
                        void run(async () => {
                          await navigator.clipboard.writeText(token);
                          setNotice(
                            "Token copied. Save it in your private MCP connection.",
                          );
                        })
                      }
                    >
                      <Copy className="w-3.5 h-3.5 mr-1" />
                      Copy token
                    </Button>
                  </div>
                )}
              </details>
            </section>

            <div className="connect-card">
              <h3 className="tracking-tight">Start with a simple request</h3>
              <blockquote className="my-3">
                Use DocSync to make a report from these notes and return its
                link.
              </blockquote>
              <p className="text-xs text-muted-foreground">
                {["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
                  ? "Localhost links are local previews. Use a deployed DocSync server to share with other people."
                  : "To get a share link, enable publishing for the agent under Authorized MCP clients."}
              </p>
            </div>
          </section>
        ) : doc ? (
          <SharedViewer
            key={doc.id}
            content={doc}
            slideshow={fullscreen}
            onSlideshowChange={setFullscreen}
            pageLocks={pageLockControls}
            screenPreview
            page={editorMode === "slide" ? safeActiveSlide : activeSectionIndex}
            onPageChange={editorMode === "slide" ? setActiveSlide : setActiveSectionIndex}
            footer={(section) => {
              const notes = speakerNotes(section.html);
              return <>{lockedPageIds.has(section.id) && <strong className="reserved-note">Reserved for an agent · </strong>}{notes ? <><span className="notes-label">Speaker notes</span> {notes}</> : "No speaker notes on this slide."}</>;
            }}
          />
        ) : (
          <section className="library">
            <div className="library-heading">
              <div>
                <p className="eyebrow">MAKE ROOM FOR WHAT MATTERS</p>
                <h1 className="tracking-tight">Your documents.</h1>
                <p className="subtitle">
                  A little structure for your next big idea.
                </p>
              </div>
              <div className="relative search w-full sm:w-64">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  aria-label="Search documents"
                  placeholder="Search documents…"
                  className="w-full h-9 pl-9 pr-3 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="library-label">
              <span>{search ? "SEARCH RESULTS" : "ALL DOCUMENTS"}</span>
              <span>{list.length} documents</span>
            </div>
            {list.length ? (
              <div className="document-grid">
                {list.map((item) => (
                  <button
                    type="button"
                    className="document-card group"
                    key={item.id}
                    disabled={busy}
                    onClick={() => void open(item.id)}
                  >
                    <div className={cn("document-thumbnail relative", item.format === "presentation" && "presentation-thumbnail")}>
                      <DocumentCover id={item.id} revision={item.revision} title={item.title} presentation={item.format === "presentation"} />
                      {item.format === "presentation" && (
                        <span className="document-format-badge absolute top-2 right-2 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                          Slides
                        </span>
                      )}
                    </div>
                    <h3>{item.title}</h3>
                    <p>
                      <span>
                        Edited{" "}
                        {new Date(item.updated_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">↗</span>
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty">
                <span className="empty-icon">
                  <Sparkles className="w-5 h-5 text-muted-foreground" />
                  <span className="sr-only">✳</span>
                </span>
                <h2>{search ? "No matches yet." : "A fresh page awaits."}</h2>
                <p>
                  {search
                    ? "Try another document title."
                    : "Create your first document or let your agent start one for you."}
                </p>
                {!search && (
                  <Button
                    onClick={() => openWorkspace("agents")}
                    className="gap-2"
                  >
                    Connect your agent →
                  </Button>
                )}
              </div>
            )}
          </section>
        )}
      </main>
      {history && doc && (
        <VersionHistory
          documentId={doc.id}
          canRestore={false}
          history={history}
          currentRevision={doc.revision}
          busy={busy}
          dirty={dirty}
          onRestore={async (rev) => {
            await run(async () => {
              const restored = await api<Document>(
                `/documents/${doc.id}/restore`,
                "POST",
                { revision: rev, expectedRevision: doc.revision, lockToken: (await lock.renew()).lockToken },
              );
              setDoc(restored);
              setHistory(null);
              await refresh();
              setNotice("Restored as a new version.");
            });
          }}
          onClose={() => setHistory(null)}
        />
      )}
      {sessionExpired && session && <dialog ref={recoveryDialog} className="session-dialog" aria-label="Sign in to keep working" onCancel={event => { event.preventDefault(); if (!busy) setSessionExpired(false); }}>
        <LoginPage authMode={authMode} setAuthMode={setAuthMode} error={error} setError={setError} google={session.google ? google : false}
          googleUrl={session.google ? "/api/auth/google?" + new URLSearchParams({ returnTo: "/login", reauth: session.accountId }) : undefined}
          resumeGoogleSession={session.google ? () => void run(finishSignIn) : undefined}
          busy={busy} claim="" authenticate={authenticate} onBackToLanding={() => { if (!busy) setSessionExpired(false); }} recovering recoveryEmail={session.email} />
      </dialog>}

      {shareModalOpen && doc && session && (
        <ShareDialog
          documentId={doc.id}
          title={doc.title}
          revision={doc.revision}
          published={published}
          share={share}
          presentation={isPresentationContent(doc)}
          dirty={dirty}
          copied={copiedLink}
          error={error}
          onCopy={url => void run(async () => {
            try { await navigator.clipboard.writeText(url); }
            catch { throw new Error("Clipboard access is unavailable. Select the published link and copy it manually."); }
            setCopiedLink(url);
            setNotice("Share link copied to clipboard.");
          })}
          onPublish={async () => {
            if (dirty) { setError("Save your changes before publishing."); return; }
            await run(async () => {
              const result = await api(`/documents/${doc.id}/publish`, "POST", { expectedRevision: doc.revision });
              setShare(result.url);
              setCopiedLink("");
              setPublished(result.revision);
              setNotice(result.linkAccess === "local_only" ? "Local preview link created." : "Share link created. Anyone with this link can view this version.");
            });
          }}
          onRevoke={async () => {
            await run(async () => {
              await api(`/documents/${doc.id}/publish`, "DELETE");
              setPublished(null);
              setShare("");
              setCopiedLink("");
              setNotice("Share link revoked. Your draft is private.");
            });
          }}
          onClose={() => setShareModalOpen(false)}
          busy={busy}
        />
      )}
    </div></MediaContext.Provider>
  );
}
