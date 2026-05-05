import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContractStore } from "../src/contract-loader.js";
import { createToolHandlers, toolDefinitions } from "../src/tools.js";
import { JsonValidator } from "../src/validator.js";

const hashPattern = /^sha256:[a-f0-9]{64}$/;

const supportTicketContract = {
  description: "Convert natural language into a support ticket object.",
  rules: [
    "If the user says urgent, severity must be critical.",
    "Summary must be under 80 characters."
  ],
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
  examples: [
    {
      input: "Urgent, users cannot log in after SSO update.",
      output: {
        summary: "Users cannot log in after SSO update",
        severity: "critical",
        category: "authentication"
      }
    }
  ]
};

async function makeStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-to-json-tools-"));
  const dir = path.join(root, "json-contracts");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "support-ticket.json"),
    JSON.stringify(supportTicketContract, null, 2),
    "utf8"
  );
  const store = new ContractStore({ contractsDir: dir });
  await store.reload();
  return { root, dir, store, handlers: createToolHandlers(store, new JsonValidator()) };
}

describe("tool handlers", () => {
  let state: Awaited<ReturnType<typeof makeStore>>;

  beforeEach(async () => {
    state = await makeStore();
  });

  afterEach(async () => {
    await fs.rm(state.root, { recursive: true, force: true });
  });

  it("exposes only the stable contract tool names", () => {
    expect(toolDefinitions.map((tool) => tool.name)).toEqual([
      "list_contracts",
      "read_contract",
      "get_json_contract",
      "get_edit_contract",
      "validate_json",
      "get_repair_contract",
      "status",
      "reload_contracts"
    ]);
  });

  it("list_contracts returns loaded contracts", async () => {
    await expect(state.handlers.list_contracts({})).resolves.toEqual({
      contracts: [
        {
          name: "support-ticket",
          description: "Convert natural language into a support ticket object.",
          contractHash: expect.stringMatching(hashPattern),
          schemaHash: expect.stringMatching(hashPattern)
        }
      ]
    });
  });

  it("read_contract returns the selected contract", async () => {
    const result = await state.handlers.read_contract({ contract: "support-ticket" });

    expect(result).toMatchObject({
      contract: "support-ticket",
      contractHash: expect.stringMatching(hashPattern),
      schemaHash: expect.stringMatching(hashPattern),
      description: "Convert natural language into a support ticket object.",
      rules: supportTicketContract.rules,
      schema: supportTicketContract.schema,
      examples: supportTicketContract.examples
    });
  });

  it("get_json_contract returns instructions, rules, schema, examples, input, and context", async () => {
    const result = await state.handlers.get_json_contract({
      contract: "support-ticket",
      input: "Urgent, users cannot log in after SSO update.",
      context: { source: "chat" }
    });

    expect(result.contract).toBe("support-ticket");
    expect(result.contractHash).toMatch(hashPattern);
    expect(result.schemaHash).toMatch(hashPattern);
    expect(result.operation).toBe("create");
    expect(result.instructions).toEqual([
      "Convert the input into JSON.",
      "Return JSON only.",
      "Do not return markdown.",
      "Do not include commentary.",
      "Do not include extra keys.",
      "Match the schema exactly.",
      "Use enum values exactly.",
      "Follow all rules.",
      "Use examples as guidance."
    ]);
    expect(result.rules).toEqual(supportTicketContract.rules);
    expect(result.operationRules).toEqual([]);
    expect(result.schema).toEqual(supportTicketContract.schema);
    expect(result.examples).toEqual(supportTicketContract.examples);
    expect(result.operationExamples).toEqual([]);
    expect(result.input).toBe("Urgent, users cannot log in after SSO update.");
    expect(result.context).toEqual({ source: "chat" });
  });

  it("get_edit_contract returns edit instructions and current JSON", async () => {
    const currentJson = {
      summary: "Users cannot log in after SSO update",
      severity: "high",
      category: "authentication"
    };

    const result = await state.handlers.get_edit_contract({
      contract: "support-ticket",
      currentJson,
      input: "make it critical",
      context: { source: "chat" }
    });

    expect(result.contract).toBe("support-ticket");
    expect(result.contractHash).toMatch(hashPattern);
    expect(result.schemaHash).toMatch(hashPattern);
    expect(result.operation).toBe("edit");
    expect(result.instructions).toEqual([
      "Start from currentJson.",
      "Apply only the user's requested change.",
      "Preserve all unspecified fields exactly.",
      "Return the complete updated JSON object, not a patch.",
      "Return JSON only.",
      "Do not return markdown.",
      "Do not include commentary.",
      "Do not include extra keys.",
      "Match the schema exactly.",
      "Use enum values exactly.",
      "Follow all rules.",
      "Use examples as guidance."
    ]);
    expect(result.currentJson).toEqual(currentJson);
    expect(result.input).toBe("make it critical");
    expect(result.context).toEqual({ source: "chat" });
  });

  it("get_edit_contract rejects invalid current JSON", async () => {
    await expect(
      state.handlers.get_edit_contract({
        contract: "support-ticket",
        currentJson: { severity: "urgent" },
        input: "make it critical"
      })
    ).rejects.toThrow(/currentJson does not validate/);
  });

  it("validate_json returns valid=true for valid object", async () => {
    const result = await state.handlers.validate_json({
      contract: "support-ticket",
      json: {
        summary: "Users cannot log in after SSO update",
        severity: "critical",
        category: "authentication"
      }
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.contract).toBe("support-ticket");
    }
  });

  it("validate_json returns errors for invalid object", async () => {
    const result = await state.handlers.validate_json({
      contract: "support-ticket",
      json: {
        summary: "Users cannot log in",
        severity: "urgent"
      }
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.contract).toBe("support-ticket");
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: "/severity", keyword: "enum" })])
      );
    }
  });

  it("status returns server and loaded contract metadata", async () => {
    const result = await state.handlers.status({});

    expect(result).toMatchObject({
      server: "prompt-to-json",
      version: "0.1.0",
      contractsDir: state.store.contractsDir,
      loaded: 1,
      watchContracts: false,
      allowInvalidContracts: false,
      contracts: [
        {
          name: "support-ticket",
          description: "Convert natural language into a support ticket object.",
          contractHash: expect.stringMatching(hashPattern),
          schemaHash: expect.stringMatching(hashPattern)
        }
      ]
    });
  });

  it("reload_contracts rescans the folder", async () => {
    await fs.writeFile(
      path.join(state.dir, "search-query.json"),
      JSON.stringify({
        schema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"]
        }
      }),
      "utf8"
    );

    const result = await state.handlers.reload_contracts({});

    expect(result.loaded).toBe(2);
    expect(result.contracts).toEqual(["search-query", "support-ticket"]);
  });

  it("get_repair_contract returns a repair contract", async () => {
    const result = await state.handlers.get_repair_contract({
      contract: "support-ticket",
      invalidJson: {
        severity: "urgent"
      },
      validationErrors: []
    });

    expect(result.contract).toBe("support-ticket");
    expect(result.contractHash).toMatch(hashPattern);
    expect(result.schemaHash).toMatch(hashPattern);
    expect(result.instructions).toEqual(
      expect.arrayContaining([
        "Repair the JSON so it validates against the schema.",
        "Return JSON only.",
        "Do not return markdown.",
        "Do not include commentary.",
        "Do not include extra keys.",
        "Preserve valid fields where possible.",
        "Set /severity to one of: low, medium, high, critical.",
        "Add missing required field /summary.",
        "Add missing required field /category."
      ])
    );
    expect(result.schema).toEqual(supportTicketContract.schema);
    expect(result.rules).toEqual(supportTicketContract.rules);
    expect(result.examples).toEqual(supportTicketContract.examples);
    expect(result.invalidJson).toEqual({ severity: "urgent" });
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });

});
