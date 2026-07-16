import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("Foundry Control Room", () => {
  it("declares a company-context page", () => {
    expect(manifest.capabilities).toContain("ui.page.register");
    expect(manifest.ui?.slots).toContainEqual(expect.objectContaining({
      type: "page",
      routePath: "foundry"
    }));
  });

  it("registers real company data and agent tools", async () => {
    const harness = createTestHarness({ manifest, capabilities: manifest.capabilities });
    await plugin.definition.setup(harness.ctx);
    expect(manifest.tools?.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_company_context",
      "get_integration_status",
      "create_stripe_payment_link",
      "provision_vercel_secret",
      "check_openrouter_connection",
      "provision_app_environment",
      "get_vercel_deployments",
      "deploy_project",
      "publish_blog",
    ]));
    expect(manifest.capabilities).toContain("activity.read");
    expect(manifest.capabilities).toContain("agent.tools.register");
    expect(manifest.capabilities).toContain("authorization.grants.write");
    expect(manifest.skills?.map((skill) => skill.skillKey)).toEqual(expect.arrayContaining([
      "ai-feature-integration",
      "database-auth",
      "payments",
      "blog-publishing",
      "product-design",
      "deployment",
      "qa-recovery",
    ]));
    expect(manifest.routines?.map((routine) => routine.routineKey)).toEqual(expect.arrayContaining([
      "weekly-evidence-review",
      "weekly-blog",
    ]));
  });
});
