import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  applyLocalOpenCodeStateIsolation,
  ensureOpenCodeSkillAvailable,
  ensureRemoteOpenCodeModelConfiguredAndAvailable,
} from "./execute.js";

describe("applyLocalOpenCodeStateIsolation", () => {
  it("gives each agent separate local OpenCode database directories", () => {
    const first = applyLocalOpenCodeStateIsolation({}, "agent-one");
    const second = applyLocalOpenCodeStateIsolation({}, "agent-two");

    expect(first.XDG_DATA_HOME).toContain("paperclip-opencode/agent-one/data");
    expect(first.XDG_CACHE_HOME).toContain("paperclip-opencode/agent-one/cache");
    expect(first.XDG_STATE_HOME).toContain("paperclip-opencode/agent-one/state");
    expect(second.XDG_DATA_HOME).not.toBe(first.XDG_DATA_HOME);
  });

  it("preserves explicit XDG directories", () => {
    expect(applyLocalOpenCodeStateIsolation({
      XDG_DATA_HOME: "/custom/data",
      XDG_CACHE_HOME: "/custom/cache",
      XDG_STATE_HOME: "/custom/state",
    }, "agent-one")).toMatchObject({
      XDG_DATA_HOME: "/custom/data",
      XDG_CACHE_HOME: "/custom/cache",
      XDG_STATE_HOME: "/custom/state",
    });
  });
});

describe("ensureOpenCodeSkillAvailable", () => {
  it("materializes a skill when the runtime filesystem rejects symlinks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-opencode-skill-"));
    const source = path.join(root, "source");
    const target = path.join(root, "target");
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, "SKILL.md"), "# Test skill\n", "utf8");
    const linkError = Object.assign(new Error("symlinks unavailable"), { code: "EIO" });

    try {
      await expect(
        ensureOpenCodeSkillAvailable(
          source,
          target,
          async () => {
            throw linkError;
          },
        ),
      ).resolves.toBe("materialized");
      await expect(fs.readFile(path.join(target, "SKILL.md"), "utf8"))
        .resolves.toBe("# Test skill\n");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not hide unrelated symlink failures", async () => {
    await expect(
      ensureOpenCodeSkillAvailable(
        "/catalog/reflection-coach",
        "/runtime/skills/reflection-coach",
        async () => {
          throw Object.assign(new Error("permission denied"), { code: "EACCES" });
        },
      ),
    ).rejects.toThrow("permission denied");
  });
});

describe("ensureRemoteOpenCodeModelConfiguredAndAvailable", () => {
  afterEach(() => {
    delete process.env.OPENCODE_ALLOW_ALL_MODELS;
  });

  // The remote/sandbox execution path must honour OPENCODE_ALLOW_ALL_MODELS just
  // like the local path: gateway-routed models (e.g. anthropic/<gateway>/<model>
  // via Bifrost) never appear in `opencode models`, so the availability probe
  // must be skipped. The early return happens before the executionTarget is ever
  // touched, so a bogus target proves the probe was not run.
  const bogusTarget = {} as never;

  it("skips the remote availability probe when OPENCODE_ALLOW_ALL_MODELS is set in the run env", async () => {
    await expect(
      ensureRemoteOpenCodeModelConfiguredAndAvailable({
        runId: "run-1",
        executionTarget: bogusTarget,
        command: "opencode",
        model: "anthropic/tensorix/deepseek/deepseek-chat-v3.1",
        cwd: "/tmp",
        env: { OPENCODE_ALLOW_ALL_MODELS: "true" },
        timeoutSec: 30,
        graceSec: 5,
      }),
    ).resolves.toBeUndefined();
  });

  it("honours OPENCODE_ALLOW_ALL_MODELS from the process env", async () => {
    process.env.OPENCODE_ALLOW_ALL_MODELS = "1";
    await expect(
      ensureRemoteOpenCodeModelConfiguredAndAvailable({
        runId: "run-2",
        executionTarget: bogusTarget,
        command: "opencode",
        model: "anthropic/tensorix/deepseek/deepseek-chat-v3.1",
        cwd: "/tmp",
        env: {},
        timeoutSec: 30,
        graceSec: 5,
      }),
    ).resolves.toBeUndefined();
  });

  it("still enforces provider/model format even when the bypass flag is set", async () => {
    await expect(
      ensureRemoteOpenCodeModelConfiguredAndAvailable({
        runId: "run-3",
        executionTarget: bogusTarget,
        command: "opencode",
        model: "",
        cwd: "/tmp",
        env: { OPENCODE_ALLOW_ALL_MODELS: "true" },
        timeoutSec: 30,
        graceSec: 5,
      }),
    ).rejects.toThrow();
  });
});
