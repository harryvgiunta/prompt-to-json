import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeContractName,
  contractResourceUri,
  createLogger,
  parseJsonContractUri
} from "../src/security.js";
import { ContractStore } from "../src/contract-loader.js";
import { listContractResources, readContractResource } from "../src/resources.js";

const contract = {
  description: "Convert natural language into a support ticket object.",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" }
    },
    required: ["summary"]
  }
};

async function makeStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-to-json-security-"));
  const dir = path.join(root, "json-contracts");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "support-ticket.json"), JSON.stringify(contract), "utf8");
  const store = new ContractStore({ contractsDir: dir });
  await store.reload();
  return { root, store };
}

describe("security", () => {
  let state: Awaited<ReturnType<typeof makeStore>>;

  beforeEach(async () => {
    state = await makeStore();
  });

  afterEach(async () => {
    await fs.rm(state.root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("rejects path traversal names", () => {
    expect(() => assertSafeContractName("../secret")).toThrow(/Invalid contract name/);
    expect(() => assertSafeContractName("foo..bar")).toThrow(/Invalid contract name/);
  });

  it("rejects path separators", () => {
    expect(() => assertSafeContractName("foo/bar")).toThrow(/Invalid contract name/);
    expect(() => assertSafeContractName("foo\\bar")).toThrow(/Invalid contract name/);
  });

  it("accepts valid resource URIs", () => {
    expect(parseJsonContractUri("json-contract://support-ticket")).toBe("support-ticket");
    expect(contractResourceUri("support-ticket")).toBe("json-contract://support-ticket");
  });

  it("rejects invalid resource URIs", () => {
    expect(() => parseJsonContractUri("json-contract://../secret")).toThrow(/Invalid/);
    expect(() => parseJsonContractUri("json-contract://support-ticket/../../x")).toThrow(/Invalid/);
    expect(() => parseJsonContractUri("json-schema://support-ticket")).toThrow(/Invalid/);
    expect(() => parseJsonContractUri("file:///etc/passwd")).toThrow(/Invalid/);
  });

  it("resource URIs resolve correctly", () => {
    const resources = listContractResources(state.store);
    expect(resources).toEqual([
      {
        uri: "json-contract://support-ticket",
        name: "support-ticket",
        mimeType: "application/json",
        description: "Convert natural language into a support ticket object."
      }
    ]);

    const resource = readContractResource(state.store, "json-contract://support-ticket");
    expect(resource.mimeType).toBe("application/json");
    expect(JSON.parse(resource.text)).toMatchObject({
      name: "support-ticket",
      description: "Convert natural language into a support ticket object.",
      schema: contract.schema
    });
  });

  it("invalid resource URIs are rejected", () => {
    expect(() => readContractResource(state.store, "json-contract://../secret")).toThrow(/Invalid/);
  });

  it("stdio mode does not write logs to stdout", () => {
    let stdout = "";
    let stderr = "";
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    });
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderr += chunk.toString();
      return true;
    });

    const logger = createLogger(false);
    logger.warn("warning message");
    logger.error("error message");

    expect(stdout).toBe("");
    expect(stderr).toContain("warning message");
    expect(stderr).toContain("error message");

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
