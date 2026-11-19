import { useState, type ReactNode } from "react";
import { ChevronDown, Copy, Globe, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

function ClientGuide({ name, docs, children }: { name: string; docs: string; children: ReactNode }) {
  return (
    <details className="group border-t border-border first:border-t-0">
      <summary className="flex list-none items-center justify-between gap-3 rounded-sm py-3 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
        {name}
        <ChevronDown size={16} className="shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-4 text-sm">
        {children}
        <a className="mt-2 inline-block text-xs underline underline-offset-4" href={docs} target="_blank" rel="noreferrer">
          {name} setup guide
        </a>
      </div>
    </details>
  );
}

export function AgentConnectionGuide({ origin, busy, onCopy }: {
  origin?: string;
  busy?: boolean;
  onCopy?: (value: string, notice: string) => void;
}) {
  const [surface, setSurface] = useState<"cli" | "web">("cli");
  const url = new URL("/mcp", origin ?? "https://your-docsync-host");
  const endpoint = url.href;
  const local = url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const cli = [
    {
      name: "Codex CLI",
      docs: "https://developers.openai.com/codex/mcp",
      command: `codex mcp add docsync --url ${endpoint}`,
      auth: <>Approve access in your browser. If DocSync is still signed out, run <code>codex mcp login docsync</code>. In Codex, use <code>/mcp</code> to check the connection.</>,
    },
    {
      name: "Claude Code CLI",
      docs: "https://code.claude.com/docs/en/mcp#authenticate-with-remote-mcp-servers",
      command: `claude mcp add --transport http docsync ${endpoint}`,
      auth: <>Open Claude Code, run <code>/mcp</code>, then choose <strong>docsync → Authenticate</strong>. The command adds DocSync to the current project.</>,
    },
    {
      name: "Gemini CLI",
      docs: "https://geminicli.com/docs/tools/mcp-server/",
      command: `gemini mcp add --transport http docsync ${endpoint}`,
      auth: <>Start Gemini CLI, run <code>/mcp auth docsync</code>, and approve the connection in your browser.</>,
    },
    {
      name: "Antigravity CLI",
      docs: "https://antigravity.google/docs/mcp#antigravity-cli",
      command: `agy mcp add --type http docsync ${endpoint}`,
      auth: <>Open Antigravity and run <code>/mcp</code> to check DocSync. If it needs authentication, follow the browser sign-in prompts. You can also authenticate it from <strong>Antigravity App → Customizations → Installed → MCP Servers</strong>.</>,
    },
  ];
  const antigravityConfig = JSON.stringify({ mcpServers: { docsync: { serverUrl: endpoint } } }, null, 2);

  return (
    <section className="connect-card" aria-labelledby="agent-setup-title">
      <h2 id="agent-setup-title" className="mb-3 text-base font-semibold">Connect DocSync</h2>
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-border bg-muted/35 p-3">
        <div className="min-w-0">
          <span className="block text-xs font-medium text-muted-foreground">{origin ? "MCP server URL" : "Example MCP server URL"}</span>
          <code className="block break-all text-xs sm:text-sm">{endpoint}</code>
        </div>
        {onCopy && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onCopy(endpoint, "MCP server URL copied.")}>
          <Copy size={14} className="mr-1.5" aria-hidden="true" />Copy URL
        </Button>}
      </div>
      {onCopy && <div className="my-4 inline-flex max-w-full flex-wrap gap-1 rounded-md bg-muted p-1" role="group" aria-label="Connection method">
        <Button type="button" variant={surface === "cli" ? "outline" : "ghost"} size="sm" aria-pressed={surface === "cli"} onClick={() => setSurface("cli")}>
          <Terminal size={16} className="mr-1.5" aria-hidden="true" />CLI
        </Button>
        <Button type="button" variant={surface === "web" ? "outline" : "ghost"} size="sm" aria-pressed={surface === "web"} onClick={() => setSurface("web")}>
          <Globe size={16} className="mr-1.5" aria-hidden="true" />Web &amp; desktop
        </Button>
      </div>}
      {(!onCopy || surface === "cli") && (
        <div key="cli" role="group" aria-label="CLI setup">
          {!onCopy && <h3 className="mt-5">Command-line clients</h3>}
          {cli.map(client => (
            <ClientGuide key={client.name} name={client.name} docs={client.docs}>
              {onCopy && <Button type="button" variant="outline" size="sm" disabled={busy} aria-label={`Copy ${client.name} command`} onClick={() => onCopy(client.command, `${client.name} command copied.`)}>
                <Copy size={14} className="mr-1.5" aria-hidden="true" />Copy command
              </Button>}
              <pre><code>{client.command}</code></pre>
              <div>{client.auth}</div>
            </ClientGuide>
          ))}
        </div>
      )}
      {(!onCopy || surface === "web") && (
        <div key="web" role="group" aria-label="Web and desktop setup">
          {!onCopy && <h3 className="mt-5">Web and desktop clients</h3>}
          {local && <p>Web agents need a public HTTPS endpoint. Open Agents on your deployed DocSync instance and copy its MCP server URL.</p>}
          <ClientGuide name="ChatGPT web & Projects" docs="https://developers.openai.com/api/docs/guides/custom-mcp-server">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open <strong>ChatGPT → Plugins → + → Add custom MCP server</strong>.</li>
              <li>Name it <strong>DocSync</strong>, paste the MCP server URL, and choose <strong>OAuth</strong>. Use dynamic client registration if prompted.</li>
              <li>Create and install the plugin, then sign in to DocSync and approve access when prompted.</li>
              <li>In a chat, type <strong>@DocSync</strong> and select the plugin. In a project chat, use the same picker when the plugin is available there.</li>
            </ol>
            <div className="mt-2 text-xs text-muted-foreground">Custom plugins in ChatGPT and project chats depend on your workspace settings.</div>
          </ClientGuide>
          <ClientGuide name="Claude web & Claude Code on the web" docs="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open <strong>Claude → Customize → Connectors → + Add → Add custom connector</strong>.</li>
              <li>Name it <strong>DocSync</strong> and paste the MCP server URL. Choose <strong>Sign in now</strong> and <strong>Register automatically</strong> if those options are shown.</li>
              <li>Connect and approve access in DocSync. In a Claude chat, enable it from <strong>+ → Connectors</strong>. For Claude Code on the web, authorize the connector in Claude first.</li>
            </ol>
            <div className="mt-2 text-xs text-muted-foreground">On Team and Enterprise, an admin may need to add DocSync in Organization settings first.</div>
          </ClientGuide>
          <ClientGuide name="Gemini web" docs="https://support.google.com/gemini/answer/17209137?hl=en">
            <ol className="list-decimal space-y-2 pl-5">
              <li>Open <strong>Gemini → Settings → Connected Apps → Custom apps → Add a custom app</strong>. If needed, look under <strong>Personal Intelligence → Connected Apps</strong>.</li>
              <li>Paste the MCP server URL and follow the prompts to connect your DocSync account.</li>
              <li>In a Gemini chat, type <strong>@DocSync</strong> and select the connected app.</li>
            </ol>
            <div className="mt-2 text-xs text-muted-foreground">Google currently requires a personal account in the US, age 18+, English, and Gemini History on.</div>
          </ClientGuide>
          <ClientGuide name="Antigravity App & IDE" docs="https://antigravity.google/docs/mcp">
            <ol className="list-decimal space-y-2 pl-5">
              <li>In the App, open <strong>Customizations → Installed → MCP Servers → Copy Config File Path</strong>. In the IDE, open <strong>… → MCP Servers → Manage MCP Servers → View raw config</strong>.</li>
              <li>Add the <code>docsync</code> entry to the existing <code>mcpServers</code> object.</li>
            </ol>
            <pre><code>{antigravityConfig}</code></pre>
            {onCopy && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onCopy(antigravityConfig, "Antigravity configuration copied.")}>Copy configuration</Button>}
            <div className="mt-2">Reload the server list, select <strong>Authenticate</strong> next to DocSync, and follow the browser prompts.</div>
          </ClientGuide>
          <ClientGuide name="Codex on the web & ChatGPT desktop" docs="https://developers.openai.com/codex/mcp">
            <div>For browser-based work with DocSync, install the remote plugin using the ChatGPT web steps above.</div>
            <div className="mt-2">For local Codex in the ChatGPT desktop app, open <strong>Settings → MCP servers → Add server</strong>, choose <strong>Streamable HTTP</strong>, and paste the MCP server URL. Save, restart, and select <strong>Authenticate</strong> next to DocSync.</div>
          </ClientGuide>
        </div>
      )}
    </section>
  );
}
