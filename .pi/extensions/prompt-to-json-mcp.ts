import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

type JsonObject = Record<string, unknown>;

type McpConnection = {
	client: Client;
	transport: StdioClientTransport;
	projectRoot: string;
	contractsDir: string;
	startedAt: number;
	stderrLines: string[];
};

const CONTRACT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const MAX_STDERR_LINES = 40;

let connection: McpConnection | undefined;
let connectionPromise: Promise<McpConnection> | undefined;

const EmptyParams = Type.Object({}, { additionalProperties: false });
const ContractParams = Type.Object(
	{
		contract: Type.String({ description: "Contract name, e.g. support-ticket or ecommerce-return" }),
	},
	{ additionalProperties: false },
);
const JsonContractParams = Type.Object(
	{
		contract: Type.String({ description: "Contract name" }),
		input: Type.String({ description: "Natural-language input to convert into JSON" }),
		context: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Optional caller context" })),
	},
	{ additionalProperties: false },
);
const EditContractParams = Type.Object(
	{
		contract: Type.String({ description: "Contract name" }),
		currentJson: Type.Unknown({ description: "Existing JSON value to edit" }),
		input: Type.String({ description: "Natural-language edit instruction" }),
		context: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Optional caller context" })),
	},
	{ additionalProperties: false },
);
const ValidateJsonParams = Type.Object(
	{
		contract: Type.String({ description: "Contract name" }),
		json: Type.Unknown({ description: "Agent/model-produced JSON value to validate" }),
	},
	{ additionalProperties: false },
);
const ValidationErrorParams = Type.Object(
	{
		path: Type.String(),
		message: Type.String(),
		keyword: Type.String(),
	},
	{ additionalProperties: false },
);
const RepairContractParams = Type.Object(
	{
		contract: Type.String({ description: "Contract name" }),
		invalidJson: Type.Unknown({ description: "Invalid JSON value to repair" }),
		validationErrors: Type.Optional(Type.Array(ValidationErrorParams)),
	},
	{ additionalProperties: false },
);

const PROMPT_TO_JSON_GUIDELINES = [
	"Use prompt-to-json tools when the user asks to convert natural language into schema-valid JSON for a named contract.",
	"prompt-to-json is a contract registry and validator. It does not generate JSON by itself; the active Pi model generates or repairs the JSON.",
	"Correct create flow: call ptj_get_json_contract, generate JSON yourself, call ptj_validate_json, and if invalid call ptj_get_repair_contract before validating again.",
	"Correct edit flow: call ptj_get_edit_contract with currentJson and the edit instruction, produce the complete edited JSON yourself, then call ptj_validate_json.",
	"After ptj_validate_json returns valid=true, present the final JSON and mention the contract that validated it.",
];

function isSafeContractName(name: string): boolean {
	return CONTRACT_NAME_RE.test(name) && !name.includes("..") && !name.includes("/") && !name.includes("\\");
}

function assertSafeContractName(name: string): void {
	if (!isSafeContractName(name)) {
		throw new Error(`Invalid prompt-to-json contract name: ${name}`);
	}
}

function stringifyEnv(env: NodeJS.ProcessEnv): Record<string, string> {
	const result: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (typeof value === "string") result[key] = value;
	}
	return result;
}

function normalizeOptionalJsonString<T>(value: unknown): T | unknown {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed) return value;
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;

	try {
		return JSON.parse(trimmed) as T;
	} catch {
		return value;
	}
}

function prepareJsonContractArgs(args: unknown) {
	if (!args || typeof args !== "object") return args as never;
	const input = { ...(args as JsonObject) };
	if (input.context !== undefined) input.context = normalizeOptionalJsonString(input.context);
	return input as never;
}

function prepareEditContractArgs(args: unknown) {
	if (!args || typeof args !== "object") return args as never;
	const input = { ...(args as JsonObject) };
	if (input.currentJson !== undefined) input.currentJson = normalizeOptionalJsonString(input.currentJson);
	if (input.context !== undefined) input.context = normalizeOptionalJsonString(input.context);
	return input as never;
}

