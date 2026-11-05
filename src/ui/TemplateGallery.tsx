import { useEffect, useState } from "react";
import themes from "../../skills/docsync/themes.json";

export function TemplateGallery({ initialFormat: requested, initialTemplate }: { initialFormat?: string | null; initialTemplate?: string | null }) {
  const [format, setFormat] = useState(requested === "document" || requested === "presentation" ? requested : "all");
  const options = themes.filter(theme => format === "all" || theme.format === format);
  const [selectedId, setSelectedId] = useState(initialTemplate || options[0].id);
  const selected = options.find(theme => theme.id === selectedId) || options[0];
  function choose(nextFormat: string, nextId?: string) {
    const available = themes.filter(theme => nextFormat === "all" || theme.format === nextFormat);
    const next = available.find(theme => theme.id === nextId) || available[0];
    setFormat(nextFormat);
    setSelectedId(next.id);
    const url = new URL(location.href);
    url.searchParams.set("format", nextFormat);
    url.searchParams.set("template", next.id);
    if (url.href !== location.href) history.pushState(null, "", url);
  }
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.search);
      const filter = params.get("format");
      setFormat(filter === "document" || filter === "presentation" ? filter : "all");
      setSelectedId(params.get("template") || themes[0].id);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  return <main className="mx-auto max-w-6xl p-6 sm:p-10">
    <a href="/" className="text-sm underline">DocSync</a>
    <h1 className="mt-6 text-3xl font-semibold">Choose your starting point</h1>
    <p className="mt-3 text-muted-foreground">Browse document and presentation templates. Tell your agent the template name, or say “you decide” for a custom design.</p>
    <nav aria-label="Template format" className="my-6 flex gap-3">
      {([['all', 'All templates'], ['document', 'Documents'], ['presentation', 'Presentations']] as const).map(([value, label]) => <button key={value} className="rounded-md border px-4 py-2 aria-pressed:bg-secondary" aria-pressed={format === value} onClick={() => choose(value, selected.id)}>{label}</button>)}
    </nav>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {options.map(theme => <button key={theme.id} aria-pressed={selected.id === theme.id} onClick={() => choose(format, theme.id)} className="rounded-lg border p-6 text-left aria-pressed:ring-2" style={{ background: theme.background, color: theme.color }}>
        <strong className="text-lg">{theme.name}</strong>
        <p className="mt-2 text-sm">{theme.description}</p>
        {(theme as any).suggestedTheme && <span className="mt-3 inline-block rounded bg-black/10 px-2 py-0.5 text-xs font-medium opacity-80">Theme: {(theme as any).suggestedTheme}</span>}
      </button>)}
    </div>
    <section className="mt-8" aria-label="Selected template">
      <h2 className="text-xl font-semibold">{selected.name}</h2>
      <p className="my-3">To use this design, tell your agent: “Use the {selected.name} template ({selected.id}).”</p>
      <p className="mb-4 text-sm text-muted-foreground">Preview figures are fictional examples. Your agent will use your information.</p>
      <iframe key={selected.id} title={`${selected.name} preview`} src={`/downloads/docsync/assets/templates/${selected.id}/index.html`} sandbox="allow-scripts" loading="lazy" className="h-[850px] w-full border bg-white" />
    </section>
  </main>;
}
