import { Download, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const templates = [
  { id: "editorial-document", title: "Revenue report", type: "REPORT / REVENUE & ACTIVITY", text: "₹9.6L MRR", background: "#fffdf7", color: "#24251f", accent: "#53674d", serif: true },
  { id: "design-document", title: "Service design", type: "DESIGN / SYSTEM HEALTH", text: "108 ms p95", background: "#edf3ff", color: "#1b2b44", accent: "#285cca", serif: false },
  { id: "sales-dashboard", title: "Sales dashboard", type: "REPORT / SIMULATED SALES", text: "₹18.4L sales", background: "#f5fbf7", color: "#18342a", accent: "#16845b", serif: false },
  { id: "pitch-deck", title: "Product pitch", type: "DECK / GROWTH STORY", text: "1,280 teams", background: "#211d40", color: "#ffffff", accent: "#d1f46b", serif: false },
  { id: "review-slides", title: "Delivery review", type: "SLIDES / TEAM PROGRESS", text: "28 items shipped", background: "#fffaf3", color: "#352a24", accent: "#b45135", serif: true },
];

export function AgentSkill() {
  const [selected, setSelected] = useState(templates[0]);
  const previewUrl = `/downloads/docsync/assets/templates/${selected.id}/index.html`;
  return (
    <section id="agent-skill" className="mx-auto my-10 w-full max-w-6xl rounded-xl border border-border bg-card p-5 sm:p-8 text-left">
      <p className="text-[11px] font-semibold tracking-widest text-muted-foreground">EXPLORE DOCSYNC / INTERACTIVE EXAMPLES</p>
      <h2 className="mt-3 text-2xl sm:text-3xl font-semibold tracking-tight">Read the story. Explore the numbers.</h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Open a finished report, inspect a system’s health, or walk through a presentation.
        Switch chart periods and watch a simulated activity stream update. These examples use a fictional business and clearly labeled demo data.
        Download the skill to have Codex or Claude create documents from your own information.
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button asChild><a href="/downloads/docsync-skill.zip" download><Download className="mr-2 h-4 w-4" />Download skill + templates</a></Button>
        <a className="text-sm underline underline-offset-4" href="/downloads/docsync/SKILL.md">Read the skill instructions</a>
      </div>
      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map(template => (
          <button key={template.id} type="button" onClick={() => setSelected(template)} aria-pressed={selected.id === template.id} aria-controls="template-example" className={`group overflow-hidden rounded-lg border text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${selected.id === template.id ? "border-foreground ring-1 ring-foreground" : "border-border"}`} aria-label={`Preview ${template.title} template`}>
            <div className="flex min-h-44 flex-col p-5" style={{ background: template.background, color: template.color, borderTop: `4px solid ${template.accent}` }}>
              <span className="text-[9px] font-bold tracking-widest opacity-80">{template.type}</span>
              <span className="mt-6 text-2xl font-semibold leading-tight tracking-tight" style={{ fontFamily: template.serif ? "Georgia, serif" : "inherit" }}>{template.text}</span>
              <span aria-hidden="true" className="mt-4 flex h-10 items-end gap-1.5">{[35, 48, 45, 64, 77, 100].map((height, i) => <span key={i} className="w-5 rounded-t-sm" style={{ height: `${height}%`, background: template.accent, opacity: .5 + i / 10 }} />)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 p-3 text-xs font-medium">{template.title}<span className="text-muted-foreground">{selected.id === template.id ? "Viewing" : "Preview"}</span></div>
          </button>
        ))}
      </div>
      <div id="template-example" className="mt-5 overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
          <div><h3 className="text-sm font-semibold">{selected.title} — interactive example</h3><p className="mt-1 text-xs text-muted-foreground">Explore charts, pause the demo stream, or navigate the slides. All figures are illustrative.</p></div>
          <a className="inline-flex items-center gap-1 text-xs underline underline-offset-4" href={previewUrl} target="_blank" rel="noreferrer">Open full example<ArrowUpRight className="h-3.5 w-3.5" /></a>
        </div>
        <iframe key={selected.id} src={previewUrl} title={`${selected.title} live example`} sandbox="allow-scripts" loading="lazy" className="block h-[700px] w-full border-0 bg-white sm:h-[850px]" />
      </div>
      <details className="mt-6 rounded-lg border border-border p-4 text-sm">
        <summary className="cursor-pointer font-medium">Install in Codex or Claude Code</summary>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>Download and unzip the package. It contains a <code>docsync</code> folder with <code>SKILL.md</code>, templates, and a conversion helper.</li>
          <li>For Codex, put that folder in <code>~/.codex/skills/</code>. For Claude Code, use <code>~/.claude/skills/</code>. For a project-only Claude skill, use <code>.claude/skills/</code> in your project.</li>
          <li>Restart your agent if needed. Connect the DocSync MCP separately from the Connect agent page and authorize access in your browser.</li>
          <li>Ask: “Use the DocSync skill to make a project report from my notes and share its link.”</li>
        </ol>
      </details>
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Includes HTML, CSS, and JavaScript for charts, filters, and artifact interactions.
        Hosted JavaScript runs in an isolated sandbox without account or network access. Live values in these examples are simulated.
        Presentations use HTML; open the full example to print or save as PDF.
      </p>
    </section>
  );
}