function prepareValidateArgs(args: unknown) {
	if (!args || typeof args !== "object") return args as never;
	const input = { ...(args as JsonObject) };
	if (input.json !== undefined) input.json = normalizeOptionalJsonString(input.json);
	return input as never;
}

function prepareRepairArgs(args: unknown) {
	if (!args || typeof args !== "object") return args as never;
	const input = { ...(args as JsonObject) };
	if (input.invalidJson !== undefined) input.invalidJson = normalizeOptionalJsonString(input.invalidJson);
	if (input.validationErrors !== undefined) input.validationErrors = normalizeOptionalJsonString(input.validationErrors);
	return input as never;
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function findPromptToJsonRoot(cwd: string): Promise<string> {
	let current = path.resolve(cwd);

	while (true) {
		const packageJsonPath = path.join(current, "package.json");
		if (await pathExists(packageJsonPath)) {
			try {
				const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as { name?: string };
				if (packageJson.name === "prompt-to-json") return current;
			} catch {
				// Keep walking upward.
			}
		}

		if (await pathExists(path.join(current, "dist", "index.js")) && await pathExists(path.join(current, "json-contracts"))) {
			return current;
		}

		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	return path.resolve(cwd);
}

async function ensureBuiltServer(projectRoot: string): Promise<string> {
	const serverPath = path.join(projectRoot, "dist", "index.js");
	if (await pathExists(serverPath)) return serverPath;

	throw new Error(
		`prompt-to-json MCP server is not built. Run \`npm run build\` in ${projectRoot}, then restart pi or run /reload.`,
	);
}

function resolveContractsDir(projectRoot: string): string {
	const configured = process.env.PROMPT_TO_JSON_CONTRACTS_DIR;
	if (!configured) return path.join(projectRoot, "json-contracts");
	return path.resolve(projectRoot, configured);
}

async function startConnection(cwd: string): Promise<McpConnection> {
	const projectRoot = await findPromptToJsonRoot(cwd);
	const serverPath = await ensureBuiltServer(projectRoot);
	const contractsDir = resolveContractsDir(projectRoot);
	const stderrLines: string[] = [];

	const env = {
		...getDefaultEnvironment(),
		...stringifyEnv(process.env),
		MCP_TRANSPORT: "stdio",
		PROMPT_TO_JSON_CONTRACTS_DIR: contractsDir,
		WATCH_CONTRACTS: process.env.WATCH_CONTRACTS ?? "true",
	};

	const transport = new StdioClientTransport({
		command: process.execPath,
		args: [serverPath],
		cwd: projectRoot,
		env,
		stderr: "pipe",
	});

	transport.stderr?.on("data", (chunk) => {
		const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
		for (const line of text.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			stderrLines.push(trimmed);
			while (stderrLines.length > MAX_STDERR_LINES) stderrLines.shift();
		}
	});

	const client = new Client(
		{
			name: "pi-prompt-to-json",
			version: "0.1.0",
		},
		{
			capabilities: {},
		},
	);

	await client.connect(transport);

	return {
		client,
		transport,
		projectRoot,
		contractsDir,
		startedAt: Date.now(),
		stderrLines,
	};
}

async function ensureConnection(cwd: string): Promise<McpConnection> {
	if (connection) return connection;
	if (connectionPromise) return connectionPromise;

	connectionPromise = startConnection(cwd)
		.then((created) => {
			connection = created;
			return created;
		})
		.catch((error) => {
			connectionPromise = undefined;
			throw error;
		});

	return connectionPromise;
}

async function closeConnection(): Promise<void> {
	const existing = connection;
	connection = undefined;
	connectionPromise = undefined;
	if (!existing) return;

	try {
		await existing.client.close();
	} catch {
		try {
			await existing.transport.close();
		} catch {
			// Ignore shutdown errors.
		}
	}
}

function textFromMcpContent(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const block = part as { type?: unknown; text?: unknown; resource?: unknown };
			if (block.type === "text" && typeof block.text === "string") return block.text;
			if (block.type === "resource") return JSON.stringify(block.resource, null, 2);
			return JSON.stringify(block, null, 2);
		})
		.filter(Boolean)
		.join("\n");
}

