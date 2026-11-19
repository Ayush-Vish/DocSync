import { useEffect, useState } from "react";
import { Copy, Download, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "./api";
import themes from "../../skills/docsync/themes.json";

type SavedTemplate = { id: string; name: string; format: "document" | "presentation" };
const customThemePrompt =
  "Use DocSync to create a document or presentation with a custom theme. Style direction: [describe colors, typography, mood, density, and audience]. Use only facts I provide. Label any example or simulated data clearly. Add interactive charts only when useful, verify the saved result, and return a share link.";

export function WorkspaceTemplates({ busy, onCopyPrompt }: { busy: boolean; onCopyPrompt: (prompt: string) => void }) {
  const [saved, setSaved] = useState<SavedTemplate[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void api<{ companyTemplates: SavedTemplate[] }>("/template-options?format=all", "GET", undefined, controller.signal)
      .then(result => setSaved(result.companyTemplates))
      .catch(() => { if (!controller.signal.aborted) setError("Couldn’t load your saved templates."); });
    return () => controller.abort();
  }, []);

  return (
    <section className="library">
      <div className="library-heading">
        <div>
          <h1 className="tracking-tight">Templates</h1>
          <p className="subtitle">Browse DocSync designs or reuse a template you shared with your agent.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" asChild><a href="/downloads/docsync-skill.zip" download><Download className="mr-1.5 h-4 w-4" />Download skill + templates</a></Button>
          <a className="text-sm underline underline-offset-4" href="/downloads/docsync/SKILL.md">Skill instructions</a>
        </div>
      </div>
      <section className="theme-library" aria-labelledby="saved-templates-title">
        <div className="theme-library-heading">
          <div>
            <h2 id="saved-templates-title">Saved templates</h2>
            <p>Share a reference with your connected agent and ask it to save the design.</p>
          </div>
        </div>
        {error ? <p role="alert">{error}</p> : !saved ? <p role="status">Loading saved templates…</p> : saved.length ? (
          <>
            <ul className="grid gap-2 sm:grid-cols-2">
              {saved.map(template => (
                <li className="rounded-md border p-3" key={template.id}>
                  <strong className="block text-sm break-words">{template.name}</strong>
                  <span className="text-xs text-muted-foreground">{template.format === "document" ? "Document" : "Presentation"}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">Tell your agent “Use my saved template” when requesting a document or presentation.</p>
          </>
        ) : <p className="text-sm text-muted-foreground">You haven’t saved any templates yet.</p>}
      </section>
      <section className="theme-library" aria-labelledby="theme-library-title">
        <div className="theme-library-heading">
          <div>
            <h2 id="theme-library-title">DocSync templates</h2>
            <p>Preview a design and ask your agent to use it by name.</p>
          </div>
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
              onClick={() => onCopyPrompt(customThemePrompt)}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />Copy agent prompt
            </Button>
          </details>
        </div>
      </section>
    </section>
  );
}
