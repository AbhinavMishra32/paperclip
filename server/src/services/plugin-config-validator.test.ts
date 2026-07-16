import { describe, expect, it } from "vitest";
import { validateInstanceConfig } from "./plugin-config-validator.js";

const schema = {
  type: "object" as const,
  properties: {
    token: {
      type: "string" as const,
      format: "secret-ref",
    },
  },
};

describe("validateInstanceConfig secret refs", () => {
  it("accepts the secure shared secret_ref binding", () => {
    expect(validateInstanceConfig({
      token: {
        type: "secret_ref",
        secretId: "77777777-7777-4777-8777-777777777777",
        version: "latest",
      },
    }, schema)).toEqual({ valid: true });
  });

  it("rejects raw values and malformed bindings", () => {
    expect(validateInstanceConfig({ token: "raw-secret" }, schema).valid).toBe(false);
    expect(validateInstanceConfig({
      token: { type: "secret_ref", secretId: "not-a-uuid" },
    }, schema).valid).toBe(false);
  });
});
