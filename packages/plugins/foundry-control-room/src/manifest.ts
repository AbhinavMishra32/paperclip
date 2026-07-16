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
  provisionDatabase: "provision_database",
  provisionAppEnvironment: "provision_app_environment",
  listDeployments: "get_vercel_deployments",
  deploymentEvents: "get_vercel_deployment_events",
  deployProject: "deploy_project",
  publishBlog: "publish_blog",
  recordLeads: "record_leads",
  sendOutboundEmail: "send_outbound_email",
} as const;

export const FOUNDRY_SKILLS = [
  "ai-feature-integration",
  "database-auth",
  "payments",
  "blog-publishing",
  "product-design",
  "deployment",
  "qa-recovery",
  "lead-generation",
  "outbound-email",
] as const;

export const FOUNDRY_SKILL_KEYS = FOUNDRY_SKILLS.map((key) => `plugin/${PLUGIN_ID.replaceAll(".", "-")}/${key}`);

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.6.0",
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
      smtpMode: {
        type: "string",
        enum: ["platform", "custom"],
        title: "Outbound email connection",
        description: "'platform' uses Foundry's shared outbound email connection. 'custom' uses the SMTP connection configured below.",
      },
      customSmtpHost: {
        type: "string",
        title: "Custom SMTP host",
      },
      customSmtpPort: {
        type: "string",
        title: "Custom SMTP port",
      },
      customSmtpUser: {
        type: "string",
        title: "Custom SMTP username",
      },
      customSmtpPassword: {
        type: "string",
        format: "secret-ref",
        title: "Custom SMTP password",
        description: "Stored as a company secret. Never exposed to agents or the UI.",
      },
      customSmtpFromEmail: {
        type: "string",
        title: "Custom SMTP from address",
      },
      customSmtpFromName: {
        type: "string",
        title: "Custom SMTP from name (optional)",
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
    capabilities: "Publishes evidence-based content, finds and emails real prospective leads, checks live deployments, and reports real growth signals using governed Foundry tools.",
    adapterType: "opencode_local",
    adapterPreference: ["opencode_local", "codex_local", "claude_local"],
    adapterConfig: {
      model: "opencode-go/deepseek-v4-flash",
      paperclipSkillSync: { desiredSkills: FOUNDRY_SKILL_KEYS },
    },
    runtimeConfig: { heartbeat: { maxConcurrentRuns: 1 } },
    permissions: { pluginTools: [PLUGIN_ID] },
    status: "idle",
    budgetMonthlyCents: 0,
    instructions: {
      entryFile: "AGENTS.md",
      content: "You are the Growth and Publishing Operator. Work only from real company evidence. Use Foundry tools for blog publication, lead generation, outbound email, and deployment verification; never claim publication, traffic, leads, contacts, or revenue without a successful tool result. Follow the Paperclip task lifecycle and the managed skills synced into your runtime.",
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
    {
      routineKey: "weekly-lead-generation",
      title: "Find real prospective leads",
      description: "Research real, sourced candidates who plausibly need this product and call record_leads with them. Skip when no honest candidates can be found. Never invent leads.",
      assigneeRef: { resourceKind: "agent", resourceKey: "growth-operator" },
      projectRef: { resourceKind: "project", resourceKey: "company-operations" },
      status: "active",
      priority: "low",
      concurrencyPolicy: "skip_if_active",
      catchUpPolicy: "skip_missed",
      triggers: [{ kind: "schedule", label: "Weekly lead search", enabled: true, cronExpression: "0 9 * * 1", timezone: "UTC", signingMode: null, replayWindowSec: null }],
      issueTemplate: { originId: "routine:weekly-lead-generation", billingCode: "foundry:growth" },
    },
    {
      routineKey: "weekly-outbound",
      title: "Send outbound email to new leads",
      description: "Review leads with status 'new' and send each a short, personalized first-contact email via send_outbound_email. Skip leads that are not status 'new'. Skip entirely if outbound email is not configured.",
      assigneeRef: { resourceKind: "agent", resourceKey: "growth-operator" },
      projectRef: { resourceKind: "project", resourceKey: "company-operations" },
      status: "active",
      priority: "low",
      concurrencyPolicy: "skip_if_active",
      catchUpPolicy: "skip_missed",
      triggers: [{ kind: "schedule", label: "Weekly outbound send", enabled: true, cronExpression: "0 9 * * 3", timezone: "UTC", signingMode: null, replayWindowSec: null }],
      issueTemplate: { originId: "routine:weekly-outbound", billingCode: "foundry:growth" },
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
      name: TOOL_NAMES.provisionDatabase,
      displayName: "Provision application database",
      description: "Provision a real Neon Postgres database through Vercel Marketplace, connect it to the existing project, and run the committed db:migrate script without revealing credentials.",
      parametersSchema: {
        type: "object",
        properties: {
          region: { type: "string", enum: ["cle1", "iad1", "pdx1", "fra1", "lhr1", "syd1", "sin1", "gru1"] },
        },
      },
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
      name: TOOL_NAMES.deploymentEvents,
      displayName: "Get Vercel deployment events",
      description: "Read real build events and error output for one deployment in the configured Vercel project.",
      parametersSchema: {
        type: "object",
        properties: { deploymentId: { type: "string", pattern: "^dpl_[A-Za-z0-9]+$" }, limit: { type: "integer", minimum: 1, maximum: 200 } },
        required: ["deploymentId"],
      },
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
    {
      name: TOOL_NAMES.recordLeads,
      displayName: "Record found leads",
      description: "Store real, sourced prospective-customer leads. Rejects candidates without a source URL and deduplicates by email against existing leads for this company.",
      parametersSchema: {
        type: "object",
        properties: {
          leads: {
            type: "array",
            minItems: 1,
            maxItems: 25,
            items: {
              type: "object",
              required: ["name", "email", "sourceUrl"],
              properties: {
                name: { type: "string", minLength: 1 },
                title: { type: "string" },
                companyName: { type: "string" },
                email: { type: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
                sourceUrl: { type: "string", pattern: "^https?://" },
                notes: { type: "string", maxLength: 500 },
              },
            },
          },
        },
        required: ["leads"],
      },
    },
    {
      name: TOOL_NAMES.sendOutboundEmail,
      displayName: "Send outbound email",
      description: "Send a real first-contact email to a recorded lead through whichever SMTP connection the company has configured (custom, or the shared Foundry default). Fails honestly if no connection is configured. Updates the lead's status.",
      parametersSchema: {
        type: "object",
        properties: {
          leadId: { type: "string" },
          subject: { type: "string", minLength: 3, maxLength: 200 },
          body: { type: "string", minLength: 20, maxLength: 5000 },
        },
        required: ["leadId", "subject", "body"],
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
