import { ArrowDown, ArrowRight, ArrowUpRight, History, Link2, Lock, Plus } from "lucide-react";
import { AgentIcon } from "./AgentIcon";

const assets = "/assets/landing";

const useCases = [
  { title: "Reports & updates", description: "Summarize progress and give readers a clear set of next steps.", template: "editorial-document", example: "Explore a report" },
  { title: "Technical documents", description: "Put architecture, decisions, and tradeoffs in one reference.", template: "design-document", example: "Explore a design doc" },
  { title: "Dashboards & analysis", description: "Let readers explore the numbers with charts and filters.", template: "sales-dashboard", example: "Explore a dashboard" },
  { title: "Presentations", description: "Build a live deck for a proposal, pitch, or team review.", template: "review-slides", example: "Explore a presentation" },
];

const agents = [
  { provider: "openai", label: "Codex" },
  { provider: "anthropic", label: "Claude Code" },
  { provider: "google", label: "Antigravity" },
  { provider: "other", label: "Other MCP clients" },
] as const;

const steps = [
  { title: "Connect your agent", description: "Authorize DocSync in your existing AI agent. Give it the notes, data, and audience for your first draft." },
  { title: "Review in your browser", description: "Read every page, play animated slides, reserve pages for your agent, and check its version history and activity log." },
  { title: "Publish a version", description: "Share a link to the saved version you reviewed, or present your slides straight from your browser." },
];

const questions = [
  { question: "Can I edit in the browser?", answer: "Not for now. Your connected agent makes every edit, so drafts stay consistent with its plan. In the browser you read and present your work, reserve pages for the agent, review its activity log and version history, and publish." },
  { question: "Can I try DocSync before creating an account?", answer: "Yes. The local MCP client can create one document per installation without a web account. Sign in to claim that document and create more." },
  { question: "Who can see what I publish?", answer: "Anyone with a published link can open that saved version without signing in. Your private draft can keep changing. Republishing issues a new link and revokes the old one, and revocation cannot remove copies already downloaded." },
  { question: "Can I present or export my work?", answer: "You can present slides full screen, print previews to PDF, or download standalone HTML to open offline." },
  { question: "Does DocSync include an AI subscription?", answer: "DocSync works with your existing MCP-compatible agent. Your agent’s subscription or model usage is separate." },
];

function WorkspaceLink({ compact = false }: { compact?: boolean }) {
  return <a className={`home-button${compact ? " home-button-compact" : ""}`} href="/signup">
    {compact ? "Get started" : "Create your workspace"}<ArrowRight size={17} aria-hidden="true" />
  </a>;
}

