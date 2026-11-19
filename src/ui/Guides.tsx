import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { AgentConnectionGuide } from "./AgentConnectionGuide";
import { publicPages } from "../seo";

const guides = [
  { path: "/guides/connect-mcp", heading: "Connect your AI agent to DocSync with MCP" },
  { path: "/guides/chatgpt-presentations", heading: "Create a presentation with ChatGPT and DocSync" },
  { path: "/guides/codex-documentation", heading: "Write technical documentation with Codex and DocSync" },
] as const;

type Guide = typeof guides[number];

function GuideLayout({ children }: { children: ReactNode }) {
  return <div className="home min-h-screen">
    <header className="home-dark">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4 text-sm sm:px-10">
        <a href="/" className="brand" aria-label="DocSync home"><span className="brand-mark" aria-hidden="true">d.</span>DocSync</a>
        <a href="/guides" className="underline-offset-4 hover:underline">Guides</a>
        <a href="/templates" className="underline-offset-4 hover:underline">Templates</a>
        <a href="/agents" className="underline-offset-4 hover:underline">Agents</a>
      </nav>
    </header>
    <main className="mx-auto max-w-4xl px-6 py-10 sm:px-10 sm:py-14">{children}</main>
  </div>;
}

function GuideLinks({ current }: { current?: Guide["path"] }) {
  return <ul className="grid gap-3" aria-label="DocSync guides">
    {guides.filter(guide => guide.path !== current).map(guide => (
      <li key={guide.path}>
        <a href={guide.path} className="block rounded-lg border border-border bg-background p-4 hover:border-foreground focus-visible:outline-2">
          <strong>{guide.heading} <ArrowUpRight size={15} className="ml-1 inline" aria-hidden="true" /></strong>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">{publicPages[guide.path].description}</span>
        </a>
      </li>
    ))}
  </ul>;
}

export function GuidesIndex() {
  return <GuideLayout>
    <h1 className="text-4xl font-semibold tracking-tight">DocSync guides</h1>
    <p className="my-5 max-w-xl text-base leading-relaxed">Set up a connection with your AI agent, then use it to create a presentation or a technical document you can review and share.</p>
    <GuideLinks />
  </GuideLayout>;
}

function GuideArticle({ guide, children }: { guide: Guide; children: ReactNode }) {
  return <GuideLayout>
    <article>
      <h1 className="max-w-[24ch] text-3xl leading-tight font-semibold tracking-tight sm:text-5xl">{guide.heading}</h1>
      <div className="mt-6 space-y-7 text-base leading-relaxed">{children}</div>
    </article>
    <section className="mt-12 border-t border-border pt-6" aria-labelledby="related-guides">
      <h2 id="related-guides" className="mb-4 text-xl font-semibold">More DocSync guides</h2>
      <GuideLinks current={guide.path} />
    </section>
  </GuideLayout>;
}

export function ConnectMcpGuide() {
  return <GuideArticle guide={guides[0]}>
    <p>DocSync connects to your existing AI agent through the Model Context Protocol (MCP). Once connected, the agent can save drafts to your DocSync workspace, and you can review or present the results in your browser.</p>
    <p>Open <a className="underline underline-offset-4" href="/agents">Agents</a> in your DocSync workspace and copy its MCP server URL. Substitute that address for the example below. For browser-hosted agents, use a DocSync deployment with a public HTTPS address. A local CLI can also connect to a local DocSync server.</p>
    <AgentConnectionGuide />
    <section aria-labelledby="check-title">
      <h2 id="check-title" className="mb-2 text-xl font-semibold">Check the connection</h2>
      <p>Ask your agent to run DocSync’s <code>get_connection</code> tool. A successful result shows the workspace origin and whether the agent can publish. If the agent needs sign-in, start a fresh authentication flow from its MCP menu or reconnect the app in its settings.</p>
      <p className="mt-3">Refresh <strong>Authorized MCP clients</strong> in Agents to see the connection. Turn on <strong>Allow publishing</strong> if the agent should create share links. Anyone with a published link can view that saved version.</p>
    </section>
  </GuideArticle>;
}

