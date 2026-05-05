import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContractStore } from "../src/contract-loader.js";
import { createPromptHandlers, getPromptText, normalizePromptArguments } from "../src/prompts.js";

const supportTicketContract = {
  description: "Convert natural language into a support ticket object.",
  rules: ["If the user says urgent, severity must be critical."],
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-to-json-prompts-"));
  const dir = path.join(root, "json-contracts");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "support-ticket.json"),
    JSON.stringify(supportTicketContract, null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(dir, "create-disabled.json"),
    JSON.stringify(
      {
        ...supportTicketContract,
        operations: {
          create: { enabled: false }
        }
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(
    path.join(dir, "patch-edit.json"),
    JSON.stringify(
      {
        ...supportTicketContract,
        operations: {
          edit: { enabled: true, return: "json_patch" }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  const store = new ContractStore({ contractsDir: dir });
  await store.reload();
  return { root, store, handlers: createPromptHandlers(store) };
}

describe("MCP prompt handlers", () => {
  let state: Awaited<ReturnType<typeof makeStore>>;

  beforeEach(async () => {
    state = await makeStore();
  });

  afterEach(async () => {
    await state.store.close();
    await fs.rm(state.root, { recursive: true, force: true });
  });

  it("normalizes only prompt arguments that were provided", () => {
    const normalized = normalizePromptArguments({
      contract: "support-ticket",
      input: "Urgent login issue"
    });

    expect(normalized).toEqual({
      contract: "support-ticket",
      input: "Urgent login issue"
    });
  });

  it("renders json_contract_prompt with JSON-encoded context", async () => {
    const prompt = await getPromptText(state.handlers, "json_contract_prompt", {
      contract: "support-ticket",
      input: "Urgent, users cannot log in after SSO update.",
      context: JSON.stringify({ source: "chat" })
    });

    expect(prompt).toContain("Contract: support-ticket");
    expect(prompt).toContain("Operation: create");
    expect(prompt).toContain('"source": "chat"');
  });

  it("rejects json_contract_prompt when create is disabled", async () => {
    await expect(
      getPromptText(state.handlers, "json_contract_prompt", {
        contract: "create-disabled",
        input: "Urgent login issue"
      })
    ).rejects.toThrow(/does not enable the create operation/);
  });

  it("validates currentJson for edit_contract_prompt", async () => {
    await expect(
      getPromptText(state.handlers, "edit_contract_prompt", {
        contract: "support-ticket",
        currentJson: JSON.stringify({ severity: "urgent" }),
        input: "make it critical"
      })
    ).rejects.toThrow(/currentJson does not validate/);
  });

  it("rejects edit_contract_prompt when edit does not return a full object", async () => {
    await expect(
      getPromptText(state.handlers, "edit_contract_prompt", {
        contract: "patch-edit",
        currentJson: JSON.stringify({
          summary: "Users cannot log in",
          severity: "high",
          category: "authentication"
        }),
        input: "make it critical"
      })
    ).rejects.toThrow(/must return full_object/);
  });

  it("renders repair_contract_prompt with JSON-encoded invalidJson and validation errors", async () => {
    const prompt = await getPromptText(state.handlers, "repair_contract_prompt", {
      contract: "support-ticket",
      invalidJson: JSON.stringify({ severity: "urgent" }),
      validationErrors: JSON.stringify([
        {
          path: "/severity",
          message: "must be equal to one of the allowed values",
          keyword: "enum"
        }
      ])
    });

    expect(prompt).toContain("The previous JSON failed validation.");
    expect(prompt).toContain('"severity": "urgent"');
    expect(prompt).toContain('"path": "/severity"');
  });
});
