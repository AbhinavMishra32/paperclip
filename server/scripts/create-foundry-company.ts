#!/usr/bin/env npx tsx
/**
 * Create a new company with the full Foundry-managed template in one run:
 * Core Exec Team (CEO/CTO/QA on opencode_local/deepseek-v4-flash, chain of
 * command wired up), base + catalog skills, Foundry plugin skills/routines/
 * tool-grants, founder membership, and a real mission kickoff task assigned
 * to the CEO.
 *
 * This exists because none of these steps are exposed to Foundry's own
 * plugin worker (company/team/skill-catalog creation are core platform
 * operations, not plugin capabilities) — so it runs as a server-side script
 * against the same services the real routes use, not raw SQL.
 *
 * Usage (from server/, inside the running container or locally):
 *   tsx scripts/create-foundry-company.ts \
 *     --name "StudyLoop" \
 *     --description "An AI flashcard generator." \
 *     --mission "Paste in notes, get AI-generated flashcards. Free tier + paid unlimited tier." \
 *     --owner-user-id kXVhYSO4ELd0QFfEcAikMYY5R6WjhOxl \
 *     --plugin-id 86ab352d-6653-4c81-b6bf-1246768c704c \
 *     --plugin-key foundry.control-room
 */
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { createDb, agents } from "@paperclipai/db";
import { companyService } from "../src/services/companies.js";
import { teamsCatalogService } from "../src/services/teams-catalog.js";
import { companySkillService } from "../src/services/company-skills.js";
import { pluginManagedAgentService } from "../src/services/plugin-managed-agents.js";
import { pluginManagedSkillService } from "../src/services/plugin-managed-skills.js";
import { pluginManagedRoutineService } from "../src/services/plugin-managed-routines.js";
import { projectService } from "../src/services/projects.js";
import { accessService } from "../src/services/access.js";
import { issueService } from "../src/services/issues.js";

const MODEL = "opencode-go/deepseek-v4-flash";
const ADAPTER = "opencode_local";
const FOUNDRY_SKILL_KEYS = [
  "ai-feature-integration", "database-auth", "payments", "blog-publishing",
  "product-design", "deployment", "qa-recovery", "lead-generation", "outbound-email",
];
const FOUNDRY_ROUTINE_KEYS = ["weekly-evidence-review", "weekly-blog", "weekly-lead-generation", "weekly-outbound"];
const ROLE_TOOLS: Record<string, string[]> = {
  ceo: ["get_company_context", "get_integration_status", "check_openrouter_connection", "get_vercel_deployments"],
  "engineering-manager": ["get_company_context", "get_integration_status", "check_openrouter_connection", "provision_database", "provision_app_environment", "get_vercel_deployments", "get_vercel_deployment_events", "deploy_project"],
  qa: ["get_company_context", "get_integration_status", "check_openrouter_connection", "get_vercel_deployments", "get_vercel_deployment_events"],
  growth: ["get_company_context", "get_integration_status", "get_vercel_deployments", "publish_blog", "record_leads", "send_outbound_email"],
};
const BASE_SKILL_DIRS = ["paperclip", "paperclip-create-agent"];

