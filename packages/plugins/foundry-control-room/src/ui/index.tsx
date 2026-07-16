import { useEffect, useMemo, useRef, useState } from "react";
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
type Document = { id: string; key: string; title: string | null; issueId: string; issueIdentifier: string | null; issueTitle: string; updatedAt: string };
type Integration = { configured: boolean; url?: string | null; projectConfigured?: boolean };
type FounderCeoMessage = { id: string; agentId: string | null; role: "founder" | "ceo" | "system"; body: string; status: "queued" | "running" | "completed" | "failed"; runId: string | null; error: string | null; createdAt: string; updatedAt: string };
type ToolEvent = { id: string; agentId: string | null; runId: string | null; toolName: string; status: "running" | "succeeded" | "failed"; summary: string | null; error: string | null; metadata: Record<string, unknown>; createdAt: string; updatedAt: string };
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
  toolEvents: ToolEvent[];
  workspaces: Workspace[];
  documents: Document[];
  integrations: Record<string, Integration>;
  integrationSettings: { websiteUrl: string; vercelProjectId: string; vercelTeamId: string };
  counts: { activeIssues: number; completedIssues: number; failedRuns: number; activeRuns: number; connectedOpenCodeAgents: number };
  honestRead: string[];
};

type ActivityRow = { id: string; at: string; kind: "error" | "run" | "done" | "audit"; label: string; actor: string; text: string; excerpt: string | null };

