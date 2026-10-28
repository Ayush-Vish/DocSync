import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { AgentSkill } from "./AgentSkill";
import { ArtifactFrame, ArtifactThumbnail } from "./ArtifactFrame";
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
  Presentation,
  Play,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  LayoutGrid,
  Columns,
  Quote,
  X,
  ArrowLeft,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Content, Document } from "../document";
import themeCatalog from "../../skills/docsync/themes.json";
import "./style.css";

type Session = { email: string; legacy: boolean };
type Summary = {
  id: string;
  title: string;
  revision: number;
  updated_at: string;
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
      html: "<p></p>",
      css: "",
    },
  ],
});

const VISUAL_TEMPLATES = [
  {
    name: "KPI Metrics",
    icon: LayoutGrid,
    html: `<article class="slide">\n  <span class="badge">KEY METRICS</span>\n  <h2>Performance Overview</h2>\n  <div class="metrics-grid">\n    <div class="card">\n      <span class="num">$2.4M</span>\n      <span class="label">ARR (+38% YoY)</span>\n    </div>\n    <div class="card">\n      <span class="num">99.98%</span>\n      <span class="label">Uptime SLA</span>\n    </div>\n    <div class="card">\n      <span class="num">14,200</span>\n      <span class="label">Active Teams</span>\n    </div>\n  </div>\n</article>`,
    css: `.slide { padding: clamp(16px, 4vw, 36px); font-family: system-ui, sans-serif; background: #fafafa; border-radius: 12px; box-sizing: border-box; }\n.badge { font-size: 11px; letter-spacing: 1.5px; font-weight: 700; color: #71717a; text-transform: uppercase; }\nh2 { font-size: clamp(18px, 3.5vw, 26px); margin: 6px 0 16px; letter-spacing: -0.5px; color: #09090b; }\n.metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 12px; }\n.card { background: #fff; padding: clamp(10px, 2vw, 20px); border-radius: 8px; border: 1px solid #e4e4e7; box-shadow: 0 1px 3px rgba(0,0,0,0.03); box-sizing: border-box; }\n.num { display: block; font-size: clamp(18px, 3.5vw, 30px); font-weight: 700; color: #09090b; margin-bottom: 4px; }\n.label { font-size: clamp(10px, 1.8vw, 12px); color: #71717a; font-weight: 500; }`,
  },
  {
    name: "Bar Chart",
    icon: BarChart3,
    html: `<article class="slide">\n  <span class="badge">GROWTH TRAJECTORY</span>\n  <h2>Revenue by Quarter</h2>\n  <div class="chart">\n    <div class="col"><div class="bar" style="height: 35%"><span class="val">$1.2M</span></div><span class="sub">Q1</span></div>\n    <div class="col"><div class="bar" style="height: 55%"><span class="val">$1.8M</span></div><span class="sub">Q2</span></div>\n    <div class="col"><div class="bar" style="height: 75%"><span class="val">$2.4M</span></div><span class="sub">Q3</span></div>\n    <div class="col"><div class="bar highlight" style="height: 100%"><span class="val">$3.2M</span></div><span class="sub">Q4 (Est)</span></div>\n  </div>\n</article>`,
    css: `.slide { padding: clamp(16px, 4vw, 36px); font-family: system-ui, sans-serif; background: #fff; border-radius: 12px; border: 1px solid #e4e4e7; box-sizing: border-box; }\n.badge { font-size: 11px; letter-spacing: 1.5px; font-weight: 700; color: #71717a; }\nh2 { font-size: clamp(18px, 3.5vw, 26px); margin: 6px 0 clamp(12px, 3vw, 28px); letter-spacing: -0.5px; color: #09090b; }\n.chart { display: flex; align-items: flex-end; gap: clamp(8px, 2vw, 20px); height: clamp(100px, 20vw, 180px); padding-bottom: 12px; border-bottom: 1px solid #e4e4e7; }\n.col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; gap: 6px; }\n.bar { width: 100%; background: #e4e4e7; border-radius: 6px; display: flex; align-items: flex-start; justify-content: center; padding-top: 6px; transition: all 0.3s; }\n.bar.highlight { background: #09090b; }\n.bar .val { font-size: clamp(9px, 1.5vw, 11px); font-weight: 600; color: #71717a; }\n.bar.highlight .val { color: #fff; }\n.col .sub { font-size: clamp(10px, 1.8vw, 12px); color: #71717a; font-weight: 500; }`,
  },
  {
    name: "Comparison",
    icon: Columns,
    html: `<article class="slide">\n  <span class="badge">PRODUCT COMPARISON</span>\n  <h2>DocSync vs Traditional Tools</h2>\n  <div class="split">\n    <div class="box">\n      <h3>Standard Word Docs</h3>\n      <ul>\n        <li>Static text with no real-time code</li>\n        <li>Rigid table styling</li>\n        <li>No AI Agent MCP protocol</li>\n      </ul>\n    </div>\n    <div class="box highlight">\n      <h3>DocSync Presentation</h3>\n      <ul>\n        <li>HTML + CSS interactive components</li>\n        <li>Real-time live rendering</li>\n        <li>Autonomous MCP agent tools</li>\n      </ul>\n    </div>\n  </div>\n</article>`,
    css: `.slide { padding: clamp(16px, 4vw, 36px); font-family: system-ui, sans-serif; background: #fafafa; border-radius: 12px; box-sizing: border-box; }\n.badge { font-size: 11px; letter-spacing: 1.5px; font-weight: 700; color: #71717a; }\nh2 { font-size: clamp(18px, 3.5vw, 26px); margin: 6px 0 16px; letter-spacing: -0.5px; color: #09090b; }\n.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }\n.box { background: #fff; padding: clamp(12px, 2vw, 22px); border-radius: 8px; border: 1px solid #e4e4e7; box-sizing: border-box; }\n.box.highlight { border-color: #09090b; box-shadow: 0 4px 14px rgba(0,0,0,0.05); }\nh3 { font-size: clamp(13px, 2vw, 16px); margin: 0 0 8px; color: #09090b; }\nul { padding-left: 16px; margin: 0; font-size: clamp(11px, 1.8vw, 13px); color: #52525b; line-height: 1.6; }`,
  },
  {
    name: "Quote Slide",
    icon: Quote,
    html: `<article class="slide quote-slide">\n  <blockquote>“Great presentations don’t just report numbers—they create a shared picture of what’s next.”</blockquote>\n  <p class="author">— Strategy & Operations, FY27</p>\n</article>`,
    css: `.slide { padding: clamp(24px, 5vw, 50px) clamp(20px, 4vw, 40px); font-family: system-ui, sans-serif; background: #09090b; color: #fff; border-radius: 12px; display: flex; flex-direction: column; justify-content: center; min-height: 140px; box-sizing: border-box; }\nblockquote { font-size: clamp(15px, 3vw, 24px); font-style: italic; line-height: 1.45; margin: 0 0 12px; font-weight: 400; color: #fff; border: 0; padding: 0; }\n.author { font-size: clamp(11px, 1.8vw, 13px); color: #a1a1aa; font-weight: 500; margin: 0; }`,
  },
];