export function LandingPage() {
  return <div className="home">
    <a className="home-skip" href="#main-content">Skip to content</a>
    <div className="home-dark home-header-band">
      <header className="home-header home-container">
        <a href="/" className="brand" aria-label="DocSync home"><span className="brand-mark" aria-hidden="true">d.</span>DocSync</a>
        <nav aria-label="Main navigation" className="home-nav">
          <a href="#use-cases">Examples</a>
          <a href="#how-it-works">How it works</a>
          <a href="/templates">Templates</a>
        </nav>
        <div className="home-header-actions">
          <a href="/login" className="home-signin">Sign in</a>
          <WorkspaceLink compact />
        </div>
      </header>
    </div>

    <main id="main-content" tabIndex={-1}>
      <div className="home-dark">
        <section className="home-hero home-container" aria-labelledby="home-title">
          <div className="home-intro">
            <p className="home-kicker">For AI agents and their people</p>
            <h1 id="home-title">Turn agent drafts into work <em>worth sharing.</em></h1>
            <p className="home-lead">Use your existing AI agent to draft documents, reports, and slides. Edit them in your browser and share a link.</p>
            <div className="home-actions">
              <WorkspaceLink />
              <a className="home-text-link" href="#use-cases">Browse examples <ArrowDown size={16} aria-hidden="true" /></a>
            </div>
            <a className="home-trial" href="#agent-setup">Try one document before signing up</a>
          </div>
          <figure className="home-hero-figure">
            <img
              src={`${assets}/project-review-1280.webp`}
              srcSet={`${assets}/project-review-640.webp 640w, ${assets}/project-review-1280.webp 1280w`}
              sizes="(max-width: 760px) calc(100vw - 40px), (max-width: 1280px) 49vw, 640px"
              width="1280" height="960" fetchPriority="high"
              alt="An illustrative project review deck with matching results and scope charts"
            />
            <figcaption><span>Example output</span><span>Project review</span></figcaption>
          </figure>
        </section>
      </div>

      <section className="home-proof" aria-labelledby="compatibility-title">
        <div className="home-container home-compatibility">
          <h2 id="compatibility-title">Works with your existing agent</h2>
          <ul>{agents.map(({ provider, label }) =>
            <li key={provider}><AgentIcon provider={provider} size={21} />{label}</li>)}</ul>
        </div>
      </section>

      <section className="home-section home-container" id="use-cases" aria-labelledby="use-cases-title">
        <div className="home-section-heading">
          <div>
            <p className="home-kicker">Template gallery</p>
            <h2 id="use-cases-title">Start with a real example.</h2>
            <p>Open a working template with fictional data, then make it your own.</p>
          </div>
          <a className="home-text-link" href="/templates">View all templates <ArrowUpRight size={17} aria-hidden="true" /></a>
        </div>
        <div className="home-use-cases">{useCases.map(({ title, description, template, example }) => <article key={template}>
          <a href={`/templates?template=${template}`}>
            <div className={`home-template-preview home-template-${template}`}>
              <img src={`${assets}/${template}.webp`} alt="" width="720" height="450" loading="lazy" decoding="async" />
            </div>
            <div className="home-template-copy">
              <h3>{title}</h3>
              <p>{description}</p>
              <span className="home-template-link">{example}<ArrowUpRight size={16} aria-hidden="true" /></span>
            </div>
          </a>
        </article>)}</div>
      </section>

      <div className="home-workflow">
        <section className="home-section home-container" id="how-it-works" aria-labelledby="workflow-title">
          <div className="home-section-heading">
            <div><p className="home-kicker">How it works</p><h2 id="workflow-title">From first draft to shared link.</h2></div>
            <a className="home-text-link" href="/connect">Connect your agent <ArrowUpRight size={17} aria-hidden="true" /></a>
          </div>
          <ol className="home-steps">{steps.map(({ title, description }, index) =>
            <li key={title}><span aria-hidden="true">0{index + 1}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
        </section>
      </div>

      <section className="home-section home-sharing home-container" aria-labelledby="sharing-title">
        <div>
          <p className="home-kicker">Sharing & version history</p>
          <h2 id="sharing-title">Share the version<br className="home-wide-break" /> you reviewed.</h2>
          <p>A published link opens the saved version you chose. Keep working privately, then publish a fresh link when it’s ready. You can revoke a link any time.</p>
        </div>
        <ul className="home-version-example" aria-label="From a private draft to a published version">
          <li><Lock size={19} aria-hidden="true" /><div><strong>Private draft</strong><span>Edit with your agent and invited collaborators</span></div></li>
          <li><History size={19} aria-hidden="true" /><div><strong>Saved revision</strong><span>Review the version you’re about to share</span></div></li>
          <li><Link2 size={19} aria-hidden="true" /><div><strong>Published link</strong><span>Anyone with the link can view that revision</span></div></li>
        </ul>
      </section>

      <section className="home-section home-faq home-container" aria-labelledby="faq-title">
        <div><p className="home-kicker">FAQ</p><h2 id="faq-title">Good to know.</h2></div>
        <div>{questions.map(({ question, answer }) => <details key={question}>
          <summary>{question}<Plus size={19} aria-hidden="true" /></summary><p>{answer}</p>
        </details>)}</div>
      </section>

      <section className="home-container home-closing" aria-labelledby="closing-title" id="agent-setup">
        <div>
          <p className="home-kicker">Get started</p>
          <h2 id="closing-title">Give your next draft a home.</h2>
          <p>Create a workspace for your documents and decks, or try one document locally with the MCP bridge.</p>
        </div>
        <div className="home-closing-actions">
          <WorkspaceLink />
          <a className="home-text-link" href="/downloads/docsync-mcp.cjs" download>Download the MCP bridge <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
      </section>
    </main>
    <footer className="home-footer home-container">
      <a href="/" className="brand" aria-label="DocSync home"><span className="brand-mark" aria-hidden="true">d.</span>DocSync</a>
      <nav aria-label="Footer">
        <a href="/templates">Templates</a>
        <a href="/connect">Connect agent</a>
        <a href="/downloads/docsync-skill.zip" download>Download the agent skill</a>
        <a href="/login">Sign in</a>
      </nav>
    </footer>
  </div>;
}
