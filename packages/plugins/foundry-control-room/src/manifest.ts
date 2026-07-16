import { readFileSync } from "node:fs";
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "foundry.control-room";

const skillMarkdown = (key: string) => readFileSync(new URL(`../skills/${key}/SKILL.md`, import.meta.url), "utf8");

export const TOOL_NAMES = {
  companyContext: "get_company_context",
  integrationStatus: "get_integration_status",
  createStripePaymentLink: "create_stripe_payment_link",
  provisionVercelSecret: "provision_vercel_secret",
  checkOpenRouter: "check_openrouter_connection",
  provisionAppEnvironment: "provision_app_environment",
  listDeployments: "get_vercel_deployments",
  deployProject: "deploy_project",
  publishBlog: "publish_blog",
} as const;

export const FOUNDRY_SKILLS = [
  "ai-feature-integration",
  "database-auth",
  "payments",
  "blog-publishing",
  "product-design",
  "deployment",
  "qa-recovery",
] as const;

export const FOUNDRY_SKILL_KEYS = FOUNDRY_SKILLS.map((key) => `plugin/${PLUGIN_ID.replaceAll(".", "-")}/${key}`);

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.5.0",
  displayName: "Foundry",
  description: "Founder-facing company control room and secure business tools.",
  author: "Abhinav Mishra",
  categories: ["ui", "automation", "connector"],
  capabilities: [
    "ui.page.register",
    "companies.read",
    "projects.read",
    "project.workspaces.read",
    "issues.read",
    "issue.documents.read",
    "agents.read",
    "agents.invoke",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "database.namespace.migrate",
    "database.namespace.read",
    "database.namespace.write",
    "goals.read",
    "activity.read",
    "activity.log.write",
    "http.outbound",
    "secrets.read-ref",
    "agent.tools.register",
    "instance.settings.register",
    "agents.managed",
    "projects.managed",
    "routines.managed",
    "skills.managed",
    "authorization.grants.read",
    "authorization.grants.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  database: {
    namespaceSlug: "foundry_control_room",
    migrationsDir: "migrations",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      websiteUrl: {
        type: "string",
        title: "Company website URL",
        description: "The real production URL shown in Foundry. Leave empty until deployed.",
      },
      stripeSecretKey: {
        type: "string",
        format: "secret-ref",
        title: "Stripe secret key",
        description: "Stored as a company secret. Agents can call Stripe tools but cannot read this value.",
      },
      vercelToken: {
        type: "string",
        format: "secret-ref",
        title: "Vercel access token",
        description: "Stored as a company secret and used only by Foundry's Vercel tool.",
      },
      vercelProjectId: {
        type: "string",
        title: "Vercel project ID",
      },
      vercelTeamId: {
        type: "string",
        title: "Vercel team ID (optional)",
      },
      openrouterApiKey: {
        type: "string",
        format: "secret-ref",
        title: "OpenRouter API key",
        description: "Company-bound OpenRouter credential. Agents can provision it but cannot read it.",
      },
      databaseUrl: {
        type: "string",
        format: "secret-ref",
        title: "Application database URL",
        description: "A company application database; never the Paperclip control-plane database.",
      },
      authSecret: {
        type: "string",
        format: "secret-ref",
        title: "Application auth secret",
        description: "Random application session-signing secret.",
      },
    },
  },
  projects: [{
    projectKey: "company-operations",
    displayName: "Company Operations",
    description: "Foundry-managed growth, publishing, deployment-health, and operating review work.",
    status: "in_progress",
    color: "#635bff",
  }],
  agents: [{
    agentKey: "growth-operator",
    displayName: "Growth Operator",
    role: "growth",
    title: "Growth and Publishing Operator",
    capabilities: "Publishes evidence-based content, checks live deployments, and reports real growth signals using governed Foundry tools.",
    adapterType: "opencode_local",
    adapterPreference: ["opencode_local", "codex_local", "claude_local"],
    adapterConfig: {
      model: "opencode-go/deepseek-v4-flash",
      paperclipSkillSync: { desiredSkills: FOUNDRY_SKILL_KEYS },
    },
    permissions: { pluginTools: [PLUGIN_ID] },
    status: "idle",
    budgetMonthlyCents: 0,
    instructions: {
      entryFile: "AGENTS.md",
      content: "You are the Growth and Publishing Operator. Work only from real company evidence. Use Foundry tools for blog publication and deployment verification; never claim publication, traffic, leads, or revenue without a successful tool result. Follow the Paperclip task lifecycle and the managed skills synced into your runtime.",
    },
  }],
  skills: FOUNDRY_SKILLS.map((key) => ({
    skillKey: key,
    displayName: key.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" "),
    slug: key,
    description: `Foundry company operating guidance for ${key.replaceAll("-", " ")}.`,
    markdown: skillMarkdown(key),
  })),
  routines: [
    {
      routineKey: "weekly-evidence-review",
      title: "Review live product evidence",
      description: "Inspect real deployment, task, QA, and integration evidence. Create focused follow-up work for concrete failures or stalled outcomes. Never manufacture activity or metrics.",
      assigneeRef: { resourceKind: "agent", resourceKey: "growth-operator" },
      projectRef: { resourceKind: "project", resourceKey: "company-operations" },
      status: "active",
      priority: "medium",
      concurrencyPolicy: "skip_if_active",
      catchUpPolicy: "skip_missed",
      triggers: [{ kind: "schedule", label: "Daily operating review", enabled: true, cronExpression: "15 8 * * *", timezone: "UTC", signingMode: null, replayWindowSec: null }],
      issueTemplate: { originId: "routine:weekly-evidence-review", billingCode: "foundry:operations" },
    },
    {
      routineKey: "weekly-blog",
      title: "Publish one evidence-based company article",
      description: "Choose a useful topic supported by the real product and customer problem. Draft an original article, call publish_blog, and close only after the tool returns the commit and live deployment evidence. Skip when there is no honest topic.",
      assigneeRef: { resourceKind: "agent", resourceKey: "growth-operator" },
      projectRef: { resourceKind: "project", resourceKey: "company-operations" },
      status: "active",
      priority: "low",
      concurrencyPolicy: "skip_if_active",
      catchUpPolicy: "skip_missed",
      triggers: [{ kind: "schedule", label: "Weekly article", enabled: true, cronExpression: "30 9 * * 2", timezone: "UTC", signingMode: null, replayWindowSec: null }],
      issueTemplate: { originId: "routine:weekly-blog", billingCode: "foundry:content" },
    },
  ],
  tools: [
    {
      name: TOOL_NAMES.companyContext,
      displayName: "Get company context",
      description: "Read the current Paperclip company's projects, tasks, goals, agents, and workspace readiness.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.integrationStatus,
      displayName: "Get integration status",
      description: "Report which Foundry integrations are configured without revealing any credentials.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.createStripePaymentLink,
      displayName: "Create Stripe payment link",
      description: "Create a real Stripe product, price, and payment link using the company-bound secret. The secret is never returned.",
      parametersSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer-visible product name." },
          amountCents: { type: "integer", minimum: 50, description: "Unit amount in the smallest currency unit." },
          currency: { type: "string", pattern: "^[a-zA-Z]{3}$", description: "Three-letter currency code, such as usd." },
        },
        required: ["name", "amountCents", "currency"],
      },
    },
    {
      name: TOOL_NAMES.provisionVercelSecret,
      displayName: "Provision Stripe into Vercel",
      description: "Securely provision the company-bound Stripe secret into the configured Vercel project. The secret is never returned.",
      parametersSchema: {
        type: "object",
        properties: {
          target: {
            type: "array",
            items: { type: "string", enum: ["production", "preview", "development"] },
            minItems: 1,
            description: "Vercel environments that receive STRIPE_SECRET_KEY.",
          },
        },
        required: ["target"],
      },
    },
    {
      name: TOOL_NAMES.checkOpenRouter,
      displayName: "Check OpenRouter connection",
      description: "Verify the company OpenRouter credential and Laguna model availability without revealing the credential.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.provisionAppEnvironment,
      displayName: "Provision application environment",
      description: "Provision approved company secrets into the configured Vercel project without returning their values.",
      parametersSchema: {
        type: "object",
        properties: {
          variables: { type: "array", items: { type: "string", enum: ["OPENROUTER_API_KEY", "DATABASE_URL", "AUTH_SECRET", "STRIPE_SECRET_KEY"] }, minItems: 1 },
          target: { type: "array", items: { type: "string", enum: ["production", "preview", "development"] }, minItems: 1 },
        },
        required: ["variables", "target"],
      },
    },
    {
      name: TOOL_NAMES.listDeployments,
      displayName: "Get Vercel deployments",
      description: "Read real recent deployments for the configured Vercel project.",
      parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 } } },
    },
    {
      name: TOOL_NAMES.deployProject,
      displayName: "Deploy project",
      description: "Push the current committed project workspace and return the real matching Vercel deployment state. Refuses dirty worktrees.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.publishBlog,
      displayName: "Publish blog article",
      description: "Write a validated Markdown article into the company's existing blog content contract, commit it, push it, and report real deployment evidence.",
      parametersSchema: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 5 }, slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          excerpt: { type: "string", minLength: 20 }, contentMarkdown: { type: "string", minLength: 200 },
        },
        required: ["title", "slug", "excerpt", "contentMarkdown"],
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: "control-room",
        displayName: "Foundry",
        exportName: "ControlRoomPage",
        routePath: "foundry",
      },
    ],
  },
};

export default manifest;