function Preview({ sections }: { sections: Content["sections"] }) {
  return (
    <div className="preview-stack">
      {sections.map((section) => (
        <ArtifactFrame
          key={section.id}
          title={`Preview: ${section.id}`}
          section={section}
        />
      ))}
    </div>
  );
}

const slideMarkup = (html: string) =>
  /class\s*=\s*["'][^"']*\bslide\b[^"']*["']/i.test(html);

const isPresentationContent = (content: Content) =>
  content.sections.every((section) => slideMarkup(section.html));

function SharedViewer({ content }: { content: Content }) {
  const [page, setPage] = useState(0);
  const isPresentation = isPresentationContent(content);
  const lastPage = content.sections.length - 1;
  const current = content.sections[Math.min(page, lastPage)];
  const itemName = isPresentation ? "slide" : "page";

  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        setPage((value) => Math.max(0, value - 1));
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        setPage((value) => Math.min(lastPage, value + 1));
      }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [lastPage]);

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
      {isPresentation && (
        <>
          <i className="shared-toolbar-divider" aria-hidden="true" />
          <span className="shared-tool-button"><Search className="w-3.5 h-3.5" /> Fit</span>
          <i className="shared-toolbar-divider" aria-hidden="true" />
          <span className="shared-icon-tool" aria-label="Undo unavailable in read-only view"><Undo2 className="w-4 h-4" /></span>
          <span className="shared-icon-tool" aria-label="Redo unavailable in read-only view"><Redo2 className="w-4 h-4" /></span>
          <i className="shared-toolbar-divider" aria-hidden="true" />
          <span className="shared-tool-label">Background</span>
          <span className="shared-tool-label">Layout</span>
          <span className="shared-tool-label">Theme</span>
          <span className="shared-tool-label">Transition</span>
        </>
      )}
    </div>
  );

  if (isPresentation) return (
    <section className="shared-viewer shared-slide-viewer" aria-label="Presentation viewer">
      {controls}
      <div className="shared-slide-layout">
        <aside className="shared-slide-filmstrip" aria-label="Slides">
          {content.sections.map((section, index) => (
            <button
              type="button"
              key={section.id}
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
          ))}
        </aside>
        <div className="shared-slide-workarea">
          <div className="shared-page-stage">
            <div className="shared-page">
              <ArtifactFrame
                key={current.id}
                title={`Slide ${page + 1}: ${content.title}`}
                section={current}
              />
            </div>
          </div>
          <div className="shared-speaker-notes">Shared presentation · Read only</div>
        </div>
        <aside className="shared-tools-rail" aria-label="Presentation tools">
          <span><LayoutGrid className="w-4 h-4" />Theme</span>
          <span><Columns className="w-4 h-4" />Layout</span>
          <span><Presentation className="w-4 h-4" />Present</span>
        </aside>
      </div>
    </section>
  );

  return (
    <section className="shared-viewer shared-document-viewer" aria-label="Document viewer">
      {controls}
      <div className="shared-page-stage">
        <div className="shared-page">
          <ArtifactFrame
            key={current.id}
            title={`Page ${page + 1}: ${content.title}`}
            section={current}
          />
        </div>
      </div>
    </section>
  );
}

