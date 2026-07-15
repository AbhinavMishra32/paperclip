import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const TOOL_NAMES = {
  companyContext: "get_company_context",
  integrationStatus: "get_integration_status",
  createStripePaymentLink: "create_stripe_payment_link",
  provisionVercelSecret: "provision_vercel_secret",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: "foundry.control-room",
  apiVersion: 1,
  version: "0.3.0",
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
    "goals.read",
    "activity.read",
    "activity.log.write",
    "http.outbound",
    "secrets.read-ref",
    "agent.tools.register",
    "instance.settings.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
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
    },
  },
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