const css = `
  :root{
    --fc-bg:#f3f5f9; --fc-surface:#fff; --fc-ink:#0f1729; --fc-muted:#64748b; --fc-faint:#94a3b8;
    --fc-line:#e4e9f1; --fc-accent:#5b52f3; --fc-accent-2:#8b7dfb; --fc-accent-soft:#edebff;
    --fc-cyan:#0ea5a3; --fc-green:#16a34a; --fc-amber:#d97706; --fc-red:#e0384a;
    --fc-shadow:0 1px 2px rgba(15,23,42,.04),0 18px 40px -18px rgba(30,41,59,.16);
    --fc-shadow-lg:0 1px 2px rgba(15,23,42,.05),0 30px 70px -24px rgba(30,41,59,.28);
    --fc-radius:16px;
  }
  @media(prefers-reduced-motion:reduce){.fc *{animation-duration:.001ms !important;transition-duration:.001ms !important}}
  .fc{min-height:100vh;color:var(--fc-ink);
    background:
      radial-gradient(760px 420px at 6% -6%,rgba(91,82,243,.10),transparent 60%),
      radial-gradient(620px 380px at 96% 4%,rgba(14,165,163,.09),transparent 55%),
      var(--fc-bg);
    font-family:"Inter var",Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    margin:-24px;padding:0 0 64px;
  }
  .fc *{box-sizing:border-box}
  .fc ::selection{background:var(--fc-accent-soft);color:var(--fc-ink)}

  .fc-top{position:sticky;top:0;z-index:8;background:rgba(255,255,255,.82);backdrop-filter:blur(20px) saturate(1.4);
    border-bottom:1px solid rgba(226,232,240,.9);padding:16px 30px;display:flex;align-items:center;gap:13px}
  .fc-mark{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;
    background:linear-gradient(150deg,var(--fc-accent),var(--fc-accent-2));box-shadow:0 6px 16px -4px rgba(91,82,243,.55)}
  .fc-brand{font-size:16px;font-weight:800;letter-spacing:-.03em;color:var(--fc-ink)}
  .fc-sep{color:#cbd5e1;font-weight:400}
  .fc-company{font-size:16px;font-weight:650;letter-spacing:-.02em;color:var(--fc-ink)}
  .fc-handle{font:700 10.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--fc-muted);
    background:#eef1f6;border:1px solid var(--fc-line);border-radius:7px;padding:4px 8px;letter-spacing:.02em}
  .fc-status{border:1px solid #bbf0d1;background:#eefdf4;color:#0f7a44;border-radius:999px;padding:4px 10px;
    text-transform:capitalize;font-size:10.5px;font-weight:750;letter-spacing:.02em}
  .fc-updated{margin-left:auto;color:var(--fc-muted);font-size:10.5px;font-weight:650;
    display:flex;align-items:center;gap:8px}
  .fc-updated small{color:var(--fc-faint);font-weight:500}
  .fc-livepulse{position:relative;width:7px;height:7px;border-radius:50%;background:var(--fc-green);flex:none}
  .fc-livepulse:after{content:'';position:absolute;inset:-5px;border-radius:50%;border:1.5px solid var(--fc-green);
    opacity:.55;animation:fc-ring 2.1s ease-out infinite}
  .fc-livepulse.off{background:var(--fc-red)}.fc-livepulse.off:after{border-color:var(--fc-red)}
  @keyframes fc-ring{0%{transform:scale(.4);opacity:.7}100%{transform:scale(2.1);opacity:0}}

  .fc-layout{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(380px,1.08fr) minmax(320px,.78fr);
    gap:20px;padding:26px 30px;align-items:start;max-width:1720px;margin:0 auto}
  .fc-col{display:grid;gap:20px}.fc-side{position:sticky;top:88px}

  .fc-panel{background:var(--fc-surface);border:1px solid var(--fc-line);border-radius:var(--fc-radius);
    box-shadow:var(--fc-shadow);overflow:hidden;animation:fc-rise .4s cubic-bezier(.16,1,.3,1) both}
  @keyframes fc-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .fc-head{min-height:46px;border-bottom:1px solid var(--fc-line);display:flex;align-items:center;gap:9px;
    padding:0 18px;font-size:11.5px;font-weight:750;letter-spacing:.03em;color:#334155}
  .fc-head svg{flex:none;color:var(--fc-muted)}
  .fc-body{padding:18px}

  /* ---- terminal ---- */
  .fc-term{background:linear-gradient(160deg,#131a2b,#0a0f1c 62%);border:1px solid #1f2a40;border-radius:18px;
    box-shadow:var(--fc-shadow-lg);overflow:hidden;position:relative;animation:fc-rise .4s cubic-bezier(.16,1,.3,1) both}
  .fc-term:before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.5;background:
    repeating-linear-gradient(0deg,rgba(255,255,255,.014) 0px,rgba(255,255,255,.014) 1px,transparent 1px,transparent 3px)}
  .fc-term-bar{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid #1c2740;
    background:rgba(255,255,255,.015)}
  .fc-term-dots{display:flex;gap:6.5px;flex:none}
  .fc-term-dots i{width:10px;height:10px;border-radius:50%;display:block}
  .fc-term-dots i:nth-child(1){background:#ff5f57}.fc-term-dots i:nth-child(2){background:#febc2e}.fc-term-dots i:nth-child(3){background:#28c840}
  .fc-term-title{font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b96ad;letter-spacing:.01em}
  .fc-term-title b{color:#e2e8f5;font-weight:650}
  .fc-term-meta{margin-left:auto;display:flex;align-items:center;gap:14px;font:700 10px ui-monospace,SFMono-Regular,monospace;
    color:#647089;text-transform:uppercase;letter-spacing:.05em}
  .fc-term-meta strong{color:#c3cbe0;font-weight:700}
  .fc-term-body{max-height:452px;min-height:452px;overflow-y:auto;padding:14px 18px 10px;position:relative;
    scrollbar-width:thin;scrollbar-color:#2c3854 transparent}
  .fc-term-body::-webkit-scrollbar{width:8px}.fc-term-body::-webkit-scrollbar-thumb{background:#26314a;border-radius:99px}
  .fc-term-body::-webkit-scrollbar-track{background:transparent}
  .fc-line{display:grid;grid-template-columns:60px 78px 1fr;column-gap:10px;align-items:start;padding:2px 0;
    font:12px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;animation:fc-line-in .3s ease both}
  @keyframes fc-line-in{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
  .fc-line time{color:#4b5872}
  .fc-line .fc-tag{border-radius:4px;padding:1px 5px;font-weight:750;font-size:10.5px;letter-spacing:.03em;justify-self:start;white-space:nowrap;line-height:1.5}
  .fc-line .fc-tag.error{color:#ff9c9c;background:rgba(224,56,74,.14)}
  .fc-line .fc-tag.run{color:#8fd8ff;background:rgba(56,155,224,.14)}
  .fc-line .fc-tag.done{color:#8ef0b8;background:rgba(22,163,74,.16)}
  .fc-line .fc-tag.audit{color:#c9b8ff;background:rgba(139,125,251,.15)}
  .fc-line .fc-msg{color:#c7cfe2;overflow-wrap:anywhere}
  .fc-line .fc-msg b{color:#eef1f8;font-weight:600}
  .fc-line.error .fc-msg{color:#ffcaca}
  .fc-pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#7c879e;margin:2px 0 12px 148px;
    font:10.5px/1.5 ui-monospace,SFMono-Regular,monospace;max-height:64px;overflow:hidden;
    border-left:2px solid #263050;padding-left:9px}
  .fc-cursor{display:inline-block;width:7px;height:14px;background:#8fd8ff;margin-left:2px;vertical-align:-2px;
    animation:fc-blink 1.05s steps(1) infinite}
  @keyframes fc-blink{0%,49%{opacity:1}50%,100%{opacity:0}}
  .fc-term-prompt{display:flex;align-items:center;gap:7px;padding:4px 0 2px;font:12px ui-monospace,SFMono-Regular,monospace;color:#6d798f}
  .fc-term-prompt .fc-prompt-user{color:#8fd8ff}.fc-term-prompt .fc-prompt-path{color:#c9b8ff}
  .fc-term-jump{position:absolute;right:16px;bottom:14px;font:700 10.5px Inter,sans-serif;color:#0a0f1c;
    background:#c9d2ea;border:0;border-radius:99px;padding:6px 11px;cursor:pointer;box-shadow:0 8px 20px -6px rgba(0,0,0,.5);
    display:flex;align-items:center;gap:5px;opacity:.96}
  .fc-term-jump:hover{background:#fff}

  .fc-buttons{display:flex;flex-wrap:wrap;gap:9px}
  .fc button,.fc-btn{font:700 12px Inter,ui-sans-serif,sans-serif;color:#334155;background:#fff;border:1px solid #dde3ee;
    border-radius:10px;padding:9px 13px;cursor:pointer;text-decoration:none;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease;
    display:inline-flex;align-items:center;gap:6px}
  .fc button:hover,.fc-btn:hover{border-color:#b9c3d6;transform:translateY(-1px);box-shadow:0 8px 18px -6px rgba(15,23,42,.16)}
  .fc button:active,.fc-btn:active{transform:translateY(0)}
  .fc button:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:none}
  .fc button.primary{background:linear-gradient(155deg,var(--fc-accent),#4740d6);border-color:transparent;color:#fff}
  .fc button.run{background:linear-gradient(155deg,#161f33,#0a0f1c);border-color:#0a0f1c;color:#dfe6f7}

  .fc-kicker,.fc-eyebrow{text-transform:uppercase;letter-spacing:.085em;color:var(--fc-faint);font-size:10px;font-weight:750}
  .fc-big{font-size:50px;font-weight:750;letter-spacing:-.055em;margin:5px 0;font-variant-numeric:tabular-nums}
  .fc-meter{height:7px;border-radius:99px;background:#e8edf4;overflow:hidden}
  .fc-meter span{display:block;height:100%;background:linear-gradient(90deg,var(--fc-accent),var(--fc-cyan));
    border-radius:inherit;transition:width .5s ease}
  .fc-rule{border:0;border-top:1px solid var(--fc-line);margin:16px 0}
  .fc-muted{color:var(--fc-muted)}.fc-error{color:var(--fc-red)}

  .fc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 0;
    border-bottom:1px solid var(--fc-line);font-size:13px;transition:background .15s ease}
  .fc-row:last-child{border:0}
  a.fc-row{margin:0 -8px;padding:11px 8px;border-radius:9px}a.fc-row:hover{background:#f7f8fc}
  .fc-tag{border:1px solid #dde3ee;background:#f8fafc;color:#475569;border-radius:999px;padding:3px 8px;
    font-size:9px;font-weight:800;text-transform:uppercase;white-space:nowrap;letter-spacing:.03em}
  .fc-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--fc-cyan);margin-right:9px;
    box-shadow:0 0 0 3px rgba(14,165,163,.12)}
  .fc-dot.off{background:#b6c0d1;box-shadow:none}
  .fc-money{font-size:42px;font-weight:750;letter-spacing:-.05em;font-variant-numeric:tabular-nums}
  .fc-card{border:1px solid var(--fc-line);background:#f8fafc;border-radius:12px;padding:13px;margin-top:9px;transition:border-color .15s ease}
  .fc-card:hover{border-color:#c7d0e0}
  .fc-site{font-size:13.5px;font-weight:650;overflow-wrap:anywhere}.fc-site a{color:var(--fc-accent);text-decoration:none}
  .fc-site-frame{height:210px;border:1px solid var(--fc-line);border-radius:13px;margin-top:14px;background:#fff;overflow:hidden}
  .fc-site-frame iframe{width:100%;height:100%;border:0}

  .fc-chat-head{padding:20px 20px 13px;border-bottom:1px solid var(--fc-line)}
  .fc-chat-head h2{font-size:20px;letter-spacing:-.035em;margin:4px 0;font-weight:700}
  .fc-chat{display:grid;gap:12px;max-height:500px;overflow:auto;padding:17px 17px 8px;
    background:linear-gradient(180deg,#fff,#fafbff)}
  .fc-message{display:grid;gap:5px;max-width:92%;animation:fc-rise .3s ease both}
  .fc-message.founder{justify-self:end}.fc-message.ceo,.fc-message.system{justify-self:start}
  .fc-message-meta{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--fc-faint)}
  .fc-message.founder .fc-message-meta{text-align:right}
  .fc-bubble{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--fc-line);border-radius:14px;
    padding:10px 12px;font-size:13px;line-height:1.55;background:#fff;color:#334155}
  .fc-message.founder .fc-bubble{background:linear-gradient(155deg,var(--fc-accent),#4740d6);border-color:transparent;
    color:#fff;border-bottom-right-radius:4px}
  .fc-message.ceo .fc-bubble{border-bottom-left-radius:4px}
  .fc-chat-state{font-size:11px;color:var(--fc-muted)}.fc-chat-state.failed{color:var(--fc-red)}
  .fc-compose{border-top:1px solid var(--fc-line);padding:17px;background:#fafbff}
  .fc-compose textarea{width:100%;min-height:92px;border:1px solid var(--fc-line);border-radius:12px;background:#fff;
    resize:vertical;font:14px/1.5 Inter,ui-sans-serif,sans-serif;outline:0;padding:11px;margin:9px 0;transition:border-color .15s,box-shadow .15s}
  .fc-compose textarea:focus{border-color:#b7aefb;box-shadow:0 0 0 3px var(--fc-accent-soft)}
  .fc-compose-actions{display:flex;align-items:center;justify-content:space-between}
  .fc-note{font-size:10px;line-height:1.45;color:var(--fc-faint)}

  .fc-fields{display:grid;gap:9px;margin:13px 0}.fc-field{display:grid;gap:5px}
  .fc-field label{font-size:9.5px;font-weight:800;color:var(--fc-muted);text-transform:uppercase;letter-spacing:.06em}
  .fc-field input{width:100%;border:1px solid var(--fc-line);border-radius:10px;background:#fff;padding:9px 11px;
    font:12px Inter,ui-sans-serif,sans-serif;outline:0;transition:border-color .15s,box-shadow .15s}
  .fc-field input:focus{border-color:#b7aefb;box-shadow:0 0 0 3px var(--fc-accent-soft)}

  .fc-empty{color:var(--fc-muted);padding:8px 0;font-size:13px;line-height:1.5}
  .fc-loading{min-height:70vh;display:grid;place-items:center;font:600 15px Inter,system-ui;background:var(--fc-bg);gap:14px}
  .fc-spin{width:22px;height:22px;border-radius:50%;border:2.5px solid #dfe3ee;border-top-color:var(--fc-accent);animation:fc-spin .8s linear infinite}
  @keyframes fc-spin{to{transform:rotate(360deg)}}

  @media(max-width:1180px){.fc-layout{grid-template-columns:1fr 1fr}.fc-side{grid-column:1/-1;position:static}}
  @media(max-width:760px){.fc{margin:-16px}.fc-layout{grid-template-columns:1fr;padding:14px}
    .fc-top{padding:12px 14px;flex-wrap:wrap}.fc-updated{display:none}.fc-company{font-size:15px}
    .fc-line{grid-template-columns:46px 64px 1fr}.fc-pre{margin-left:0}.fc-term-meta{display:none}}
`;

