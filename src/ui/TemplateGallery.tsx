import { useState } from "react";
import themes from "../../skills/docsync/themes.json";

export function TemplateGallery() {
  const requested = new URLSearchParams(location.search).get("format");
  const [format, setFormat] = useState(requested === "document" || requested === "presentation" ? requested : "all");
  const options = themes.filter(theme => format === "all" || theme.format === format);
  const [selectedId, setSelectedId] = useState(options[0].id);
  const selected = options.find(theme => theme.id === selectedId) || options[0];
  return <main className="mx-auto max-w-6xl p-6 sm:p-10">
    <a href="/" className="text-sm underline">DocSync</a>
    <h1 className="mt-6 text-3xl font-semibold">Choose your starting point</h1>
    <p className="mt-3 text-muted-foreground">Browse document and presentation templates. Tell your agent the template name, or say “you decide” for a custom design.</p>
    <nav aria-label="Template format" className="my-6 flex gap-3">
      {([['all', 'All templates'], ['document', 'Documents'], ['presentation', 'Presentations']] as const).map(([value, label]) => <button key={value} className="rounded-md border px-4 py-2 aria-pressed:bg-secondary" aria-pressed={format === value} onClick={() => {
        setFormat(value);
        history.replaceState(null, "", `/templates?format=${value}`);
      }}>{label}</button>)}
    </nav>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {options.map(theme => <button key={theme.id} aria-pressed={selected.id === theme.id} onClick={() => setSelectedId(theme.id)} className="rounded-lg border p-6 text-left aria-pressed:ring-2" style={{ background: theme.background, color: theme.color }}>
        <strong className="text-lg">{theme.name}</strong><p className="mt-2 text-sm">{theme.description}</p>
      </button>)}
    </div>
    <section className="mt-8" aria-label="Selected template">
      <h2 className="text-xl font-semibold">{selected.name}</h2>
      <p className="my-3">To use this design, tell your agent: “Use the {selected.name} template ({selected.id}).”</p>
      <p className="mb-4 text-sm text-muted-foreground">Preview figures are fictional examples. Your agent will use your information.</p>
      <iframe key={selected.id} title={`${selected.name} preview`} src={`/downloads/docsync/assets/templates/${selected.id}/index.html`} sandbox="allow-scripts" className="h-[850px] w-full border bg-white" />
    </section>
  </main>;
}
