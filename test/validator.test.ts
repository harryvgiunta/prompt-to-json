import { describe, expect, it } from "vitest";
import type { LoadedContract } from "../src/types.js";
import { JsonValidator, validateJsonSchema } from "../src/validator.js";

const supportTicketContract: LoadedContract = {
  name: "support-ticket",
  description: "Convert natural language into a support ticket object.",
  rules: [],
  sourcePath: "support-ticket.json",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string", maxLength: 80 },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
      category: { type: "string", enum: ["authentication", "billing", "bug", "feature_request", "other"] }
    },
    required: ["summary", "severity", "category"]
  },
  examples: []
};

describe("JsonValidator", () => {
  it("validate_json returns valid=true for valid object", () => {
    const validator = new JsonValidator();
    const result = validator.validateAgainstContract(supportTicketContract, {
      summary: "Users cannot log in after SSO update",
      severity: "critical",
      category: "authentication"
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.contract).toBe("support-ticket");
      expect(result.errors).toEqual([]);
      expect(result.json).toEqual({
        summary: "Users cannot log in after SSO update",
        severity: "critical",
        category: "authentication"
      });
    }
  });

  it("validate_json returns errors for invalid object", () => {
    const validator = new JsonValidator();
    const result = validator.validateAgainstContract(supportTicketContract, {
      summary: "Users cannot log in",
      severity: "urgent"
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.contract).toBe("support-ticket");
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "/severity", keyword: "enum" }),
          expect.objectContaining({ path: "/category", keyword: "required" })
        ])
      );
    }
  });

  it("respects additionalProperties false", () => {
    const validator = new JsonValidator();
    const result = validator.validateAgainstContract(supportTicketContract, {
      summary: "Users cannot log in",
      severity: "critical",
      category: "authentication",
      unexpected: true
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "/unexpected", keyword: "additionalProperties" })])
      );
    }
  });

  it("rejects invalid JSON Schema", () => {
    expect(() => validateJsonSchema({ type: "invalid-type" })).toThrow(/Invalid JSON Schema/);
  });

  it("supports draft-07 JSON Schema contracts", () => {
    const validator = new JsonValidator();
    const draft7Contract: LoadedContract = {
      ...supportTicketContract,
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        ...supportTicketContract.schema
      }
    };

    expect(() => validateJsonSchema(draft7Contract.schema)).not.toThrow();
    const result = validator.validateAgainstContract(draft7Contract, {
      summary: "Users cannot log in after SSO update",
      severity: "critical",
      category: "authentication"
    });

    expect(result.valid).toBe(true);
  });

  it("rejects unsupported JSON Schema dialects with a clear message", () => {
    expect(() => validateJsonSchema({ $schema: "https://json-schema.org/draft/2019-09/schema", type: "object" })).toThrow(
      /Unsupported JSON Schema dialect/
    );
  });

  it("buildRepairInstructions follows $ref and composition for generic schema hints", () => {
    const validator = new JsonValidator();
    const contract: LoadedContract = {
      name: "generic-composed",
      rules: [],
      operations: {
        create: { enabled: true, rules: [], examples: [] },
        edit: { enabled: true, return: "full_object", rules: [], examples: [] }
      },
      sourcePath: "generic-composed.json",
      schema: {
        type: "object",
        additionalProperties: false,
        allOf: [
          {
            properties: {
              state: { $ref: "#/$defs/state" }
            },
            required: ["state"]
          }
        ],
        $defs: {
          state: {
            type: "string",
            enum: ["open", "closed"]
          }
        }
      },
      examples: []
    };

    const instructions = validator.buildRepairInstructions(contract, { state: "pending" });

    expect(instructions).toContain("Set /state to one of: open, closed.");
  });

  it("buildRepairInstructions creates concise guidance", () => {
    const validator = new JsonValidator();
    const instructions = validator.buildRepairInstructions(
      supportTicketContract,
      {
        summary: "Users cannot log in",
        severity: "urgent"
      },
      [
        {
          path: "/severity",
          message: "must be equal to one of the allowed values",
          keyword: "enum"
        }
      ]
    );

    expect(instructions).toContain("Set /severity to one of: low, medium, high, critical.");
    expect(instructions).toContain("Add missing required field /category.");
    expect(instructions.at(-1)).toBe("Return JSON only.");
  });
});
