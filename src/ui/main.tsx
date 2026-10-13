import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import {
  FileText,
  Plus,
  Search,
  Bot,
  Sparkles,
  Share2,
  Save,
  Download,
  History,
  Eye,
  LogOut,
  Undo2,
  Redo2,
  Heading1,
  Heading2,
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Quote as QuoteIcon,
  Table as TableIcon,
  ArrowUp,
  ArrowDown,
  Trash2,
  Copy,
  ArrowRight,
  ExternalLink,
  Shield,
  Layers,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { frameSource } from "../content";
import type { Content, Document } from "../document";
import "./style.css";

type Session = { email: string; legacy: boolean };
type Summary = {
  id: string;
  title: string;
  revision: number;
  updated_at: string;
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function api<T = any>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, value.error || "Request failed");
  return value;
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

const blank = (): Content => ({
  title: "Untitled document",
  sections: [
    {
      id: crypto.randomUUID(),
      kind: "text",
      html: "<p>Start writing…</p>",
      css: "",
    },
  ],
});

function Preview({ sections }: { sections: Content["sections"] }) {
  return (
    <div className="preview-stack">
      {sections.map((section) => {
        let source = "";
        try {
          source = frameSource(section);
        } catch {
          return (
            <p role="alert" key={section.id} className="p-4 text-xs text-destructive">
              This component has invalid HTML or CSS. Fix it in source view.
            </p>
          );
        }
        return (
          <iframe
            key={section.id}
            title={`Preview: ${section.id}`}
            sandbox=""
            srcDoc={source}
          />
        );
      })}
    </div>
  );
}

function RichText({
  html,
  onChange,
  disabled,
}: {
  html: string;
  onChange: (html: string) => void;
  disabled: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Table,
      TableRow,
      TableCell,
      TableHeader,
    ],
    content: html,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { "aria-label": "Document text", class: "document-text" },
    },
  });

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  if (!editor) return null;

  return (
    <>
      <div className="format-bar" aria-label="Text formatting" role="toolbar">
        <button
          type="button"
          title="Undo"
          aria-label="Undo"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="w-3.5 h-3.5 mr-1" />↶
        </button>
        <button
          type="button"
          title="Redo"
          aria-label="Redo"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="w-3.5 h-3.5 mr-1" />↷
        </button>
        <span className="divider" />
        <button
          type="button"
          className={editor.isActive("paragraph") ? "bg-accent text-accent-foreground" : ""}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          Text
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 1 }) ? "bg-accent text-accent-foreground" : ""}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          H1
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "bg-accent text-accent-foreground" : ""}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </button>
        <span className="divider" />
        <button
          type="button"
          aria-label="Bold"
          className={editor.isActive("bold") ? "bg-accent text-accent-foreground font-bold" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          aria-label="Italic"
          className={editor.isActive("italic") ? "bg-accent text-accent-foreground italic" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          aria-label="Underline"
          className={editor.isActive("underline") ? "bg-accent text-accent-foreground underline" : ""}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "bg-accent text-accent-foreground" : ""}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          type="button"
          className={editor.isActive("orderedList") ? "bg-accent text-accent-foreground" : ""}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </button>
        <button
          type="button"
          className={editor.isActive("blockquote") ? "bg-accent text-accent-foreground" : ""}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          Quote
        </button>
        <button
          type="button"
          className={editor.isActive("table") ? "bg-accent text-accent-foreground" : ""}
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          Table
        </button>
        {editor.isActive("table") && (
          <>
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              + Row
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              + Column
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              Remove table
            </button>
          </>
        )}
      </div>
      <EditorContent editor={editor} />
    </>
  );
}