function formatToolResult(result: Record<string, unknown>): string {
	if (result.structuredContent !== undefined) {
		return JSON.stringify(result.structuredContent, null, 2);
	}

	if (result.toolResult !== undefined) {
		return JSON.stringify(result.toolResult, null, 2);
	}

	const text = textFromMcpContent(result.content);
	return text || JSON.stringify(result, null, 2);
}

function errorTextFromMcpResult(result: Record<string, unknown>): string {
	if (result.structuredContent && typeof result.structuredContent === "object") {
		const structured = result.structuredContent as { error?: unknown };
		if (typeof structured.error === "string") return structured.error;
	}
	return formatToolResult(result);
}

async function callMcpTool(ctx: ExtensionContext, toolName: string, args: JsonObject = {}) {
	const conn = await ensureConnection(ctx.cwd);
	const result = (await conn.client.callTool({
		name: toolName,
		arguments: args,
	})) as Record<string, unknown>;

	if (result.isError) {
		throw new Error(errorTextFromMcpResult(result));
	}

	return {
		content: [{ type: "text" as const, text: formatToolResult(result) }],
		details: {
			mcpTool: toolName,
			projectRoot: conn.projectRoot,
			contractsDir: conn.contractsDir,
			result,
		},
	};
}

async function listContractsForStatus(ctx: ExtensionContext): Promise<{ names: string[]; loaded?: number }> {
	const output = await callMcpTool(ctx, "status", {});
	const result = output.details.result as { structuredContent?: { contracts?: Array<{ name?: unknown }>; loaded?: unknown } };
	const contracts = result.structuredContent?.contracts ?? [];
	return {
		names: contracts.map((contract) => String(contract.name ?? "")).filter(Boolean),
		loaded: typeof result.structuredContent?.loaded === "number" ? result.structuredContent.loaded : contracts.length,
	};
}

