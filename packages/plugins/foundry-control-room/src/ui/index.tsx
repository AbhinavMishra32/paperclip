import { useMemo, useState } from "react";
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
type Run = { id: string; agentId: string; status: string; invocationSource: string; startedAt: string | null; finishedAt: string | null; createdAt: string; errorCode: string | null; stdoutExcerpt: string | null; stderrExcerpt: string | null };
type Activity = { id: string; actorType: string; actorId: string; action: string; agentId: string | null; entityType: string; entityId: string; createdAt: string; details: Record<string, unknown> | null };
type Workspace = { id: string; name: string; projectName: string; path: string; repoUrl: string | null; isPrimary: boolean };
type Document = { id: string; key: string; title: string | null; issueIdentifier: string | null; issueTitle: string; updatedAt: string };
type Integration = { configured: boolean; url?: string | null; projectConfigured?: boolean };
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
  workspaces: Workspace[];
  documents: Document[];
  integrations: { website: Integration; stripe: Integration; vercel: Integration; analytics: Integration; email: Integration };
  counts: { activeIssues: number; completedIssues: number; failedRuns: number; activeRuns: number; connectedOpenCodeAgents: number };
  honestRead: string[];
};

const css = `
  :root{--fc-paper:#f4eee1;--fc-ink:#181716;--fc-teal:#4ca39d;--fc-teal-dark:#286f6c;--fc-lav:#c6cbef;--fc-green:#dcefd6;--fc-red:#b84d45;--fc-muted:#817b70}
  .fc{min-height:100vh;color:var(--fc-ink);background-color:#e5e7fb;background-image:radial-gradient(var(--fc-lav) 1.5px,transparent 1.5px);background-size:10px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;margin:-24px;padding:0 0 48px}
  .fc *{box-sizing:border-box}.fc-top{position:sticky;top:0;z-index:5;background:var(--fc-paper);border-top:3px solid var(--fc-ink);border-bottom:3px solid var(--fc-ink);padding:15px 28px;display:flex;align-items:center;gap:18px}.fc-brand{font:italic 23px Georgia,serif}.fc-company{font:28px Georgia,serif}.fc-handle{color:var(--fc-muted)}
  .fc-status{border:3px solid #3d7c4f;background:var(--fc-green);color:#326d44;padding:7px 12px;text-transform:uppercase;font-weight:800;letter-spacing:.08em}.fc-updated{margin-left:auto;color:var(--fc-muted);font-size:12px}
  .fc-layout{display:grid;grid-template-columns:minmax(340px,1fr) minmax(380px,1.08fr) minmax(330px,.75fr);gap:22px;padding:22px 28px;align-items:start}.fc-col{display:grid;gap:22px}.fc-side{position:sticky;top:92px}
  .fc-panel{background:var(--fc-paper);border:3px solid var(--fc-ink);box-shadow:6px 7px 0 var(--fc-ink)}.fc-head{height:38px;border-bottom:3px solid var(--fc-ink);display:flex;align-items:center;padding:0 13px;font-weight:900;letter-spacing:.09em;text-transform:uppercase}.fc-head:before{content:'□';font-size:25px;margin-right:10px}.fc-body{padding:18px}
  .fc-terminal{background:#151412;color:#67aaa3;padding:19px 22px;min-height:330px;border:3px solid var(--fc-ink);box-shadow:6px 7px 0 var(--fc-ink)}.fc-terminal-title{color:#f3eee5;border-bottom:2px solid #050505;padding-bottom:12px;font-weight:900;letter-spacing:.12em}.fc-runbar{padding:15px 0;border-bottom:1px solid #383530;text-transform:uppercase;letter-spacing:.08em}.fc-log{display:grid;grid-template-columns:55px 90px 1fr;gap:8px;margin-top:11px;line-height:1.35;font-size:12px}.fc-log time{color:#6b8b87}.fc-log b{color:#c79b4b}.fc-log .bad{color:#e17a70}.fc-pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#8aa7a2;margin:3px 0 10px 153px;font-size:11px;max-height:54px;overflow:hidden}
  .fc-buttons{display:flex;flex-wrap:wrap;gap:12px}.fc button,.fc-btn{font:700 12px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:var(--fc-ink);background:#f7f2e8;border:3px solid var(--fc-ink);box-shadow:4px 5px 0 var(--fc-ink);padding:12px 16px;cursor:pointer;text-decoration:none}.fc button:hover,.fc-btn:hover{background:#fff}.fc button:disabled{opacity:.45;cursor:not-allowed}.fc button.primary{background:var(--fc-teal);color:white}.fc button.run{background:var(--fc-green);color:#326d44}
  .fc-kicker{text-transform:uppercase;letter-spacing:.1em;color:var(--fc-muted);font-size:12px}.fc-big{font:58px Georgia,serif;margin:7px 0}.fc-meter{height:17px;border:3px solid var(--fc-ink);padding:2px}.fc-meter span{display:block;height:100%;background:var(--fc-teal)}.fc-rule{border:0;border-top:1px solid #c9c0ae;margin:18px 0}.fc-muted{color:var(--fc-muted)}.fc-error{color:var(--fc-red)}
  .fc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #c9c0ae}.fc-row:last-child{border:0}.fc-tag{border:2px solid var(--fc-ink);padding:3px 7px;font-size:10px;text-transform:uppercase}.fc-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--fc-teal);margin-right:9px}.fc-dot.off{background:#aaa}.fc-money{font:52px Georgia,serif}.fc-card{border:3px solid var(--fc-ink);padding:14px;margin-top:12px}.fc-site{font:23px Georgia,serif;overflow-wrap:anywhere}.fc-site-frame{height:190px;border:3px solid var(--fc-ink);margin-top:15px;background:#fff}.fc-site-frame iframe{width:100%;height:100%;border:0}
  .fc-honest{padding:30px 28px;min-height:510px}.fc-honest h2{font:700 27px system-ui,sans-serif;margin:7px 0 25px}.fc-honest li{font:17px/1.65 system-ui,sans-serif;margin-bottom:13px}.fc-honest p{font:16px/1.65 system-ui,sans-serif}.fc-compose{border-top:3px solid var(--fc-ink);padding:16px}.fc-compose textarea{width:100%;min-height:88px;border:0;background:transparent;resize:vertical;font:16px/1.4 system-ui,sans-serif;outline:0}.fc-compose-actions{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #c9c0ae;padding-top:12px}.fc-note{font-size:11px;color:var(--fc-muted)}
  .fc-empty{color:var(--fc-muted);padding:8px 0}.fc-loading{min-height:70vh;display:grid;place-items:center;font:20px ui-monospace,monospace;background:var(--fc-paper)}
  @media(max-width:1180px){.fc-layout{grid-template-columns:1fr 1fr}.fc-side{grid-column:1/-1;position:static}.fc-honest{min-height:auto}}@media(max-width:760px){.fc{margin:-16px}.fc-layout{grid-template-columns:1fr;padding:14px}.fc-top{padding:12px 14px;flex-wrap:wrap}.fc-updated{display:none}.fc-company{font-size:22px}.fc-log{grid-template-columns:42px 70px 1fr}.fc-pre{margin-left:0}}
`;

