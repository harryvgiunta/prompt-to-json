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
