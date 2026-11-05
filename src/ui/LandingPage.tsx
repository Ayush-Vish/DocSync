import { ArrowRight, ArrowUpRight, Check, FileText, Presentation, Code2, BarChart3, History, Share2, SquareTerminal, Asterisk, Orbit, Plug } from "lucide-react";

const useCases = [
  { icon: FileText, title: "Reports & updates", description: "Turn scattered notes into a readable report. Spend less time formatting the weekly update.", template: "editorial-document", example: "Explore a report" },
  { icon: Code2, title: "Technical documents", description: "Bring architecture, decisions, and tradeoffs together so the next handoff starts with context.", template: "design-document", example: "Explore a design doc" },
  { icon: BarChart3, title: "Dashboards & analysis", description: "Make your data easier to explain with visual summaries, charts, and interactive components.", template: "sales-dashboard", example: "Explore a dashboard" },
  { icon: Presentation, title: "Pitches & team reviews", description: "Shape your ideas into a presentation. Walk through a proposal or share progress with your team.", template: "review-slides", example: "Explore a presentation" },
];

export function LandingPage() {
  return <div className="home">
    <a className="home-skip" href="#main-content">Skip to content</a>
    <header className="home-header">
      <a href="/" className="brand" aria-label="DocSync home"><span className="brand-mark">d.</span>DocSync</a>
      <nav aria-label="Main navigation" className="home-nav">
        <a href="#use-cases">Use cases</a><a href="#how-it-works">How it works</a><a href="/templates">Templates</a>
      </nav>
      <a href="/login" className="home-signin">Sign in <ArrowUpRight size={15} aria-hidden="true" /></a>
    </header>
    <main id="main-content">
      <section className="home-hero home-container" aria-labelledby="home-title">
        <div className="home-intro">
          <p className="home-eyebrow"><span /> YOUR IDEAS, READY TO SHARE</p>
          <h1 id="home-title">Less busywork.<br />More <em>shared clarity.</em></h1>
          <p className="home-lead">Turn your AI agent’s work into clear documents, visual reports, and presentations. Refine in your browser. Share with your team.</p>
          <div className="home-actions"><a className="home-button" href="/signup">Create your workspace <ArrowRight size={17} aria-hidden="true" /></a><a className="home-text-link" href="/templates">Explore templates <ArrowUpRight size={16} aria-hidden="true" /></a></div>
          <p className="home-note">Already using an agent? <a href="#agent-setup">Try one document without an account.</a></p>
        </div>
        <div className="home-example" aria-label="Illustrative project update, from agent prompt to a shareable document">
          <div className="home-prompt"><span className="home-prompt-label">YOU + YOUR AGENT</span><p>“Turn these notes into a project update I can share with my team.”</p></div>
          <div className="home-document">
            <div className="home-document-top"><span><FileText size={14} aria-hidden="true" /> Project update</span><span className="home-saved"><Check size={13} aria-hidden="true" /> Saved · v3</span></div>
            <div className="home-document-body"><p className="home-eyebrow">ILLUSTRATIVE DOCUMENT</p><h2>A clear view of<br />what’s next.</h2><p>The decisions, progress, and next steps.<br />Together in one place.</p><div className="home-example-grid"><div><span>01</span><strong>Progress</strong><p>What changed</p></div><div><span>02</span><strong>Decisions</strong><p>Why it matters</p></div><div><span>03</span><strong>Next steps</strong><p>Where we go</p></div></div><div className="home-example-line" /><div className="home-example-line short" /></div>
            <div className="home-document-bottom"><History size={14} aria-hidden="true" /> Revision history <span><Share2 size={14} aria-hidden="true" /> Ready to share</span></div>
          </div>
        </div>
      </section>
      <div className="home-compatibility home-container"><span>WORKS WITH YOUR EXISTING AGENT</span><ul aria-label="Compatible AI agents"><li><SquareTerminal aria-hidden="true" />Codex</li><li><Asterisk aria-hidden="true" />Claude Code</li><li><Orbit aria-hidden="true" />Antigravity</li><li><Plug aria-hidden="true" />MCP-compatible clients</li></ul></div>

      <section className="home-section home-container" id="use-cases" aria-labelledby="use-cases-title">
        <div className="home-section-heading"><div><p className="home-eyebrow">LESS STARTING FROM SCRATCH</p><h2 id="use-cases-title">One workspace. Many ways forward.</h2></div><p>From the first draft to the next handoff,<br />make your work easier to understand.</p></div>
        <div className="home-use-cases">{useCases.map(({ icon: Icon, title, description, template, example }) => <article key={title}><Icon size={23} strokeWidth={1.5} aria-hidden="true" /><h3>{title}</h3><p>{description}</p><a href={`/templates?template=${template}`}>{example}<ArrowUpRight size={15} aria-hidden="true" /></a></article>)}</div>
        <p className="home-note">Preview templates with clearly labeled fictional data, then create with your own information.</p>
      </section>

      <section className="home-section home-container" id="how-it-works" aria-labelledby="workflow-title">
        <p className="home-eyebrow">A SHORTER PATH FROM IDEA TO OUTPUT</p><h2 id="workflow-title">Draft. Refine. Share.</h2>
        <ol className="home-steps"><li><span>01</span><h3>Let your agent do the groundwork.</h3><p>Connect DocSync to your coding agent. Give it your notes, data, and audience to create a document or slide deck.</p></li><li><span>02</span><h3>Make it yours in the browser.</h3><p>Edit text, preview visual components, and review the result. Save revisions and restore earlier work when you need it.</p></li><li><span>03</span><h3>Give everyone a clear reference.</h3><p>Publish a saved version and send its link. Present slides in the browser or print a preview to PDF.</p></li></ol>
      </section>

      <section className="home-collaboration home-container" aria-labelledby="collaboration-title">
        <div><p className="home-eyebrow">BUILT FOR THE HANDOFF</p><h2 id="collaboration-title">Less explaining.<br />More understanding.</h2><p>Help teammates and clients catch up with a report they can read, a dashboard they can explore, or a deck you can present.</p></div>
        <div className="home-sharing"><div><Check size={18} aria-hidden="true" /><p><strong>Share the version you reviewed.</strong>A published link stays on its saved revision while you keep editing privately.</p></div><div><Check size={18} aria-hidden="true" /><p><strong>Keep control of the next handoff.</strong>Republish to issue a new link, or revoke a link when it is no longer needed.</p></div><p className="home-note">Collaboration through shared documents and presentations. Live co-editing and comments are not available yet.</p></div>
      </section>

      <section className="home-section home-container home-setup" id="agent-setup" aria-labelledby="setup-title">
        <div><p className="home-eyebrow">BRING YOUR OWN AI AGENT</p><h2 id="setup-title">Keep your workflow.<br />Skip the copy-paste.</h2><p>Connect through MCP (Model Context Protocol) so your agent can create, update, and publish directly to DocSync. Your existing agent generates the content.</p><a className="home-text-link" href="/connect">Connect your agent <ArrowRight size={16} aria-hidden="true" /></a></div>
        <div className="home-setup-options"><h3>Two ways to get started</h3><p><strong>Hosted connection</strong>Sign in and open Connect agent for your client’s setup instructions. Authorize access in your browser.</p><p><strong>Try a document first</strong>The local MCP client supports one document per installation without a web account. Sign in to claim it and create more.</p><a href="/downloads/docsync-skill.zip" download>Download the agent skill + templates <ArrowUpRight size={15} aria-hidden="true" /></a><span>For Codex and Claude Code. MCP connection is separate.</span></div>
      </section>

      <section className="home-section home-container home-faq" aria-labelledby="faq-title">
        <h2 id="faq-title">A few useful details.</h2>
        <div><details><summary>What can I create with DocSync?</summary><p>Documents, technical specifications, visual reports, interactive dashboards, pitch decks, and project review presentations. Start with a template or ask your connected agent for a custom layout using your information.</p></details><details><summary>Can I edit without an AI agent?</summary><p>Yes. Create an account to use the browser editor, start from a template, format text, and edit HTML components. An MCP connection lets your agent handle drafting and updates directly in the same workspace.</p></details><details><summary>How does sharing work?</summary><p>Anyone with a published link can view that saved version without signing in. Private edits stay private until you republish. Republishing creates a new URL and revokes the previous link. Revoking a link cannot remove copies already downloaded.</p></details><details><summary>Is this a PowerPoint or Google Docs replacement?</summary><p>DocSync focuses on agent-created documents and HTML presentations. You can present in the browser and print previews to PDF. Native PowerPoint export, simultaneous editing, and comments are not included.</p></details><details><summary>Does DocSync include an AI subscription?</summary><p>No. DocSync works with your existing MCP-compatible agent and does not call a model API itself. Your agent’s subscription or model usage is separate.</p></details></div>
      </section>
      <section className="home-closing home-container"><p className="home-eyebrow">MAKE ROOM FOR THE WORK THAT MATTERS</p><h2>Your next idea deserves<br />a clearer finish.</h2><a className="home-button" href="/signup">Create your workspace <ArrowRight size={17} aria-hidden="true" /></a></section>
    </main>
    <footer className="home-footer home-container"><a href="/" className="brand"><span className="brand-mark">d.</span>DocSync</a><p>From your agent to everyone who needs it.</p><nav aria-label="Footer"><a href="/templates">Templates</a><a href="/connect">Connect agent</a><a href="/login">Sign in</a></nav></footer>
  </div>;
}
