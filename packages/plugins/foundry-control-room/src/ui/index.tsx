import { useEffect, useMemo, useState } from "react";
import {
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
} from "@paperclipai/plugin-sdk/ui";

type Company = { id: string; name: string; description: string | null; status: string; issuePrefix: string; budgetMonthlyCents: number; spentMonthlyCents: number };
type Agent = { id: string; name: string; role: string; title: string | null; status: string; adapterType: string; lastHeartbeatAt: string | null };
type Issue = { id: string; identifier: string | null; title: string; status: string; priority: string; assigneeAgentId: string | null; updatedAt: string };
type Project = { id: string; name: string; status: string };
type Goal = { id: string; title: string; status: string; description: string | null };
type Run = { id: string; agentId: string; status: string; invocationSource: string; startedAt: string | null; finishedAt: string | null; createdAt: string; errorCode: string | null; summary: string | null; error: string | null; stdoutExcerpt: string | null; stderrExcerpt: string | null };
type RunEvent = { id: number; runId: string; agentId: string; seq: number; eventType: string; stream: string | null; level: string | null; message: string | null; createdAt: string };
type Activity = { id: string; actorType: string; actorId: string; action: string; agentId: string | null; entityType: string; entityId: string; createdAt: string; details: Record<string, unknown> | null };
type Workspace = { id: string; name: string; projectName: string; path: string; repoUrl: string | null; isPrimary: boolean };
type Document = { id: string; key: string; title: string | null; issueIdentifier: string | null; issueTitle: string; updatedAt: string };
type Integration = { configured: boolean; url?: string | null; projectConfigured?: boolean };
type FounderCeoMessage = { id: string; agentId: string | null; role: "founder" | "ceo" | "system"; body: string; status: "queued" | "running" | "completed" | "failed"; runId: string | null; error: string | null; createdAt: string; updatedAt: string };
type Snapshot = {
  generatedAt: string;
  company: Company;
  agents: Agent[];
  agentNames: Record<string, string>;
  ceo: Agent | null;
  issues: Issue[];
  projects: Project[];
  goals: Goal[];
  activity: Activity[];
  runs: Run[];
  runEvents: RunEvent[];
  chatMessages: FounderCeoMessage[];
  workspaces: Workspace[];
  documents: Document[];
  integrations: { website: Integration; stripe: Integration; vercel: Integration; analytics: Integration; email: Integration };
  counts: { activeIssues: number; completedIssues: number; failedRuns: number; activeRuns: number; connectedOpenCodeAgents: number };
  honestRead: string[];
};