function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "legacy">(
      "signin",
    ),
    [google, setGoogle] = useState(false);
  const [documents, setDocuments] = useState<Summary[]>([]),
    [doc, setDoc] = useState<Document | null>(null),
    [dirty, setDirty] = useState(false),
    [search, setSearch] = useState(""),
    [view, setView] = useState<"library" | "connect">(
      location.pathname === "/connect" ? "connect" : "library",
    );
  const [preview, setPreview] = useState(false),
    [history, setHistory] = useState<
      { revision: number; created_at: string }[] | null
    >(null),
    [share, setShare] = useState(""),
    [published, setPublished] = useState<number | null>(null),
    [token, setToken] = useState(""),
    [allowPublishing, setAllowPublishing] = useState(true),
    [tokenActive, setTokenActive] = useState(false);
  const [claim, setClaim] = useState(() => {
    const code = new URLSearchParams(location.hash.slice(1)).get("claim");
    if (code && /^[a-f0-9]{64}$/.test(code)) {
      sessionStorage.setItem("docsync_claim", code);
      window.history.replaceState(null, "", location.pathname);
    }
    return sessionStorage.getItem("docsync_claim") || "";
  });
  const [shared, setShared] = useState<Content | null>(null);
  const [mcpClients, setMcpClients] = useState<{client_id:string;client_name:string;access_expires:number}[]>([]);
  const sharePath = location.pathname.startsWith("/share/");

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setDocuments(await api("/documents"));
  }

  useEffect(() => {
    void (async () => {
      try {
        if (sharePath) {
          setShared(await api("/shared/" + location.pathname.split("/").pop()));
          return;
        }
        setGoogle((await api("/auth/config")).google);
        try {
          setSession(await api("/session"));
          setDocuments(await api("/documents"));
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e;
        }
      } catch (e) {
        setError(message(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (view !== "connect" || !session) return;
    void api("/mcp-clients").then(setMcpClients).catch((e) => setError(message(e)));
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

  const leave = () =>
    !dirty ||
    confirm(
      "Discard your unsaved changes? Download a draft first if you want to keep them.",
    );

  function change(next: Document) {
    setDoc(next);
    setDirty(true);
    setShare("");
  }

  async function open(id: string) {
    if (!leave()) return;
    await run(async () => {
      const next = await api<Document>("/documents/" + id);
      setDoc(next);
      setDirty(false);
      setShare("");
      setHistory(null);
      setView("library");
      setPublished(
        (await api("/documents/" + id + "/publish"))?.revision ?? null,
      );
    });
  }

  async function save() {
    if (!doc) return;
    await run(async () => {
      const updated = await api<Document>("/documents/" + doc.id, "PUT", {
        title: doc.title,
        sections: doc.sections,
        expectedRevision: doc.revision,
      });
      setDoc(updated);
      setDirty(false);
      await refresh();
      setNotice("Saved.");
    });
  }

  function exportDraft() {
    if (!doc) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "docsync-draft.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function connect() {
    if (!leave()) return;
    setDoc(null);
    setDirty(false);
    setView("connect");
    await run(async () => {
      setTokenActive((await api("/agent-token")).active);
    });
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
      setSession(await api("/session"));
      await refresh();
    });
  }

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
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <header className="share-header">
          {brand}
          <Badge variant="secondary" className="gap-1 font-normal text-xs">
            <Eye className="w-3 h-3 text-muted-foreground" />
            <span>Shared document · Read only</span>
          </Badge>
        </header>
        <main className="shared flex-1">
          <h1 className="tracking-tight">{shared?.title || "Shared document"}</h1>
          {error && (
            <div role="alert" className="error mb-6">
              {error}
            </div>
          )}
          {shared && <Preview sections={shared.sections} />}
        </main>
      </div>
    );

  if (!session)
    return (
      <div className="auth-layout">
        <section className="auth-story select-none">
          {brand}
          <div>
            <p className="eyebrow">FROM AN IDEA TO A DOCUMENT</p>
            <h1>
              Your ideas.
              <br />A little more
              <br />
              <em>room to grow.</em>
            </h1>
            <p>
              Write, shape, and share beautiful documents.
              <br />
              Bring your favorite AI agent along.
            </p>
            <div className="sample-page">
              <div className="sample-label">STRATEGY / FY27</div>
              <h2>
                A clearer view
                <br />
                of what’s next.
              </h2>
              <div className="sample-lines" />
              <div className="sample-chart">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <span className="flex items-center gap-1">Made with DocSync <ArrowRight className="w-2.5 h-2.5" /></span>
            </div>
          </div>
          <small className="text-muted-foreground text-xs">
            One free document through your agent. No account needed.
          </small>
        </section>
        <main className="auth-panel">
          <div className="auth-form">
            <p className="eyebrow">YOUR WORKSPACE, TOGETHER</p>
            <h2>
              {authMode === "signup"
                ? "Make yourself at home."
                : "Welcome back."}
            </h2>
            <p className="muted">
              {claim
                ? "Sign in to bring your first document into your workspace."
                : "A quiet place to do your best thinking."}
            </p>
            {error && (
              <div role="alert" className="error mb-4">
                {error}
              </div>
            )}
            {google && (
              <>
                <Button variant="outline" className="w-full justify-between h-10 mb-3" asChild>
                  <a href="/api/auth/google">
                    Continue with Google <ArrowRight className="w-4 h-4 ml-1" /> <span>↗</span>
                  </a>
                </Button>
                <div className="or">or use your email</div>
              </>
            )}
            <form onSubmit={authenticate}>
              {authMode === "legacy" ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Workspace owner key
                  </label>
                  <Input
                    name="key"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Email address
                    </label>
                    <Input
                      name="email"
                      type="email"
                      placeholder="you@company.com"
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Password
                    </label>
                    <Input
                      name="password"
                      type="password"
                      placeholder="At least 12 characters"
                      minLength={12}
                      maxLength={256}
                      required
                      autoComplete={
                        authMode === "signup"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                  </div>
                </>
              )}
              <Button type="submit" className="w-full justify-between h-10 mt-2" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : authMode === "signup"
                    ? "Create account"
                    : "Sign in"}{" "}
                <span>→</span>
              </Button>
            </form>
            <p className="auth-switch">
              {authMode === "signup"
                ? "Already have an account?"
                : "New to DocSync?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "signup" ? "signin" : "signup");
                  setError("");
                }}
              >
                {authMode === "signup" ? "Sign in" : "Create an account"}
              </button>
            </p>
            <div className="text-center mt-3">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                onClick={() =>
                  setAuthMode(authMode === "legacy" ? "signin" : "legacy")
                }
              >
                {authMode === "legacy"
                  ? "Use email instead"
                  : "Existing workspace owner"}
              </button>
            </div>
          </div>
        </main>
      </div>
    );

  const list = documents.filter((d) =>
    d.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        {brand}
        <Button
          className="new-button w-full justify-start gap-2 h-9 font-medium shadow-none"
          disabled={busy}
          onClick={() => {
            if (!leave()) return;
            void run(async () => {
              const next = await api<Document>("/documents", "POST", blank());
              setDoc(next);
              setView("library");
              setDirty(false);
              setPublished(null);
              setShare("");
              await refresh();
            });
          }}
        >
          <Plus className="w-4 h-4" />
          <span>＋</span> New document
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
              }
            }}
          >
            <span className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              ▤ <span>My documents</span>
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
            <Bot className="w-4 h-4 text-muted-foreground" />
            ⌘ <span>Connect agent</span>
          </button>
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
            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent"
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
              });
            }}
          >
            <LogOut className="w-3.5 h-3.5" />
            ↗
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span>Workspace</span>
            <span className="slash">/</span>
            <span className="text-foreground">
              {view === "connect"
                ? "Connect agent"
                : doc
                  ? "Document"
                  : "My documents"}
            </span>
          </div>
          <div>
            {doc ? (
              dirty ? (
                <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 text-xs font-normal">
                  Unsaved changes
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-xs font-normal gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Saved · version {doc.revision}
                </Badge>
              )
            ) : (
              <span className="muted text-xs">A clear space for your ideas</span>
            )}
          </div>
        </header>
        {error && (
          <div role="alert" className="error banner flex items-center justify-between gap-4">
            <div>
              {error}
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
        {view === "connect" ? (
          <section className="connect-page">
            <p className="eyebrow">YOUR AGENT, YOUR WORKSPACE</p>
            <h1 className="tracking-tight">Good ideas travel.</h1>
            <p className="subtitle">
              Connect Claude, Codex, Antigravity, or any MCP-compatible agent.
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
                  disabled={busy || session.legacy}
                  onClick={() =>
                    void run(async () => {
                      await api("/claim", "POST", { code: claim });
                      setClaim("");
                      sessionStorage.removeItem("docsync_claim");
                      await refresh();
                      setNotice(
                        "Document added to your workspace. Generate your account token below.",
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
                  disabled={busy}
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
                  disabled={busy}
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
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void run(async () => {
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
                  : "Enable publishing when generating your token to let your agent return a share link. Anyone with the link can view the published document."}
              </p>
            </div>
          </section>
        ) : doc ? (
          <fieldset className="editor-page" disabled={busy}>
            <div className="editor-heading">
              <input
                className="document-title"
                aria-label="Document title"
                maxLength={200}
                value={doc.title}
                placeholder="Document title"
                onChange={(e) => change({ ...doc, title: e.target.value })}
              />
              <div className="actions flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setPreview(!preview)}
                  >
                    {preview ? <Edit3Icon className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                    {preview ? "Edit" : "Preview"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={exportDraft}
                  >
                    <Download className="w-3.5 h-3.5 mr-1" />
                    Download
                  </Button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="default"
                    size="sm"
                    disabled={!dirty || busy}
                    onClick={() => void save()}
                  >
                    <Save className="w-3.5 h-3.5 mr-1" />
                    Save
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="primary"
                    disabled={dirty || busy}
                    title={
                      dirty ? "Save before sharing" : "Publish this saved version"
                    }
                    onClick={() =>
                      void run(async () => {
                        const result = await api(
                          `/documents/${doc.id}/publish`,
                          "POST",
                          { expectedRevision: doc.revision },
                        );
                        setShare(result.url);
                        setPublished(result.revision);
                        setNotice(
                          result.linkAccess === "local_only"
                            ? "Local preview link created."
                            : "Share link created. Anyone with this link can read this version.",
                        );
                      })
                    }
                  >
                    <Share2 className="w-3.5 h-3.5 mr-1" />
                    Share ↗
                  </Button>
                </div>
              </div>
            </div>
            {published && (
              <p className="publication">
                Shared version {published} · Updates stay private until you
                publish again.{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api(`/documents/${doc.id}/publish`, "DELETE");
                      setPublished(null);
                      setShare("");
                      setNotice("Share link revoked.");
                    })
                  }
                >
                  Revoke link
                </button>
              </p>
            )}
            {share && (
              <div className="share-link">
                <a href={share} target="_blank" rel="noreferrer">
                  {share}
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs shrink-0"
                  onClick={() =>
                    void run(async () => {
                      await navigator.clipboard.writeText(share);
                      setNotice("Link copied.");
                    })
                  }
                >
                  <Copy className="w-3 h-3 mr-1" />
                  Copy link
                </Button>
              </div>
            )}
            {history && (
              <Card className="history mb-6">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-xs font-semibold flex items-center justify-between">
                    <span>Version history</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs px-2"
                      onClick={() => setHistory(null)}
                    >
                      Close
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-1">
                  {history.map((row) => (
                    <div
                      key={row.revision}
                      className="flex items-center justify-between py-1.5 text-xs text-muted-foreground border-t border-border"
                    >
                      <span>
                        Version {row.revision} ·{" "}
                        {new Date(row.created_at).toLocaleString()}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        disabled={busy || dirty || row.revision === doc.revision}
                        onClick={() =>
                          void run(async () => {
                            const restored = await api<Document>(
                              `/documents/${doc.id}/restore`,
                              "POST",
                              {
                                revision: row.revision,
                                expectedRevision: doc.revision,
                              },
                            );
                            setDoc(restored);
                            setHistory(null);
                            await refresh();
                            setNotice("Restored as a new version.");
                          })
                        }
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {preview ? (
              <Preview sections={doc.sections} />
            ) : (
              doc.sections.map((section, index) => (
                <article className="section-card" key={section.id}>
                  <header>
                    <span className="font-medium">
                      {section.kind === "text" ? "Text" : "HTML component"}{" "}
                      <small>{String(index + 1).padStart(2, "0")}</small>
                    </span>
                    <div className="actions flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        aria-label={`Move section ${index + 1} up`}
                        disabled={index === 0}
                        onClick={() => {
                          const sections = [...doc.sections];
                          [sections[index - 1], sections[index]] = [
                            sections[index],
                            sections[index - 1],
                          ];
                          change({ ...doc, sections });
                        }}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        aria-label={`Move section ${index + 1} down`}
                        disabled={index === doc.sections.length - 1}
                        onClick={() => {
                          const sections = [...doc.sections];
                          [sections[index + 1], sections[index]] = [
                            sections[index],
                            sections[index + 1],
                          ];
                          change({ ...doc, sections });
                        }}
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                        ↓
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={doc.sections.length === 1}
                        onClick={() => {
                          if (confirm("Remove this section?"))
                            change({
                              ...doc,
                              sections: doc.sections.filter(
                                (s) => s.id !== section.id,
                              ),
                            });
                        }}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </header>
                  {section.kind === "text" ? (
                    <RichText
                      key={section.id + "-" + doc.revision}
                      disabled={busy}
                      html={section.html}
                      onChange={(html) =>
                        change({
                          ...doc,
                          sections: doc.sections.map((s) =>
                            s.id === section.id ? { ...s, html } : s,
                          ),
                        })
                      }
                    />
                  ) : (
                    <div className="component-editor">
                      <Preview sections={[section]} />
                      <details>
                        <summary>Edit HTML & CSS</summary>
                        <label>
                          HTML
                          <textarea
                            spellCheck={false}
                            value={section.html}
                            onChange={(e) =>
                              change({
                                ...doc,
                                sections: doc.sections.map((s) =>
                                  s.id === section.id
                                    ? { ...s, html: e.target.value }
                                    : s,
                                ),
                              })
                            }
                          />
                        </label>
                        <label>
                          CSS
                          <textarea
                            spellCheck={false}
                            value={section.css}
                            onChange={(e) =>
                              change({
                                ...doc,
                                sections: doc.sections.map((s) =>
                                  s.id === section.id
                                    ? { ...s, css: e.target.value }
                                    : s,
                                ),
                              })
                            }
                          />
                        </label>
                      </details>
                    </div>
                  )}
                </article>
              ))
            )}
            {!preview && (
              <div className="add-section">
                <Button
                  variant="outline"
                  className="border-dashed gap-1 text-xs"
                  disabled={doc.sections.length >= 40}
                  onClick={() =>
                    change({
                      ...doc,
                      sections: [
                        ...doc.sections,
                        {
                          id: crypto.randomUUID(),
                          kind: "text",
                          html: "<p></p>",
                          css: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  ＋ Text section
                </Button>
                <Button
                  variant="outline"
                  className="border-dashed gap-1 text-xs"
                  disabled={doc.sections.length >= 40}
                  onClick={() =>
                    change({
                      ...doc,
                      sections: [
                        ...doc.sections,
                        {
                          id: crypto.randomUUID(),
                          kind: "html",
                          html: "<section><h2>A new perspective</h2><p>Add your component here.</p></section>",
                          css: "section{padding:24px;background:#f5f6f0;border-radius:12px}",
                        },
                      ],
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  ＋ HTML component
                </Button>
              </div>
            )}
          </fieldset>
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
              <div className="relative search">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  aria-label="Search documents"
                  placeholder="Search documents…"
                  className="w-64 h-9 pl-9 pr-3 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
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
                    <div className="document-thumbnail">
                      <span className="paper-icon">
                        <FileText className="w-7 h-7 text-muted-foreground/60" />
                        ▤
                      </span>
                      <div />
                      <div />
                      <div />
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
    </div>
  );
}

// Helper icon component
function Edit3Icon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
