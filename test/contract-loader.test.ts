import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ContractStore } from "../src/contract-loader.js";

const validSupportContract = {
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

async function makeTempContractsDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-to-json-"));
  const dir = path.join(root, "json-contracts");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function writeJson(dir: string, fileName: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(dir, fileName), JSON.stringify(value, null, 2), "utf8");
}

describe("ContractStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await makeTempContractsDir();
  });

  afterEach(async () => {
    await fs.rm(path.dirname(dir), { recursive: true, force: true });
  });

  it("loads contracts from json-contracts", async () => {
    await writeJson(dir, "support-ticket.json", validSupportContract);

    const store = new ContractStore({ contractsDir: dir });
    await store.reload();

    expect(store.listNames()).toEqual(["support-ticket"]);
  });

  it("defaults contracts to create and edit operations", async () => {
    await writeJson(dir, "support-ticket.json", validSupportContract);

    const store = new ContractStore({ contractsDir: dir });
    await store.reload();

    expect(store.getContract("support-ticket").operations).toMatchObject({
      create: { enabled: true, rules: [], examples: [] },
      edit: { enabled: true, return: "full_object", rules: [], examples: [] }
    });
  });

  it("loads top-level operation metadata", async () => {
    await writeJson(dir, "support-ticket.json", {
      ...validSupportContract,
      operations: {
        edit: {
          enabled: true,
          return: "full_object",
          rules: ["Preserve unspecified fields exactly."],
          examples: [
            {
              currentJson: {
                summary: "Users cannot log in",
                severity: "high",
                category: "authentication"
              },
              input: "make it critical",
              output: {
                summary: "Users cannot log in",
                severity: "critical",
                category: "authentication"
              }
            }
          ]
        }
      }
    });

    const store = new ContractStore({ contractsDir: dir });
    await store.reload();

    expect(store.getContract("support-ticket").operations.edit).toMatchObject({
      enabled: true,
      return: "full_object",
      rules: ["Preserve unspecified fields exactly."],
      examples: [expect.objectContaining({ input: "make it critical" })]
    });
  });

  it("derives contract name from filename", async () => {
    await writeJson(dir, "support-ticket.json", {
      ...validSupportContract,
      name: "ignored-name"
    });

    const store = new ContractStore({ contractsDir: dir });
    await store.reload();

    expect(store.getContract("support-ticket").name).toBe("support-ticket");
    expect(() => store.getContract("ignored-name")).toThrow(/Contract not found/);
  });

  it("rejects invalid JSON files", async () => {
    await fs.writeFile(path.join(dir, "broken.json"), "{ nope", "utf8");

    const store = new ContractStore({ contractsDir: dir });

    await expect(store.reload()).rejects.toThrow(/Invalid JSON/);
  });

  it("rejects contracts missing schema", async () => {
    await writeJson(dir, "missing-schema.json", {
      description: "Missing schema"
    });

    const store = new ContractStore({ contractsDir: dir });

    await expect(store.reload()).rejects.toThrow(/Invalid contract shape/);
  });

  it("rejects invalid JSON Schema", async () => {
    await writeJson(dir, "bad-schema.json", {
      schema: {
        type: "definitely-not-a-json-schema-type"
      }
    });

    const store = new ContractStore({ contractsDir: dir });

    await expect(store.reload()).rejects.toThrow(/Invalid JSON Schema/);
  });

  it("rejects examples whose output does not validate against the contract schema", async () => {
    await writeJson(dir, "bad-example.json", {
      ...validSupportContract,
      examples: [
        {
          input: "Urgent login issue",
          output: {
            summary: "Login issue",
            severity: "urgent",
            category: "authentication"
          }
        }
      ]
    });

    const store = new ContractStore({ contractsDir: dir });

    await expect(store.reload()).rejects.toThrow(/Example output at examples\[0\] does not validate/);
  });

  it("rejects contracts with a version field", async () => {
    await writeJson(dir, "versioned.json", {
      ...validSupportContract,
      version: "1.0.0"
    });

    const store = new ContractStore({ contractsDir: dir });

    await expect(store.reload()).rejects.toThrow(/must not include a version field/);
  });

  it("rejects duplicate contract names", async () => {
    await writeJson(dir, "Duplicate.json", validSupportContract);
    await writeJson(dir, "duplicate.json", validSupportContract);

    const files = await fs.readdir(dir);
    const duplicateFiles = files.filter((file) => file.toLowerCase() === "duplicate.json");
    if (duplicateFiles.length < 2) {
      // Case-insensitive filesystems cannot create both files; the loader still implements this guard.
      return;
    }

    const store = new ContractStore({ contractsDir: dir });
    await expect(store.reload()).rejects.toThrow(/Duplicate contract name/);
  });

  it("rejects path traversal", async () => {
    await writeJson(dir, "support-ticket.json", validSupportContract);
    const store = new ContractStore({ contractsDir: dir });
    await store.reload();

    expect(() => store.getContract("../secret")).toThrow(/Invalid contract name/);
  });

  it("reload_contracts rescans the folder", async () => {
    await writeJson(dir, "support-ticket.json", validSupportContract);
    const store = new ContractStore({ contractsDir: dir });
    await store.reload();
    expect(store.listNames()).toEqual(["support-ticket"]);

    await writeJson(dir, "search-query.json", {
      schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"]
      }
    });

    await store.reload();
    expect(store.listNames()).toEqual(["search-query", "support-ticket"]);
  });

  it("adding a file updates loaded contracts after reload", async () => {
    const store = new ContractStore({ contractsDir: dir });
    await store.reload();
    expect(store.listNames()).toEqual([]);

    await writeJson(dir, "support-ticket.json", validSupportContract);
    await store.reload();

    expect(store.listNames()).toEqual(["support-ticket"]);
  });

  it("deleting a file removes it after reload", async () => {
    await writeJson(dir, "support-ticket.json", validSupportContract);
    const store = new ContractStore({ contractsDir: dir });
    await store.reload();
    expect(store.listNames()).toEqual(["support-ticket"]);

    await fs.unlink(path.join(dir, "support-ticket.json"));
    await store.reload();

    expect(store.listNames()).toEqual([]);
  });
});