const css = `
  :root{--fc-bg:#f4f6fa;--fc-surface:#fff;--fc-ink:#111827;--fc-muted:#64748b;--fc-line:#e2e8f0;--fc-accent:#635bff;--fc-accent-soft:#eeecff;--fc-cyan:#14b8a6;--fc-green:#16a34a;--fc-red:#dc2626;--fc-shadow:0 18px 45px rgba(15,23,42,.08)}
  .fc{min-height:100vh;color:var(--fc-ink);background:radial-gradient(circle at 8% 0%,rgba(99,91,255,.10),transparent 27%),radial-gradient(circle at 92% 8%,rgba(20,184,166,.08),transparent 24%),var(--fc-bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:-24px;padding:0 0 56px}
  .fc *{box-sizing:border-box}.fc-top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.86);backdrop-filter:blur(18px);border-bottom:1px solid rgba(226,232,240,.85);padding:17px 30px;display:flex;align-items:center;gap:14px}.fc-brand{font-size:20px;font-weight:800;letter-spacing:-.04em;color:var(--fc-accent)}.fc-brand:after{content:'/';color:#cbd5e1;margin-left:14px}.fc-company{font-size:20px;font-weight:720;letter-spacing:-.025em}.fc-handle{font:700 11px ui-monospace,SFMono-Regular,monospace;color:var(--fc-muted);background:#f1f5f9;border-radius:7px;padding:5px 8px}
  .fc-status{border:1px solid #bbf7d0;background:#f0fdf4;color:#15803d;border-radius:999px;padding:5px 9px;text-transform:capitalize;font-size:11px;font-weight:750}.fc-updated{margin-left:auto;color:var(--fc-muted);font-size:11px;font-weight:700;display:grid;grid-template-columns:auto auto;align-items:center;column-gap:7px;text-align:right}.fc-updated small{grid-column:2;font-weight:500;color:#94a3b8}.fc-sync-dot{grid-row:1/3;width:8px;height:8px;border-radius:50%;background:var(--fc-green);box-shadow:0 0 0 4px rgba(22,163,74,.1)}.fc-sync-dot.off{background:var(--fc-red);box-shadow:0 0 0 4px rgba(220,38,38,.1)}
  .fc-layout{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(380px,1.08fr) minmax(320px,.78fr);gap:20px;padding:24px 30px;align-items:start;max-width:1720px;margin:0 auto}.fc-col{display:grid;gap:20px}.fc-side{position:sticky;top:92px}
  .fc-panel{background:rgba(255,255,255,.94);border:1px solid var(--fc-line);border-radius:18px;box-shadow:var(--fc-shadow);overflow:hidden}.fc-head{min-height:48px;border-bottom:1px solid var(--fc-line);display:flex;align-items:center;padding:0 19px;font-size:12px;font-weight:800;letter-spacing:.035em;color:#334155}.fc-body{padding:19px}
  .fc-terminal{background:linear-gradient(145deg,#111827,#0b1220);color:#cbd5e1;padding:20px 22px;min-height:350px;border:1px solid #1e293b;border-radius:20px;box-shadow:0 24px 55px rgba(15,23,42,.22);overflow:hidden}.fc-terminal-title{display:flex;align-items:flex-end;justify-content:space-between;color:#f8fafc;border-bottom:1px solid #283548;padding-bottom:14px}.fc-terminal-title span{font-size:15px;font-weight:780}.fc-terminal-title small{font-size:10px;color:#64748b;font-weight:600}.fc-runbar{display:flex;flex-wrap:wrap;gap:8px 16px;padding:14px 0;border-bottom:1px solid #283548;color:#94a3b8;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}.fc-log{display:grid;grid-template-columns:55px 82px 1fr;gap:8px;margin-top:11px;line-height:1.4;font:11px ui-monospace,SFMono-Regular,Menlo,monospace}.fc-log time{color:#64748b}.fc-log b{color:#a5b4fc;overflow:hidden;text-overflow:ellipsis}.fc-log .bad{color:#fca5a5}.fc-pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#94a3b8;margin:4px 0 10px 145px;font:10px/1.45 ui-monospace,SFMono-Regular,monospace;max-height:58px;overflow:hidden}
  .fc-buttons{display:flex;flex-wrap:wrap;gap:9px}.fc button,.fc-btn{font:700 12px Inter,ui-sans-serif,sans-serif;color:#334155;background:#fff;border:1px solid #dbe3ee;border-radius:10px;padding:10px 14px;cursor:pointer;text-decoration:none;transition:.18s ease}.fc button:hover,.fc-btn:hover{border-color:#b8c2d1;transform:translateY(-1px);box-shadow:0 6px 16px rgba(15,23,42,.08)}.fc button:disabled{opacity:.45;cursor:not-allowed;transform:none}.fc button.primary,.fc button.run{background:var(--fc-accent);border-color:var(--fc-accent);color:#fff}.fc button.run{background:#111827;border-color:#111827}
  .fc-kicker,.fc-eyebrow{text-transform:uppercase;letter-spacing:.09em;color:#94a3b8;font-size:10px;font-weight:800}.fc-big{font-size:54px;font-weight:760;letter-spacing:-.06em;margin:4px 0}.fc-meter{height:8px;border-radius:99px;background:#e8edf4;overflow:hidden}.fc-meter span{display:block;height:100%;background:linear-gradient(90deg,var(--fc-accent),var(--fc-cyan));border-radius:inherit}.fc-rule{border:0;border-top:1px solid var(--fc-line);margin:17px 0}.fc-muted{color:var(--fc-muted)}.fc-error{color:var(--fc-red)}
  .fc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--fc-line);font-size:13px}.fc-row:last-child{border:0}.fc-tag{border:1px solid #dbe3ee;background:#f8fafc;color:#475569;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:800;text-transform:uppercase;white-space:nowrap}.fc-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--fc-cyan);margin-right:9px;box-shadow:0 0 0 3px rgba(20,184,166,.1)}.fc-dot.off{background:#94a3b8;box-shadow:none}.fc-money{font-size:45px;font-weight:750;letter-spacing:-.055em}.fc-card{border:1px solid var(--fc-line);background:#f8fafc;border-radius:12px;padding:14px;margin-top:10px}.fc-site{font-size:14px;font-weight:700;overflow-wrap:anywhere}.fc-site a{color:var(--fc-accent);text-decoration:none}.fc-site-frame{height:220px;border:1px solid var(--fc-line);border-radius:13px;margin-top:15px;background:#fff;overflow:hidden}.fc-site-frame iframe{width:100%;height:100%;border:0}
  .fc-chat-head{padding:22px 22px 14px;border-bottom:1px solid var(--fc-line)}.fc-chat-head h2{font-size:22px;letter-spacing:-.04em;margin:5px 0}.fc-chat{display:grid;gap:12px;max-height:520px;overflow:auto;padding:18px 18px 8px;background:linear-gradient(180deg,#fff,#fafbff)}.fc-message{display:grid;gap:5px;max-width:92%}.fc-message.founder{justify-self:end}.fc-message.ceo,.fc-message.system{justify-self:start}.fc-message-meta{font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#94a3b8}.fc-message.founder .fc-message-meta{text-align:right}.fc-bubble{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--fc-line);border-radius:14px;padding:11px 12px;font-size:13px;line-height:1.5;background:#fff;color:#334155}.fc-message.founder .fc-bubble{background:var(--fc-accent);border-color:var(--fc-accent);color:#fff;border-bottom-right-radius:4px}.fc-message.ceo .fc-bubble{border-bottom-left-radius:4px}.fc-chat-state{font-size:11px;color:#64748b}.fc-chat-state.failed{color:var(--fc-red)}.fc-compose{border-top:1px solid var(--fc-line);padding:18px;background:#fafbff}.fc-compose textarea{width:100%;min-height:96px;border:1px solid var(--fc-line);border-radius:12px;background:#fff;resize:vertical;font:14px/1.5 Inter,ui-sans-serif,sans-serif;outline:0;padding:12px;margin:10px 0}.fc-compose textarea:focus{border-color:#a5b4fc;box-shadow:0 0 0 3px var(--fc-accent-soft)}.fc-compose-actions{display:flex;align-items:center;justify-content:space-between}.fc-note{font-size:10px;line-height:1.45;color:#94a3b8}
  .fc-empty{color:var(--fc-muted);padding:8px 0;font-size:13px;line-height:1.5}.fc-loading{min-height:70vh;display:grid;place-items:center;font:600 16px Inter,system-ui;background:var(--fc-bg)}
  @media(max-width:1180px){.fc-layout{grid-template-columns:1fr 1fr}.fc-side{grid-column:1/-1;position:static}.fc-honest{min-height:auto}}@media(max-width:760px){.fc{margin:-16px}.fc-layout{grid-template-columns:1fr;padding:14px}.fc-top{padding:12px 14px;flex-wrap:wrap}.fc-updated{display:none}.fc-company{font-size:18px}.fc-log{grid-template-columns:42px 68px 1fr}.fc-pre{margin-left:0}.fc-terminal-title small{display:none}}
`;