function money(cents: number) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100); }
function when(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString(); }
function time(value: string | null | undefined) { if (!value) return "--:--:--"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "--:--:--" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

function Icon({ path }: { path: string }) {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}
const ICON = {
  bolt: "M13 2 3 14h7l-1 8 11-14h-7z",
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  plug: "M9 2v4M15 2v4M6 8h12v3a6 6 0 0 1-12 0zM8 19a3 3 0 0 0 3 3h2a3 3 0 0 0 3-3v-2H8z",
  globe: "M12 2a15 15 0 0 0 0 20 15 15 0 0 0 0-20zM2 12h20M3.5 7h17M3.5 17h17",
  chart: "M4 20V10M12 20V4M20 20v-7",
  doc: "M8 2h6l6 6v14H8zM14 2v6h6M11 13h6M11 17h6",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  chat: "M21 11.5a8.4 8.4 0 0 1-1 4 8.5 8.5 0 0 1-7.5 4.5 8.4 8.4 0 0 1-4-1L3 20l1-5.5a8.4 8.4 0 0 1-1-4A8.5 8.5 0 0 1 11.5 3a8.5 8.5 0 0 1 9.5 8.5z",
  dollar: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  terminal: "m4 17 6-5-6-5M12 19h8",
};

function Panel(props: { title: string; icon?: string; children: React.ReactNode; className?: string }) {
  return <section className={`fc-panel ${props.className ?? ""}`}>
    <div className="fc-head">{props.icon && <Icon path={props.icon} />}{props.title}</div>
    <div className="fc-body">{props.children}</div>
  </section>;
}
function Empty({ children }: { children: React.ReactNode }) { return <div className="fc-empty">{children}</div>; }

function Terminal({ rows, activeRuns, agentCount, syncing, syncError }: { rows: ActivityRow[]; activeRuns: number; agentCount: number; syncing: boolean; syncError: string | null }) {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  function handleScroll() {
    const el = bodyRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < 48;
    setShowJump(distance >= 48);
  }
  function jumpToBottom() {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottom.current = true;
    setShowJump(false);
  }
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [rows]);

  return <section className="fc-term">
    <div className="fc-term-bar">
      <div className="fc-term-dots"><i /><i /><i /></div>
      <span className="fc-term-title"><b>operations</b> — live company log</span>
      <span className="fc-term-meta">
        <span><strong>{activeRuns}</strong> running</span>
        <span><strong>{agentCount}</strong> agents</span>
      </span>
    </div>
    <div className="fc-term-body" ref={bodyRef} onScroll={handleScroll}>
      <div className="fc-term-prompt"><span className="fc-prompt-user">founder@foundry</span>:<span className="fc-prompt-path">~/activity</span>$ tail -f company.log</div>
      {rows.length === 0
        ? <Empty>No runs or audit events recorded yet.</Empty>
        : rows.map((row) => (
            <div key={row.id}>
              <div className={`fc-line ${row.kind === "error" ? "error" : ""}`}>
                <time>{time(row.at)}</time>
                <span className={`fc-tag ${row.kind}`}>{row.label}</span>
                <span className="fc-msg"><b>{row.actor}</b> — {row.text}</span>
              </div>
              {row.excerpt && <pre className="fc-pre">{row.excerpt}</pre>}
            </div>
          ))}
      <div className="fc-line" style={{ gridTemplateColumns: "60px 78px 1fr" }}>
        <time />
        <span />
        <span className="fc-prompt-user">▍<span className="fc-cursor" style={{ marginLeft: 0 }} /></span>
      </div>
    </div>
    {showJump && <button className="fc-term-jump" onClick={jumpToBottom}><Icon path="M12 5v14M5 12l7 7 7-7" />Jump to latest</button>}
  </section>;
}