function money(cents: number) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100); }
function when(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString(); }
function time(value: string | null | undefined) { if (!value) return "--:--"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "--:--" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function Panel(props: { title: string; children: React.ReactNode; className?: string }) { return <section className={`fc-panel ${props.className ?? ""}`}><div className="fc-head">{props.title}</div><div className="fc-body">{props.children}</div></section>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="fc-empty">{children}</div>; }

export function ControlRoomPage({ context }: PluginPageProps) {
  const companyId = context.companyId ?? "";
  const navigation = useHostNavigation();
  const { data, loading, error, refresh } = usePluginData<Snapshot>("control-room", { companyId });
  const invokeCeo = usePluginAction("invoke-ceo");
  const askCeo = usePluginAction("ask-ceo");
  const [busy, setBusy] = useState<"run" | "chat" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const activityRows = useMemo(() => {
    if (!data) return [];
    const runRows = data.runs.map((run) => ({
      id: `run-${run.id}`, at: run.startedAt ?? run.createdAt, label: run.status === "failed" ? "FAIL" : run.status === "running" ? "RUN" : "DONE",
      bad: run.status === "failed", actor: data.agentNames[run.agentId] ?? "Unknown agent",
      text: `${run.invocationSource} · ${run.status}${run.errorCode ? ` · ${run.errorCode}` : ""}`,
      excerpt: run.stderrExcerpt || run.stdoutExcerpt,
    }));
    const auditRows = data.activity.map((entry) => ({ id: `event-${entry.id}`, at: entry.createdAt, label: entry.actorType.toUpperCase(), bad: false, actor: entry.agentId ? data.agentNames[entry.agentId] ?? entry.actorType : entry.actorType, text: `${entry.action} · ${entry.entityType}`, excerpt: null as string | null }));
    return [...runRows, ...auditRows].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 18);
  }, [data]);

  async function runCeo() {
    setBusy("run"); setActionError(null);
    try { await invokeCeo({ companyId }); await refresh(); } catch (err) { setActionError(err instanceof Error ? err.message : String(err)); } finally { setBusy(null); }
  }
  async function send() {
    const value = prompt.trim(); if (!value) return;
    setBusy("chat"); setActionError(null);
    try { await askCeo({ companyId, prompt: value }); setPrompt(""); } catch (err) { setActionError(err instanceof Error ? err.message : String(err)); } finally { setBusy(null); }
  }

  if (loading) return <><style>{css}</style><main className="fc-loading">Loading live company state…</main></>;
  if (error || !data) return <><style>{css}</style><main className="fc-loading fc-error">Foundry could not load live data: {error?.message ?? "No company data returned"}</main></>;
  const spentRatio = data.company.budgetMonthlyCents > 0 ? Math.min(100, (data.company.spentMonthlyCents / data.company.budgetMonthlyCents) * 100) : 0;
  const activeGoal = data.goals.find((goal) => goal.status === "active");
  const settingsPath = "/company/settings/instance/plugins";

  return <><style>{css}</style><main className="fc">
    <header className="fc-top"><span className="fc-brand">Foundry</span><span className="fc-company">{data.company.name}</span><span className="fc-handle">@{data.company.issuePrefix.toLowerCase()}</span><span className="fc-status">{data.company.status}</span><span className="fc-updated">LIVE DATA · {when(data.generatedAt)}</span></header>
    <div className="fc-layout">
      <div className="fc-col">
        <section className="fc-terminal"><div className="fc-terminal-title">□ ALL-AGENT ACTIVITY</div><div className="fc-runbar"><span className="fc-dot"/> {data.counts.activeRuns > 0 ? `${data.counts.activeRuns} RUNNING` : "IDLE"} · {data.agents.length} AGENTS · {data.counts.activeIssues} ACTIVE TASKS · {money(data.company.spentMonthlyCents)} SPENT</div>{activityRows.length === 0 ? <Empty>No runs or audit events recorded yet.</Empty> : activityRows.map((row) => <div key={row.id}><div className="fc-log"><time>{time(row.at)}</time><b className={row.bad ? "bad" : ""}>[{row.label}]</b><span>{row.actor} — {row.text}</span></div>{row.excerpt && <pre className="fc-pre">{row.excerpt}</pre>}</div>)}</section>
        <Panel title="Controls"><div className="fc-buttons"><button className="run" onClick={() => void runCeo()} disabled={!data.ceo || busy !== null}>{busy === "run" ? "Starting…" : "Run CEO"}</button><a className="fc-btn" {...navigation.linkProps("/agents")}>Agents</a><a className="fc-btn" {...navigation.linkProps("/issues")}>Tasks</a><button onClick={() => void refresh()}>Refresh</button></div>{!data.ceo && <p className="fc-error">No CEO agent is configured.</p>}{actionError && <p className="fc-error">{actionError}</p>}</Panel>
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
        <section className="fc-panel"><div className="fc-honest"><h2>⚠ The Honest Read</h2><ul>{data.honestRead.map((item) => <li key={item}>{item}</li>)}</ul><h2>🎯 What I’d Do Next</h2><ol>{!activeGoal && <li>Set one active company goal.</li>}{data.counts.failedRuns > 0 && <li>Open the failed runs and fix the first repeated failure.</li>}{data.workspaces.length === 0 && <li>Bind a real git project workspace.</li>}{!data.integrations.website.configured && <li>Configure the deployed website URL.</li>}<li>Ask the CEO to choose and execute the highest-impact evidence-backed action.</li></ol></div><div className="fc-compose"><div className="fc-kicker">Compose to CEO</div><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={data.ceo ? `Message ${data.ceo.name}…` : "No CEO configured"} disabled={!data.ceo || busy !== null}/><div className="fc-compose-actions"><span className="fc-note">Starts or reuses a real agent session</span><button className="primary" onClick={() => void send()} disabled={!data.ceo || !prompt.trim() || busy !== null}>{busy === "chat" ? "Sending…" : "Send ↵"}</button></div></div></section>
      </aside>
    </div>
  </main></>;
}
