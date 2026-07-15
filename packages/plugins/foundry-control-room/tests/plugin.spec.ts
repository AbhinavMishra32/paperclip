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

  it("reports its actual worker status through the plugin bridge", async () => {
    const harness = createTestHarness({ manifest, capabilities: manifest.capabilities });
    await plugin.definition.setup(harness.ctx);
    const status = await harness.getData<{ status: string; checkedAt: string }>("control-room-status");
    expect(status.status).toBe("ready");
    expect(Date.parse(status.checkedAt)).toBeTruthy();
  });
});