export default function promptToJsonMcpExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "ptj_list_contracts",
		label: "prompt-to-json list",
		description: "List currently loaded prompt-to-json contracts from the local MCP server.",
		promptSnippet: "List available prompt-to-json JSON contracts",
		promptGuidelines: PROMPT_TO_JSON_GUIDELINES,
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return callMcpTool(ctx, "list_contracts", {});
		},
	});

	pi.registerTool({
		name: "ptj_status",
		label: "prompt-to-json status",
		description: "Show local prompt-to-json MCP server status, loaded contracts, and contract hashes.",
		promptSnippet: "Show prompt-to-json MCP status",
		promptGuidelines: PROMPT_TO_JSON_GUIDELINES,
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return callMcpTool(ctx, "status", {});
		},
	});

	pi.registerTool({
		name: "ptj_read_contract",
		label: "prompt-to-json read",
		description: "Read a prompt-to-json contract by name.",
		promptSnippet: "Read a selected prompt-to-json contract including schema, rules, and examples",
		promptGuidelines: PROMPT_TO_JSON_GUIDELINES,
		parameters: ContractParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			assertSafeContractName(params.contract);
			return callMcpTool(ctx, "read_contract", { contract: params.contract });
		},
	});

	pi.registerTool({
		name: "ptj_get_json_contract",
		label: "prompt-to-json contract",
		description:
			"Get schema, rules, examples, instructions, and input so Pi's active model can produce JSON for a prompt-to-json contract.",
		promptSnippet: "Get a JSON contract payload before generating schema-valid JSON",
		promptGuidelines: PROMPT_TO_JSON_GUIDELINES,
		parameters: JsonContractParams,
		prepareArguments: prepareJsonContractArgs,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			assertSafeContractName(params.contract);
			return callMcpTool(ctx, "get_json_contract", {
				contract: params.contract,
				input: params.input,
				context: params.context ?? {},
			});
		},
	});

	pi.registerTool({
		name: "ptj_get_edit_contract",
		label: "prompt-to-json edit contract",
		description:
			"Get schema, rules, current JSON, edit instructions, and input so Pi's active model can edit existing JSON for a prompt-to-json contract.",
		promptSnippet: "Get an edit contract payload before generating complete edited JSON",
		promptGuidelines: PROMPT_TO_JSON_GUIDELINES,
		parameters: EditContractParams,
		prepareArguments: prepareEditContractArgs,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			assertSafeContractName(params.contract);
			return callMcpTool(ctx, "get_edit_contract", {
				contract: params.contract,
				currentJson: params.currentJson,
				input: params.input,
				context: params.context ?? {},
			});
		},
	});

	pi.registerTool({
		name: "ptj_validate_json",
		label: "prompt-to-json validate",
		description: "Validate JSON produced by Pi's active model against a prompt-to-json contract schema.",
		promptSnippet: "Validate generated JSON against a prompt-to-json contract",
		promptGuidelines: PROMPT_TO_JSON_GUIDELINES,
		parameters: ValidateJsonParams,
		prepareArguments: prepareValidateArgs,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			assertSafeContractName(params.contract);
			return callMcpTool(ctx, "validate_json", {
				contract: params.contract,
				json: params.json,
			});
		},
	});

	pi.registerTool({
		name: "ptj_get_repair_contract",
		label: "prompt-to-json repair",
		description:
			"Get repair instructions, schema, rules, invalid JSON, and validation errors so Pi's active model can repair invalid JSON.",
		promptSnippet: "Get a repair contract after prompt-to-json validation fails",
		promptGuidelines: PROMPT_TO_JSON_GUIDELINES,
		parameters: RepairContractParams,
		prepareArguments: prepareRepairArgs,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			assertSafeContractName(params.contract);
			return callMcpTool(ctx, "get_repair_contract", {
				contract: params.contract,
				invalidJson: params.invalidJson,
				validationErrors: params.validationErrors ?? [],
			});
		},
	});

	pi.registerTool({
		name: "ptj_reload_contracts",
		label: "prompt-to-json reload",
		description: "Rescan the local json-contracts folder and reload prompt-to-json contracts.",
		promptSnippet: "Reload prompt-to-json contracts from disk",
		promptGuidelines: PROMPT_TO_JSON_GUIDELINES,
		parameters: EmptyParams,
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			return callMcpTool(ctx, "reload_contracts", {});
		},
	});

	pi.registerCommand("ptj-status", {
		description: "Show prompt-to-json MCP bridge status",
		handler: async (_args, ctx) => {
			try {
				const conn = await ensureConnection(ctx.cwd);
				const contracts = await listContractsForStatus(ctx);
				const uptimeSeconds = Math.round((Date.now() - conn.startedAt) / 1000);
				const lines = [
					"prompt-to-json MCP server: connected",
					`project root: ${conn.projectRoot}`,
					`contracts dir: ${conn.contractsDir}`,
					`loaded contracts: ${contracts.loaded ?? contracts.names.length}`,
					`contract names: ${contracts.names.join(", ") || "none"}`,
					`uptime: ${uptimeSeconds}s`,
				];
				if (conn.stderrLines.length) {
					lines.push("recent stderr:", ...conn.stderrLines.slice(-5).map((line) => `  ${line}`));
				}
				ctx.ui.notify(lines.join("\n"), "info");
			} catch (error) {
				ctx.ui.notify(`prompt-to-json MCP status failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	pi.registerCommand("ptj-reload", {
		description: "Reload prompt-to-json contracts from disk",
		handler: async (_args, ctx) => {
			try {
				const output = await callMcpTool(ctx, "reload_contracts", {});
				ctx.ui.notify(`prompt-to-json contracts reloaded:\n${output.content[0].text}`, "info");
			} catch (error) {
				ctx.ui.notify(`prompt-to-json reload failed: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});

	pi.on("session_shutdown", async () => {
		await closeConnection();
	});
}
