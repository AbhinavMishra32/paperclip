/**
 * @fileoverview Validates plugin instance configuration against its JSON Schema.
 *
 * Uses Ajv to validate `configJson` values against the `instanceConfigSchema`
 * declared in a plugin's manifest. This ensures that invalid configuration is
 * rejected at the API boundary, not discovered later at worker startup.
 *
 * @module server/services/plugin-config-validator
 */

import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import type { JsonSchema } from "@paperclipai/shared";

export interface ConfigValidationResult {
  valid: boolean;
  errors?: { field: string; message: string }[];
}

const secretRefBindingSchema: JsonSchema = {
  type: "object",
  required: ["type", "secretId"],
  additionalProperties: false,
  properties: {
    type: { const: "secret_ref" },
    secretId: { type: "string", format: "uuid" },
    version: {
      anyOf: [
        { const: "latest" },
        { type: "integer", minimum: 1 },
      ],
    },
    projectionClass: {
      enum: ["unclassified", "class_3_static_lease"],
    },
    projectionAllowlistKey: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 160 },
        { type: "null" },
      ],
    },
  },
};

function schemaForSecureSecretRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaForSecureSecretRefs);
  if (!value || typeof value !== "object") return value;

  const schema = value as Record<string, unknown>;
  if (schema.format === "secret-ref") {
    return {
      ...secretRefBindingSchema,
      title: schema.title,
      description: schema.description,
    };
  }

  return Object.fromEntries(
    Object.entries(schema).map(([key, child]) => [key, schemaForSecureSecretRefs(child)]),
  );
}

/**
 * Validate a config object against a JSON Schema.
 *
 * @param configJson - The configuration values to validate.
 * @param schema - The JSON Schema from the plugin manifest's `instanceConfigSchema`.
 * @returns Validation result with structured field errors on failure.
 */
export function validateInstanceConfig(
  configJson: Record<string, unknown>,
  schema: JsonSchema,
): ConfigValidationResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const AjvCtor = (Ajv as any).default ?? Ajv;
  const ajv = new AjvCtor({ allErrors: true });
  // ajv-formats v3 default export is a FormatsPlugin object; call it as a plugin.
  const applyFormats = (addFormats as any).default ?? addFormats;
  applyFormats(ajv);
  // Plugin manifests use `format: "secret-ref"` as a declarative UI marker,
  // while the host persists secure refs as the shared object-shaped binding.
  // Validate the persisted representation here so the API and the secrets
  // handler agree and raw values can never pass as configured credentials.
  const validate = ajv.compile(schemaForSecureSecretRefs(schema));
  const valid = validate(configJson);

  if (valid) {
    return { valid: true };
  }

  const errors = (validate.errors ?? []).map((err: ErrorObject) => ({
    field: err.instancePath || "/",
    message: err.message ?? "validation failed",
  }));

  return { valid: false, errors };
}
