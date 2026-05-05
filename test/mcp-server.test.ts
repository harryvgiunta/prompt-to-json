import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPromptToJsonMcpServer, type PromptToJsonMcpServer } from "../src/mcp-server.js";

const require = createRequire(import.meta.url);

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

function stringifyEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

async function makeContractsDir(prefix: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const contractsDir = path.join(root, "json-contracts");
  await fs.mkdir(contractsDir, { recursive: true });
  await fs.writeFile(
    path.join(contractsDir, "support-ticket.json"),
    JSON.stringify(supportTicketContract, null, 2),
    "utf8"
  );
  return { root, contractsDir };
}

async function makeConnectedClient() {
  const { root, contractsDir } = await makeContractsDir("prompt-to-json-mcp-");

  const app = await createPromptToJsonMcpServer({
    contractsDir,
    watchContracts: false
  });
  const client = new Client(
    {
      name: "prompt-to-json-test-client",
      version: "0.0.0"
    },
    {
      capabilities: {}
    }
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await app.server.connect(serverTransport);
  await client.connect(clientTransport);

  return { root, app, client };
}

describe("prompt-to-json MCP server", () => {
  let state: Awaited<ReturnType<typeof makeConnectedClient>> | undefined;

  beforeEach(async () => {
    state = await makeConnectedClient();
  });

  afterEach(async () => {
    await state?.client.close().catch(() => undefined);
    await state?.app.close().catch(() => undefined);
    if (state) await fs.rm(state.root, { recursive: true, force: true });
    state = undefined;
  });

  it("exposes working tools, resources, resource templates, and prompts through MCP", async () => {
    if (!state) throw new Error("test state was not initialized");

    const tools = await state.client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "list_contracts",
      "read_contract",
      "get_json_contract",
      "get_edit_contract",
      "validate_json",
      "get_repair_contract",
      "reload_contracts"
    ]);
    expect(tools.tools.find((tool) => tool.name === "validate_json")?.outputSchema).toMatchObject({
      type: "object"
    });

    const contractList = await state.client.callTool({
      name: "list_contracts",
      arguments: {}
    });
    expect(contractList.isError).not.toBe(true);
    expect(contractList.structuredContent).toEqual({
      contracts: [
        {
          name: "support-ticket",
          description: "Convert natural language into a support ticket object."
        }
      ]
    });

    const validation = await state.client.callTool({
      name: "validate_json",
      arguments: {
        contract: "support-ticket",
        json: {
          summary: "Users cannot log in",
          severity: "urgent"
        }
      }
    });
    expect(validation.isError).not.toBe(true);
    expect(validation.structuredContent).toMatchObject({
      valid: false,
      contract: "support-ticket"
    });

    const resources = await state.client.listResources();
    expect(resources.resources).toEqual([
      expect.objectContaining({
        uri: "json-contract://support-ticket",
        name: "support-ticket",
        mimeType: "application/json"
      })
    ]);

    const resource = await state.client.readResource({ uri: "json-contract://support-ticket" });
    expect(resource.contents[0]).toMatchObject({
      uri: "json-contract://support-ticket",
      mimeType: "application/json"
    });
    expect(JSON.parse(String(resource.contents[0].text))).toMatchObject({
      name: "support-ticket",
      schema: supportTicketContract.schema
    });

    const templates = await state.client.listResourceTemplates();
    expect(templates.resourceTemplates).toEqual([
      expect.objectContaining({
        uriTemplate: "json-contract://{name}",
        name: "json-contract"
      })
    ]);

    const prompts = await state.client.listPrompts();
    expect(prompts.prompts.map((prompt) => prompt.name)).toEqual([
      "json_contract_prompt",
      "edit_contract_prompt",
      "repair_contract_prompt"
    ]);

    const renderedPrompt = await state.client.getPrompt({
      name: "json_contract_prompt",
      arguments: {
        contract: "support-ticket",
        input: "Urgent, users cannot log in after SSO update.",
        context: JSON.stringify({ source: "chat" })
      }
    });
    const content = renderedPrompt.messages[0].content;
    if (content.type !== "text") throw new Error("Expected a text prompt response");
    expect(content.text).toContain("Contract: support-ticket");
    expect(content.text).toContain('"source": "chat"');
  });

  it("starts as a stdio MCP server and serves tools through an official client", async () => {
    const { root, contractsDir } = await makeContractsDir("prompt-to-json-stdio-");
    const tsxCli = require.resolve("tsx/cli");
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [tsxCli, "src/index.ts"],
      cwd: process.cwd(),
      env: {
        ...getDefaultEnvironment(),
        ...stringifyEnv(process.env),
        MCP_TRANSPORT: "stdio",
        PROMPT_TO_JSON_CONTRACTS_DIR: contractsDir,
        WATCH_CONTRACTS: "false"
      },
      stderr: "pipe"
    });
    const client = new Client(
      {
        name: "prompt-to-json-stdio-test-client",
        version: "0.0.0"
      },
      {
        capabilities: {}
      }
    );

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toContain("validate_json");

      const result = await client.callTool({
        name: "validate_json",
        arguments: {
          contract: "support-ticket",
          json: {
            summary: "Users cannot log in after SSO update",
            severity: "critical",
            category: "authentication"
          }
        }
      });

      expect(result.isError).not.toBe(true);
      expect(result.structuredContent).toMatchObject({
        valid: true,
        contract: "support-ticket"
      });
    } finally {
      await client.close().catch(() => undefined);
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