function SharedHeader({ content }: { content: Content | null }) {
  const isPresentation = content ? isPresentationContent(content) : false;
  const menus = isPresentation
    ? ["File", "Edit", "View", "Insert", "Format", "Slide", "Arrange", "Tools", "Help"]
    : ["File", "Edit", "View", "Insert", "Format", "Tools", "Help"];

  return (
    <header className="share-header">
      <div className="share-title-area">
        {brand}
        <div className="share-file-meta">
          <div className="share-file-title">
            <strong>{content?.title || "Shared document"}</strong>
            <span aria-hidden="true">☆</span>
          </div>
          <nav className="share-menu" aria-label="Document menu">
            {menus.map((menu) => <span key={menu}>{menu}</span>)}
          </nav>
        </div>
      </div>
      <div className="share-header-actions">
        {isPresentation && (
          <span className="share-slideshow"><Presentation className="w-4 h-4" /> Slideshow</span>
        )}
        <Badge variant="secondary" className="gap-1 font-normal text-xs">
          <Eye className="w-3 h-3 text-muted-foreground" />
          <span>Read only</span>
        </Badge>
      </div>
    </header>
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

  return <EditorContent editor={editor} />;
}

function LandingPage({
  onSignIn,
  onSignUp,
}: {
  onSignIn: () => void;
  onSignUp: () => void;
}) {

  return (
    <div className="landing-page select-none">
      {/* Sticky Navigation Bar */}
      <header className="landing-nav">
        <div className="max-w-6xl mx-auto flex items-center justify-between py-3 px-4 sm:px-6">
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {brand}
            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 hidden xs:inline-flex">
              v0.3.0
            </Badge>
          </div>
          <div className="hidden md:flex items-center gap-6 text-xs text-muted-foreground font-medium">
            <a href="#features" className="hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#interactive-preview" className="hover:text-foreground transition-colors">
              Interactive Slides
            </a>
            <a href="#agent-skill" className="hover:text-foreground transition-colors">
              Examples
            </a>
            <a href="#mcp-protocol" className="hover:text-foreground transition-colors">
              Agent Protocol
            </a>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-8 px-2 sm:px-3"
              onClick={onSignIn}
            >
              Sign in
            </Button>
            <Button
              variant="default"
              size="sm"
              className="text-xs h-8 px-2.5 sm:px-3.5 font-medium"
              onClick={onSignUp}
            >
              <span className="hidden sm:inline">Get Started Free</span>
              <span className="sm:hidden">Get Started</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="landing-hero">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/80 text-[10px] sm:text-[11px] font-medium text-muted-foreground border border-border mb-4 text-center max-w-full leading-normal">
          <Sparkles className="w-3.5 h-3.5 text-foreground shrink-0" />
          <span className="truncate sm:whitespace-normal">MINIMALIST WORKSPACE FOR HUMANS & AI AGENTS</span>
        </div>
        <h1>
          A clearer space for your ideas.
          <br />
          <span className="text-muted-foreground font-normal">
            Documents and presentations in sync.
          </span>
        </h1>
        <p className="subtitle">
          Turn your agent’s output into visual reports, design documents, and presentation decks. Review the result in your browser and share it with a link.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap w-full max-w-sm sm:max-w-none mx-auto">
          <Button
            size="lg"
            className="h-10 px-6 text-xs font-medium gap-2 w-full sm:w-auto"
            onClick={onSignUp}
          >
            Get Started Free
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-10 px-5 text-xs font-medium w-full sm:w-auto"
            onClick={onSignIn}
          >
            Sign In to Workspace
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          ⚡ One free document through your AI agent. No account required to start.
        </p>

        <div id="interactive-preview" className="w-full">
          <AgentSkill />
        </div>
      </section>

      {/* Features Bento Grid */}
      <section id="features" className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-12 box-border">
        <div className="text-center mb-10">
          <p className="eyebrow">DESIGNED FOR CLARITY</p>
          <h2 className="text-2xl font-bold tracking-tight">Everything you need to communicate clearly.</h2>
        </div>
        <div className="landing-features-grid">
          <div className="landing-feature-card">
            <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center mb-4">
              <BarChart3 className="w-4 h-4 text-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-2">Interactive Visualizations</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Combine KPI summaries, CSS charts, and comparison tables in shareable HTML documents. Try chart controls and simulated live metrics in the examples.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center mb-4">
              <Presentation className="w-4 h-4 text-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-2">Dual Doc & PPT Deck Mode</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Toggle between long-form editorial writing and a 16:9 presentation slide deck with a single click. Fullscreen presenter mode included.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center mb-4">
              <Bot className="w-4 h-4 text-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-2">Native Model Context Protocol</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Connect Cursor, Claude Desktop, Antigravity, or custom CLI tools. Autonomous agents draft, update, and publish documents directly to your workspace.
            </p>
          </div>

          <div className="landing-feature-card">
            <div className="w-8 h-8 rounded-md bg-secondary flex items-center justify-center mb-4">
              <Shield className="w-4 h-4 text-foreground" />
            </div>
            <h3 className="text-base font-semibold mb-2">Zero Telemetry & Sandboxed</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Rigorous HTML/CSS sanitization, strict Content Security Policy iframes, and end-to-end credential rotation keep your data private.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works with Agents */}
      <section id="mcp-protocol" className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 sm:py-12 text-center box-border">
        <p className="eyebrow">AUTONOMOUS WORKFLOW</p>
        <h2 className="text-2xl font-bold tracking-tight mb-8">How It Works with Your AI Agent</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 text-left w-full">
          <div className="p-4 rounded-lg border border-border bg-card">
            <span className="text-xs font-mono font-semibold text-muted-foreground block mb-2">01. CONNECT</span>
            <h4 className="text-sm font-semibold mb-1">Add MCP Tool</h4>
            <p className="text-xs text-muted-foreground">Run <code>npx @docsync/mcp connect</code> in Cursor or Claude to integrate your workspace.</p>
          </div>
          <div className="p-4 rounded-lg border border-border bg-card">
            <span className="text-xs font-mono font-semibold text-muted-foreground block mb-2">02. AUTONOMY</span>
            <h4 className="text-sm font-semibold mb-1">Agent Drafts Slides</h4>
            <p className="text-xs text-muted-foreground">Your agent analyzes data and creates structured HTML components with live charts.</p>
          </div>
          <div className="p-4 rounded-lg border border-border bg-card">
            <span className="text-xs font-mono font-semibold text-muted-foreground block mb-2">03. PRESENT</span>
            <h4 className="text-sm font-semibold mb-1">Review & Present</h4>
            <p className="text-xs text-muted-foreground">Review drafts live in real-time, switch to slides mode, and present or share snapshot links.</p>
          </div>
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="landing-cta-banner">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
          Make room for what matters.
        </h2>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mb-5">
          Join teams and engineers crafting interactive reports and presentations with autonomous agents.
        </p>
        <Button
          size="lg"
          className="h-10 px-6 text-xs font-medium"
          onClick={onSignUp}
        >
          Create your account →
        </Button>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4 text-xs text-muted-foreground px-4 sm:px-0">
          <div className="flex items-center gap-2">
            {brand}
            <span>· Minimalism UI & Model Context Protocol</span>
          </div>
          <div>
            © 2026 DocSync. Open agent protocol.
          </div>
        </div>
      </footer>
    </div>
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
}) {
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
          Back to DocSync
        </Button>
        <span className="text-xs text-muted-foreground font-mono">v0.3.0</span>
      </div>

      <div className="auth-centered-card">
        <div className="mb-6">
          <div className="mb-3">{brand}</div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {authMode === "signup"
              ? "Make yourself at home."
              : authMode === "legacy"
                ? "Workspace Owner Key"
                : "Welcome back."}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {claim
              ? "Sign in to bring your first document into your workspace."
              : "A quiet place to do your best thinking."}
          </p>
        </div>

        {error && (
          <div role="alert" className="error mb-4">
            {error}
          </div>
        )}

        {google && (
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

        <form onSubmit={authenticate} className="space-y-3.5">
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
                className="h-9 text-xs"
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
                  className="h-9 text-xs"
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
                  className="h-9 text-xs"
                />
              </div>
            </>
          )}

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

        <p className="auth-switch text-xs text-muted-foreground mt-5 text-center">
          {authMode === "signup"
            ? "Already have an account?"
            : "New to DocSync?"}{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline cursor-pointer"
            onClick={() => {
              setAuthMode(authMode === "signup" ? "signin" : "signup");
              setError("");
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
              setAuthMode(authMode === "legacy" ? "signin" : "legacy");
              setError("");
            }}
          >
            {authMode === "legacy"
              ? "Use email instead"
              : "Existing workspace owner"}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const isAuthRoute = () => {
    const p = location.pathname;
    return (
      p === "/login" ||
      p === "/signup" ||
      p === "/connect" ||
      Boolean(sessionStorage.getItem("docsync_claim")) ||
      location.hash.includes("claim=")
    );
  };
  const [authPage, setAuthPage] = useState(isAuthRoute);
  const [session, setSession] = useState<Session | null>(null),
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
    [view, setView] = useState<"library" | "connect">(
      location.pathname === "/connect" ? "connect" : "library",
    );
  const [preview, setPreview] = useState(false),
    [editorMode, setEditorMode] = useState<"doc" | "slide">("doc"),
    [activeSlide, setActiveSlide] = useState(0),
    [fullscreen, setFullscreen] = useState(false),
    [history, setHistory] = useState<
      { revision: number; created_at: string }[] | null
    >(null),
    [share, setShare] = useState(""),
    [published, setPublished] = useState<number | null>(null),
    [token, setToken] = useState(""),
    [allowPublishing, setAllowPublishing] = useState(true),
    [tokenActive, setTokenActive] = useState(false);
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

  useEffect(() => {
    if (!fullscreen || !doc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFullscreen(false);
      } else if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        setActiveSlide((prev) => Math.min(doc.sections.length - 1, prev + 1));
      } else if (e.key === "ArrowLeft") {
        setActiveSlide((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, doc]);

  useEffect(() => {
    const handlePop = () => {
      setAuthPage(isAuthRoute());
      if (location.pathname === "/signup") setAuthMode("signup");
      else if (location.pathname === "/login") setAuthMode("signin");
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  const goToLogin = () => {
    setAuthMode("signin");
    setError("");
    setAuthPage(true);
    window.history.pushState(null, "", "/login");
  };

  const goToSignup = () => {
    setAuthMode("signup");
    setError("");
    setAuthPage(true);
    window.history.pushState(null, "", "/signup");
  };

  const goToLanding = () => {
    setError("");
    setAuthPage(false);
    window.history.pushState(null, "", "/");
  };

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
      setPreview(false);
      setActiveSlide(0);
      setDirty(false);
      setShare("");
      setHistory(null);
      setView("library");
      setPublished(
        (await api("/documents/" + id + "/publish"))?.revision ?? null,
      );
    });
  }

  async function createFromTheme(theme: ThemeCatalogItem) {
    if (!leave()) return;
    await run(async () => {
      const response = await fetch(
        `/downloads/docsync/themes/${theme.id}.json`,
        { credentials: "same-origin" },
      );
      if (!response.ok) throw new Error("Theme could not be loaded.");
      const content = (await response.json()) as Content;
      const next = await api<Document>("/documents", "POST", content);
      setDoc(next);
      setEditorMode(theme.format === "presentation" ? "slide" : "doc");
      setPreview(theme.format === "document");
      setActiveSlide(0);
      setDirty(false);
      setPublished(null);
      setShare("");
      setHistory(null);
      await refresh();
      setNotice(`${theme.name} created with fictional example content.`);
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
      setAuthPage(false);
      window.history.pushState(null, "", "/");
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
      <div className="share-shell">
        <SharedHeader content={shared} />
        <main className="shared">
          {error && (
            <div role="alert" className="error mb-6">
              {error}
            </div>
          )}
          {shared && <SharedViewer content={shared} />}
        </main>
      </div>
    );

  if (!session) {
    if (!authPage) {
      return (
        <LandingPage
          onSignIn={goToLogin}
          onSignUp={goToSignup}
        />
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
              setEditorMode("doc");
              setPreview(false);
              setView("library");
              setDirty(false);
              setPublished(null);
              setShare("");
              await refresh();
            });
          }}
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>New document</span>
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
            <input
              className="document-title"
              aria-label="Document title"
              maxLength={200}
              disabled={busy}
              value={doc.title}
              placeholder="Document title"
              onChange={(e) => change({ ...doc, title: e.target.value })}
            />
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground min-w-0">
              <span>Workspace</span>
              <span className="slash">/</span>
              <span className="text-foreground truncate">
                {view === "connect" ? "Connect agent" : "My documents"}
              </span>
            </div>
          )}
          <div className="shrink-0">
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
                  disabled={busy || session.legacy}
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
                  : "During browser authorization, allow publishing if you want the agent to return share links. Anyone with a published link can view that document."}
              </p>
            </div>
          </section>
        ) : doc ? (
          <fieldset className="editor-page" disabled={busy}>
            <div className="editor-heading">
              <div className="actions flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center bg-muted p-0.5 rounded-md border border-border">
                    <Button
                      variant={editorMode === "doc" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-2.5 font-medium shadow-none"
                      onClick={() => setEditorMode("doc")}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1" />
                      Document
                    </Button>
                    <Button
                      variant={editorMode === "slide" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-7 text-xs px-2.5 font-medium shadow-none"
                      onClick={() => setEditorMode("slide")}
                    >
                      <Presentation className="w-3.5 h-3.5 mr-1" />
                      Slides (PPT)
                    </Button>
                  </div>
                  {editorMode === "slide" ? (
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs px-2.5 font-medium"
                      onClick={() => setFullscreen(true)}
                    >
                      <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                      Present
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2.5"
                      disabled={busy}
                      onClick={() => setPreview(!preview)}
                    >
                      {preview ? <Edit3Icon className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                      {preview ? "Edit" : "Preview"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-2.5"
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
                    className="h-7 text-xs px-2.5"
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
              <div className="share-link flex-wrap sm:flex-nowrap">
                <a href={share} target="_blank" rel="noreferrer" className="break-all sm:truncate">
                  {share}
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs shrink-0 w-full sm:w-auto"
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
            ) : editorMode === "slide" ? (
              <div className="slide-deck space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Slide {safeActiveSlide + 1} of {doc.sections.length}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground font-medium">
                      {doc.sections[safeActiveSlide]?.kind === "text"
                        ? "Text Slide"
                        : "Interactive Slide"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={safeActiveSlide === 0}
                      onClick={() =>
                        setActiveSlide((prev) => Math.max(0, prev - 1))
                      }
                    >
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={safeActiveSlide >= doc.sections.length - 1}
                      onClick={() =>
                        setActiveSlide((prev) =>
                          Math.min(doc.sections.length - 1, prev + 1),
                        )
                      }
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 px-2.5 text-xs font-medium"
                      onClick={() => setFullscreen(true)}
                    >
                      <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                      Present Fullscreen
                    </Button>
                  </div>
                </div>

                {/* 16:9 Slide Canvas */}
                <div className="slide-canvas">
                  {doc.sections[safeActiveSlide] && (
                    <ArtifactFrame
                      title={`Slide ${safeActiveSlide + 1}`}
                      section={doc.sections[safeActiveSlide]}
                    />
                  )}
                </div>

                {/* Slide Thumbnail Strip */}
                <div className="slide-strip">
                  {doc.sections.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`slide-thumb ${idx === safeActiveSlide ? "active" : ""}`}
                      onClick={() => setActiveSlide(idx)}
                    >
                      <span className="slide-thumb-num">#{idx + 1}</span>
                      <span className="slide-thumb-title">
                        {s.kind === "text" ? "Text slide" : "Interactive"}
                      </span>
                    </button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto aspect-[16/9] w-[120px] shrink-0 border-dashed text-xs flex flex-col items-center justify-center gap-1"
                    disabled={doc.sections.length >= 40}
                    onClick={() => {
                      const newSection = {
                        id: crypto.randomUUID(),
                        kind: "html" as const,
                        html: `<article class="slide">\n  <h2>New Slide</h2>\n  <p>Add presentation content here.</p>\n</article>`,
                        css: `.slide { padding: 40px; font-family: system-ui, sans-serif; background: #fafafa; border-radius: 12px; }\nh2 { font-size: 26px; margin: 0 0 12px; color: #09090b; }\np { font-size: 15px; color: #71717a; }`,
                      };
                      change({ ...doc, sections: [...doc.sections, newSection] });
                      setActiveSlide(doc.sections.length);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Slide</span>
                  </Button>
                </div>

                {/* Interactive Slide Quick Templates */}
                <div className="pt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Add Interactive Visualization Template
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {VISUAL_TEMPLATES.map((tmpl) => {
                      const Icon = tmpl.icon;
                      return (
                        <Button
                          key={tmpl.name}
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-normal"
                          disabled={doc.sections.length >= 40}
                          onClick={() => {
                            const newSection = {
                              id: crypto.randomUUID(),
                              kind: "html" as const,
                              html: tmpl.html,
                              css: tmpl.css,
                            };
                            change({
                              ...doc,
                              sections: [...doc.sections, newSection],
                            });
                            setActiveSlide(doc.sections.length);
                          }}
                        >
                          <Icon className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                          {tmpl.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Slide Editor */}
                {doc.sections[safeActiveSlide] && (
                  <article className="section-card mt-4">
                    <header>
                      <span className="font-medium">
                        Edit Slide #{safeActiveSlide + 1}{" "}
                        <small>
                          {doc.sections[safeActiveSlide].kind === "text"
                            ? "Text"
                            : "Interactive slide"}
                        </small>
                      </span>
                      <div className="actions flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          aria-label={`Move slide ${safeActiveSlide + 1} up`}
                          disabled={safeActiveSlide === 0}
                          onClick={() => {
                            const sections = [...doc.sections];
                            [
                              sections[safeActiveSlide - 1],
                              sections[safeActiveSlide],
                            ] = [
                              sections[safeActiveSlide],
                              sections[safeActiveSlide - 1],
                            ];
                            change({ ...doc, sections });
                            setActiveSlide(safeActiveSlide - 1);
                          }}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-foreground"
                          aria-label={`Move slide ${safeActiveSlide + 1} down`}
                          disabled={safeActiveSlide === doc.sections.length - 1}
                          onClick={() => {
                            const sections = [...doc.sections];
                            [
                              sections[safeActiveSlide + 1],
                              sections[safeActiveSlide],
                            ] = [
                              sections[safeActiveSlide],
                              sections[safeActiveSlide + 1],
                            ];
                            change({ ...doc, sections });
                            setActiveSlide(safeActiveSlide + 1);
                          }}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={doc.sections.length === 1}
                          onClick={() => {
                            if (confirm("Remove this slide?")) {
                              const filtered = doc.sections.filter(
                                (_, idx) => idx !== safeActiveSlide,
                              );
                              change({ ...doc, sections: filtered });
                              setActiveSlide(Math.max(0, safeActiveSlide - 1));
                            }
                          }}
                        >
                          <Trash2 className="w-3 h-3 mr-1" />
                          Remove
                        </Button>
                      </div>
                    </header>
                    {doc.sections[safeActiveSlide].kind === "text" ? (
                      <RichText
                        key={
                          doc.sections[safeActiveSlide].id +
                          "-" +
                          doc.revision
                        }
                        disabled={busy}
                        html={doc.sections[safeActiveSlide].html}
                        onChange={(html) =>
                          change({
                            ...doc,
                            sections: doc.sections.map((s, idx) =>
                              idx === safeActiveSlide ? { ...s, html } : s,
                            ),
                          })
                        }
                      />
                    ) : (
                      <p className="component-managed-note">Interactive slide content is managed through your connected agent.</p>
                    )}
                  </article>
                )}
              </div>
            ) : (
              doc.sections.map((section, index) => (
                <article className="section-card" key={section.id}>
                  <header>
                    <span className="font-medium">
                      {section.kind === "text" ? "Text" : "Interactive section"}{" "}
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
                    </div>
                  )}
                </article>
              ))
            )}
            {!preview && editorMode === "doc" && (
              <div className="space-y-4 mt-6">
                <div className="add-section">
                  <Button
                    variant="outline"
                    className="border-dashed text-xs h-8"
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
                    ＋ Text section
                  </Button>
                  <Button
                    variant="outline"
                    className="border-dashed text-xs h-8"
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
                    ＋ Interactive section
                  </Button>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg border border-dashed border-border/80">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
                    Quick-Insert Interactive Visualizations
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {VISUAL_TEMPLATES.map((tmpl) => {
                      const Icon = tmpl.icon;
                      return (
                        <Button
                          key={tmpl.name}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs font-normal bg-background"
                          disabled={doc.sections.length >= 40}
                          onClick={() =>
                            change({
                              ...doc,
                              sections: [
                                ...doc.sections,
                                {
                                  id: crypto.randomUUID(),
                                  kind: "html",
                                  html: tmpl.html,
                                  css: tmpl.css,
                                },
                              ],
                            })
                          }
                        >
                          <Icon className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                          {tmpl.name}
                        </Button>
                      );
                    })}
                  </div>
                </div>
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
                    <h2 id="theme-library-title">Start with a theme</h2>
                    <p>Choose a document or HTML presentation. Replace all fictional example content before using it as real data.</p>
                  </div>
                  <Badge variant="outline">5 presets + custom</Badge>
                </div>
                <div className="theme-grid">
                  {themes.map((theme) => (
                    <button
                      type="button"
                      className="theme-card"
                      data-theme-id={theme.id}
                      key={theme.id}
                      disabled={busy}
                      onClick={() => void createFromTheme(theme)}
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
                    </button>
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
                    <div className="document-thumbnail">
                      <span className="paper-icon">
                        <FileText className="w-8 h-8 text-muted-foreground/40" />
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
      {fullscreen && doc && (
        <div
          className="fullscreen-overlay"
          onClick={(e) => {
            if ((e.target as HTMLElement).tagName !== "BUTTON") {
              setActiveSlide((prev) => Math.min(doc.sections.length - 1, prev + 1));
            }
          }}
        >
          <div className="fullscreen-slide">
            {doc.sections[safeActiveSlide] && (
              <ArtifactFrame
                title={`Fullscreen Slide ${safeActiveSlide + 1}`}
                section={doc.sections[safeActiveSlide]}
              />
            )}
          </div>
          <div className="fullscreen-controls flex items-center justify-between w-full max-w-[1200px] mt-4 px-2 text-white flex-wrap gap-2">
            <div className="text-xs font-mono text-zinc-400">
              Slide {safeActiveSlide + 1} of {doc.sections.length}
              <span className="hidden sm:inline"> · Use ← → arrows or click to navigate</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-2.5 sm:px-3 text-xs bg-zinc-800 text-white hover:bg-zinc-700 border-0"
                disabled={safeActiveSlide === 0}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSlide((prev) => Math.max(0, prev - 1));
                }}
              >
                <ChevronLeft className="w-4 h-4 mr-0.5 sm:mr-1" />
                Prev
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-2.5 sm:px-3 text-xs bg-zinc-800 text-white hover:bg-zinc-700 border-0"
                disabled={safeActiveSlide >= doc.sections.length - 1}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveSlide((prev) => Math.min(doc.sections.length - 1, prev + 1));
                }}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-0.5 sm:ml-1" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 px-2.5 sm:px-3 text-xs bg-zinc-800 text-white hover:bg-zinc-700 border-0"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreen(false);
                }}
              >
                <X className="w-4 h-4 mr-0.5 sm:mr-1" />
                Exit<span className="hidden sm:inline"> (Esc)</span>
              </Button>
            </div>
          </div>
        </div>
      )}
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
