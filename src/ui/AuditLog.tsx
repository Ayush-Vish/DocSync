import { useEffect, useState } from "react";
import { Activity, ChevronDown, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "./api";
import { AgentIcon } from "./AgentIcon";
import { agentIdentity } from "../agent-client";
import type { AuditEvent, AuditPage } from "../audit";

function AuditEntry({ event }: { event: AuditEvent }) {
  const agent = agentIdentity(event.clientName);
  return <details className="audit-entry">
    <summary>
      <span className="audit-agent"><span className="audit-agent-icon"><AgentIcon provider={agent.provider} /></span><span><strong>{event.clientName}</strong><small>{agent.company}</small></span></span>
      <span className="audit-command">
        <code>{event.tool}</code>
        <small><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></small>
        {(event.localDurationMs !== null || event.durationMs !== null) && <small>
          {[
            event.localDurationMs !== null && `Local MCP · ${event.localDurationMs} ms`,
            event.durationMs !== null && `${event.source === "mcp" ? "Hosted MCP" : event.source === "client" ? "Report processing" : "Server API"} · ${event.durationMs} ms`,
          ].filter(Boolean).join(" / ")}
        </small>}
      </span>
      <span className="audit-device"><strong>{event.deviceName || "Device not reported"}</strong><small>{event.platform || (event.source === "mcp" ? "Remote MCP connection" : "Client metadata unavailable")}</small></span>
      <Badge variant={event.outcome === "error" ? "destructive" : "outline"} className={`audit-result audit-result-${event.outcome}`}>{event.outcome === "success" ? "Succeeded" : event.outcome === "error" ? "Failed" : "Unconfirmed"}</Badge>
      <ChevronDown size={16} className="audit-expand" aria-hidden="true" />
    </summary>
    <div className="audit-event-details">
      {event.error && <Alert variant="destructive"><AlertDescription>{event.error}</AlertDescription></Alert>}
      {event.outcome === "pending" && <p>The final outcome could not be confirmed. Check the saved document before retrying a change.</p>}
      <dl>
        <div><dt>Source</dt><dd>{event.source === "mcp" ? "Hosted MCP tool call" : event.source === "client" ? "Client-reported local tool event" : event.localDurationMs !== null ? "Local MCP tool call with server API request" : "Server-observed agent API action"}</dd></div>
        <div><dt>Request</dt><dd><code>{event.method} {event.path}</code></dd></div>
        <div><dt>{event.source === "client" ? "Report HTTP status" : "HTTP status"}</dt><dd>{event.status ?? "Not finalized"}</dd></div>
        <div><dt>UTC timestamp</dt><dd><time dateTime={event.createdAt}>{event.createdAt}</time></dd></div>
        <div><dt>Reported client version</dt><dd>{event.clientVersion || "Not reported"}</dd></div>
        <div><dt>Reported device</dt><dd>{event.deviceName || "Not reported"}</dd></div>
        <div><dt>Reported platform</dt><dd>{event.platform || "Not reported"}</dd></div>
        <div><dt>Network IP</dt><dd>{event.ip || "Not provided by the network"}</dd></div>
        <div><dt>User agent</dt><dd>{event.userAgent || "Not reported"}</dd></div>
        <div><dt>Connection reference</dt><dd><code>{event.credentialId}</code></dd></div>
        <div><dt>Request reference</dt><dd><code>{event.requestId}</code></dd></div>
        {event.documentId && <div><dt>Document</dt><dd><code>{event.documentId}</code></dd></div>}
      </dl>
      <h3>Parameter summary</h3><pre>{JSON.stringify(event.details, null, 2)}</pre>
    </div>
  </details>;
}

export function AuditLog() {
  const [data, setData] = useState<AuditPage | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [query, setQuery] = useState(""), [outcome, setOutcome] = useState("");
  const [filters, setFilters] = useState<{ q: string; outcome: string; before: number | null }>({ q: "", outcome: "", before: null });
  const [previous, setPrevious] = useState<(number | null)[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.outcome) params.set("outcome", filters.outcome);
    if (filters.before !== null) params.set("before", String(filters.before));
    setLoading(true); setError("");
    void api<AuditPage>(`/audit-log?${params}`, "GET", undefined, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message || "Cannot load audit history"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters]);
  return <section className="audit-page" aria-labelledby="audit-title" aria-busy={loading}>
    <header className="audit-heading"><div><p className="eyebrow"><ShieldCheck size={14} aria-hidden="true" /> ACCOUNT ACTIVITY</p><h1 id="audit-title">Audit log</h1><p>See what your connected agents did, when they ran, and the device information they reported.</p></div><Button variant="outline" size="sm" disabled={loading} onClick={() => { setPrevious([]); setFilters({ ...filters, before: null }); }}><RefreshCw size={14} aria-hidden="true" />Refresh</Button></header>
    <div className="audit-privacy"><ShieldCheck size={17} aria-hidden="true" /><p>Only your account’s agent activity is shown. Device names, platforms, and client versions are reported by clients, not verified hardware identities. Network IPs may belong to cloud services or proxies. Local terminal commands outside DocSync are not visible.</p></div>
    <form className="audit-filters" onSubmit={event => { event.preventDefault(); setPrevious([]); setFilters({ q: query.trim(), outcome, before: null }); }}>
      <label className="audit-search"><Search size={16} aria-hidden="true" /><Input aria-label="Search audit log" placeholder="Search tools, agents, or devices" maxLength={100} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label="Audit result filter" value={outcome} onChange={event => setOutcome(event.target.value)}><option value="">All results</option><option value="success">Succeeded</option><option value="error">Failed</option><option value="pending">Unconfirmed</option></select>
      <Button type="submit" variant="secondary" disabled={loading}>Filter</Button>
    </form>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="audit-events" aria-label="Agent audit events">
      {data?.items.map(event => <AuditEntry key={event.id} event={event} />)}
      {!error && !data?.items.length && <div className="audit-empty"><Activity size={28} aria-hidden="true" /><h2>{loading ? "Loading activity…" : "No matching activity yet"}</h2><p>{loading ? "Checking your account’s audit history." : "New DocSync tool calls and agent API actions will appear here. Use Refresh to check for new events."}</p></div>}
    </div>
    <footer className="audit-footer"><p>Events are retained for {data?.retentionDays ?? 90} days. Times use your browser’s timezone; UTC is available in each event.</p><div><Button variant="outline" size="sm" disabled={loading || !previous.length} onClick={() => { const cursor = previous.at(-1) ?? null; setPrevious(values => values.slice(0, -1)); setFilters({ ...filters, before: cursor }); }}>Newer events</Button><Button variant="outline" size="sm" disabled={loading || !data?.nextCursor} onClick={() => { if (data?.nextCursor) { setPrevious(values => [...values, filters.before]); setFilters({ ...filters, before: data.nextCursor }); } }}>Older events</Button></div></footer>
  </section>;
}
