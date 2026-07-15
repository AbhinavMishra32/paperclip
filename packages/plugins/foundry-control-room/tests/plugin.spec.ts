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
    ]));
    expect(manifest.capabilities).toContain("activity.read");
    expect(manifest.capabilities).toContain("agent.tools.register");
  });
});
