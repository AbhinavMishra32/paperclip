import {
  definePlugin,
  runWorker,
  type EnvSecretRefBinding,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "./manifest.js";

type FoundryConfig = {
  websiteUrl?: string;
  stripeSecretKey?: string | EnvSecretRefBinding;
  vercelToken?: string | EnvSecretRefBinding;
  vercelProjectId?: string;
  vercelTeamId?: string;
};

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
  return await ctx.config.get(companyId) as FoundryConfig;
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
  };
}

async function companySnapshot(ctx: PluginContext, companyId: string) {
  const [company, agents, issues, projects, goals, activity, runs, config] = await Promise.all([
    ctx.companies.get(companyId),
    ctx.agents.list({ companyId, limit: 200, offset: 0 }),
    ctx.issues.list({ companyId, limit: 200, offset: 0 }),
    ctx.projects.list({ companyId, limit: 200, offset: 0 }),
    ctx.goals.list({ companyId, limit: 200, offset: 0 }),
    ctx.activity.list({ companyId, limit: 80 }),
    ctx.activity.listRuns({ companyId, limit: 80 }),
    getConfig(ctx, companyId),
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
  const ceo = agents.find((agent) => agent.role === "ceo") ?? null;
  const activeStatuses = new Set(["backlog", "todo", "in_progress", "in_review", "blocked"]);
  const completeStatuses = new Set(["done", "cancelled"]);
  const activeIssues = issues.filter((issue) => activeStatuses.has(issue.status));
  const completedIssues = issues.filter((issue) => completeStatuses.has(issue.status));
  const failedRuns = runs.filter((run) => run.status === "failed");
  const runningRuns = runs.filter((run) => run.status === "running" || run.status === "queued");
  const connectedOpenCodeAgents = agents.filter((agent) => agent.adapterType === "opencode_local");

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
    workspaces,
    documents: documentCounts.flatMap((entry) => entry.documents.map((document) => ({ ...document, issueId: entry.issueId, issueIdentifier: entry.issueIdentifier, issueTitle: entry.issueTitle }))),
    integrations: integrationStatus(config),
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
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("control-room", async (params) => companySnapshot(ctx, companyIdFrom(params)));

    ctx.actions.register("invoke-ceo", async (params) => {
      const companyId = companyIdFrom(params);
      const agents = await ctx.agents.list({ companyId, limit: 200, offset: 0 });
      const ceo = agents.find((agent) => agent.role === "ceo");
      if (!ceo) throw new Error("No CEO agent is configured");
      const result = await ctx.agents.invoke(ceo.id, companyId, {
        reason: "foundry_manual_run",
        prompt: "Review the current company state, choose the highest-impact in-scope next action, and execute or delegate it. Use available Foundry MCP tools where relevant. Report evidence, never invented data.",
      });
      return { ...result, agentId: ceo.id };
    });

    ctx.actions.register("ask-ceo", async (params) => {
      const companyId = companyIdFrom(params);
      const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
      if (!prompt) throw new Error("prompt is required");
      const agents = await ctx.agents.list({ companyId, limit: 200, offset: 0 });
      const ceo = agents.find((agent) => agent.role === "ceo");
      if (!ceo) throw new Error("No CEO agent is configured");
      const existing = await ctx.agents.sessions.list(ceo.id, companyId);
      const session = existing[0] ?? await ctx.agents.sessions.create(ceo.id, companyId, { reason: "foundry_founder_chat" });
      const channel = `founder-chat:${ceo.id}`;
      ctx.streams.open(channel, companyId);
      const sent = await ctx.agents.sessions.sendMessage(session.sessionId, companyId, {
        prompt,
        reason: "foundry_founder_chat",
        onEvent: (event) => ctx.streams.emit(channel, { type: event.eventType, stream: event.stream, text: event.message ?? "", runId: event.runId }),
      });
      return { ...sent, sessionId: session.sessionId, agentId: ceo.id };
    });

    registerTools(ctx);
  },

  async onHealth() {
    return { status: "ok", message: "Foundry control room and agent tools are ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
