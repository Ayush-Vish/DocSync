import React, { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api, ApiError, requestJson, type Session } from "./api";
import { LandingPage } from "./LandingPage";
import { ShareDialog } from "./ShareDialog";
import { AcceptInvitation } from "./Collaborators";
import { VersionHistory } from "./VersionHistory";
import { useDocumentLock } from "./useDocumentLock";
import { MediaContext } from "./MediaContext";
import { MediaUpload, insertPageMedia } from "./MediaUpload";
import { CollaboratorPresence } from "./CollaboratorPresence";
import { AgentSkill } from "./AgentSkill";
import { ArtifactFrame, ArtifactThumbnail } from "./ArtifactFrame";
import { PresentationViewer } from "./PresentationViewer";
import { DocumentViewer } from "./DocumentViewer";
import { DocumentCover } from "./DocumentCover";
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
  EyeOff,
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
  ChevronDown,
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
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  PanelRight,
  Palette,
  Code2,
  SlidersHorizontal,
  Lock,
  Globe,
  Users,
  CheckCircle2,
  Type,
  FileCode,
  Info,
  Minus,
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
import type { Content, Document, Revision, RenderedContent } from "../document";
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

const blank = (): Content => ({
  title: "Untitled document",
  format: "document",
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

const slideMarkup = (html: string) =>
  [...html.matchAll(/\sclass\s*=\s*(["'])(.*?)\1/gis)].some(match => match[2].split(/\s+/).includes("slide"));

const isPresentationContent = (content: Content) =>
  content.format ? content.format === "presentation" : content.sections.every((section) => slideMarkup(section.html));

const documentRoute = () => {
  const match = location.pathname.match(
    /^\/documents\/([a-f0-9-]{36})(\/preview)?$/,
  );
  return match ? { id: match[1], preview: Boolean(match[2]) } : null;
};

function SharedViewer({
  content,
  slideshow,
  onSlideshowChange,
}: {
  content: RenderedContent;
  slideshow: boolean;
  onSlideshowChange: (open: boolean) => void;
}) {
  const [page, setPage] = useState(0);
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
              {slideshow ? <ArtifactThumbnail section={current} title={`Slide ${page + 1}`} /> : <ArtifactFrame
                key={current.id}
                title={`Slide ${page + 1}: ${content.title}`}
                section={current}
                fitSlide
              />}
            </div>
          </div>
          <div className="shared-speaker-notes">Shared presentation · Read only</div>
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
    <DocumentViewer sections={content.sections} page={page} onPageChange={setPage} title={content.title} />
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

function SlideStudio({
  doc,
  safeActiveSlide,
  setActiveSlide,
  change,
  busy,
  presenting,
  setFullscreen,
  slidesSidebarOpen,
  setSlidesSidebarOpen,
  propertiesOpen,
  setPropertiesOpen,
  propertiesTab,
  setPropertiesTab,
  codeTab,
  setCodeTab,
  run,
  setNotice,
}: {
  doc: Document;
  safeActiveSlide: number;
  setActiveSlide: React.Dispatch<React.SetStateAction<number>>;
  change: (next: Document) => void;
  busy: boolean;
  presenting: boolean;
  setFullscreen: (open: boolean) => void;
  slidesSidebarOpen: boolean;
  setSlidesSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  propertiesOpen: boolean;
  setPropertiesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  propertiesTab: "layout" | "style" | "code";
  setPropertiesTab: React.Dispatch<React.SetStateAction<"layout" | "style" | "code">>;
  codeTab: "html" | "css" | "js";
  setCodeTab: React.Dispatch<React.SetStateAction<"html" | "css" | "js">>;
  run: (action: () => Promise<void>) => Promise<void>;
  setNotice: (n: string) => void;
}) {
  const addSlide = () => {
    if (doc.sections.length >= 40) return;
    const newSection = {
      id: crypto.randomUUID(),
      kind: "html" as const,
      html: `<article class="slide">\n  <h2>New Slide</h2>\n  <p>Add presentation content here.</p>\n</article>`,
      css: `.slide { padding: 40px; font-family: system-ui, sans-serif; background: #0F172A; color: #FFFFFF; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; }\nh2 { font-size: 26px; margin: 0 0 12px; color: #F8FAFC; }\np { font-size: 15px; color: #94A3B8; }`,
    };
    change({ ...doc, sections: [...doc.sections, newSection] });
    setActiveSlide(doc.sections.length);
  };

  const duplicateSlide = (idx: number) => {
    if (doc.sections.length >= 40) return;
    const target = doc.sections[idx];
    if (!target) return;
    const clone = { ...target, id: crypto.randomUUID() };
    const updated = [...doc.sections];
    updated.splice(idx + 1, 0, clone);
    change({ ...doc, sections: updated });
    setActiveSlide(idx + 1);
  };

  const deleteSlide = (idx: number) => {
    if (doc.sections.length <= 1) return;
    if (!confirm(`Delete slide ${idx + 1}?`)) return;
    const filtered = doc.sections.filter((_, i) => i !== idx);
    change({ ...doc, sections: filtered });
    setActiveSlide(Math.max(0, idx - 1));
  };

  const moveSlide = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= doc.sections.length) return;
    const updated = [...doc.sections];
    [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];
    change({ ...doc, sections: updated });
    setActiveSlide(targetIdx);
  };

  const applyTheme = (theme: ThemeCatalogItem) => {
    const themeCss = `\n/* Theme: ${theme.name} */\n:root, .slide {\n  --ds-bg: ${theme.background};\n  --ds-text: ${theme.color};\n  --ds-accent: ${theme.accent};\n  background: ${theme.background} !important;\n  color: ${theme.color} !important;\n}\n`;
    change({
      ...doc,
      sections: doc.sections.map((s, idx) => {
        if (idx !== safeActiveSlide) return s;
        const clean = s.css.replace(/\/\* Theme: [\s\S]*?\*\/\n:root, \.slide \{[\s\S]*?\}\n/, "");
        return { ...s, css: clean + themeCss };
      }),
    });
    setNotice(`Applied ${theme.name} theme to slide ${safeActiveSlide + 1}.`);
  };

  const applyBgColor = (color: string) => {
    const bgCss = `\n/* Custom Bg */\n.slide { background: ${color} !important; }\n`;
    change({
      ...doc,
      sections: doc.sections.map((s, idx) => {
        if (idx !== safeActiveSlide) return s;
        const clean = s.css.replace(/\/\* Custom Bg \*\/\n\.slide \{ background: [^}]+ !important; \}\n/, "");
        return { ...s, css: clean + bgCss };
      }),
    });
  };

  const applyAccentColor = (accent: string) => {
    const accentCss = `\n/* Custom Accent */\n:root, .slide { --ds-accent: ${accent} !important; }\n.badge, .highlight, h2 { color: ${accent} !important; }\n`;
    change({
      ...doc,
      sections: doc.sections.map((s, idx) => {
        if (idx !== safeActiveSlide) return s;
        const clean = s.css.replace(/\/\* Custom Accent \*\/[\s\S]*?color: [^}]+ !important; \}\n/, "");
        return { ...s, css: clean + accentCss };
      }),
    });
  };

  return (
    <div className="slide-studio">
      {/* 1. Left Panel: Slide Filmstrip */}
      <aside className={cn("slide-studio-left", !slidesSidebarOpen && "collapsed")}>
        <div className="slide-studio-left-header">
          {slidesSidebarOpen ? (
            <>
              <div className="title">
                <span>Slides</span>
                <span className="count-badge">{doc.sections.length}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Collapse sidebar"
                aria-label="Collapse slide sidebar"
                onClick={() => setSlidesSidebarOpen(false)}
              >
                <PanelLeftClose className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Expand sidebar"
              aria-label="Expand slide sidebar"
              onClick={() => setSlidesSidebarOpen(true)}
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="slide-studio-left-actions">
          {slidesSidebarOpen ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs font-medium justify-center h-8 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-600"
              disabled={doc.sections.length >= 40 || busy}
              onClick={() => addSlide()}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add slide
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg border-dashed"
              title="Add slide"
              disabled={doc.sections.length >= 40 || busy}
              onClick={() => addSlide()}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="slide-studio-thumbnails">
          {doc.sections.map((s, idx) => {
            const isActive = idx === safeActiveSlide;
            if (!slidesSidebarOpen) {
              return (
                <button
                  key={s.id}
                  type="button"
                  className={cn("slide-studio-mini-pill", isActive && "active")}
                  title={`Slide ${idx + 1}`}
                  onClick={() => setActiveSlide(idx)}
                >
                  {idx + 1}
                </button>
              );
            }
            return (
              <div
                key={s.id}
                className={cn("slide-studio-card", isActive && "active")}
                onClick={() => setActiveSlide(idx)}
              >
                <div className="slide-studio-card-bar">
                  <span>Slide {idx + 1}</span>
                  <div className="slide-studio-card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer border-0 bg-transparent"
                      title="Move up"
                      disabled={idx === 0 || busy}
                      onClick={() => moveSlide(idx, -1)}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer border-0 bg-transparent"
                      title="Move down"
                      disabled={idx === doc.sections.length - 1 || busy}
                      onClick={() => moveSlide(idx, 1)}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer border-0 bg-transparent"
                      title="Duplicate slide"
                      disabled={doc.sections.length >= 40 || busy}
                      onClick={() => duplicateSlide(idx)}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      className="p-1 rounded hover:bg-destructive/10 text-slate-400 hover:text-destructive disabled:opacity-30 cursor-pointer border-0 bg-transparent"
                      title="Delete slide"
                      disabled={doc.sections.length <= 1 || busy}
                      onClick={() => deleteSlide(idx)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="slide-studio-card-preview">
                  <ArtifactThumbnail title={`Slide ${idx + 1}`} section={s} />
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* 2. Center Panel: 16:9 Canvas + Dock */}
      <main className="slide-studio-center">
        {!propertiesOpen && (
          <Button
            variant="outline"
            size="sm"
            className="absolute top-3 right-4 z-10 bg-white/90 backdrop-blur shadow-xs text-xs font-medium border-slate-200 hover:bg-slate-50"
            onClick={() => setPropertiesOpen(true)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
            Properties
          </Button>
        )}

        {/* 16:9 Slide Canvas Stage */}
        <div className="slide-studio-canvas-container">
          <div className="slide-studio-canvas">
            {doc.sections[safeActiveSlide] && (
              presenting ? <ArtifactThumbnail section={doc.sections[safeActiveSlide]} title={`Slide ${safeActiveSlide + 1}`} /> : <ArtifactFrame
                key={doc.sections[safeActiveSlide].id + "-" + doc.sections[safeActiveSlide].css.length + "-" + doc.sections[safeActiveSlide].html.length}
                title={`Slide ${safeActiveSlide + 1}`}
                section={doc.sections[safeActiveSlide]}
                fitSlide
              />
            )}
          </div>
        </div>

        {/* Slide controls */}
        <div className="slide-studio-bottom-bar" role="toolbar" aria-label="Slide quick actions">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-medium"
            title="Copy AI Prompt for connected agent"
            disabled={busy}
            onClick={() => void run(async () => {
              await navigator.clipboard.writeText(customThemePrompt);
              setNotice("AI slide generation prompt copied! Paste into Codex, Claude, or Antigravity.");
            })}
          >
            <Sparkles className="w-3.5 h-3.5 mr-1 text-indigo-600" />
            AI Prompt
          </Button>

          <div className="slide-studio-dock-sep" aria-hidden="true" />

          {/* Slide Pager */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:text-slate-900"
              title="Previous slide"
              disabled={safeActiveSlide === 0}
              onClick={() => setActiveSlide((prev) => Math.max(0, prev - 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-xs font-semibold text-slate-700 min-w-[50px] text-center select-none">
              {safeActiveSlide + 1} / {doc.sections.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:text-slate-900"
              title="Next slide"
              disabled={safeActiveSlide >= doc.sections.length - 1}
              onClick={() => setActiveSlide((prev) => Math.min(doc.sections.length - 1, prev + 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-600 hover:text-indigo-600 ml-0.5"
              title="Present fullscreen"
              onClick={() => setFullscreen(true)}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
            </Button>
          </div>
        </div>
      </main>

      {/* 3. Right Panel: Properties */}
      <aside className={cn("slide-studio-right", !propertiesOpen && "collapsed")} inert={!propertiesOpen}>
        <div className="slide-studio-right-header">
          <span className="title">Properties</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              Slide {safeActiveSlide + 1}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Close properties"
              aria-label="Close properties"
              onClick={() => setPropertiesOpen(false)}
            >
              <PanelRightClose className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Segmented Tabs Bar */}
        <div className="slide-studio-tabs-bar">
          <button
            type="button"
            className={cn("slide-studio-tab-btn", propertiesTab === "layout" && "active")}
            onClick={() => setPropertiesTab("layout")}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Layout
          </button>
          <button
            type="button"
            className={cn("slide-studio-tab-btn", propertiesTab === "style" && "active")}
            onClick={() => setPropertiesTab("style")}
          >
            <Palette className="w-3.5 h-3.5" />
            Style
          </button>
          <button
            type="button"
            className={cn("slide-studio-tab-btn", propertiesTab === "code" && "active")}
            onClick={() => setPropertiesTab("code")}
          >
            <Code2 className="w-3.5 h-3.5" />
            Code
          </button>
        </div>

        <div className="slide-studio-right-body" inert={busy}>
          <MediaUpload key={doc.sections[safeActiveSlide].id} documentId={doc.id} textPage={doc.sections[safeActiveSlide].kind === "text"} disabled={busy}
            onInsert={html => {
              change({ ...doc, sections: doc.sections.map((section, index) => index === safeActiveSlide ? { ...section, kind: "html", html: insertPageMedia(section.html, html) } : section) });
              setNotice("Media inserted. Save to keep this change.");
            }} />
          {/* Tab 1: Slide layout */}
          {propertiesTab === "layout" && (
            <>
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Slide Type
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <span className="text-xs font-semibold text-slate-800">
                    {doc.sections[safeActiveSlide]?.kind === "text" ? "Rich Text Document Slide" : "Interactive HTML Slide"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => {
                      const current = doc.sections[safeActiveSlide];
                      const nextKind = current.kind === "text" ? "html" : "text";
                      change({
                        ...doc,
                        sections: doc.sections.map((s, idx) =>
                          idx === safeActiveSlide ? { ...s, kind: nextKind } : s,
                        ),
                      });
                    }}
                  >
                    Convert
                  </Button>
                </div>
              </div>

              {doc.sections[safeActiveSlide]?.kind === "text" && (
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Text Content
                  </div>
                  <div className="border border-slate-200 rounded-lg p-2 bg-white">
                    <RichText
                      key={doc.sections[safeActiveSlide].id + "-" + doc.revision}
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
                  </div>
                </div>
              )}
            </>
          )}

          {/* Tab 2: Style & Themes */}
          {propertiesTab === "style" && (
            <>
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Preset Themes
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="p-2.5 rounded-lg border border-slate-200 text-left hover:border-indigo-500 transition-all cursor-pointer flex flex-col gap-1.5 bg-white"
                      onClick={() => applyTheme(t)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">{t.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full border border-slate-300" style={{ background: t.background }} />
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.accent }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 leading-tight">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Slide Background Color
                </div>
                <div className="swatch-group">
                  {[
                    { color: "#0B0F17", name: "Dark Slate" },
                    { color: "#0A192F", name: "Deep Navy" },
                    { color: "#FFFFFF", name: "Pure White" },
                    { color: "#F8FAFC", name: "Soft Zinc" },
                    { color: "#FFFBF0", name: "Warm Cream" },
                  ].map((swatch) => (
                    <button
                      key={swatch.color}
                      type="button"
                      className="color-swatch"
                      style={{ background: swatch.color }}
                      title={swatch.name}
                      onClick={() => applyBgColor(swatch.color)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Accent Highlight Color
                </div>
                <div className="swatch-group">
                  {[
                    { color: "#6366F1", name: "Indigo" },
                    { color: "#0EA5E9", name: "Sky Cyan" },
                    { color: "#10B981", name: "Emerald Mint" },
                    { color: "#F59E0B", name: "Amber Glow" },
                    { color: "#EC4899", name: "Rose Pink" },
                  ].map((swatch) => (
                    <button
                      key={swatch.color}
                      type="button"
                      className="color-swatch"
                      style={{ background: swatch.color }}
                      title={swatch.name}
                      onClick={() => applyAccentColor(swatch.color)}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs h-8 text-slate-700"
                  onClick={() => {
                    const activeSlideCss = doc.sections[safeActiveSlide].css;
                    change({
                      ...doc,
                      sections: doc.sections.map((s) => ({ ...s, css: activeSlideCss })),
                    });
                    setNotice("Style applied to all slides in this presentation.");
                  }}
                >
                  Apply this style to all slides
                </Button>
              </div>
            </>
          )}

          {/* Tab 3: Live Code Editor */}
          {propertiesTab === "code" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
                  {(["html", "css", "js"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-mono rounded cursor-pointer border-0 bg-transparent uppercase",
                        codeTab === tab
                          ? "bg-white font-bold text-indigo-600 shadow-xs"
                          : "text-slate-500 hover:text-slate-800",
                      )}
                      onClick={() => setCodeTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Live editor</span>
              </div>

              <textarea
                className="code-editor-area"
                disabled={busy}
                spellCheck={false}
                value={doc.sections[safeActiveSlide]?.[codeTab] || ""}
                placeholder={`Enter slide ${codeTab.toUpperCase()}...`}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  change({
                    ...doc,
                    sections: doc.sections.map((s, idx) =>
                      idx === safeActiveSlide ? { ...s, [codeTab]: nextVal } : s,
                    ),
                  });
                }}
              />

              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Edits update the live canvas immediately. Click <strong>Save</strong> in the topbar to persist your changes.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

type DocArchetype = {
  id: string;
  name: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  badge: string;
  kind: "text" | "html";
  html: string;
  css: string;
};

const DOC_ARCHETYPES: DocArchetype[] = [
  {
    id: "header",
    name: "Document Header",
    desc: "Executive title, subtitle, author, and metadata tags",
    icon: Type,
    badge: "HEADER",
    kind: "html",
    html: `<header class="doc-header">\n  <span class="doc-badge">EXECUTIVE SUMMARY</span>\n  <h1 class="doc-title">Engineering Strategy & Systems Defense</h1>\n  <p class="doc-subtitle">A comprehensive breakdown of architecture decisions, throughput benchmarks, and operational roadmaps.</p>\n  <div class="doc-meta">\n    <span class="meta-item"><strong>Author:</strong> Ayush Vishwakarma</span>\n    <span class="meta-dot">•</span>\n    <span class="meta-item"><strong>Updated:</strong> Q4 2026</span>\n    <span class="meta-dot">•</span>\n    <span class="meta-badge">Verified Defense</span>\n  </div>\n</header>`,
    css: `.doc-header { padding: 4px 0 12px; font-family: Inter, system-ui, sans-serif; color: #0F172A; }\n.doc-badge { font-size: 11px; letter-spacing: 1.5px; font-weight: 700; color: #6366F1; text-transform: uppercase; margin-bottom: 8px; display: inline-block; }\n.doc-title { font-size: clamp(24px, 3.5vw, 32px); font-weight: 700; margin: 0 0 10px; color: #0F172A; letter-spacing: -0.5px; line-height: 1.25; }\n.doc-subtitle { font-size: 15px; color: #64748B; margin: 0 0 16px; line-height: 1.6; max-width: 680px; }\n.doc-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #64748B; flex-wrap: wrap; }\n.meta-dot { color: #CBD5E1; }\n.meta-badge { background: #EEF2FF; color: #4F46E5; font-weight: 600; padding: 2px 8px; border-radius: 9999px; }`,
  },
  {
    id: "kpi",
    name: "Summary KPI Row",
    desc: "3-card metrics overview (throughput, latency, efficiency)",
    icon: LayoutGrid,
    badge: "KEY METRICS",
    kind: "html",
    html: `<div class="doc-kpi-row">\n  <div class="kpi-card">\n    <span class="kpi-label">Peak Throughput</span>\n    <span class="kpi-val">2.14M <small>Ops/sec</small></span>\n    <span class="kpi-sub positive">↑ 3.2x vs Redis Cluster</span>\n  </div>\n  <div class="kpi-card highlight">\n    <span class="kpi-label">p99 Tail Latency</span>\n    <span class="kpi-val">14.2 <small>µs</small></span>\n    <span class="kpi-sub">Sub-microsecond kernel dispatch</span>\n  </div>\n  <div class="kpi-card">\n    <span class="kpi-label">Core Scaling Efficiency</span>\n    <span class="kpi-val">98.4%</span>\n    <span class="kpi-sub">Shared-nothing lock-free</span>\n  </div>\n</div>`,
    css: `.doc-kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; font-family: Inter, system-ui, sans-serif; }\n.kpi-card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px; box-sizing: border-box; }\n.kpi-card.highlight { border-color: #6366F1; background: #FAF5FF; }\n.kpi-label { font-size: 12px; font-weight: 600; color: #64748B; margin-bottom: 6px; display: block; }\n.kpi-val { font-size: 26px; font-weight: 700; color: #0F172A; display: block; margin-bottom: 4px; }\n.kpi-val small { font-size: 13px; font-weight: 500; color: #64748B; }\n.kpi-sub { font-size: 11px; color: #64748B; font-weight: 500; }\n.kpi-sub.positive { color: #16A34A; }\n@media (max-width: 640px) { .doc-kpi-row { grid-template-columns: 1fr; } }`,
  },
  {
    id: "table",
    name: "Structured Data Table",
    desc: "Clean formatted benchmark or financial table",
    icon: TableIcon,
    badge: "DATA TABLE",
    kind: "html",
    html: `<div class="doc-table-box">\n  <div class="table-header-row">\n    <h3>Engine Benchmark Comparison</h3>\n    <span class="badge">AWS c6i.16xlarge (64 vCPUs)</span>\n  </div>\n  <table class="doc-table">\n    <thead>\n      <tr>\n        <th>Engine</th>\n        <th>Threading Model</th>\n        <th>Throughput (Ops/sec)</th>\n        <th>p99 Latency</th>\n        <th>Memory</th>\n      </tr>\n    </thead>\n    <tbody>\n      <tr class="row-highlight">\n        <td><strong>DbSync (Our System)</strong></td>\n        <td>Shared-Nothing (io_uring)</td>\n        <td><strong style="color: #4F46E5;">2,140,143</strong></td>\n        <td>14.2 µs</td>\n        <td>1.2 GB</td>\n      </tr>\n      <tr>\n        <td>DragonFly DB</td>\n        <td>Multi-Threaded Fiber</td>\n        <td>1,420,000</td>\n        <td>42.8 µs</td>\n        <td>1.8 GB</td>\n      </tr>\n      <tr>\n        <td>KeyDB</td>\n        <td>Multi-Threaded</td>\n        <td>890,000</td>\n        <td>68.1 µs</td>\n        <td>2.1 GB</td>\n      </tr>\n      <tr>\n        <td>Redis 7.2</td>\n        <td>Single-Threaded Event Loop</td>\n        <td>480,000</td>\n        <td>92.4 µs</td>\n        <td>1.4 GB</td>\n      </tr>\n    </tbody>\n  </table>\n</div>`,
    css: `.doc-table-box { font-family: Inter, system-ui, sans-serif; }\n.table-header-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }\n.table-header-row h3 { font-size: 16px; font-weight: 700; color: #0F172A; margin: 0; }\n.table-header-row .badge { font-size: 11px; color: #64748B; background: #F1F5F9; padding: 2px 8px; border-radius: 6px; }\n.doc-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }\n.doc-table th { padding: 10px 12px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; color: #64748B; font-weight: 600; }\n.doc-table td { padding: 12px; border-bottom: 1px solid #F1F5F9; color: #334155; }\n.row-highlight { background: rgba(238, 242, 255, 0.4); }\n.row-highlight td { font-weight: 500; }`,
  },
  {
    id: "chart",
    name: "Visual Bar Chart",
    desc: "Vertical animated data comparison chart",
    icon: BarChart3,
    badge: "CHART",
    kind: "html",
    html: `<div class="doc-chart-box">\n  <div class="chart-header">\n    <h3>Scaling Linearity Across Cores</h3>\n    <span class="caption">Benchmark metric: SET/GET ratio 1:1</span>\n  </div>\n  <div class="chart-bars">\n    <div class="col"><div class="bar" style="height: 25%"><span class="val">540K</span></div><span class="sub">4 Cores</span></div>\n    <div class="col"><div class="bar" style="height: 48%"><span class="val">1.05M</span></div><span class="sub">8 Cores</span></div>\n    <div class="col"><div class="bar" style="height: 72%"><span class="val">1.60M</span></div><span class="sub">16 Cores</span></div>\n    <div class="col"><div class="bar highlight" style="height: 100%"><span class="val">2.14M</span></div><span class="sub">32 Cores</span></div>\n  </div>\n</div>`,
    css: `.doc-chart-box { font-family: Inter, system-ui, sans-serif; }\n.chart-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }\n.chart-header h3 { font-size: 16px; font-weight: 700; color: #0F172A; margin: 0; }\n.chart-header .caption { font-size: 12px; color: #64748B; }\n.chart-bars { display: flex; align-items: flex-end; gap: 16px; height: 160px; padding-bottom: 10px; border-bottom: 1px solid #E2E8F0; }\n.col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; gap: 6px; }\n.bar { width: 100%; background: #E2E8F0; border-radius: 6px; display: flex; align-items: flex-start; justify-content: center; padding-top: 6px; }\n.bar.highlight { background: #6366F1; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.25); }\n.bar .val { font-size: 11px; font-weight: 700; color: #64748B; }\n.bar.highlight .val { color: #FFFFFF; }\n.col .sub { font-size: 11px; color: #64748B; font-weight: 500; }`,
  },
  {
    id: "callout",
    name: "Callout Box",
    desc: "Highlighted insight note with icon and accent border",
    icon: Info,
    badge: "CALLOUT",
    kind: "html",
    html: `<div class="doc-callout">\n  <span class="callout-icon">💡</span>\n  <div class="callout-body">\n    <h4>Key Architectural Principle</h4>\n    <p>By guaranteeing that memory shards are never shared across threads, CPU cores never invalidate L1/L2 cache lines or execute memory barriers during normal key lookup. This unlocks near-hardware-speed performance.</p>\n  </div>\n</div>`,
    css: `.doc-callout { display: flex; gap: 14px; background: #F8FAFC; border: 1px solid #E2E8F0; border-left: 4px solid #6366F1; border-radius: 8px; padding: 16px; font-family: Inter, system-ui, sans-serif; }\n.callout-icon { font-size: 20px; line-height: 1; flex-shrink: 0; }\n.callout-body h4 { font-size: 14px; font-weight: 700; color: #0F172A; margin: 0 0 4px; }\n.callout-body p { font-size: 13px; color: #475569; margin: 0; line-height: 1.6; }`,
  },
  {
    id: "text",
    name: "Text Paragraph",
    desc: "Formatted narrative text and headings",
    icon: FileText,
    badge: "TEXT BLOCK",
    kind: "text",
    html: `<h2>Technical Blueprint & Core Invariants</h2><p>DbSync operates on the core invariant that no memory address is ever written to by more than one thread. Work is distributed across hardware threads via ring buffers.</p>`,
    css: ``,
  },
  {
    id: "code",
    name: "Code Snippet",
    desc: "Syntax-highlighted code block with language indicator",
    icon: FileCode,
    badge: "CODE BLOCK",
    kind: "html",
    html: `<div class="doc-code-box">\n  <div class="code-head">\n    <span>core/engine/io_uring_dispatcher.cpp</span>\n    <span class="lang">C++20</span>\n  </div>\n  <pre><code>// Kernel submission ring buffer setup\nstruct io_uring_params params = {};\nparams.flags = IORING_SETUP_SQPOLL; // Kernel poll thread\nint ret = io_uring_queue_init_params(QUEUE_DEPTH, &ring, &params);\nif (ret < 0) throw std::runtime_error("io_uring initialization failed");</code></pre>\n</div>`,
    css: `.doc-code-box { font-family: Inter, system-ui, sans-serif; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; }\n.code-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 14px; background: #F8FAFC; border-bottom: 1px solid #E2E8F0; font-size: 11px; font-family: ui-monospace, monospace; color: #64748B; }\n.doc-code-box pre { margin: 0; padding: 14px; background: #0F172A; color: #F8FAFC; font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; line-height: 1.5; overflow-x: auto; }`,
  },
  {
    id: "divider",
    name: "Divider",
    desc: "Horizontal line to separate document sections",
    icon: Minus,
    badge: "DIVIDER",
    kind: "html",
    html: `<hr class="doc-divider" />`,
    css: `.doc-divider { border: 0; border-top: 1px solid #E2E8F0; margin: 12px 0; }`,
  },
];

function getSectionTitle(s: Content["sections"][number], idx: number): string {
  if (s.html) {
    const hMatch = s.html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/i);
    if (hMatch) {
      const text = hMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text) return text;
    }
    const badgeMatch = s.html.match(/class="[^"]*(?:badge|label|title)[^"]*"[^>]*>(.*?)<\//i);
    if (badgeMatch) {
      const text = badgeMatch[1].replace(/<[^>]+>/g, "").trim();
      if (text) return text;
    }
  }
  return `Page ${idx + 1}`;
}

function getSectionIcon(s: Content["sections"][number]): React.ComponentType<{ className?: string }> {
  const html = s.html.toLowerCase();
  if (html.includes("doc-header") || html.includes("<h1")) return Type;
  if (html.includes("kpi") || html.includes("metrics")) return LayoutGrid;
  if (html.includes("table")) return TableIcon;
  if (html.includes("chart") || html.includes("bar")) return BarChart3;
  if (html.includes("callout")) return Info;
  if (html.includes("code") || html.includes("<pre")) return FileCode;
  if (html.includes("divider") || html.includes("<hr")) return Minus;
  return FileText;
}

function SlashCommandMenu({
  insertIndex,
  onSelect,
  onClose,
}: {
  insertIndex: number;
  onSelect: (arch: DocArchetype, index: number) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = DOC_ARCHETYPES.filter(
    (a) =>
      a.name.toLowerCase().includes(filter.toLowerCase()) ||
      a.desc.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="slash-menu-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="slash-menu-card" onClick={(e) => e.stopPropagation()}>
        <div className="slash-menu-header">
          <span className="title">Insert page (or type /)</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="p-2 border-b border-slate-100">
          <Input
            autoFocus
            placeholder="Search page type..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 text-xs bg-slate-50 border-slate-200"
          />
        </div>
        <div className="slash-menu-list">
          {filtered.map((arch) => {
            const Icon = arch.icon;
            return (
              <button
                key={arch.id}
                type="button"
                className="slash-menu-item"
                onClick={() => onSelect(arch, insertIndex)}
              >
                <div className="slash-menu-item-icon">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="slash-menu-item-text">
                  <span className="name">{arch.name}</span>
                  <span className="desc">{arch.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DocStudio({
  doc,
  activeSectionIndex,
  setActiveSectionIndex,
  change,
  busy,
  preview,
  outlineOpen,
  setOutlineOpen,
  propertiesOpen,
  setPropertiesOpen,
  propertiesTab,
  setPropertiesTab,
  codeTab,
  setCodeTab,
  setNotice,
}: {
  doc: Document;
  activeSectionIndex: number;
  setActiveSectionIndex: React.Dispatch<React.SetStateAction<number>>;
  change: (next: Document) => void;
  busy: boolean;
  preview: boolean;
  outlineOpen: boolean;
  setOutlineOpen: React.Dispatch<React.SetStateAction<boolean>>;
  propertiesOpen: boolean;
  setPropertiesOpen: React.Dispatch<React.SetStateAction<boolean>>;
  propertiesTab: "layout" | "style" | "code";
  setPropertiesTab: React.Dispatch<React.SetStateAction<"layout" | "style" | "code">>;
  codeTab: "html" | "css" | "js";
  setCodeTab: React.Dispatch<React.SetStateAction<"html" | "css" | "js">>;
  setNotice: (n: string) => void;
}) {
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !slashMenuOpen) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setSlashMenuIndex(doc.sections.length);
        setSlashMenuOpen(true);
      }
      if (e.key === "Escape" && slashMenuOpen) {
        setSlashMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [slashMenuOpen, doc.sections.length]);

  const safeActiveSection =
    doc && doc.sections.length > 0
      ? Math.min(activeSectionIndex, doc.sections.length - 1)
      : 0;

  const insertPage = (arch: DocArchetype, index: number) => {
    if (doc.sections.length >= 40) return;
    const newSection = {
      id: crypto.randomUUID(),
      kind: arch.kind,
      html: arch.html,
      css: arch.css,
    };
    const updated = [...doc.sections];
    updated.splice(index, 0, newSection);
    change({ ...doc, sections: updated });
    setActiveSectionIndex(index);
    setSlashMenuOpen(false);
    setNotice(`Added ${arch.name}.`);
  };

  const duplicatePage = (idx: number) => {
    if (doc.sections.length >= 40) return;
    const target = doc.sections[idx];
    if (!target) return;
    const clone = { ...target, id: crypto.randomUUID() };
    const updated = [...doc.sections];
    updated.splice(idx + 1, 0, clone);
    change({ ...doc, sections: updated });
    setActiveSectionIndex(idx + 1);
    setNotice("Page duplicated.");
  };

  const deletePage = (idx: number) => {
    if (doc.sections.length <= 1) return;
    if (!confirm(`Delete page ${idx + 1}?`)) return;
    const filtered = doc.sections.filter((_, i) => i !== idx);
    change({ ...doc, sections: filtered });
    setActiveSectionIndex(Math.max(0, idx - 1));
    setNotice("Page removed.");
  };

  const movePage = (idx: number, dir: -1 | 1) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= doc.sections.length) return;
    const updated = [...doc.sections];
    [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];
    change({ ...doc, sections: updated });
    setActiveSectionIndex(targetIdx);
  };

  const applyArchetype = (arch: DocArchetype) => {
    change({
      ...doc,
      sections: doc.sections.map((s, idx) =>
        idx === safeActiveSection
          ? { ...s, html: arch.html, css: arch.css, kind: arch.kind, js: undefined }
          : s,
      ),
    });
    setNotice(`Applied ${arch.name} to page ${safeActiveSection + 1}.`);
  };

  const applyTheme = (theme: ThemeCatalogItem) => {
    const themeCss = `\n/* Doc Theme: ${theme.name} */\n:root, .doc-header, .doc-kpi-row, .doc-table-box, .doc-chart-box, .doc-callout {\n  --ds-accent: ${theme.accent};\n}\n.doc-badge, .kpi-card.highlight, .row-highlight, .bar.highlight, .doc-callout {\n  border-color: ${theme.accent} !important;\n}\n`;
    change({
      ...doc,
      sections: doc.sections.map((s, idx) => {
        if (idx !== safeActiveSection) return s;
        const clean = s.css.replace(/\/\* Doc Theme: [\s\S]*?\*\/[\s\S]*?\}\n/, "");
        return { ...s, css: clean + themeCss };
      }),
    });
    setNotice(`Applied ${theme.name} theme tokens.`);
  };

  const applyAccentColor = (accent: string) => {
    const accentCss = `\n/* Custom Accent */\n:root { --ds-accent: ${accent} !important; }\n.doc-badge, .meta-badge { background: ${accent}15 !important; color: ${accent} !important; }\n.kpi-card.highlight, .bar.highlight { background: ${accent} !important; }\n`;
    change({
      ...doc,
      sections: doc.sections.map((s, idx) => {
        if (idx !== safeActiveSection) return s;
        const clean = s.css.replace(/\/\* Custom Accent \*\/[\s\S]*?\}\n/, "");
        return { ...s, css: clean + accentCss };
      }),
    });
  };

  return (
    <div className="doc-studio">
      {/* 1. Left Panel: Document Outline */}
      <aside className={cn("doc-studio-left", !outlineOpen && "collapsed")}>
        <div className="doc-studio-left-header">
          {outlineOpen ? (
            <>
              <div className="title">
                <span>Pages</span>
                <span className="count-badge">{doc.sections.length}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Collapse outline"
                aria-label="Collapse outline"
                onClick={() => setOutlineOpen(false)}
              >
                <PanelLeftClose className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Expand outline"
              aria-label="Expand outline"
              onClick={() => setOutlineOpen(true)}
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
          )}
        </div>

        <div className="doc-studio-left-actions">
          {outlineOpen ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs font-medium justify-center h-8 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-600"
              disabled={doc.sections.length >= 40 || busy}
              onClick={() => {
                setSlashMenuIndex(doc.sections.length);
                setSlashMenuOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add page
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-lg border-dashed"
              title="Add page"
              disabled={doc.sections.length >= 40 || busy}
              onClick={() => {
                setSlashMenuIndex(doc.sections.length);
                setSlashMenuOpen(true);
              }}
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        <div className="doc-studio-outline-list">
          {doc.sections.map((s, idx) => {
            const isActive = idx === safeActiveSection;
            const Icon = getSectionIcon(s);
            const title = getSectionTitle(s, idx);

            if (!outlineOpen) {
              return (
                <button
                  key={s.id}
                  type="button"
                  className={cn("slide-studio-mini-pill", isActive && "active")}
                  title={`Page ${idx + 1}: ${title}`}
                  aria-label={`Show page ${idx + 1}: ${title}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setActiveSectionIndex(idx)}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            }

            return (
              <div
                key={s.id}
                className={cn("doc-outline-item", isActive && "active")}
              >
                <button type="button" className="doc-outline-item-info" aria-label={`Show page ${idx + 1}: ${title}`} aria-current={isActive ? "page" : undefined} onClick={() => setActiveSectionIndex(idx)}>
                  <span className="doc-outline-num">{String(idx + 1).padStart(2, "0")}</span>
                  <Icon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="doc-outline-title">{title}</span>
                </button>
                <div className="doc-outline-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer border-0 bg-transparent"
                    title="Move up"
                    disabled={idx === 0 || busy}
                    onClick={() => movePage(idx, -1)}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer border-0 bg-transparent"
                    title="Move down"
                    disabled={idx === doc.sections.length - 1 || busy}
                    onClick={() => movePage(idx, 1)}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-destructive/10 text-slate-400 hover:text-destructive disabled:opacity-30 cursor-pointer border-0 bg-transparent"
                    title="Delete page"
                    disabled={doc.sections.length <= 1 || busy}
                    onClick={() => deletePage(idx)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <main className="doc-studio-center">
        <DocumentViewer
          sections={doc.sections}
          page={safeActiveSection}
          onPageChange={setActiveSectionIndex}
          title={doc.title}
          actions={<>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicate page" aria-label="Duplicate page" disabled={doc.sections.length >= 40 || busy} onClick={() => duplicatePage(safeActiveSection)}><Copy size={15} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete page" aria-label="Delete page" disabled={doc.sections.length <= 1 || busy} onClick={() => deletePage(safeActiveSection)}><Trash2 size={15} /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" title="Inspect properties" aria-label="Inspect properties" onClick={() => setPropertiesOpen(value => !value)}><SlidersHorizontal size={15} /></Button>
          </>}
        >
          {!preview && doc.sections[safeActiveSection]?.kind === "text" && <div className="document-text-page">
            <RichText
              key={doc.sections[safeActiveSection].id + "-" + doc.revision}
              disabled={busy}
              html={doc.sections[safeActiveSection].html}
              onChange={(html) => change({ ...doc, sections: doc.sections.map((section, index) => index === safeActiveSection ? { ...section, html } : section) })}
            />
          </div>}
        </DocumentViewer>
      </main>

      {/* 3. Right Panel: Properties Inspector */}
      <aside className={cn("doc-studio-right", !propertiesOpen && "collapsed")} inert={!propertiesOpen}>
        <div className="doc-studio-right-header">
          <span className="title">Properties</span>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              Page {safeActiveSection + 1}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Close properties"
              aria-label="Close properties"
              onClick={() => setPropertiesOpen(false)}
            >
              <PanelRightClose className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Segmented Tabs Bar */}
        <div className="doc-studio-tabs-bar">
          <button
            type="button"
            className={cn("doc-studio-tab-btn", propertiesTab === "layout" && "active")}
            onClick={() => setPropertiesTab("layout")}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Page
          </button>
          <button
            type="button"
            className={cn("doc-studio-tab-btn", propertiesTab === "style" && "active")}
            onClick={() => setPropertiesTab("style")}
          >
            <Palette className="w-3.5 h-3.5" />
            Style
          </button>
          <button
            type="button"
            className={cn("doc-studio-tab-btn", propertiesTab === "code" && "active")}
            onClick={() => setPropertiesTab("code")}
          >
            <Code2 className="w-3.5 h-3.5" />
            Code
          </button>
        </div>

        <div className="doc-studio-right-body" inert={busy}>
          <MediaUpload key={doc.sections[safeActiveSection].id} documentId={doc.id} textPage={doc.sections[safeActiveSection].kind === "text"} disabled={busy}
            onInsert={html => {
              change({ ...doc, sections: doc.sections.map((section, index) => index === safeActiveSection ? { ...section, kind: "html", html: insertPageMedia(section.html, html) } : section) });
              setNotice("Media inserted. Save to keep this change.");
            }} />
          {/* Tab 1: Block Archetypes */}
          {propertiesTab === "layout" && (
            <>
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Page Type
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg border border-slate-200 bg-slate-50">
                  <span className="text-xs font-semibold text-slate-800">
                    {doc.sections[safeActiveSection]?.kind === "text"
                      ? "Rich Text Page"
                      : "Interactive HTML Page"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-[11px] px-2"
                    onClick={() => {
                      const current = doc.sections[safeActiveSection];
                      const nextKind = current.kind === "text" ? "html" : "text";
                      change({
                        ...doc,
                        sections: doc.sections.map((s, idx) =>
                          idx === safeActiveSection ? { ...s, kind: nextKind } : s,
                        ),
                      });
                    }}
                  >
                    Convert
                  </Button>
                </div>
              </div>

              {/* Dimensions Inspector */}
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Dimensions
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-medium">Width</span>
                    <span className="font-semibold text-slate-700">100% (Fluid)</span>
                  </div>
                  <div className="p-2 rounded-md bg-slate-50 border border-slate-200">
                    <span className="text-[10px] text-slate-400 block font-medium">Height</span>
                    <span className="font-semibold text-slate-700">Auto (Content)</span>
                  </div>
                </div>
              </div>

              {/* Expandable Convert to Archetype */}
              <div>
                <details className="archetype-expandable group">
                  <summary className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer list-none py-1.5 px-2 rounded-md hover:bg-slate-100 transition-colors">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      Convert to Archetype
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="archetype-grid pt-2">
                    {DOC_ARCHETYPES.map((arch) => {
                      const Icon = arch.icon;
                      return (
                        <button
                          key={arch.id}
                          type="button"
                          className="archetype-card"
                          onClick={() => applyArchetype(arch)}
                        >
                          <div className="flex items-center gap-1.5 text-slate-700">
                            <Icon className="w-3.5 h-3.5 text-indigo-600" />
                            <span className="name">{arch.name}</span>
                          </div>
                          <span className="desc">{arch.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </details>
              </div>

              <Separator />

              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Page Actions
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8"
                    onClick={() => duplicatePage(safeActiveSection)}
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Duplicate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs h-8 text-destructive hover:bg-destructive/10 hover:text-destructive border-slate-200"
                    disabled={doc.sections.length <= 1}
                    onClick={() => deletePage(safeActiveSection)}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Tab 2: Style & Spacing */}
          {propertiesTab === "style" && (
            <>
              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Preset Document Themes
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {themes.filter(t => t.format === "document").map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="p-2.5 rounded-lg border border-slate-200 text-left hover:border-indigo-500 transition-all cursor-pointer flex flex-col gap-1.5 bg-white"
                      onClick={() => applyTheme(t)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">{t.name}</span>
                        <div className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full border border-slate-300" style={{ background: t.background }} />
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.accent }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-500 leading-tight">{t.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Accent Color
                </div>
                <div className="swatch-group">
                  {[
                    { color: "#6366F1", name: "Indigo" },
                    { color: "#0EA5E9", name: "Sky Cyan" },
                    { color: "#10B981", name: "Emerald Mint" },
                    { color: "#F59E0B", name: "Amber Glow" },
                    { color: "#EC4899", name: "Rose Pink" },
                  ].map((swatch) => (
                    <button
                      key={swatch.color}
                      type="button"
                      className="color-swatch"
                      style={{ background: swatch.color }}
                      title={swatch.name}
                      onClick={() => applyAccentColor(swatch.color)}
                    />
                  ))}
                </div>
              </div>

            </>
          )}

          {/* Tab 3: Live Code Editor */}
          {propertiesTab === "code" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200">
                  {(["html", "css", "js"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-mono rounded cursor-pointer border-0 bg-transparent uppercase",
                        codeTab === tab
                          ? "bg-white font-bold text-indigo-600 shadow-xs"
                          : "text-slate-500 hover:text-slate-800",
                      )}
                      onClick={() => setCodeTab(tab)}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Page {safeActiveSection + 1}</span>
              </div>

              <textarea
                className="code-editor-area"
                disabled={busy}
                spellCheck={false}
                value={doc.sections[safeActiveSection]?.[codeTab] || ""}
                placeholder={`Enter page ${codeTab.toUpperCase()}...`}
                onChange={(e) => {
                  const nextVal = e.target.value;
                  change({
                    ...doc,
                    sections: doc.sections.map((s, idx) =>
                      idx === safeActiveSection ? { ...s, [codeTab]: nextVal } : s,
                    ),
                  });
                }}
              />

              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                Edits update the live document immediately. Click <strong>Save</strong> in the topbar to persist changes.
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* Slash Command Menu Modal */}
      {slashMenuOpen && (
        <SlashCommandMenu
          insertIndex={slashMenuIndex}
          onSelect={insertPage}
          onClose={() => setSlashMenuOpen(false)}
        />
      )}
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
      p === "/connect" ||
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
    [view, setView] = useState<"library" | "connect">(
      location.pathname === "/connect" ? "connect" : "library",
    );
  const [preview, setPreview] = useState(false),
    [activeSlide, setActiveSlide] = useState(0),
    [activeSectionIndex, setActiveSectionIndex] = useState(0),
    [outlineOpen, setOutlineOpen] = useState(() => !matchMedia("(max-width: 800px)").matches),
    [fullscreen, setFullscreen] = useState(false),
    [history, setHistory] = useState<Revision[] | null>(null),
    [share, setShare] = useState(""),
    [published, setPublished] = useState<number | null>(null),
    [token, setToken] = useState(""),
    [allowPublishing, setAllowPublishing] = useState(false),
    [tokenActive, setTokenActive] = useState(false),
    [slidesSidebarOpen, setSlidesSidebarOpen] = useState(() => !matchMedia("(max-width: 800px)").matches),
    [propertiesOpen, setPropertiesOpen] = useState(() => !matchMedia("(max-width: 800px)").matches),
    [propertiesTab, setPropertiesTab] = useState<"layout" | "style" | "code">("layout"),
    [codeTab, setCodeTab] = useState<"html" | "css" | "js">("html"),
    [shareModalOpen, setShareModalOpen] = useState(false),
    [copiedLink, setCopiedLink] = useState("");
  const editorMode = doc && isPresentationContent(doc) ? "slide" : "doc";
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
  const [editingRequested, setEditingRequested] = useState(true);
  const [shared, setShared] = useState<RenderedContent | null>(null);
  const [mcpClients, setMcpClients] = useState<{client_id:string;client_name:string;access_expires:number}[]>([]);
  const sharePath = location.pathname.startsWith("/share/");
  const running = useRef(false);
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  const draftVersion = useRef(0);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const canEdit = doc?.access !== "viewer";
  const lock = useDocumentLock(doc?.id ?? null, Boolean(doc && canEdit && !preview && editingRequested), async (revision) => {
    const current = latestDoc.current;
    if (!current || current.revision === revision) return;
    if (dirtyRef.current) { setError("A newer version was saved. Your draft is preserved. Compare version history before reconciling your changes."); return; }
    const version = draftVersion.current;
    const fresh = await api<Document>(`/documents/${current.id}`);
    if (latestDoc.current?.id === current.id && draftVersion.current === version && !dirtyRef.current) {
      latestDoc.current = fresh;
      setDoc(fresh);
    }
  });
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

  useEffect(() => {
    const narrow = matchMedia("(max-width: 800px)");
    const collapse = () => {
      if (!narrow.matches) return;
      setOutlineOpen(false);
      setSlidesSidebarOpen(false);
      setPropertiesOpen(false);
    };
    narrow.addEventListener("change", collapse);
    return () => narrow.removeEventListener("change", collapse);
  }, []);

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

  function change(next: Document) {
    if (!lock.canWrite) { setNotice("Start editing with an active lock to change this document. Your draft is still here."); return; }
    draftVersion.current += 1;
    latestDoc.current = next;
    setDoc(next);
    setDirty(true);
  }

  async function loadDocument(id: string, navigate: boolean, openPreview: boolean, signal?: AbortSignal) {
    const [next, pub] = await Promise.all([
      api<Document>("/documents/" + id, "GET", undefined, signal),
      api<{ revision: number } | null>("/documents/" + id + "/publish", "GET", undefined, signal),
    ]);
    if (signal?.aborted) return;
    setDoc(next);
    setEditingRequested(true);
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

  async function createFromTheme(theme: ThemeCatalogItem) {
    if (!leave()) return;
    await run(async () => {
      const content = await requestJson<Content>(`/downloads/docsync/themes/${theme.id}.json`);
      const next = await api<Document>("/documents", "POST", content);
      setDoc(next);
      setEditingRequested(true);
      setPreview(theme.format === "document");
      setActiveSlide(0);
      setActiveSectionIndex(0);
      setDirty(false);
      setPublished(null);
      setShare("");
      setHistory(null);
      window.history.pushState(
        null,
        "",
        `/documents/${next.id}${theme.format === "document" ? "/preview" : ""}`,
      );
      await refresh();
      setNotice(`${theme.name} created with fictional example content.`);
    });
  }

  async function save() {
    if (!doc || !lock.canWrite) return;
    const version = draftVersion.current;
    await run(async () => {
      const lease = await lock.renew();
      const updated = await api<Document>("/documents/" + doc.id, "PUT", {
        lockToken: lease.lockToken,
        changeSummary: "Edited in browser",
        title: doc.title,
        format: doc.format,
        sections: doc.sections,
        expectedRevision: doc.revision,
      });
      const changedDuringSave = draftVersion.current !== version;
      setDoc(changedDuringSave && latestDoc.current?.id === updated.id
        ? { ...latestDoc.current, revision: updated.revision, updated_at: updated.updated_at }
        : updated);
      setDirty(changedDuringSave);
      setDocuments(items => items.map(item => item.id === updated.id ? { ...item, title: updated.title, revision: updated.revision, updated_at: updated.updated_at } : item));
      setNotice(changedDuringSave ? "Saved the earlier draft. Your newer changes are still unsaved." : "Saved.");
    });
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
      if (doc && canEdit && !preview && editingRequested) await lock.start();
      if (!doc) {
        const route = documentRoute();
        await Promise.all([refresh(), route ? loadDocument(route.id, false, route.preview) : Promise.resolve()]);
      }
      setAuthPage(false);
      if (!doc && !documentRoute()) window.history.replaceState(null, "", view === "connect" || claim ? "/connect" : "/");
    });
  }

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty && !running.current && !sessionExpired) void save();
      }
    };
    window.addEventListener("keydown", saveShortcut);
    return () => window.removeEventListener("keydown", saveShortcut);
  }, [doc, dirty, sessionExpired, lock.canWrite]);

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

  return (
    <MediaContext.Provider value={doc?.mediaToken}><div className={cn("app-shell", doc && "document-shell")}>
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
              setEditingRequested(true);
              setActiveSectionIndex(0);
              setPreview(false);
              setView("library");
              setDirty(false);
              setPublished(null);
              setShare("");
              window.history.pushState(null, "", `/documents/${next.id}`);
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
                  <span className="text-indigo-600 font-bold">◈</span>
                  <span>DocSync</span>
                </Button>
                <span className="text-slate-300 select-none">/</span>
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
                <span className="text-slate-300 select-none">/</span>
                <input
                  className="document-title-input"
                  aria-label="Document title"
                  maxLength={200}
                  disabled={busy || !lock.canWrite}
                  value={doc.title}
                  placeholder="Untitled document"
                  onChange={(e) => change({ ...doc, title: e.target.value })}
                />
                <span className="shared-format-chip document-format-label">
                  {editorMode === "slide" ? <Presentation size={13} /> : <FileText size={13} />}
                  {editorMode === "slide" ? "Presentation" : "Document"}
                </span>
              </div>

              {/* Right Status & Actions */}
              <div className="document-actions flex items-center gap-2 shrink-0">
                <CollaboratorPresence key={doc.id} documentId={doc.id} />
                {dirty ? (
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 text-xs font-normal">
                    Unsaved changes
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-xs font-normal gap-1.5 hidden sm:inline-flex">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                    Saved · v{doc.revision}
                  </Badge>
                )}
                <Button
                  variant={dirty ? "default" : "outline"}
                  size="sm"
                  className={cn("h-8 text-xs px-2.5 font-medium", dirty && "bg-indigo-600 hover:bg-indigo-700 text-white")}
                  disabled={!dirty || busy || !lock.canWrite}
                  onClick={() => void save()}
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs px-2.5"
                  disabled={busy}
                  onClick={exportDraft}
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Download
                </Button>
                {editorMode === "slide" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2.5 font-medium"
                    onClick={() => setFullscreen(true)}
                  >
                    <Play className="w-3.5 h-3.5 mr-1 fill-current text-indigo-600" />
                    Present
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs px-2.5"
                    disabled={busy}
                    onClick={() => {
                      const nextPreview = !preview;
                      setEditingRequested(true);
                      setPreview(nextPreview);
                      window.history.pushState(
                        null,
                        "",
                        `/documents/${doc.id}${nextPreview ? "/preview" : ""}`,
                      );
                    }}
                  >
                    {preview ? <Edit3Icon className="w-3.5 h-3.5 mr-1" /> : <Eye className="w-3.5 h-3.5 mr-1" />}
                    {preview ? (canEdit ? "Edit" : "View") : "Preview"}
                  </Button>
                )}
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 text-xs px-3 font-medium bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
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
                  {view === "connect" ? "Connect agent" : "My documents"}
                </span>
              </div>
              <div className="shrink-0">
                <span className="muted text-xs">A clear space for your ideas</span>
              </div>
            </>
          )}
        </header>
        {doc && <div className="edit-lock-status" data-editing={lock.canWrite ? "true" : "false"} aria-live="polite">
          <span>{lock.canWrite ? "Editing · Your session holds the document lock" : lock.pending ? "Acquiring edit lock…" : doc.access === "viewer" ? "Viewer access · Read only" : lock.lock ? `Read only · ${lock.lock.holder} is editing with ${lock.lock.agent}` : "Read only · Start editing to make changes"}</span>
          {canEdit && !preview && <Button variant="outline" size="sm" disabled={busy || lock.pending} onClick={() => {
            if (lock.canWrite) setEditingRequested(false);
            else if (!editingRequested) setEditingRequested(true);
            else void lock.start().catch(fail);
          }}>{lock.canWrite ? "Stop editing" : "Start editing"}</Button>}
          {lock.error && !lock.canWrite && <small>{lock.error}</small>}
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
        {invitation ? <AcceptInvitation token={invitation} onDismiss={() => { sessionStorage.removeItem("docsync_invite"); setInvitation(""); window.history.replaceState(null, "", "/"); }} onAccepted={async id => {
          await loadDocument(id, true, false);
          sessionStorage.removeItem("docsync_invite"); setInvitation("");
          await refresh();
        }} /> : view === "connect" ? (
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
          editorMode === "slide" ? (
            <SlideStudio
              doc={doc}
              safeActiveSlide={safeActiveSlide}
              setActiveSlide={setActiveSlide}
              change={change}
              busy={busy || !lock.canWrite}
              presenting={fullscreen}
              setFullscreen={setFullscreen}
              slidesSidebarOpen={slidesSidebarOpen}
              setSlidesSidebarOpen={setSlidesSidebarOpen}
              propertiesOpen={propertiesOpen}
              setPropertiesOpen={setPropertiesOpen}
              propertiesTab={propertiesTab}
              setPropertiesTab={setPropertiesTab}
              codeTab={codeTab}
              setCodeTab={setCodeTab}
              run={run}
              setNotice={setNotice}
            />
          ) : (
            <DocStudio
              doc={doc}
              activeSectionIndex={activeSectionIndex}
              setActiveSectionIndex={setActiveSectionIndex}
              change={change}
              busy={busy || !lock.canWrite}
              preview={preview}
              outlineOpen={outlineOpen}
              setOutlineOpen={setOutlineOpen}
              propertiesOpen={propertiesOpen}
              setPropertiesOpen={setPropertiesOpen}
              propertiesTab={propertiesTab}
              setPropertiesTab={setPropertiesTab}
              codeTab={codeTab}
              setCodeTab={setCodeTab}
              setNotice={setNotice}
            />
          )
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
      {fullscreen && doc && (
        <PresentationViewer
          sections={doc.sections}
          initialSlide={safeActiveSlide}
          title={doc.title}
          onClose={() => setFullscreen(false)}
          onSlideChange={(idx) => setActiveSlide(idx)}
        />
      )}
      {history && doc && (
        <VersionHistory
          documentId={doc.id}
          canRestore={lock.canWrite}
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