export function ControlRoomPage({ context }: PluginPageProps) {
  const companyId = context.companyId ?? "";
  const navigation = useHostNavigation();
  const { data: fetchedData, loading, error, refresh } = usePluginData<Snapshot>("control-room", { companyId });
  const [lastData, setLastData] = useState<Snapshot | null>(null);
  const data = fetchedData ?? (lastData?.company.id === companyId ? lastData : null);
  const invokeCeo = usePluginAction("invoke-ceo");
  const askCeo = usePluginAction("ask-ceo");
  const setupCompany = usePluginAction("setup-company");
  const saveCompanyIntegrations = usePluginAction("save-company-integrations");
  const [busy, setBusy] = useState<"run" | "chat" | "setup" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [settingsCompanyId, setSettingsCompanyId] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [vercelProjectId, setVercelProjectId] = useState("");
  const [vercelTeamId, setVercelTeamId] = useState("");

  useEffect(() => {
    if (fetchedData) setLastData(fetchedData);
  }, [fetchedData]);

  useEffect(() => {
    if (!data || settingsCompanyId === data.company.id) return;
    setWebsiteUrl(data.integrationSettings.websiteUrl);
    setVercelProjectId(data.integrationSettings.vercelProjectId);
    setVercelTeamId(data.integrationSettings.vercelTeamId);
    setSettingsCompanyId(data.company.id);
  }, [data, settingsCompanyId]);

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

  const activityRows = useMemo<ActivityRow[]>(() => {
    if (!data) return [];
    const eventRows: ActivityRow[] = data.runEvents
      .filter((event) => event.message)
      .map((event) => ({
        id: `live-${event.id}`, at: event.createdAt,
        kind: (event.level === "error" || event.stream === "stderr" ? "error" : "run") as ActivityRow["kind"],
        label: event.stream?.toUpperCase() ?? event.eventType.toUpperCase(),
        actor: data.agentNames[event.agentId] ?? "Unknown agent",
        text: event.message ?? event.eventType, excerpt: null,
      }));
    const runRows: ActivityRow[] = data.runs.map((run) => ({
      id: `run-${run.id}`, at: run.startedAt ?? run.createdAt,
      kind: (run.status === "failed" ? "error" : run.status === "running" ? "run" : "done") as ActivityRow["kind"],
      label: run.status === "failed" ? "FAIL" : run.status === "running" ? "RUN" : "DONE",
      actor: data.agentNames[run.agentId] ?? "Unknown agent",
      text: `${run.invocationSource} · ${run.status}${run.errorCode ? ` · ${run.errorCode}` : ""}`,
      excerpt: run.stderrExcerpt || run.stdoutExcerpt,
    }));
    const auditRows: ActivityRow[] = data.activity.map((entry) => ({
      id: `event-${entry.id}`, at: entry.createdAt, kind: "audit",
      label: entry.actorType.toUpperCase(),
      actor: entry.agentId ? data.agentNames[entry.agentId] ?? entry.actorType : entry.actorType,
      text: `${entry.action} · ${entry.entityType}`, excerpt: null,
    }));
    return [...eventRows, ...runRows, ...auditRows].sort((a, b) => +new Date(a.at) - +new Date(b.at)).slice(-70);
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
  async function setup() {
    setBusy("setup"); setActionError(null);
    try { await setupCompany({ companyId }); await refresh(); } catch (err) { setActionError(err instanceof Error ? err.message : String(err)); } finally { setBusy(null); }
  }
  async function saveIntegrations() {
    setBusy("setup"); setActionError(null);
    try { await saveCompanyIntegrations({ companyId, websiteUrl, vercelProjectId, vercelTeamId }); await refresh(); } catch (err) { setActionError(err instanceof Error ? err.message : String(err)); } finally { setBusy(null); }
  }

  if (loading && !data) return <><style>{css}</style><main className="fc-loading"><span className="fc-spin" />Loading live company state…</main></>;
  if (!data) return <><style>{css}</style><main className="fc-loading fc-error">Foundry could not load live data: {error?.message ?? "No company data returned"}</main></>;
  const spentRatio = data.company.budgetMonthlyCents > 0 ? Math.min(100, (data.company.spentMonthlyCents / data.company.budgetMonthlyCents) * 100) : 0;
  const activeGoal = data.goals.find((goal) => goal.status === "active");

  return <><style>{css}</style><main className="fc">
    <header className="fc-top">
      <span className="fc-mark"><Icon path={ICON.bolt} /></span>
      <span className="fc-brand">Foundry</span><span className="fc-sep">/</span>
      <span className="fc-company">{data.company.name}</span>
      <span className="fc-handle">{data.company.issuePrefix}</span>
      <span className="fc-status">{data.company.status}</span>
      <span className="fc-updated">
        <span className={`fc-livepulse ${syncError ? "off" : ""}`} />
        {syncError ? "SYNC ISSUE" : syncing ? "SYNCING" : "LIVE · 5S SYNC"}
        <small>{when(data.generatedAt)}</small>
      </span>
    </header>
    <div className="fc-layout">
      <div className="fc-col">
        <Terminal rows={activityRows} activeRuns={data.counts.activeRuns} agentCount={data.agents.length} syncing={syncing} syncError={syncError} />
        <Panel title="Command center" icon={ICON.terminal}>
          <div className="fc-buttons">
            <button className="run" onClick={() => void runCeo()} disabled={!data.ceo || busy !== null}>{busy === "run" ? "Starting…" : "Run CEO"}</button>
            <button className="primary" onClick={() => void setup()} disabled={busy !== null}>{busy === "setup" ? "Installing…" : "Install company system"}</button>
            <a className="fc-btn" {...navigation.linkProps("/agents")}>Agents</a>
            <a className="fc-btn" {...navigation.linkProps("/issues")}>Tasks</a>
            <button onClick={() => void refresh()} disabled={syncing}>{syncing ? "Syncing…" : "Sync now"}</button>
          </div>
          {!data.ceo && <p className="fc-error">No CEO agent is configured.</p>}
          {(actionError || syncError) && <p className="fc-error">{actionError ?? syncError}</p>}
        </Panel>
        <Panel title="Engine" icon={ICON.bolt}>
          <div className="fc-kicker">Current execution</div><div className="fc-big">{data.counts.activeRuns}</div>
          <div className="fc-muted">active or queued runs</div><hr className="fc-rule" />
          <div className="fc-row"><span>OpenCode agents</span><strong>{data.counts.connectedOpenCodeAgents}</strong></div>
          <div className="fc-row"><span>Recent failed runs</span><strong className={data.counts.failedRuns ? "fc-error" : ""}>{data.counts.failedRuns}</strong></div>
          <div className="fc-row"><span>Last CEO heartbeat</span><strong>{when(data.ceo?.lastHeartbeatAt)}</strong></div>
        </Panel>
        <Panel title="Tasks" icon={ICON.list}>
          <div className="fc-buttons"><a className="fc-btn" {...navigation.linkProps("/issues")}>+ New task</a></div>
          <hr className="fc-rule" />
          {data.issues.slice(0, 8).map((issue) => <div className="fc-row" key={issue.id}><span><strong>{issue.identifier ?? "TASK"}</strong><br />{issue.title}</span><span className="fc-tag">{issue.status.replaceAll("_", " ")}</span></div>)}
          {data.issues.length === 0 && <Empty>No tasks exist.</Empty>}
          <p className="fc-muted">{data.counts.completedIssues} finished · {data.counts.activeIssues} active</p>
        </Panel>
        <Panel title="Company spend" icon={ICON.dollar}>
          <div className="fc-kicker">Paperclip spend this month</div><div className="fc-money">{money(data.company.spentMonthlyCents)}</div>
          <div className="fc-meter"><span style={{ width: `${spentRatio}%` }} /></div>
          <p>{data.company.budgetMonthlyCents > 0 ? `${money(data.company.budgetMonthlyCents)} monthly budget` : "No monthly budget configured"}</p>
          <p className="fc-note">This is actual agent spend, not customer revenue. Revenue is not shown until a payment data source is connected.</p>
        </Panel>
        <Panel title="Milestone" icon={ICON.target}>
          {activeGoal ? <><div className="fc-kicker">Active goal</div><h2>{activeGoal.title}</h2><p>{activeGoal.description}</p></> : <Empty>No active goal is set. Create one in Paperclip to give the company a north star.</Empty>}
        </Panel>
      </div>
      <div className="fc-col">
        <Panel title="Agent connections" icon={ICON.users}>
          {data.agents.map((agent) => <div className="fc-row" key={agent.id}><span><span className={`fc-dot ${agent.status === "paused" || agent.status === "error" ? "off" : ""}`} /><strong>{agent.name}</strong><br /><span className="fc-muted">{agent.adapterType} · {agent.role}</span></span><span className="fc-tag">{agent.status}</span></div>)}
          {data.agents.length === 0 && <Empty>No agents configured.</Empty>}
          <p className="fc-note">"Connected" means configured in Paperclip. MCP availability is proven per run in activity/tool audit, not inferred from this card.</p>
        </Panel>
        <Panel title="Connections & tools" icon={ICON.plug}>
          {Object.entries(data.integrations).map(([name, status]) => <div className="fc-row" key={name}><span><span className={`fc-dot ${status.configured ? "" : "off"}`} />{name}</span><strong>{status.configured ? "Configured" : "Not configured"}</strong></div>)}
          <div className="fc-fields">
            <div className="fc-field"><label>Production website</label><input value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://product.example" /></div>
            <div className="fc-field"><label>Vercel project ID</label><input value={vercelProjectId} onChange={(event) => setVercelProjectId(event.target.value)} placeholder="prj_…" /></div>
            <div className="fc-field"><label>Vercel team ID (optional)</label><input value={vercelTeamId} onChange={(event) => setVercelTeamId(event.target.value)} placeholder="team_…" /></div>
          </div>
          <div className="fc-buttons">
            <button className="primary" onClick={() => void saveIntegrations()} disabled={busy !== null}>Save company settings</button>
            <a className="fc-btn" {...navigation.linkProps("/apps")}>Secret connections</a>
            <a className="fc-btn" {...navigation.linkProps("/apps/advanced/audit")}>Access & audit</a>
          </div>
          <p className="fc-note">Statuses come from company-bound settings and secret references. Agent access is enforced by Paperclip grants, profiles, and policies.</p>
        </Panel>
        <Panel title="Governed tool activity" icon={ICON.plug}>
          {data.toolEvents.slice(0, 12).map((event) => <div className="fc-row" key={event.id}><span><strong>{event.toolName}</strong><br /><span className={event.status === "failed" ? "fc-error" : "fc-muted"}>{event.error ?? event.summary ?? "In progress"}</span></span><span><span className="fc-tag">{event.status}</span><br /><time>{when(event.updatedAt)}</time></span></div>)}
          {data.toolEvents.length === 0 && <Empty>No Foundry tool has been invoked through an agent run yet.</Empty>}
        </Panel>
        <Panel title="Website" icon={ICON.globe}>
          {data.integrations.website.configured && data.integrations.website.url ? <><div className="fc-site"><span className="fc-dot" /><a href={data.integrations.website.url} target="_blank" rel="noopener noreferrer">{data.integrations.website.url}</a></div><div className="fc-site-frame"><iframe title="Production website preview" src={data.integrations.website.url} /></div></> : <Empty>No production URL configured. Add the real URL in Foundry plugin settings after deployment.</Empty>}
        </Panel>
        <Panel title="Analytics" icon={ICON.chart}><Empty>No analytics source is connected. Foundry will not invent pageviews, visitors, or sessions.</Empty></Panel>
        <Panel title="Documents" icon={ICON.doc}>
          {data.documents.slice(0, 12).map((document) => <a className="fc-row" key={document.id} {...navigation.linkProps(`/issues/${document.issueIdentifier ?? document.issueId}#document-${encodeURIComponent(document.key)}`)}><span><strong>{document.title ?? document.key}</strong><br /><span className="fc-muted">{document.issueIdentifier ?? document.issueTitle}</span></span><time>{when(document.updatedAt)}</time></a>)}
          {data.documents.length === 0 && <Empty>No issue documents exist.</Empty>}
        </Panel>
        <Panel title="Project workspaces" icon={ICON.folder}>
          {data.workspaces.map((workspace) => <div className="fc-card" key={workspace.id}><strong>{workspace.projectName} / {workspace.name}</strong><p className="fc-muted">{workspace.repoUrl ?? workspace.path}</p><span className="fc-tag">{workspace.isPrimary ? "primary" : "workspace"}</span></div>)}
          {data.workspaces.length === 0 && <Empty>No project workspaces configured. Agents cannot reliably build without one.</Empty>}
        </Panel>
      </div>
      <aside className="fc-col fc-side">
        <section className="fc-panel">
          <div className="fc-chat-head"><span className="fc-eyebrow">Founder channel</span><h2>{data.ceo ? `Chat with ${data.ceo.name}` : "CEO unavailable"}</h2><span className="fc-note">Messages and run outcomes are stored in this company. Replies are real CEO-run summaries.</span></div>
          <div className="fc-chat">
            {data.chatMessages.length === 0 ? <Empty>Start a conversation with your CEO. The reply will appear here once the real agent run completes.</Empty> : data.chatMessages.map((message) => <div className={`fc-message ${message.role}`} key={message.id}><span className="fc-message-meta">{message.role === "founder" ? "You" : message.role === "ceo" ? data.ceo?.name ?? "CEO" : "System"} · {when(message.createdAt)}</span>{message.body && <div className="fc-bubble">{message.body}</div>}{message.status === "queued" || message.status === "running" ? <span className="fc-chat-state">CEO run {message.status}…</span> : null}{message.error ? <span className="fc-chat-state failed">{message.error}</span> : null}</div>)}
          </div>
          <div className="fc-compose">
            <div className="fc-kicker">Message the CEO</div>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={data.ceo ? `Message ${data.ceo.name}…` : "No CEO configured"} disabled={!data.ceo || busy !== null} />
            <div className="fc-compose-actions"><span className="fc-note">Starts a real Paperclip CEO run</span><button className="primary" onClick={() => void send()} disabled={!data.ceo || !prompt.trim() || busy !== null}>{busy === "chat" ? "Sending…" : "Send"}</button></div>
          </div>
        </section>
      </aside>
    </div>
  </main></>;
}
