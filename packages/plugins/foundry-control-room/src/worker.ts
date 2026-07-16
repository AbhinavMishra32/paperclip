import {
  definePlugin,
  runWorker,
  type EnvSecretRefBinding,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { TOOL_NAMES } from "./manifest.js";

const execFileAsync = promisify(execFile);
const LAGUNA_MODEL = "poolside/laguna-xs-2.1:free";
// Tool grants use Paperclip's selector syntax (`tool:<namespaced-name>`), while
// MCP tool names themselves remain `<plugin-key>:<tool-name>`.
const namespacedTool = (name: string) => `tool:foundry.control-room:${name}`;

const ROLE_TOOL_NAMES: Record<string, string[]> = {
  ceo: [TOOL_NAMES.companyContext, TOOL_NAMES.integrationStatus, TOOL_NAMES.checkOpenRouter, TOOL_NAMES.listDeployments],
  "engineering-manager": [TOOL_NAMES.companyContext, TOOL_NAMES.integrationStatus, TOOL_NAMES.checkOpenRouter, TOOL_NAMES.provisionAppEnvironment, TOOL_NAMES.listDeployments, TOOL_NAMES.deploymentEvents, TOOL_NAMES.deployProject],
  cto: [TOOL_NAMES.companyContext, TOOL_NAMES.integrationStatus, TOOL_NAMES.checkOpenRouter, TOOL_NAMES.provisionAppEnvironment, TOOL_NAMES.listDeployments, TOOL_NAMES.deploymentEvents, TOOL_NAMES.deployProject],
  qa: [TOOL_NAMES.companyContext, TOOL_NAMES.integrationStatus, TOOL_NAMES.checkOpenRouter, TOOL_NAMES.listDeployments, TOOL_NAMES.deploymentEvents],
  growth: [TOOL_NAMES.companyContext, TOOL_NAMES.integrationStatus, TOOL_NAMES.listDeployments, TOOL_NAMES.publishBlog],
};

type FoundryConfig = {
  websiteUrl?: string;
  stripeSecretKey?: string | EnvSecretRefBinding;
  vercelToken?: string | EnvSecretRefBinding;
  vercelProjectId?: string;
  vercelTeamId?: string;
  openrouterApiKey?: string | EnvSecretRefBinding;
  databaseUrl?: string | EnvSecretRefBinding;
  authSecret?: string | EnvSecretRefBinding;
};

type ToolEvent = { id: string; agentId: string | null; runId: string | null; toolName: string; status: string; summary: string | null; error: string | null; metadata: Record<string, unknown>; createdAt: string; updatedAt: string };

type FounderCeoMessage = {
  id: string;
  companyId: string;
  agentId: string | null;
  role: "founder" | "ceo" | "system";
  body: string;
  status: "queued" | "running" | "completed" | "failed";
  runId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatRun = { id: string; status: string; summary: string | null; error: string | null };

function chatTable(ctx: PluginContext) {
  return `${ctx.db.namespace}.founder_ceo_messages`;
}

function toolEventTable(ctx: PluginContext) {
  return `${ctx.db.namespace}.tool_events`;
}

async function listToolEvents(ctx: PluginContext, companyId: string): Promise<ToolEvent[]> {
  return await ctx.db.query<ToolEvent>(
    `SELECT id, agent_id AS "agentId", run_id AS "runId", tool_name AS "toolName", status,
            summary, error, metadata, created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM ${toolEventTable(ctx)} WHERE company_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [companyId],
  );
}

async function beginToolEvent(ctx: PluginContext, runCtx: { companyId: string; agentId: string; runId: string }, toolName: string) {
  const id = crypto.randomUUID();
  await ctx.db.execute(
    `INSERT INTO ${toolEventTable(ctx)} (id, company_id, agent_id, run_id, tool_name, status) VALUES ($1,$2,$3,$4,$5,'running')`,
    [id, runCtx.companyId, runCtx.agentId, runCtx.runId, toolName],
  );
  return id;
}

async function finishToolEvent(ctx: PluginContext, id: string, result: ToolResult, metadata: Record<string, unknown> = {}) {
  const failed = Boolean(result.error);
  await ctx.db.execute(
    `UPDATE ${toolEventTable(ctx)} SET status=$1, summary=$2, error=$3, metadata=$4::jsonb, updated_at=now() WHERE id=$5`,
    [failed ? "failed" : "succeeded", failed ? null : chatText(result.content, 2_000), failed ? chatText(result.error, 2_000) : null, JSON.stringify(metadata), id],
  );
  return result;
}

async function failToolEvent(ctx: PluginContext, id: string, error: unknown) {
  const message = chatText(error instanceof Error ? error.message : String(error), 2_000);
  await ctx.db.execute(`UPDATE ${toolEventTable(ctx)} SET status='failed', error=$1, updated_at=now() WHERE id=$2`, [message, id]);
  return { error: message } satisfies ToolResult;
}

function chatText(value: string | null | undefined, maxLength = 8_000) {
  const text = value?.trim() ?? "";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

async function listFounderCeoMessages(ctx: PluginContext, companyId: string): Promise<FounderCeoMessage[]> {
  return await ctx.db.query<FounderCeoMessage>(
    `SELECT id, company_id AS "companyId", agent_id AS "agentId", role, body, status,
            run_id AS "runId", error, created_at::text AS "createdAt", updated_at::text AS "updatedAt"
       FROM ${chatTable(ctx)}
      WHERE company_id = $1
      ORDER BY created_at ASC
      LIMIT 100`,
    [companyId],
  );
}

async function createFounderCeoMessage(ctx: PluginContext, input: {
  id: string;
  companyId: string;
  agentId: string | null;
  role: FounderCeoMessage["role"];
  body?: string;
  status: FounderCeoMessage["status"];
}) {
  await ctx.db.execute(
    `INSERT INTO ${chatTable(ctx)} (id, company_id, agent_id, role, body, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.id, input.companyId, input.agentId, input.role, chatText(input.body), input.status],
  );
}

async function attachFounderCeoRun(ctx: PluginContext, messageId: string, runId: string) {
  await ctx.db.execute(
    `UPDATE ${chatTable(ctx)}
        SET run_id = $1, status = 'running', updated_at = now()
      WHERE id = $2`,
    [runId, messageId],
  );
}

async function failFounderCeoMessage(ctx: PluginContext, messageId: string, error: unknown) {
  await ctx.db.execute(
    `UPDATE ${chatTable(ctx)}
        SET status = 'failed', error = $1, updated_at = now()
      WHERE id = $2`,
    [chatText(error instanceof Error ? error.message : String(error), 2_000), messageId],
  );
}

async function reconcileFounderCeoMessages(ctx: PluginContext, companyId: string, runs: ChatRun[]) {
  const messages = await listFounderCeoMessages(ctx, companyId);
  const runsById = new Map(runs.map((run) => [run.id, run]));
  for (const message of messages) {
    if (message.role !== "ceo" || message.status !== "running" || !message.runId) continue;
    const run = runsById.get(message.runId);
    if (!run || run.status === "queued" || run.status === "running") continue;
    const succeeded = run.status === "succeeded";
    const body = chatText(run.summary) || (succeeded
      ? "The CEO run completed, but Paperclip did not persist a response summary. Open the linked run for its raw output."
      : "");
    const error = succeeded ? null : chatText(run.error) || `CEO run ended with status: ${run.status}.`;
    await ctx.db.execute(
      `UPDATE ${chatTable(ctx)}
          SET body = $1, status = $2, error = $3, updated_at = now()
        WHERE id = $4`,
      [body, succeeded ? "completed" : "failed", error, message.id],
    );
    message.body = body;
    message.status = succeeded ? "completed" : "failed";
    message.error = error;
  }
  return messages;
}

function founderConversationPrompt(messages: FounderCeoMessage[]) {
  const transcript = messages
    .filter((message) => message.status === "completed" && message.body)
    .slice(-12)
    .map((message) => `${message.role === "founder" ? "Founder" : "CEO"}: ${message.body}`)
    .join("\n\n");
  return [
    "You are the CEO speaking directly to the founder through Foundry.",
    "Use only evidence from Paperclip and the tools actually granted to this run. Never invent progress, metrics, deployments, customers, or tool results.",
    "If the founder asks for work, follow Paperclip policy, execute or delegate only what is in scope, and state the evidence and next action clearly.",
    transcript ? `Conversation so far:\n${transcript}` : "This is the first founder message in this conversation.",
    "CEO:",
  ].join("\n\n");
}

function companyIdFrom(params: Record<string, unknown>): string {
  const companyId = typeof params.companyId === "string" ? params.companyId : "";
  if (!companyId) throw new Error("companyId is required");
  return companyId;
}

function isSecretRef(value: unknown): value is EnvSecretRefBinding {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (value as { type?: unknown }).type === "secret_ref"
    && typeof (value as { secretId?: unknown }).secretId === "string";
}

async function getConfig(ctx: PluginContext, companyId: string): Promise<FoundryConfig> {
  const global = await ctx.config.get(companyId) as FoundryConfig;
  const rows = await ctx.db.query<{ websiteUrl: string | null; vercelProjectId: string | null; vercelTeamId: string | null }>(
    `SELECT website_url AS "websiteUrl", vercel_project_id AS "vercelProjectId", vercel_team_id AS "vercelTeamId"
       FROM ${ctx.db.namespace}.company_integrations WHERE company_id = $1 LIMIT 1`,
    [companyId],
  );
  const local = rows[0];
  return {
    ...global,
    websiteUrl: local?.websiteUrl || global.websiteUrl,
    vercelProjectId: local?.vercelProjectId || global.vercelProjectId,
    vercelTeamId: local?.vercelTeamId || global.vercelTeamId,
  };
}

function optionalUrl(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const url = new URL(text);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Website URL must use http or https");
  return url.toString();
}

function optionalId(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  if (!/^[A-Za-z0-9_.-]{1,200}$/.test(text)) throw new Error(`${label} contains unsupported characters`);
  return text;
}

function integrationStatus(config: FoundryConfig) {
  return {
    website: { configured: Boolean(config.websiteUrl), url: config.websiteUrl || null },
    stripe: { configured: isSecretRef(config.stripeSecretKey) },
    vercel: {
      configured: isSecretRef(config.vercelToken) && Boolean(config.vercelProjectId),
      projectConfigured: Boolean(config.vercelProjectId),
    },
    analytics: { configured: false },
    email: { configured: false },
    openrouter: { configured: isSecretRef(config.openrouterApiKey), model: LAGUNA_MODEL },
    database: { configured: isSecretRef(config.databaseUrl) },
    auth: { configured: isSecretRef(config.authSecret) },
  };
}

async function companySnapshot(ctx: PluginContext, companyId: string) {
  const [company, agents, issues, projects, goals, activity, runs, runEvents, config, toolEvents] = await Promise.all([
    ctx.companies.get(companyId),
    ctx.agents.list({ companyId, limit: 200, offset: 0 }),
    ctx.issues.list({ companyId, limit: 200, offset: 0 }),
    ctx.projects.list({ companyId, limit: 200, offset: 0 }),
    ctx.goals.list({ companyId, limit: 200, offset: 0 }),
    ctx.activity.list({ companyId, limit: 80 }),
    ctx.activity.listRuns({ companyId, limit: 80 }),
    ctx.activity.listRunEvents({ companyId, limit: 250 }),
    getConfig(ctx, companyId),
    listToolEvents(ctx, companyId),
  ]);
  if (!company) throw new Error("Company not found");

  const workspaces = (await Promise.all(
    projects.map(async (project) => ({
      projectId: project.id,
      projectName: project.name,
      entries: await ctx.projects.listWorkspaces(project.id, companyId),
    })),
  )).flatMap(({ projectId, projectName, entries }) =>
    entries.map((workspace) => ({ ...workspace, projectId, projectName })),
  );

  const documentCounts = await Promise.all(
    issues.slice(0, 100).map(async (issue) => ({
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      issueTitle: issue.title,
      documents: await ctx.issues.documents.list(issue.id, companyId),
    })),
  );

  const agentNames = Object.fromEntries(agents.map((agent) => [agent.id, agent.name]));
  const ceo = agents.find((agent) => agent.role === "ceo")
    ?? agents.find((agent) => agent.name.trim().toLowerCase() === "ceo")
    ?? null;
  const activeStatuses = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
  const completeStatuses = new Set(["done", "cancelled"]);
  const activeIssues = issues.filter((issue) => activeStatuses.has(issue.status));
  const completedIssues = issues.filter((issue) => completeStatuses.has(issue.status));
  const failedRuns = runs.filter((run) => run.status === "failed");
  const runningRuns = runs.filter((run) => run.status === "running" || run.status === "queued");
  const connectedOpenCodeAgents = agents.filter((agent) => agent.adapterType === "opencode_local");
  const chatMessages = await reconcileFounderCeoMessages(ctx, companyId, runs);

  const honestRead: string[] = [];
  if (!goals.some((goal) => goal.status === "active")) honestRead.push("No active company goal is set.");
  if (activeIssues.length === 0) honestRead.push("No active tasks are currently in flight.");
  if (failedRuns.length > 0) honestRead.push(`${failedRuns.length} of the ${runs.length} most recent runs failed.`);
  if (workspaces.length === 0) honestRead.push("No project workspace is configured.");
  if (!config.websiteUrl) honestRead.push("No production website URL is configured in Foundry.");
  if (honestRead.length === 0) honestRead.push("Core operating signals are present; review the activity feed for execution quality.");

  return {
    generatedAt: new Date().toISOString(),
    company,
    agents,
    agentNames,
    ceo,
    issues,
    projects,
    goals,
    activity,
    runs,
    runEvents,
    chatMessages,
    toolEvents,
    workspaces,
    documents: documentCounts.flatMap((entry) => entry.documents.map((document) => ({ ...document, issueId: entry.issueId, issueIdentifier: entry.issueIdentifier, issueTitle: entry.issueTitle }))),
    integrations: integrationStatus(config),
    integrationSettings: {
      websiteUrl: config.websiteUrl ?? "",
      vercelProjectId: config.vercelProjectId ?? "",
      vercelTeamId: config.vercelTeamId ?? "",
    },
    counts: {
      activeIssues: activeIssues.length,
      completedIssues: completedIssues.length,
      failedRuns: failedRuns.length,
      activeRuns: runningRuns.length,
      connectedOpenCodeAgents: connectedOpenCodeAgents.length,
    },
    honestRead,
  };
}

async function resolveWorkspace(ctx: PluginContext, runCtx: { companyId: string; projectId?: string | null }) {
  const projects = await ctx.projects.list({ companyId: runCtx.companyId, limit: 200, offset: 0 });
  const ordered = runCtx.projectId
    ? [...projects.filter((project) => project.id === runCtx.projectId), ...projects.filter((project) => project.id !== runCtx.projectId)]
    : projects;
  for (const project of ordered) {
    const workspaces = await ctx.projects.listWorkspaces(project.id, runCtx.companyId);
    const workspace = workspaces.find((entry) => entry.isPrimary) ?? workspaces[0];
    if (workspace?.path) return { project, workspace };
  }
  throw new Error("No project workspace is configured for this company");
}

async function git(workspacePath: string, args: string[]) {
  // Company workspaces may live on a mounted volume whose files are owned by
  // the host/provisioner rather than the plugin worker uid. Scope the trust
  // exception to this one resolved workspace instead of mutating global Git
  // config or disabling ownership checks for every repository.
  const result = await execFileAsync(
    "git",
    ["-c", `safe.directory=${workspacePath}`, ...args],
    { cwd: workspacePath, timeout: 120_000, maxBuffer: 2_000_000 },
  );
  return result.stdout.trim();
}

function vercelQuery(config: FoundryConfig, additions: Record<string, string> = {}) {
  const query = new URLSearchParams({ projectId: config.vercelProjectId ?? "", limit: "10", ...additions });
  if (config.vercelTeamId) query.set("teamId", config.vercelTeamId);
  return query;
}

async function vercelDeployments(ctx: PluginContext, companyId: string, config: FoundryConfig, limit = 10) {
  if (!isSecretRef(config.vercelToken) || !config.vercelProjectId) throw new Error("Vercel token and project ID are not configured");
  const token = await ctx.secrets.resolve(config.vercelToken, { companyId, configPath: "vercelToken" });
  const query = vercelQuery(config, { limit: String(Math.max(1, Math.min(20, limit))) });
  const response = await ctx.http.fetch(`https://api.vercel.com/v6/deployments?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json() as { deployments?: Array<Record<string, unknown>>; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Vercel request failed with HTTP ${response.status}`);
  return (body.deployments ?? []).map((deployment) => ({
    id: deployment.uid ?? deployment.id,
    name: deployment.name,
    url: typeof deployment.url === "string" ? `https://${deployment.url}` : null,
    state: deployment.state ?? deployment.readyState,
    target: deployment.target,
    createdAt: deployment.createdAt ?? deployment.created,
    meta: deployment.meta ?? {},
  }));
}

async function matchingDeployment(ctx: PluginContext, companyId: string, config: FoundryConfig, sha: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const deployments = await vercelDeployments(ctx, companyId, config, 20);
    const match = deployments.find((deployment) => {
      const meta = deployment.meta as Record<string, unknown>;
      return meta.githubCommitSha === sha || meta.gitCommitSha === sha || meta.commitSha === sha;
    });
    if (match) return match;
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  return null;
}

async function deployWithVercelCli(
  ctx: PluginContext,
  companyId: string,
  runId: string,
  config: FoundryConfig,
  workspacePath: string,
) {
  if (!isSecretRef(config.vercelToken) || !config.vercelProjectId) {
    throw new Error("Vercel token and project ID are not configured");
  }
  const token = await ctx.secrets.resolve(config.vercelToken, { companyId, configPath: "vercelToken" });
  const runtimeRoot = `/tmp/foundry-vercel/${runId}`;
  await mkdir(runtimeRoot, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: runtimeRoot,
    NO_COLOR: "1",
    npm_config_cache: `${runtimeRoot}/npm-cache`,
    VERCEL_TOKEN: token,
    VERCEL_PROJECT_ID: config.vercelProjectId,
  };
  if (config.vercelTeamId) env.VERCEL_ORG_ID = config.vercelTeamId;
  const result = await execFileAsync(
    "npx",
    ["--yes", "vercel@56.2.1", "deploy", "--prod", "--yes", "--non-interactive", "--no-wait", "--archive=tgz"],
    { cwd: workspacePath, env, timeout: 15 * 60_000, maxBuffer: 4_000_000 },
  );
  const deploymentUrl = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find((line) => /^https:\/\/[A-Za-z0-9.-]+$/.test(line));
  if (!deploymentUrl) throw new Error("Vercel CLI completed without returning a deployment URL");
  return deploymentUrl;
}

async function provisionVercelEnv(
  ctx: PluginContext,
  companyId: string,
  config: FoundryConfig,
  key: string,
  ref: EnvSecretRefBinding,
  configPath: keyof Pick<FoundryConfig, "openrouterApiKey" | "databaseUrl" | "authSecret" | "stripeSecretKey">,
  target: string[],
) {
  if (!isSecretRef(config.vercelToken) || !config.vercelProjectId) throw new Error("Vercel token and project ID are not configured");
  const [value, token] = await Promise.all([
    ctx.secrets.resolve(ref, { companyId, configPath }),
    ctx.secrets.resolve(config.vercelToken, { companyId, configPath: "vercelToken" }),
  ]);
  const query = new URLSearchParams({ upsert: "true" });
  if (config.vercelTeamId) query.set("teamId", config.vercelTeamId);
  const response = await ctx.http.fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(config.vercelProjectId)}/env?${query}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, type: "sensitive", target }),
  });
  const body = await response.json() as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Vercel environment request failed with HTTP ${response.status}`);
}

async function applyRoleToolGrants(ctx: PluginContext, companyId: string) {
  const agents = await ctx.agents.list({ companyId, limit: 200, offset: 0 });
  const applied: Array<{ agentId: string; agentName: string; tools: string[] }> = [];
  for (const agent of agents) {
    const toolNames = ROLE_TOOL_NAMES[agent.role] ?? (agent.name.trim().toLowerCase() === "cto" ? ROLE_TOOL_NAMES.cto : []);
    if (!toolNames?.length) continue;
    const existing = await ctx.authorization.grants.list({ companyId, principalType: "agent", principalId: agent.id });
    const otherGrants = existing
      .filter((grant) => grant.permissionKey !== "tools:use")
      .map((grant) => ({ permissionKey: grant.permissionKey, scope: grant.scope }));
    const previousToolGrant = existing.find((grant) => grant.permissionKey === "tools:use");
    const previousAllow = previousToolGrant?.scope && Array.isArray(previousToolGrant.scope.allow)
      ? previousToolGrant.scope.allow.filter((entry): entry is string =>
          typeof entry === "string" && !entry.startsWith("foundry.control-room:"))
      : [];
    const allow = [...new Set([...previousAllow, ...toolNames.map(namespacedTool)])];
    await ctx.authorization.grants.set({
      companyId,
      principalType: "agent",
      principalId: agent.id,
      grants: [...otherGrants, { permissionKey: "tools:use", scope: { allow } }],
    });
    applied.push({ agentId: agent.id, agentName: agent.name, tools: allow });
  }
  return applied;
}

async function stripeRequest(ctx: PluginContext, secret: string, path: string, body: URLSearchParams) {
  const response = await ctx.http.fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const apiError = result.error as { message?: string } | undefined;
    throw new Error(apiError?.message ?? `Stripe request failed with HTTP ${response.status}`);
  }
  return result;
}

function registerTools(ctx: PluginContext) {
  ctx.tools.register(TOOL_NAMES.companyContext, {
    displayName: "Get company context",
    description: "Read current company operating context.",
    parametersSchema: { type: "object", properties: {} },
  }, async (_params, runCtx): Promise<ToolResult> => {
    const snapshot = await companySnapshot(ctx, runCtx.companyId);
    return {
      content: `Company ${snapshot.company.name}: ${snapshot.agents.length} agents, ${snapshot.counts.activeIssues} active tasks, ${snapshot.projects.length} projects, ${snapshot.workspaces.length} workspaces.`,
      data: snapshot,
    };
  });

  ctx.tools.register(TOOL_NAMES.integrationStatus, {
    displayName: "Get integration status",
    description: "Report configured integrations without revealing secrets.",
    parametersSchema: { type: "object", properties: {} },
  }, async (_params, runCtx): Promise<ToolResult> => {
    const config = await getConfig(ctx, runCtx.companyId);
    const status = integrationStatus(config);
    return { content: JSON.stringify(status), data: status };
  });

  ctx.tools.register(TOOL_NAMES.createStripePaymentLink, {
    displayName: "Create Stripe payment link",
    description: "Create a live Stripe product, price, and payment link.",
    parametersSchema: {
      type: "object",
      properties: { name: { type: "string" }, amountCents: { type: "integer" }, currency: { type: "string" } },
      required: ["name", "amountCents", "currency"],
    },
  }, async (raw, runCtx): Promise<ToolResult> => {
    const params = raw as { name?: string; amountCents?: number; currency?: string };
    const name = params.name?.trim();
    const amountCents = Number(params.amountCents);
    const currency = params.currency?.trim().toLowerCase();
    if (!name || !Number.isInteger(amountCents) || amountCents < 50 || !currency?.match(/^[a-z]{3}$/)) {
      return { error: "name, amountCents (integer >= 50), and a three-letter currency are required" };
    }
    const config = await getConfig(ctx, runCtx.companyId);
    if (!isSecretRef(config.stripeSecretKey)) return { error: "Stripe is not configured in Foundry settings" };
    const secret = await ctx.secrets.resolve(config.stripeSecretKey, { companyId: runCtx.companyId, configPath: "stripeSecretKey" });
    const product = await stripeRequest(ctx, secret, "products", new URLSearchParams({ name }));
    const productId = String(product.id ?? "");
    const price = await stripeRequest(ctx, secret, "prices", new URLSearchParams({
      product: productId,
      unit_amount: String(amountCents),
      currency,
    }));
    const priceId = String(price.id ?? "");
    const link = await stripeRequest(ctx, secret, "payment_links", new URLSearchParams({ "line_items[0][price]": priceId, "line_items[0][quantity]": "1" }));
    await ctx.activity.log({ companyId: runCtx.companyId, message: `Created Stripe payment link for ${name}`, entityType: "agent", entityId: runCtx.agentId, metadata: { runId: runCtx.runId, productId, priceId, paymentLinkId: link.id } });
    return { content: `Created payment link: ${String(link.url ?? "")}`, data: { productId, priceId, paymentLinkId: link.id, url: link.url } };
  });

  ctx.tools.register(TOOL_NAMES.provisionVercelSecret, {
    displayName: "Provision Stripe into Vercel",
    description: "Provision STRIPE_SECRET_KEY to configured Vercel environments without revealing it.",
    parametersSchema: { type: "object", properties: { target: { type: "array", items: { type: "string" } } }, required: ["target"] },
  }, async (raw, runCtx): Promise<ToolResult> => {
    const allowed = new Set(["production", "preview", "development"]);
    const target = Array.isArray((raw as { target?: unknown }).target)
      ? (raw as { target: unknown[] }).target.filter((entry): entry is string => typeof entry === "string" && allowed.has(entry))
      : [];
    if (target.length === 0) return { error: "target must contain production, preview, or development" };
    const config = await getConfig(ctx, runCtx.companyId);
    if (!isSecretRef(config.stripeSecretKey)) return { error: "Stripe is not configured in Foundry settings" };
    if (!isSecretRef(config.vercelToken) || !config.vercelProjectId) return { error: "Vercel token and project ID are not configured in Foundry settings" };
    const [stripeSecret, vercelToken] = await Promise.all([
      ctx.secrets.resolve(config.stripeSecretKey, { companyId: runCtx.companyId, configPath: "stripeSecretKey" }),
      ctx.secrets.resolve(config.vercelToken, { companyId: runCtx.companyId, configPath: "vercelToken" }),
    ]);
    const query = new URLSearchParams({ upsert: "true" });
    if (config.vercelTeamId) query.set("teamId", config.vercelTeamId);
    const response = await ctx.http.fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(config.vercelProjectId)}/env?${query.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ key: "STRIPE_SECRET_KEY", value: stripeSecret, type: "sensitive", target }),
    });
    const result = await response.json() as Record<string, unknown>;
    if (!response.ok) return { error: typeof result.error === "object" ? JSON.stringify(result.error) : `Vercel request failed with HTTP ${response.status}` };
    await ctx.activity.log({ companyId: runCtx.companyId, message: "Provisioned STRIPE_SECRET_KEY to Vercel", entityType: "agent", entityId: runCtx.agentId, metadata: { runId: runCtx.runId, projectId: config.vercelProjectId, target } });
    return { content: `Provisioned STRIPE_SECRET_KEY to ${target.join(", ")}.`, data: { projectId: config.vercelProjectId, target } };
  });

  ctx.tools.register(TOOL_NAMES.checkOpenRouter, {
    displayName: "Check OpenRouter connection",
    description: "Verify the configured OpenRouter credential and Laguna model.",
    parametersSchema: { type: "object", properties: {} },
  }, async (_raw, runCtx): Promise<ToolResult> => {
    const eventId = await beginToolEvent(ctx, runCtx, TOOL_NAMES.checkOpenRouter);
    try {
      const config = await getConfig(ctx, runCtx.companyId);
      if (!isSecretRef(config.openrouterApiKey)) return await finishToolEvent(ctx, eventId, { error: "OpenRouter is not configured" });
      const secret = await ctx.secrets.resolve(config.openrouterApiKey, { companyId: runCtx.companyId, configPath: "openrouterApiKey" });
      const response = await ctx.http.fetch("https://openrouter.ai/api/v1/models", { headers: { Authorization: `Bearer ${secret}` } });
      const body = await response.json() as { data?: Array<{ id?: string }>; error?: { message?: string } };
      if (!response.ok) return await finishToolEvent(ctx, eventId, { error: body.error?.message ?? `OpenRouter returned HTTP ${response.status}` });
      const available = Boolean(body.data?.some((model) => model.id === LAGUNA_MODEL));
      const result: ToolResult = available
        ? { content: `OpenRouter is connected and ${LAGUNA_MODEL} is available.`, data: { connected: true, model: LAGUNA_MODEL, available: true } }
        : { error: `OpenRouter connected, but ${LAGUNA_MODEL} was not present in the model catalog.` };
      return await finishToolEvent(ctx, eventId, result, { model: LAGUNA_MODEL });
    } catch (error) { return await failToolEvent(ctx, eventId, error); }
  });

  ctx.tools.register(TOOL_NAMES.provisionAppEnvironment, {
    displayName: "Provision application environment",
    description: "Provision approved company secrets into the configured Vercel project.",
    parametersSchema: { type: "object", properties: { variables: { type: "array", items: { type: "string" } }, target: { type: "array", items: { type: "string" } } }, required: ["variables", "target"] },
  }, async (raw, runCtx): Promise<ToolResult> => {
    const eventId = await beginToolEvent(ctx, runCtx, TOOL_NAMES.provisionAppEnvironment);
    try {
      const input = raw as { variables?: unknown; target?: unknown };
      const allowedTargets = new Set(["production", "preview", "development"]);
      const target = Array.isArray(input.target) ? input.target.filter((entry): entry is string => typeof entry === "string" && allowedTargets.has(entry)) : [];
      const variables = Array.isArray(input.variables) ? [...new Set(input.variables.filter((entry): entry is string => typeof entry === "string"))] : [];
      if (target.length === 0 || variables.length === 0) return await finishToolEvent(ctx, eventId, { error: "At least one approved variable and target are required" });
      const config = await getConfig(ctx, runCtx.companyId);
      const refs: Record<string, { ref: EnvSecretRefBinding; configPath: "openrouterApiKey" | "databaseUrl" | "authSecret" | "stripeSecretKey" } | undefined> = {
        OPENROUTER_API_KEY: isSecretRef(config.openrouterApiKey) ? { ref: config.openrouterApiKey, configPath: "openrouterApiKey" } : undefined,
        DATABASE_URL: isSecretRef(config.databaseUrl) ? { ref: config.databaseUrl, configPath: "databaseUrl" } : undefined,
        AUTH_SECRET: isSecretRef(config.authSecret) ? { ref: config.authSecret, configPath: "authSecret" } : undefined,
        STRIPE_SECRET_KEY: isSecretRef(config.stripeSecretKey) ? { ref: config.stripeSecretKey, configPath: "stripeSecretKey" } : undefined,
      };
      const invalid = variables.filter((key) => !Object.hasOwn(refs, key));
      const missing = variables.filter((key) => !refs[key]);
      if (invalid.length > 0) return await finishToolEvent(ctx, eventId, { error: `Unsupported variables: ${invalid.join(", ")}` });
      if (missing.length > 0) return await finishToolEvent(ctx, eventId, { error: `Company secrets are not configured for: ${missing.join(", ")}` });
      for (const key of variables) {
        const binding = refs[key]!;
        await provisionVercelEnv(ctx, runCtx.companyId, config, key, binding.ref, binding.configPath, target);
      }
      await ctx.activity.log({ companyId: runCtx.companyId, message: `Provisioned ${variables.join(", ")} to Vercel`, entityType: "agent", entityId: runCtx.agentId, metadata: { runId: runCtx.runId, variables, target, projectId: config.vercelProjectId } });
      return await finishToolEvent(ctx, eventId, { content: `Provisioned ${variables.join(", ")} to ${target.join(", ")}.`, data: { variables, target, projectId: config.vercelProjectId } }, { variables, target, projectId: config.vercelProjectId });
    } catch (error) { return await failToolEvent(ctx, eventId, error); }
  });

  ctx.tools.register(TOOL_NAMES.listDeployments, {
    displayName: "Get Vercel deployments",
    description: "Read real deployments from the configured Vercel project.",
    parametersSchema: { type: "object", properties: { limit: { type: "integer" } } },
  }, async (raw, runCtx): Promise<ToolResult> => {
    const eventId = await beginToolEvent(ctx, runCtx, TOOL_NAMES.listDeployments);
    try {
      const config = await getConfig(ctx, runCtx.companyId);
      const deployments = await vercelDeployments(ctx, runCtx.companyId, config, Number((raw as { limit?: number }).limit ?? 10));
      return await finishToolEvent(ctx, eventId, { content: `Found ${deployments.length} real Vercel deployments.`, data: { deployments } }, { count: deployments.length });
    } catch (error) { return await failToolEvent(ctx, eventId, error); }
  });

  ctx.tools.register(TOOL_NAMES.deploymentEvents, {
    displayName: "Get Vercel deployment events",
    description: "Read real build events for a deployment in the configured Vercel project.",
    parametersSchema: { type: "object", properties: { deploymentId: { type: "string" }, limit: { type: "integer" } }, required: ["deploymentId"] },
  }, async (raw, runCtx): Promise<ToolResult> => {
    const eventId = await beginToolEvent(ctx, runCtx, TOOL_NAMES.deploymentEvents);
    try {
      const input = raw as { deploymentId?: string; limit?: number };
      const deploymentId = input.deploymentId?.trim() ?? "";
      if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId)) return await finishToolEvent(ctx, eventId, { error: "A valid Vercel deployment ID is required." });
      const config = await getConfig(ctx, runCtx.companyId);
      if (!isSecretRef(config.vercelToken)) throw new Error("Vercel token is not configured");
      const token = await ctx.secrets.resolve(config.vercelToken, { companyId: runCtx.companyId, configPath: "vercelToken" });
      const query = new URLSearchParams({ direction: "backward", follow: "0", limit: String(Math.max(1, Math.min(200, Number(input.limit ?? 100)))) });
      if (config.vercelTeamId) query.set("teamId", config.vercelTeamId);
      const response = await ctx.http.fetch(`https://api.vercel.com/v3/deployments/${encodeURIComponent(deploymentId)}/events?${query}`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json() as Array<{ type?: string; created?: number; text?: string; message?: string; payload?: unknown }> | { error?: { message?: string } };
      if (!response.ok || !Array.isArray(body)) throw new Error(!Array.isArray(body) ? body.error?.message ?? `Vercel request failed with HTTP ${response.status}` : `Vercel request failed with HTTP ${response.status}`);
      const events = body.reverse().map((entry) => {
        let payload = entry.payload;
        if (typeof payload === "string") {
          try { payload = JSON.parse(payload) as unknown; } catch { /* plain-text event payload */ }
        }
        const detail = payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
        return {
          type: entry.type,
          created: entry.created,
          text: typeof payload === "string" ? payload : typeof detail?.text === "string" ? detail.text : entry.text ?? entry.message ?? null,
          info: detail?.info && typeof detail.info === "object" ? detail.info : null,
          statusCode: typeof detail?.statusCode === "number" ? detail.statusCode : null,
        };
      });
      return await finishToolEvent(ctx, eventId, { content: `Found ${events.length} real events for ${deploymentId}.`, data: { deploymentId, events } }, { deploymentId, count: events.length });
    } catch (error) { return await failToolEvent(ctx, eventId, error); }
  });

  ctx.tools.register(TOOL_NAMES.deployProject, {
    displayName: "Deploy project",
    description: "Push the committed project workspace, start a production deployment in the configured Vercel project, and return its real initial state. Poll get_vercel_deployments until READY or ERROR.",
    parametersSchema: { type: "object", properties: {} },
  }, async (_raw, runCtx): Promise<ToolResult> => {
    const eventId = await beginToolEvent(ctx, runCtx, TOOL_NAMES.deployProject);
    try {
      const config = await getConfig(ctx, runCtx.companyId);
      const { workspace } = await resolveWorkspace(ctx, runCtx);
      const dirty = await git(workspace.path, ["status", "--porcelain"]);
      if (dirty) return await finishToolEvent(ctx, eventId, { error: "Deployment refused: the project workspace has uncommitted changes." });
      const sha = await git(workspace.path, ["rev-parse", "HEAD"]);
      const branch = await git(workspace.path, ["rev-parse", "--abbrev-ref", "HEAD"]);
      await git(workspace.path, ["push", "origin", `HEAD:${branch}`]);
      const deploymentUrl = await deployWithVercelCli(ctx, runCtx.companyId, runCtx.runId, config, workspace.path);
      const deployments = await vercelDeployments(ctx, runCtx.companyId, config, 20);
      const deployment = deployments.find((entry) => entry.url === deploymentUrl) ?? null;
      await ctx.activity.log({ companyId: runCtx.companyId, message: `Deployed ${sha.slice(0, 12)} to Vercel production`, entityType: "agent", entityId: runCtx.agentId, metadata: { runId: runCtx.runId, sha, branch, deploymentUrl, deployment } });
      const result: ToolResult = {
        content: `Pushed ${sha}. Started Vercel production deployment at ${deploymentUrl}${deployment ? ` with initial state ${String(deployment.state)}` : ""}. Poll get_vercel_deployments until it reaches READY or ERROR.`,
        data: { sha, branch, deploymentUrl, deployment },
      };
      return await finishToolEvent(ctx, eventId, result, { sha, branch, deployment });
    } catch (error) { return await failToolEvent(ctx, eventId, error); }
  });

  ctx.tools.register(TOOL_NAMES.publishBlog, {
    displayName: "Publish blog article",
    description: "Write, commit, push, and observe a Markdown article using the existing blog contract.",
    parametersSchema: { type: "object", properties: { title: { type: "string" }, slug: { type: "string" }, excerpt: { type: "string" }, contentMarkdown: { type: "string" } }, required: ["title", "slug", "excerpt", "contentMarkdown"] },
  }, async (raw, runCtx): Promise<ToolResult> => {
    const eventId = await beginToolEvent(ctx, runCtx, TOOL_NAMES.publishBlog);
    try {
      const input = raw as { title?: string; slug?: string; excerpt?: string; contentMarkdown?: string };
      const title = input.title?.trim() ?? ""; const slug = input.slug?.trim() ?? ""; const excerpt = input.excerpt?.trim() ?? ""; const content = input.contentMarkdown?.trim() ?? "";
      if (title.length < 5 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || excerpt.length < 20 || content.length < 200) {
        return await finishToolEvent(ctx, eventId, { error: "title, valid kebab-case slug, excerpt (20+ chars), and contentMarkdown (200+ chars) are required" });
      }
      const config = await getConfig(ctx, runCtx.companyId);
      const { workspace } = await resolveWorkspace(ctx, runCtx);
      const dirty = await git(workspace.path, ["status", "--porcelain"]);
      if (dirty) return await finishToolEvent(ctx, eventId, { error: "Publication refused: commit or discard existing workspace changes first." });
      const blogDir = join(workspace.path, "content", "blog");
      await mkdir(blogDir, { recursive: true });
      const filePath = join(blogDir, `${slug}.md`);
      const yaml = (value: string) => JSON.stringify(value);
      const body = `---\ntitle: ${yaml(title)}\nslug: ${yaml(slug)}\nexcerpt: ${yaml(excerpt)}\npublishedAt: ${yaml(new Date().toISOString())}\nauthor: ${yaml("Editorial Team")}\n---\n\n${content}\n`;
      await writeFile(filePath, body, { encoding: "utf8", flag: "wx" });
      await git(workspace.path, ["add", `content/blog/${slug}.md`]);
      await git(workspace.path, ["-c", "user.name=Foundry", "-c", "user.email=foundry@local", "commit", "-m", `content: publish ${slug}`]);
      const sha = await git(workspace.path, ["rev-parse", "HEAD"]);
      const branch = await git(workspace.path, ["rev-parse", "--abbrev-ref", "HEAD"]);
      await git(workspace.path, ["push", "origin", `HEAD:${branch}`]);
      const deployment = await matchingDeployment(ctx, runCtx.companyId, config, sha);
      await ctx.activity.log({ companyId: runCtx.companyId, message: `Published blog article ${title}`, entityType: "agent", entityId: runCtx.agentId, metadata: { runId: runCtx.runId, slug, filePath: `content/blog/${slug}.md`, sha, deployment } });
      return await finishToolEvent(ctx, eventId, { content: `Published ${title} in content/blog/${slug}.md at commit ${sha}.${deployment ? ` Deployment ${String(deployment.id)} is ${String(deployment.state)}.` : " Deployment discovery is pending."}`, data: { title, slug, filePath: `content/blog/${slug}.md`, sha, branch, deployment } }, { title, slug, sha, branch, deployment });
    } catch (error) { return await failToolEvent(ctx, eventId, error); }
  });
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("control-room", async (params) => companySnapshot(ctx, companyIdFrom(params)));

    ctx.actions.register("invoke-ceo", async (params) => {
      const companyId = companyIdFrom(params);
      const agents = await ctx.agents.list({ companyId, limit: 200, offset: 0 });
      const ceo = agents.find((agent) => agent.role === "ceo")
        ?? agents.find((agent) => agent.name.trim().toLowerCase() === "ceo");
      if (!ceo) throw new Error("No CEO agent is configured");
      const result = await ctx.agents.invoke(ceo.id, companyId, {
        reason: "foundry_manual_run",
        prompt: "Review the current company state, choose the highest-impact in-scope next action, and execute or delegate it. Use available Foundry MCP tools where relevant. Report evidence, never invented data.",
      });
      return { ...result, agentId: ceo.id };
    });

    ctx.actions.register("setup-company", async (params) => {
      const companyId = companyIdFrom(params);
      const project = await ctx.projects.managed.reconcile("company-operations", companyId);
      const agent = await ctx.agents.managed.reconcile("growth-operator", companyId);
      const skills = [];
      for (const key of ["ai-feature-integration", "database-auth", "payments", "blog-publishing", "product-design", "deployment", "qa-recovery"]) {
        skills.push(await ctx.skills.managed.reconcile(key, companyId));
      }
      const routines = [];
      routines.push(await ctx.routines.managed.reconcile("weekly-evidence-review", companyId));
      routines.push(await ctx.routines.managed.reconcile("weekly-blog", companyId));
      const toolGrants = await applyRoleToolGrants(ctx, companyId);
      await ctx.activity.log({ companyId, message: "Reconciled Foundry company operating template", entityType: "company", entityId: companyId, metadata: { project: project.status, agent: agent.status, skills: skills.map((entry) => entry.status), routines: routines.map((entry) => entry.status), toolGrantAgents: toolGrants.map((entry) => entry.agentId) } });
      return { project, agent, skills, routines, toolGrants };
    });

    ctx.actions.register("save-company-integrations", async (params) => {
      const companyId = companyIdFrom(params);
      const websiteUrl = optionalUrl(params.websiteUrl);
      const vercelProjectId = optionalId(params.vercelProjectId, "Vercel project ID");
      const vercelTeamId = optionalId(params.vercelTeamId, "Vercel team ID");
      await ctx.db.execute(
        `INSERT INTO ${ctx.db.namespace}.company_integrations (company_id, website_url, vercel_project_id, vercel_team_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (company_id) DO UPDATE SET website_url=excluded.website_url, vercel_project_id=excluded.vercel_project_id,
           vercel_team_id=excluded.vercel_team_id, updated_at=now()`,
        [companyId, websiteUrl, vercelProjectId, vercelTeamId],
      );
      await ctx.activity.log({ companyId, message: "Updated company-specific Foundry integration settings", entityType: "company", entityId: companyId, metadata: { websiteConfigured: Boolean(websiteUrl), vercelProjectConfigured: Boolean(vercelProjectId), vercelTeamConfigured: Boolean(vercelTeamId) } });
      return { websiteUrl, vercelProjectId, vercelTeamId };
    });

    ctx.actions.register("ask-ceo", async (params) => {
      const companyId = companyIdFrom(params);
      const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
      if (!prompt) throw new Error("prompt is required");
      const agents = await ctx.agents.list({ companyId, limit: 200, offset: 0 });
      const ceo = agents.find((agent) => agent.role === "ceo")
        ?? agents.find((agent) => agent.name.trim().toLowerCase() === "ceo");
      if (!ceo) throw new Error("No CEO agent is configured");
      const founderMessageId = crypto.randomUUID();
      const ceoMessageId = crypto.randomUUID();
      await createFounderCeoMessage(ctx, { id: founderMessageId, companyId, agentId: null, role: "founder", body: prompt, status: "completed" });
      await createFounderCeoMessage(ctx, { id: ceoMessageId, companyId, agentId: ceo.id, role: "ceo", status: "queued" });
      try {
        const existing = await ctx.agents.sessions.list(ceo.id, companyId);
        const session = existing[0] ?? await ctx.agents.sessions.create(ceo.id, companyId, { reason: "foundry_founder_chat" });
        const channel = `founder-chat:${ceo.id}`;
        ctx.streams.open(channel, companyId);
        const history = await listFounderCeoMessages(ctx, companyId);
        const sent = await ctx.agents.sessions.sendMessage(session.sessionId, companyId, {
          prompt: founderConversationPrompt(history),
          reason: "foundry_founder_chat",
          onEvent: (event) => ctx.streams.emit(channel, { type: event.eventType, stream: event.stream, text: event.message ?? "", runId: event.runId }),
        });
        await attachFounderCeoRun(ctx, ceoMessageId, sent.runId);
        return { ...sent, sessionId: session.sessionId, agentId: ceo.id, messageId: ceoMessageId };
      } catch (error) {
        await failFounderCeoMessage(ctx, ceoMessageId, error);
        throw error;
      }
    });

    registerTools(ctx);
  },

  async onHealth() {
    return { status: "ok", message: "Foundry control room and agent tools are ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