async function setAgentAdapterConfig(db: ReturnType<typeof createDb>, agentId: string, patch: (cfg: Record<string, unknown>) => Record<string, unknown>) {
  const [row] = await db.select().from(agents).where(eq(agents.id, agentId));
  if (!row) throw new Error(`agent ${agentId} not found`);
  const cfg = patch({ ...(row.adapterConfig as Record<string, unknown> ?? {}) });
  await db.update(agents).set({ adapterConfig: cfg }).where(eq(agents.id, agentId));
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      description: { type: "string" },
      mission: { type: "string" },
      "owner-user-id": { type: "string" },
      "plugin-id": { type: "string" },
      "plugin-key": { type: "string", default: "foundry.control-room" },
    },
  });
  if (!values.name || !values["owner-user-id"] || !values["plugin-id"]) {
    console.error("Required: --name, --owner-user-id, --plugin-id. Optional: --description, --mission, --plugin-key");
    process.exit(1);
  }
  const name = values.name;
  const description = values.description ?? "";
  const mission = values.mission ?? description;
  const ownerUserId = values["owner-user-id"];
  const pluginId = values["plugin-id"]!;
  const pluginKey = values["plugin-key"]!;
  const pluginNs = pluginKey.replaceAll(".", "-");

  const db = createDb(process.env.DATABASE_URL);
  const result: Record<string, unknown> = {};

  // 1. Create the company.
  const company = await companyService(db).create({ name, description, status: "active", defaultResponsibleUserId: ownerUserId });
  result.company = { id: company.id, prefix: company.issuePrefix };

  // 2. Founder membership so the creating user can see the company.
  await accessService(db).ensureMembership(company.id, "user", ownerUserId, "owner", "active");

  // 3. Core Exec Team (CEO/CTO/QA). installCatalogTeam rejects non-"safe" adapter
  //    overrides, so accept its default (claude_local) here and correct it right after.
  const team = await teamsCatalogService(db).installCatalogTeam(company.id, "paperclipai/bundled/company-defaults/core-exec-team", {});
  const agentBySlug = new Map(team.portabilityImport.agents.map((a) => [a.slug, a.id] as const));
  const ceoId = agentBySlug.get("ceo")!;
  const ctoId = agentBySlug.get("cto")!;
  const qaId = agentBySlug.get("qa")!;
  result.coreTeam = Object.fromEntries(agentBySlug);

  // 4. Fix adapter + model for every Core Exec Team agent.
  for (const agentId of agentBySlug.values()) {
    await setAgentAdapterConfig(db, agentId, (cfg) => ({ ...cfg, model: MODEL }));
    await db.update(agents).set({ adapterType: ADAPTER }).where(eq(agents.id, agentId));
  }

  // 5. Install + assign catalog skills (issue-triage, task-planning, github-pr-workflow, qa-acceptance).
  const skillSvc = companySkillService(db);
  const catalogSkillIds = [
    "paperclipai:bundled:paperclip-operations:issue-triage",
    "paperclipai:bundled:paperclip-operations:task-planning",
    "paperclipai:bundled:software-development:github-pr-workflow",
    "paperclipai:bundled:quality:qa-acceptance",
  ];
  for (const catalogSkillId of catalogSkillIds) {
    await skillSvc.installFromCatalog(company.id, { catalogSkillId }).catch((e: Error) => { throw new Error(`catalog skill ${catalogSkillId}: ${e.message}`); });
  }

  // 6. Base "how Paperclip works" skills — not in the catalog system, read straight from the repo's root skills/ dir.
  const repoRoot = new URL("../../", import.meta.url).pathname;
  const baseSkillKeys: Record<string, string> = {};
  for (const dir of BASE_SKILL_DIRS) {
    const markdown = await readFile(`${repoRoot}skills/${dir}/SKILL.md`, "utf8");
    const nameMatch = /^name:\s*(.+)$/m.exec(markdown);
    const created = await skillSvc.createLocalSkill(company.id, { name: nameMatch?.[1]?.trim() ?? dir, slug: dir, markdown });
    baseSkillKeys[dir] = created.key;
  }

  // 7. Assign catalog + base skills to agents' desiredSkills.
  const desired: Record<string, string[]> = {
    [ceoId]: [
      "paperclipai/bundled/paperclip-operations/issue-triage",
      "paperclipai/bundled/paperclip-operations/task-planning",
      baseSkillKeys.paperclip,
      baseSkillKeys["paperclip-create-agent"],
    ],
    [ctoId]: [
      "paperclipai/bundled/software-development/github-pr-workflow",
      "paperclipai/bundled/paperclip-operations/task-planning",
      `plugin/${pluginNs}/ai-feature-integration`,
      `plugin/${pluginNs}/database-auth`,
      `plugin/${pluginNs}/payments`,
      `plugin/${pluginNs}/deployment`,
      `plugin/${pluginNs}/product-design`,
    ],
    [qaId]: [
      "paperclipai/bundled/quality/qa-acceptance",
      `plugin/${pluginNs}/qa-recovery`,
    ],
  };
  for (const [agentId, keys] of Object.entries(desired)) {
    await setAgentAdapterConfig(db, agentId, (cfg) => {
      const sync = (cfg.paperclipSkillSync as { desiredSkills?: string[] } | undefined) ?? {};
      const existing = sync.desiredSkills ?? [];
      return { ...cfg, paperclipSkillSync: { ...sync, desiredSkills: [...new Set([...existing, ...keys])] } };
    });
  }

  // 8. Foundry: company-operations project, Growth Operator agent (desiredSkills baked into its own manifest declaration).
  const manifestMod = await import("../../packages/plugins/foundry-control-room/dist/manifest.js");
  const manifest = manifestMod.default;
  const project = await projectService(db).resolveManagedProject({ companyId: company.id, pluginId, pluginKey, projectKey: "company-operations" });
  const growthAgent = await pluginManagedAgentService(db, { pluginId, pluginKey, manifest, instructionTemplateVariables: async () => ({}) }).reconcile("growth-operator", company.id);
  const growthId = growthAgent.agentId!;
  result.foundryProject = project.status;
  result.growthAgentId = growthId;

  // 9. Growth Operator reports to CEO (Foundry's manifest doesn't declare this itself).
  await db.update(agents).set({ reportsTo: ceoId }).where(eq(agents.id, growthId));

  // 10. Foundry skills + routines.
  const managedSkills = pluginManagedSkillService(db, { pluginId, pluginKey, manifest });
  for (const key of FOUNDRY_SKILL_KEYS) await managedSkills.reconcile(key, company.id);
  const managedRoutines = pluginManagedRoutineService(db, { pluginId, pluginKey, manifest, pluginWorkerManager: undefined });
  for (const key of FOUNDRY_ROUTINE_KEYS) await managedRoutines.reconcile(key, company.id);

  // 11. Tool grants.
  const access = accessService(db);
  const ns = (n: string) => `tool:${pluginKey}:${n}`;
  const grantMap: Array<[string, string[]]> = [
    [ceoId, ROLE_TOOLS.ceo], [ctoId, ROLE_TOOLS["engineering-manager"]], [qaId, ROLE_TOOLS.qa], [growthId, ROLE_TOOLS.growth],
  ];
  for (const [agentId, tools] of grantMap) {
    await access.setPrincipalGrants(company.id, "agent", agentId, [{ permissionKey: "tools:use", scope: { allow: tools.map(ns) } }], null);
  }

  // 12. Real kickoff task with the actual mission, assigned to CEO, in the Core Exec Team's starter project.
  const projects = await projectService(db).list(company.id);
  const firstProjectId = projects.find((p) => p.name === "First Project")?.id ?? null;
  const kickoff = await issueService(db).create(company.id, {
    title: `Build and ship ${name} v1`,
    description: `Mission: ${mission}\n\nAs CEO, plan this out and delegate to your CTO (build the product using the installed Foundry skills — ai-feature-integration, database-auth, payments, deployment, product-design as applicable) and QA (verify via qa-recovery). Do not build it yourself.`,
    status: "todo",
    priority: "high",
    assigneeAgentId: ceoId,
    projectId: firstProjectId ?? undefined,
  });
  result.kickoffTask = kickoff.identifier;

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