function money(cents: number) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100); }
function when(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString(); }
function time(value: string | null | undefined) { if (!value) return "--:--"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "--:--" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function Panel(props: { title: string; children: React.ReactNode; className?: string }) { return <section className={`fc-panel ${props.className ?? ""}`}><div className="fc-head">{props.title}</div><div className="fc-body">{props.children}</div></section>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="fc-empty">{children}</div>; }

export function ControlRoomPage({ context }: PluginPageProps) {
  const companyId = context.companyId ?? "";
  const navigation = useHostNavigation();
  const { data: fetchedData, loading, error, refresh } = usePluginData<Snapshot>("control-room", { companyId });
  const [lastData, setLastData] = useState<Snapshot | null>(null);
  const data = fetchedData ?? (lastData?.company.id === companyId ? lastData : null);
  const invokeCeo = usePluginAction("invoke-ceo");
  const askCeo = usePluginAction("ask-ceo");
  const [busy, setBusy] = useState<"run" | "chat" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (fetchedData) setLastData(fetchedData);
  }, [fetchedData]);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const sync = async () => {
      if (!active || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      setSyncing(true);
      try {
        await refresh();
        if (active) setSyncError(null);
      } catch (err) {
        if (active) setSyncError(err instanceof Error ? err.message : String(err));
      } finally {
        inFlight = false;
        if (active) setSyncing(false);
      }
    };
    const timer = window.setInterval(() => void sync(), 5_000);
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);
  const activityRows = useMemo(() => {
    if (!data) return [];
    const eventRows = data.runEvents
      .filter((event) => event.message)
      .map((event) => ({
        id: `live-${event.id}`, at: event.createdAt, label: event.stream?.toUpperCase() ?? event.eventType.toUpperCase(),
        bad: event.level === "error" || event.stream === "stderr", actor: data.agentNames[event.agentId] ?? "Unknown agent",
        text: event.message ?? event.eventType, excerpt: null as string | null,
      }));
    const runRows = data.runs.map((run) => ({
      id: `run-${run.id}`, at: run.startedAt ?? run.createdAt, label: run.status === "failed" ? "FAIL" : run.status === "running" ? "RUN" : "DONE",
      bad: run.status === "failed", actor: data.agentNames[run.agentId] ?? "Unknown agent",
      text: `${run.invocationSource} · ${run.status}${run.errorCode ? ` · ${run.errorCode}` : ""}`,
      excerpt: run.stderrExcerpt || run.stdoutExcerpt,
    }));
    const auditRows = data.activity.map((entry) => ({ id: `event-${entry.id}`, at: entry.createdAt, label: entry.actorType.toUpperCase(), bad: false, actor: entry.agentId ? data.agentNames[entry.agentId] ?? entry.actorType : entry.actorType, text: `${entry.action} · ${entry.entityType}`, excerpt: null as string | null }));
    return [...eventRows, ...runRows, ...auditRows].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 28);
  }, [data]);

  async function runCeo() {
    setBusy("run"); setActionError(null);
    try { await invokeCeo({ companyId }); await refresh(); } catch (err) { setActionError(err instanceof Error ? err.message : String(err)); } finally { setBusy(null); }
  }
  async function send() {
    const value = prompt.trim(); if (!value) return;
    setBusy("chat"); setActionError(null);
    try { await askCeo({ companyId, prompt: value }); setPrompt(""); await refresh(); } catch (err) { setActionError(err instanceof Error ? err.message : String(err)); } finally { setBusy(null); }
  }

  if (loading && !data) return <><style>{css}</style><main className="fc-loading">Loading live company state…</main></>;
  if (!data) return <><style>{css}</style><main className="fc-loading fc-error">Foundry could not load live data: {error?.message ?? "No company data returned"}</main></>;
  const spentRatio = data.company.budgetMonthlyCents > 0 ? Math.min(100, (data.company.spentMonthlyCents / data.company.budgetMonthlyCents) * 100) : 0;
  const activeGoal = data.goals.find((goal) => goal.status === "active");
  const settingsPath = "/company/settings/instance/plugins";

  return <><style>{css}</style><main className="fc">
    <header className="fc-top"><span className="fc-brand">Foundry</span><span className="fc-company">{data.company.name}</span><span className="fc-handle">{data.company.issuePrefix}</span><span className="fc-status">{data.company.status}</span><span className="fc-updated"><span className={`fc-sync-dot ${syncError ? "off" : ""}`}/>{syncError ? "SYNC ISSUE" : syncing ? "SYNCING" : "LIVE · 5S SYNC"}<small>{when(data.generatedAt)}</small></span></header>
    <div className="fc-layout">
      <div className="fc-col">
        <section className="fc-terminal"><div className="fc-terminal-title"><span>Live operations</span><small>all agents · run events · audit trail</small></div><div className="fc-runbar"><span className="fc-dot"/> {data.counts.activeRuns > 0 ? `${data.counts.activeRuns} running` : "System idle"}<span>{data.agents.length} agents</span><span>{data.counts.activeIssues} active tasks</span><span>{money(data.company.spentMonthlyCents)} spent</span></div>{activityRows.length === 0 ? <Empty>No runs or audit events recorded yet.</Empty> : activityRows.map((row) => <div key={row.id}><div className="fc-log"><time>{time(row.at)}</time><b className={row.bad ? "bad" : ""}>{row.label}</b><span>{row.actor} — {row.text}</span></div>{row.excerpt && <pre className="fc-pre">{row.excerpt}</pre>}</div>)}</section>
        <Panel title="Command center"><div className="fc-buttons"><button className="run" onClick={() => void runCeo()} disabled={!data.ceo || busy !== null}>{busy === "run" ? "Starting…" : "Run CEO"}</button><a className="fc-btn" {...navigation.linkProps("/agents")}>Agents</a><a className="fc-btn" {...navigation.linkProps("/issues")}>Tasks</a><button onClick={() => void refresh()} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</button></div>{!data.ceo && <p className="fc-error">No CEO agent is configured.</p>}{(actionError || syncError) && <p className="fc-error">{actionError ?? syncError}</p>}</Panel>
        <Panel title="Engine"><div className="fc-kicker">Current execution</div><div className="fc-big">{data.counts.activeRuns}</div><div className="fc-muted">active or queued runs</div><hr className="fc-rule"/><div className="fc-row"><span>OpenCode agents</span><strong>{data.counts.connectedOpenCodeAgents}</strong></div><div className="fc-row"><span>Recent failed runs</span><strong className={data.counts.failedRuns ? "fc-error" : ""}>{data.counts.failedRuns}</strong></div><div className="fc-row"><span>Last CEO heartbeat</span><strong>{when(data.ceo?.lastHeartbeatAt)}</strong></div></Panel>
        <Panel title="Tasks"><div className="fc-buttons"><a className="fc-btn" {...navigation.linkProps("/issues")}>+ New task</a></div><hr className="fc-rule"/>{data.issues.slice(0, 8).map((issue) => <div className="fc-row" key={issue.id}><span><strong>{issue.identifier ?? "TASK"}</strong><br/>{issue.title}</span><span className="fc-tag">{issue.status.replaceAll("_", " ")}</span></div>)}{data.issues.length === 0 && <Empty>No tasks exist.</Empty>}<p className="fc-muted">{data.counts.completedIssues} finished · {data.counts.activeIssues} active</p></Panel>
        <Panel title="Company spend"><div className="fc-kicker">Paperclip spend this month</div><div className="fc-money">{money(data.company.spentMonthlyCents)}</div><div className="fc-meter"><span style={{ width: `${spentRatio}%` }}/></div><p>{data.company.budgetMonthlyCents > 0 ? `${money(data.company.budgetMonthlyCents)} monthly budget` : "No monthly budget configured"}</p><p className="fc-note">This is actual agent spend, not customer revenue. Revenue is not shown until a payment data source is connected.</p></Panel>
        <Panel title="Milestone">{activeGoal ? <><div className="fc-kicker">Active goal</div><h2>{activeGoal.title}</h2><p>{activeGoal.description}</p></> : <Empty>No active goal is set. Create one in Paperclip to give the company a north star.</Empty>}</Panel>
      </div>
      <div className="fc-col">
        <Panel title="Agent connections">{data.agents.map((agent) => <div className="fc-row" key={agent.id}><span><span className={`fc-dot ${agent.status === "paused" || agent.status === "error" ? "off" : ""}`}/><strong>{agent.name}</strong><br/><span className="fc-muted">{agent.adapterType} · {agent.role}</span></span><span className="fc-tag">{agent.status}</span></div>)}{data.agents.length === 0 && <Empty>No agents configured.</Empty>}<p className="fc-note">“Connected” means configured in Paperclip. MCP availability is proven per run in activity/tool audit, not inferred from this card.</p></Panel>
        <Panel title="Integrations">{Object.entries(data.integrations).map(([name, status]) => <div className="fc-row" key={name}><span><span className={`fc-dot ${status.configured ? "" : "off"}`}/>{name}</span><strong>{status.configured ? "Configured" : "Not configured"}</strong></div>)}<a className="fc-btn" {...navigation.linkProps(settingsPath)}>Plugin settings</a></Panel>
        <Panel title="Website">{data.integrations.website.configured && data.integrations.website.url ? <><div className="fc-site"><span className="fc-dot"/><a href={data.integrations.website.url} target="_blank" rel="noopener noreferrer">{data.integrations.website.url}</a></div><div className="fc-site-frame"><iframe title="Production website preview" src={data.integrations.website.url}/></div></> : <Empty>No production URL configured. Add the real URL in Foundry plugin settings after deployment.</Empty>}</Panel>
        <Panel title="Analytics"><Empty>No analytics source is connected. Foundry will not invent pageviews, visitors, or sessions.</Empty></Panel>
        <Panel title="Documents">{data.documents.slice(0, 12).map((document) => <div className="fc-row" key={document.id}><span><strong>{document.title ?? document.key}</strong><br/><span className="fc-muted">{document.issueIdentifier ?? document.issueTitle}</span></span><time>{when(document.updatedAt)}</time></div>)}{data.documents.length === 0 && <Empty>No issue documents exist.</Empty>}</Panel>
        <Panel title="Project workspaces">{data.workspaces.map((workspace) => <div className="fc-card" key={workspace.id}><strong>{workspace.projectName} / {workspace.name}</strong><p className="fc-muted">{workspace.repoUrl ?? workspace.path}</p><span className="fc-tag">{workspace.isPrimary ? "primary" : "workspace"}</span></div>)}{data.workspaces.length === 0 && <Empty>No project workspaces configured. Agents cannot reliably build without one.</Empty>}</Panel>
      </div>
      <aside className="fc-col fc-side">
        <section className="fc-panel"><div className="fc-chat-head"><span className="fc-eyebrow">Founder channel</span><h2>{data.ceo ? `Chat with ${data.ceo.name}` : "CEO unavailable"}</h2><span className="fc-note">Messages and run outcomes are stored in this company. Replies are real CEO-run summaries.</span></div><div className="fc-chat">{data.chatMessages.length === 0 ? <Empty>Start a conversation with your CEO. The reply will appear here once the real agent run completes.</Empty> : data.chatMessages.map((message) => <div className={`fc-message ${message.role}`} key={message.id}><span className="fc-message-meta">{message.role === "founder" ? "You" : message.role === "ceo" ? data.ceo?.name ?? "CEO" : "System"} · {when(message.createdAt)}</span>{message.body && <div className="fc-bubble">{message.body}</div>}{message.status === "queued" || message.status === "running" ? <span className="fc-chat-state">CEO run {message.status}…</span> : null}{message.error ? <span className="fc-chat-state failed">{message.error}</span> : null}</div>)}</div><div className="fc-compose"><div className="fc-kicker">Message the CEO</div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={data.ceo ? `Message ${data.ceo.name}…` : "No CEO configured"} disabled={!data.ceo || busy !== null}/><div className="fc-compose-actions"><span className="fc-note">Starts a real Paperclip CEO run</span><button className="primary" onClick={() => void send()} disabled={!data.ceo || !prompt.trim() || busy !== null}>{busy === "chat" ? "Sending…" : "Send"}</button></div></div></section>
      </aside>
    </div>
  </main></>;
}
