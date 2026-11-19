import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError, type Session } from "./api";
import { LandingPage } from "./LandingPage";
import { ShareDialog } from "./ShareDialog";
import { AcceptInvitation } from "./Collaborators";
import { VersionHistory } from "./VersionHistory";
import { useDocumentLock } from "./useDocumentLock";
import { MediaContext } from "./MediaContext";
import { CollaboratorPresence } from "./CollaboratorPresence";
import { AgentSkill } from "./AgentSkill";
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
import themeCatalog from "../../skills/docsync/themes.json";

type Summary = {
  id: string;
  title: string;
  revision: number;
  updated_at: string;
  format?: "document" | "presentation";
};
type ThemeCatalogItem = {
  id: string;
  name: string;
  format: "document" | "presentation";
  description: string;
  title: string;
  background: string;
  color: string;
  accent: string;
  sample: string;
};

const themes = themeCatalog as ThemeCatalogItem[];
const customThemePrompt =
  "Use DocSync to create a document or presentation with a custom theme. Style direction: [describe colors, typography, mood, density, and audience]. Use only facts I provide. Label any example or simulated data clearly. Add interactive charts only when useful, verify the saved result, and return a share link.";

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
}: {
  content: RenderedContent;
  slideshow: boolean;
  onSlideshowChange: (open: boolean) => void;
  pageLocks?: PageLockControls;
  page?: number;
  onPageChange?: (index: number) => void;
  footer?: (section: RenderedContent["sections"][number], index: number) => ReactNode;
}) {
  const [ownPage, setOwnPage] = useState(0);
  const page = controlledPage ?? ownPage;
  const setPage = (next: number | ((value: number) => number)) => {
    const value = typeof next === "function" ? next(page) : next;
    if (onPageChange) onPageChange(value); else setOwnPage(value);
  };
  const isPresentation = isPresentationContent(content);
  const lastPage = content.sections.length - 1;
  const current = content.sections[Math.min(page, lastPage)];
  const itemName = isPresentation ? "slide" : "page";

  useEffect(() => {
    if (!isPresentation) return;
    const navigate = (event: KeyboardEvent) => {
      if (slideshow || event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || (event.target as HTMLElement).closest("input,textarea,select,[contenteditable]")) return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setPage((value) => Math.max(0, value - 1));
      } else if (
        event.key === "ArrowRight" ||
        event.key === "PageDown"
      ) {
        event.preventDefault();
        setPage((value) => Math.min(lastPage, value + 1));
      }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [isPresentation, lastPage, slideshow]);

  const controls = (
    <div className="shared-viewer-toolbar" aria-label={`${isPresentation ? "Slide" : "Page"} navigation`}>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Previous ${itemName}`}
        disabled={page === 0}
        onClick={() => setPage((value) => Math.max(0, value - 1))}
      >
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="shared-page-indicator" aria-live="polite">
        {isPresentation ? "Slide" : "Page"} {page + 1} of {content.sections.length}
      </span>
      <Button
        variant="ghost"
        size="sm"
        aria-label={`Next ${itemName}`}
        disabled={page === lastPage}
        onClick={() => setPage((value) => Math.min(lastPage, value + 1))}
      >
        <ChevronRight className="w-4 h-4" />
      </Button>
      {isPresentation && <Button variant="outline" size="sm" onClick={() => onSlideshowChange(true)}><Play size={14} /> Present</Button>}
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
          <div className="shared-page-stage">
            <div className="shared-page">
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
  busy,
  claim,
  authenticate,
  onBackToLanding,
  recovering = false,
  recoveryEmail,
}: {
  authMode: "signin" | "signup" | "legacy";
  setAuthMode: (mode: "signin" | "signup" | "legacy") => void;
  error: string;
  setError: (err: string) => void;
  google: boolean;
  busy: boolean;
  claim: string;
  authenticate: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onBackToLanding: () => void;
  recovering?: boolean;
  recoveryEmail?: string;
}) {
  const formId = useId();
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
              ? "Make yourself at home."
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

        {google && !recovering && (
          <>
            <Button
              variant="outline"
              className="w-full justify-between h-10 mb-3 text-xs font-medium"
              asChild
            >
              <a href="/api/auth/google">
                Continue with Google <ArrowRight className="w-4 h-4 ml-1" />
              </a>
            </Button>
            <div className="or mb-3">or use your email</div>
          </>
        )}

        <form onSubmit={authenticate} className="space-y-3.5" aria-busy={busy} aria-describedby={error ? `${formId}-error` : undefined}>
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
                  autoComplete={
                    authMode === "signup"
                      ? "new-password"
                      : "current-password"
                  }
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
            {busy
              ? "Please wait…"
              : authMode === "signup"
                ? "Create account →"
                : "Sign in →"}
          </Button>
        </form>

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
      p === "/connect" || p === "/audit" ||
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
    [google, setGoogle] = useState(false);
  const [documents, setDocuments] = useState<Summary[]>([]),
    [doc, setDoc] = useState<Document | null>(null),
    [dirty, setDirty] = useState(false),
    [search, setSearch] = useState(""),
    [view, setView] = useState<"library" | "connect" | "audit">(
      location.pathname === "/audit" ? "audit" : location.pathname === "/connect" ? "connect" : "library",
    );
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
  const [mcpClients, setMcpClients] = useState<{client_id:string;client_name:string;access_expires:number}[]>([]);
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
        // Optional Google configuration must not block email sign-in or the workspace.
        void api<{ google: boolean }>("/auth/config", "GET", undefined, signal)
          .then(config => { if (!signal.aborted) setGoogle(config.google); }).catch(() => {});
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
    if (view !== "connect" || !session) return;
    const controller = new AbortController();
    const { signal } = controller;
    setConnectionLoading(true);
    void Promise.all([
      api<{ active: boolean; allowPublishing: boolean }>("/agent-token", "GET", undefined, signal),
      api<typeof mcpClients>("/mcp-clients", "GET", undefined, signal),
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
    if (!doc || editorMode !== "slide" || fullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        setActiveSlide((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        setActiveSlide((prev) => Math.min(doc.sections.length - 1, prev + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, editorMode, fullscreen]);

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
      } else if (location.pathname === "/audit") {
        setDoc(null);
        setDirty(false);
        setPreview(false);
        setView("audit");
        setError("");
        setNotice("");
      } else if (location.pathname === "/connect") {
        setDoc(null);
        setDirty(false);
        setView("connect");
      } else if (location.pathname === "/") {
        setDoc(null);
        setDirty(false);
        setPreview(false);
        setView("library");
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

  async function connect() {
    if (!leave()) return;
    setDoc(null);
    setDirty(false);
    setView("connect");
    window.history.pushState(null, "", "/connect");
  }

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      await api(
        authMode === "legacy" ? "/login" : "/auth/" + authMode,
        "POST",
        authMode === "legacy"
          ? { key: form.get("key") }
          : { email: form.get("email"), password: form.get("password") },
      );
      const signedIn = await api<Session>("/session");
      if (doc && session && signedIn.email !== session.email) throw new ApiError(403, `Sign back in as ${session.email} to continue with this draft.`);
      setSession(signedIn);
      setSessionExpired(false);
      setAuthenticationNeeded(false);
      if (!doc) {
        const route = documentRoute();
        await Promise.all([refresh(), route ? loadDocument(route.id, false, route.preview) : Promise.resolve()]);
      }
      setAuthPage(false);
      if (!doc && !documentRoute()) window.history.replaceState(null, "", view === "audit" ? "/audit" : view === "connect" || claim ? "/connect" : "/");
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
          onClick={() => { if (!leave()) return; setDoc(null); setView("connect"); window.history.pushState(null, "", "/connect"); }}
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
            onClick={() => {
              if (leave()) {
                setDoc(null);
                setDirty(false);
                setView("library");
                setPreview(false);
                window.history.pushState(null, "", "/");
              }
            }}
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
              view === "connect"
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
            onClick={() => void connect()}
          >
            <Bot className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Connect agent</span>
          </button>
          <button type="button" disabled={busy} className={cn("w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors cursor-pointer border-0 bg-transparent text-left", view === "audit" ? "bg-secondary font-medium text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}
            onClick={() => { if (leave()) { setDoc(null); setDirty(false); setPreview(false); setError(""); setNotice(""); setView("audit"); window.history.pushState(null, "", "/audit"); } }}>
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
                  {view === "audit" ? "Audit log" : view === "connect" ? "Connect agent" : "My documents"}
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
        }} /> : view === "audit" ? <AuditLog /> : view === "connect" ? (
          <section className="connect-page" aria-busy={connectionLoading}>
            {connectionLoading && <p role="status">Checking your agent connection…</p>}
            <p className="eyebrow">YOUR AGENT, YOUR WORKSPACE</p>
            <h1 className="tracking-tight">Good ideas travel.</h1>
            <p className="subtitle">
              Connect Claude, Codex, Antigravity, or any MCP-compatible agent.
            </p>
            <AgentSkill />
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
            <div className="connect-card">
              <span className="step">01</span>
              <h3 className="tracking-tight">Optional: use a private token</h3>
              <p>
                Use this for local stdio clients. Remote clients can connect below and authorize in your browser without copying a token.
              </p>
              <details className="mt-3">
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
            </div>
            <div className="connect-card">
              <span className="step">02</span>
              <h3 className="tracking-tight">Connect directly from your client</h3>
              <p>
                Add DocSync as a remote MCP server. Your client opens a DocSync sign-in page to authorize access; no local server or copied token is needed.
              </p>
              <h4 className="mt-3">Codex CLI</h4>
              <pre>{`codex mcp add docsync --url ${location.origin}/mcp\ncodex mcp login docsync`}</pre>
              <h4 className="mt-3">Antigravity CLI</h4>
              <pre>{`agy mcp add --type http docsync ${location.origin}/mcp`}</pre>
              <h4 className="mt-3">Claude Code</h4>
              <pre>{`claude mcp add --transport http docsync ${location.origin}/mcp`}</pre>
              <p className="text-xs text-muted-foreground mt-2">
                The client will open DocSync in your browser for sign-in and permission approval.
              </p>
              <details className="mt-3">
                <summary>Other remote MCP clients</summary>
                <pre>
                  {JSON.stringify(
                    {
                      mcpServers: {
                        docsync: {
                          type: "http",
                          url: `${location.origin}/mcp`,
                        },
                      },
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              <details className="mt-3">
                <summary>Use a local stdio server</summary>
                <p>For clients that do not support remote MCP servers.</p>
                <Button variant="outline" size="sm" asChild>
                  <a href="/downloads/docsync-mcp.cjs" download>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    Download MCP server
                  </a>
                </Button>
                <pre>{`agy mcp add docsync node /path/to/docsync-mcp.cjs --url ${location.origin}`}</pre>
              </details>
              <div className="mt-4 border-t pt-3">
                <h4>Authorized MCP clients</h4>
                {mcpClients.length ? mcpClients.map((client) => (
                  <div key={client.client_id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm">{client.client_name}</span>
                    <Button variant="outline" size="sm" disabled={busy || connectionLoading} onClick={() => void run(async () => {
                      await api("/mcp-clients", "DELETE", {clientId:client.client_id});
                      setMcpClients(mcpClients.filter((item)=>item.client_id!==client.client_id));
                      setNotice(`${client.client_name} access revoked.`);
                    })}>Revoke access</Button>
                  </div>
                )) : <p className="text-xs text-muted-foreground">No remote MCP clients authorized yet.</p>}
              </div>
            </div>
            <div className="connect-card">
              <span className="step">03</span>
              <h3 className="tracking-tight">Start with a simple request</h3>
              <blockquote className="my-3">
                Use DocSync to make a report from these notes and return its
                link.
              </blockquote>
              <p className="text-xs text-muted-foreground">
                {["localhost", "127.0.0.1", "[::1]"].includes(location.hostname)
                  ? "Localhost links are local previews. Use a deployed DocSync server to share with other people."
                  : "During browser authorization, allow publishing if you want the agent to return share links. Anyone with a published link can view that document."}
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
            {!search && (
              <section className="theme-library" aria-labelledby="theme-library-title">
                <div className="theme-library-heading">
                  <div>
                    <h2 id="theme-library-title">Templates your agent can use</h2>
                    <p>Preview a template, then ask your connected agent to build from it. Every edit is made by your agent.</p>
                  </div>
                  <Badge variant="outline">{themes.length} templates + custom</Badge>
                </div>
                <div className="theme-grid">
                  {themes.map((theme) => (
                    <a
                      className="theme-card"
                      data-theme-id={theme.id}
                      key={theme.id}
                      href={`/templates?template=${theme.id}`}
                    >
                      <span
                        className="theme-preview"
                        style={{
                          background: theme.background,
                          color: theme.color,
                          borderTopColor: theme.accent,
                        }}
                      >
                        <small>{theme.format === "presentation" ? "PRESENTATION" : "DOCUMENT"}</small>
                        <strong>{theme.sample}</strong>
                        <span aria-hidden="true" className="theme-bars">
                          {[42, 65, 52, 78, 96].map((height) => (
                            <i key={height} style={{ height: `${height}%`, background: theme.accent }} />
                          ))}
                        </span>
                      </span>
                      <span className="theme-copy"><strong>{theme.name}</strong><small>{theme.description}</small></span>
                    </a>
                  ))}
                  <details className="theme-card custom-theme-card">
                    <summary>
                      <span className="custom-theme-mark"><Sparkles className="h-5 w-5" /></span>
                      <span className="theme-copy"><strong>Custom via agent</strong><small>Describe the look to Codex, Claude, or Antigravity.</small></span>
                    </summary>
                    <p>Paste this into your connected agent and replace the bracketed style direction:</p>
                    <code>{customThemePrompt}</code>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void run(async () => {
                        await navigator.clipboard.writeText(customThemePrompt);
                        setNotice("Custom theme prompt copied.");
                      })}
                    >
                      <Copy className="mr-1.5 h-3.5 w-3.5" />Copy agent prompt
                    </Button>
                  </details>
                </div>
              </section>
            )}
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
                    onClick={() => void connect()}
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
        <LoginPage authMode={authMode} setAuthMode={setAuthMode} error={error} setError={setError} google={false} busy={busy} claim="" authenticate={authenticate} onBackToLanding={() => { if (!busy) setSessionExpired(false); }} recovering recoveryEmail={session.email} />
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
