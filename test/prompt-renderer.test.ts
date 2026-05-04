import { describe, expect, it } from "vitest";
import type { LoadedContract } from "../src/types.js";
import { renderEditContractPrompt, renderJsonContractPrompt, renderRepairContractPrompt } from "../src/prompt-renderer.js";

const contract: LoadedContract = {
  name: "support-ticket",
  description: "Convert natural language into a support ticket object.",
  rules: ["If the user says urgent, severity must be critical."],
  operations: {
    create: { enabled: true, rules: [], examples: [] },
    edit: {
      enabled: true,
      return: "full_object",
      rules: ["Preserve unspecified fields exactly."],
      examples: []
    }
  },
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] }
    },
    required: ["summary", "severity"]
  },
  examples: [
    {
      input: "Urgent login issue",
      output: { summary: "Login issue", severity: "critical" }
    }
  ],
  sourcePath: "support-ticket.json"
};

describe("prompt renderer", () => {
  it("JSON contract prompt contains required phrases", () => {
    const prompt = renderJsonContractPrompt({
      contract,
      input: "Urgent login issue",
      context: { source: "chat" }
    });

    expect(prompt).toContain("Convert the input into JSON.");
    expect(prompt).toContain("The agent/model performs the conversion; the MCP server only provides this contract.");
    expect(prompt).toContain("Return JSON only.");
    expect(prompt).toContain("Do not return markdown.");
    expect(prompt).toContain("Do not include prose.");
    expect(prompt).toContain("Do not include commentary.");
    expect(prompt).toContain("Do not include extra keys.");
    expect(prompt).toContain("Match the schema exactly.");
    expect(prompt).toContain("Use enum values exactly.");
    expect(prompt).toContain("Follow all rules.");
    expect(prompt).toContain("Use examples as guidance.");
    expect(prompt).toContain("If information is missing, infer only when rules/examples justify it.");
    expect(prompt).toContain("Otherwise use safe defaults only if the schema/rules specify them.");
  });

  it("JSON contract prompt contains schema/rules/examples/input/context", () => {
    const prompt = renderJsonContractPrompt({
      contract,
      input: "Urgent login issue",
      context: { source: "chat" }
    });

    expect(prompt).toContain("Contract: support-ticket");
    expect(prompt).toContain("If the user says urgent, severity must be critical.");
    expect(prompt).toContain('"additionalProperties": false');
    expect(prompt).toContain("Urgent login issue");
    expect(prompt).toContain('"source": "chat"');
  });

  it("edit contract prompt contains required phrases and current JSON", () => {
    const prompt = renderEditContractPrompt({
      contract,
      currentJson: { summary: "Login issue", severity: "high" },
      input: "make it critical",
      context: { source: "chat" }
    });

    expect(prompt).toContain("Edit the current JSON using the user's requested change.");
    expect(prompt).toContain("Start from currentJson.");
    expect(prompt).toContain("Preserve all unspecified fields exactly.");
    expect(prompt).toContain("Operation: edit");
    expect(prompt).toContain('"severity": "high"');
    expect(prompt).toContain("make it critical");
  });

  it("repair contract prompt contains required phrases", () => {
    const prompt = renderRepairContractPrompt({
      contract,
      invalidJson: { severity: "urgent" },
      validationErrors: [{ path: "/severity", message: "must be equal to one of the allowed values", keyword: "enum" }]
    });

    expect(prompt).toContain("The previous JSON failed validation.");
    expect(prompt).toContain("Repair it so it matches the schema.");
    expect(prompt).toContain("Return corrected JSON only.");
    expect(prompt).toContain("Do not explain the fix.");
    expect(prompt).toContain("Do not return markdown.");
    expect(prompt).toContain("Preserve valid fields where possible.");
  });

  it("repair contract prompt contains invalid JSON and validation errors", () => {
    const prompt = renderRepairContractPrompt({
      contract,
      invalidJson: { severity: "urgent" },
      validationErrors: [{ path: "/severity", message: "must be equal to one of the allowed values", keyword: "enum" }]
    });

    expect(prompt).toContain('"severity": "urgent"');
    expect(prompt).toContain('"path": "/severity"');
    expect(prompt).toContain('"keyword": "enum"');
    expect(prompt).toContain('"enum"');
  });
});
