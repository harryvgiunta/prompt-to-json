#!/usr/bin/env node
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultServerPath = path.resolve(__dirname, "../../dist/index.js");

const contract = process.argv[2] ?? "support-ticket";
const input = process.argv.slice(3).join(" ") || "Urgent, users cannot log in after SSO update.";

function parseJsonEnv(name) {
  const value = process.env[name];
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${name} must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function getModelJson(_payload, envName) {
  const json = parseJsonEnv(envName);
  if (json !== undefined) return json;

  throw new Error(
    `This example does not call an LLM. Set ${envName} to the JSON your model produced, then run again.`
  );
}

const transport = new StdioClientTransport({
  command: process.env.PROMPT_TO_JSON_COMMAND ?? process.execPath,
  args: process.env.PROMPT_TO_JSON_ARGS
    ? JSON.parse(process.env.PROMPT_TO_JSON_ARGS)
    : [defaultServerPath],
  env: {
    ...process.env,
    MCP_TRANSPORT: "stdio",
    PROMPT_TO_JSON_CONTRACTS_DIR: process.env.PROMPT_TO_JSON_CONTRACTS_DIR ?? path.resolve(__dirname, "../../json-contracts"),
    WATCH_CONTRACTS: process.env.WATCH_CONTRACTS ?? "false"
  }
});

const client = new Client({ name: "prompt-to-json-node-example", version: "0.1.0" }, { capabilities: {} });

try {
  await client.connect(transport);

  const contractPayload = await client.callTool({
    name: "get_json_contract",
    arguments: {
      contract,
      input,
      context: parseJsonEnv("APP_CONTEXT") ?? {}
    }
  });

  if (contractPayload.isError) throw new Error(String(contractPayload.content?.[0]?.text ?? "get_json_contract failed"));

  const candidateJson = await getModelJson(contractPayload.structuredContent, "MODEL_JSON");
  let validation = await client.callTool({
    name: "validate_json",
    arguments: {
      contract,
      json: candidateJson
    }
  });

  if (validation.isError) throw new Error(String(validation.content?.[0]?.text ?? "validate_json failed"));

  if (!validation.structuredContent?.valid) {
    const repairPayload = await client.callTool({
      name: "get_repair_contract",
      arguments: {
        contract,
        invalidJson: candidateJson,
        validationErrors: validation.structuredContent?.errors ?? []
      }
    });

    if (repairPayload.isError) throw new Error(String(repairPayload.content?.[0]?.text ?? "get_repair_contract failed"));

    const repairedJson = await getModelJson(repairPayload.structuredContent, "REPAIRED_MODEL_JSON");
    validation = await client.callTool({
      name: "validate_json",
      arguments: {
        contract,
        json: repairedJson
      }
    });
  }

  console.log(JSON.stringify(validation.structuredContent, null, 2));
} finally {
  await client.close().catch(() => undefined);
}
