import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";

const validContract = {
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      value: { type: "string" }
    },
    required: ["value"]
  },
  examples: [
    {
      input: "hello",
      output: { value: "hello" }
    }
  ]
};

async function makeContractsDir(contract = validContract) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-to-json-cli-"));
  const contractsDir = path.join(root, "json-contracts");
  await fs.mkdir(contractsDir, { recursive: true });
  await fs.writeFile(path.join(contractsDir, "generic.json"), JSON.stringify(contract, null, 2), "utf8");
  return { root, contractsDir };
}

function captureOutput() {
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
  return {
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    restore() {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  };
}

describe("CLI", () => {
  let roots: string[] = [];

  beforeEach(() => {
    roots = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it("validates contracts for CI", async () => {
    const { root, contractsDir } = await makeContractsDir();
    roots.push(root);
    const output = captureOutput();

    const exitCode = await runCli(["validate", "--contracts", contractsDir], {});

    expect(exitCode).toBe(0);
    expect(output.stdout).toContain("Validated 1 contract(s)");
    expect(output.stdout).toContain("generic sha256:");
    expect(output.stderr).toBe("");
    output.restore();
  });

  it("returns nonzero for strict lint warnings", async () => {
    const { root, contractsDir } = await makeContractsDir({
      schema: {
        type: "object",
        properties: {
          value: { type: "string" }
        },
        required: ["value"]
      }
    });
    roots.push(root);
    const output = captureOutput();

    const exitCode = await runCli(["lint", "--strict", "--contracts", contractsDir], {});

    expect(exitCode).toBe(1);
    expect(output.stdout).toContain("Object schema does not set additionalProperties:false");
    output.restore();
  });
});