export function ChatGptPresentationGuide() {
  return <GuideArticle guide={guides[1]}>
    <p>Use ChatGPT to turn a set of notes into a presentation with slide layouts and speaker notes. DocSync saves the deck so you can play it in the browser, review individual slides, and share the version you approve.</p>
    <section aria-labelledby="presentation-setup">
      <h2 id="presentation-setup" className="mb-2 text-xl font-semibold">Connect DocSync and choose a design</h2>
      <p><a className="underline underline-offset-4" href="/guides/connect-mcp">Install the DocSync MCP plugin in ChatGPT</a> and select <strong>@DocSync</strong> in your conversation. You can use the same picker in a project chat where your workspace makes the plugin available.</p>
      <p className="mt-3">Choose a design that matches the task. Use <a className="underline underline-offset-4" href="/templates?template=review-slides">Delivery Review</a> to report progress and decisions, or use <a className="underline underline-offset-4" href="/templates?template=pitch-deck">Bold Pitch</a> for a proposal. You can also ask the agent to follow a template you’ve saved in DocSync.</p>
    </section>
    <section aria-labelledby="presentation-prompt">
      <h2 id="presentation-prompt" className="mb-2 text-xl font-semibold">Example prompt for a project review</h2>
      <pre>{`Use DocSync to create a six-slide project review for our engineering leads.
Cover the goal, changes shipped, evidence, outstanding risks, decisions needed,
and next steps. Use the Delivery Review template, no animation, and speaker notes.
Use only the notes below. Mark missing figures as “not provided.” Save a private draft.

Notes and sources: [paste your approved notes here]`}</pre>
      <p>Specify who will see the deck and what they should decide. Give the agent sources for numbers and dates, and use speaker notes for supporting detail that would crowd a slide.</p>
    </section>
    <section aria-labelledby="presentation-review">
      <h2 id="presentation-review" className="mb-2 text-xl font-semibold">Review, present, and share</h2>
      <p>Open the saved deck in DocSync, read the slides and notes, then use <strong>Present</strong> to check the full-screen view. Once you approve it, publish that saved version or ask an agent with publishing permission to do it.</p>
      <p className="mt-3">DocSync decks are interactive HTML. Download HTML for an offline copy or use your browser’s print dialog to save a PDF.</p>
    </section>
  </GuideArticle>;
}

export function CodexDocumentationGuide() {
  return <GuideArticle guide={guides[2]}>
    <p>Codex can inspect a repository and turn what it finds into a technical document that teammates can read in DocSync. Use the repository revision, source links, and actual test results to make the draft easy to review.</p>
    <section aria-labelledby="documentation-setup">
      <h2 id="documentation-setup" className="mb-2 text-xl font-semibold">Give Codex a clear source of truth</h2>
      <p><a className="underline underline-offset-4" href="/guides/connect-mcp">Connect Codex to DocSync over MCP</a>, then open Codex in the repository you want to document. Identify the branch or commit and specify whether the document should describe the implementation, a proposal, or a change between two revisions.</p>
      <p className="mt-3">For architecture and engineering decisions, the <a className="underline underline-offset-4" href="/templates?template=design-document">Technical Blueprint</a> template gives you a place for requirements, design, tradeoffs, and risks.</p>
    </section>
    <section aria-labelledby="documentation-prompt">
      <h2 id="documentation-prompt" className="mb-2 text-xl font-semibold">Example prompt for an architecture document</h2>
      <pre>{`Read the repository at [commit or branch] and use DocSync’s Technical Blueprint
template to draft an architecture document for new maintainers. Explain the main
entry points, how a request moves through the system, and how state is stored.
Cite repository paths and tests for important claims. Separate observed behavior
from open questions. Keep the document private for review.`}</pre>
      <p>Review the draft against the source. Pay particular attention to access boundaries, error handling, and claims about tests. Ask Codex to revise unsupported statements before sharing.</p>
    </section>
    <section aria-labelledby="documentation-share">
      <h2 id="documentation-share" className="mb-2 text-xl font-semibold">Publish the reviewed version</h2>
      <p>Use the DocSync version history to see what changed between drafts. When you publish, teammates receive a link to the approved snapshot. Later private edits can be reviewed before you publish a new version.</p>
    </section>
  </GuideArticle>;
}
