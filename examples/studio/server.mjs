#!/usr/bin/env node
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const THINKING_LEVELS = ["off", "low", "medium", "high", "xhigh", "auto"];

await loadEnvFiles([
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.local"),
  path.join(__dirname, ".env"),
  path.join(__dirname, ".env.local")
]);

const defaultPort = 5177;
const port = parsePort(process.env.STUDIO_PORT ?? process.env.PORT, defaultPort);
const host = process.env.STUDIO_HOST ?? "127.0.0.1";
let contractsDir = path.resolve(
  process.env.PROMPT_TO_JSON_CONTRACTS_DIR ?? path.join(process.cwd(), "json-contracts")
);
const studioEnvPath = path.join(process.cwd(), ".env");
const llmConfig = createLlmConfig(process.env);

const { ContractStore, JsonValidator, createToolHandlers } = await loadCore();

const logger = {
  debug() {},
  info() {},
  warn(message, meta) {
    console.warn(`[studio] warn: ${message}${formatMeta(meta)}`);
  },
  error(message, meta) {
    console.error(`[studio] error: ${message}${formatMeta(meta)}`);
  }
};

let store;
let handlers;
const loadedContracts = await switchContractsDir(contractsDir);
const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    sendJson(response, statusCodeFor(error), {
      error: messageFor(error)
    });
  });
});

async function switchContractsDir(nextContractsDir) {
  const resolvedContractsDir = path.resolve(nextContractsDir);
  const nextStore = new ContractStore({
    contractsDir: resolvedContractsDir,
    allowInvalidContracts: parseBoolean(process.env.ALLOW_INVALID_CONTRACTS, false),
    logger
  });
  const loaded = await nextStore.reload({ emitChange: false });
  nextStore.startWatching();

  const previousStore = store;
  contractsDir = resolvedContractsDir;
  process.env.PROMPT_TO_JSON_CONTRACTS_DIR = contractsDir;
  store = nextStore;
  handlers = createToolHandlers(store, new JsonValidator());

  if (previousStore) {
    await previousStore.close();
  }

  return loaded;
}

function publicContractsDirConfig() {
  return {
    contractsDir,
    relativeContractsDir: path.relative(process.cwd(), contractsDir) || ".",
    contracts: store.listNames()
  };
}

server.listen(port, host, () => {
  const publicLlm = publicLlmConfig();
  console.log(`[studio] prompt-to-json Studio running at http://${host}:${port}`);
  console.log(`[studio] Contracts: ${contractsDir}`);
  console.log(`[studio] Loaded ${loadedContracts.length} contract(s).`);
  console.log(`[studio] LLM providers: ${publicLlm.providers.map((provider) => provider.label).join(", ")}`);
  console.log(`[studio] Default LLM provider: ${publicLlm.defaultProvider}`);
  console.log(`[studio] Default thinking: ${publicLlm.defaultThinking}`);
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.log("[studio] Warning: Studio is not bound to 127.0.0.1. Only enter API keys on trusted local networks.");
  }
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function loadEnvFiles(filePaths) {
  const originalEnvKeys = new Set(Object.keys(process.env));

  for (const filePath of filePaths) {
    let text;
    try {
      text = await readFile(filePath, "utf8");
    } catch (error) {
      const nodeError = error;
      if (nodeError && nodeError.code === "ENOENT") continue;
      throw error;
    }

    for (const [key, value] of parseEnvFile(text)) {
      if (originalEnvKeys.has(key)) continue;
      process.env[key] = value;
    }
  }
}

function parseEnvFile(text) {
  const entries = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const equalsIndex = normalized.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = normalized.slice(0, equalsIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = normalized.slice(equalsIndex + 1).trim();
    value = stripInlineComment(value);
    value = stripEnvQuotes(value);
    entries.push([key, value]);
  }

  return entries;
}

function stripInlineComment(value) {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previous = value[index - 1];

    if (char === "'" && !inDoubleQuote && previous !== "\\") {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote && previous !== "\\") {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === "#" && !inSingleQuote && !inDoubleQuote && /\s/.test(previous ?? "")) {
      return value.slice(0, index).trim();
    }
  }

  return value;
}

function stripEnvQuotes(value) {
  if (value.length < 2) return value;

  const first = value[0];
  const last = value[value.length - 1];
  if (first === "'" && last === "'") {
    return value.slice(1, -1);
  }

  if (first === '"' && last === '"') {
    return value.slice(1, -1).replace(/\\([nrt"\\])/g, (_match, escaped) => {
      switch (escaped) {
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case '"':
          return '"';
        case "\\":
          return "\\";
        default:
          return escaped;
      }
    });
  }

  return value;
}

async function loadCore() {
  try {
    const [{ ContractStore }, { JsonValidator }, { createToolHandlers }] = await Promise.all([
      import("../../dist/contract-loader.js"),
      import("../../dist/validator.js"),
      import("../../dist/tools.js")
    ]);

    return { ContractStore, JsonValidator, createToolHandlers };
  } catch (error) {
    console.error("[studio] Could not load prompt-to-json from dist/.");
    console.error("[studio] Run `npm run build` first, or use `npm run studio` from the repository root.");
    console.error(`[studio] ${messageFor(error)}`);
    process.exit(1);
  }
}

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    baseUrlEnv: "OPENAI_BASE_URL",
    requiresApiKey: true,
    supportsThinking: true
  },
  {
    id: "anthropic",
    label: "Anthropic",
    adapter: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    baseUrlEnv: "ANTHROPIC_BASE_URL",
    requiresApiKey: true,
    supportsThinking: true
  },
  {
    id: "ollama-cloud",
    label: "Ollama Cloud",
    adapter: "ollama",
    defaultBaseUrl: "https://ollama.com/api",
    defaultModel: "kimi-k2.5",
    apiKeyEnv: "OLLAMA_API_KEY",
    tokenEnv: "OLLAMA_TOKEN",
    modelEnv: "OLLAMA_MODEL",
    baseUrlEnv: "OLLAMA_BASE_URL",
    requiresApiKey: true,
    supportsThinking: true
  },
  {
    id: "ollama-local",
    label: "Local Ollama",
    adapter: "ollama",
    defaultBaseUrl: "http://127.0.0.1:11434/api",
    defaultModel: "llama3.2",
    apiKeyEnv: "OLLAMA_API_KEY",
    tokenEnv: "OLLAMA_TOKEN",
    modelEnv: "OLLAMA_MODEL",
    baseUrlEnv: "OLLAMA_BASE_URL",
    requiresApiKey: false,
    supportsThinking: true
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    baseUrlEnv: "OPENROUTER_BASE_URL",
    requiresApiKey: true,
    supportsThinking: true
  },
  {
    id: "groq",
    label: "Groq",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    baseUrlEnv: "GROQ_BASE_URL",
    requiresApiKey: true,
    supportsThinking: false
  },
  {
    id: "together",
    label: "Together AI",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    apiKeyEnv: "TOGETHER_API_KEY",
    modelEnv: "TOGETHER_MODEL",
    baseUrlEnv: "TOGETHER_BASE_URL",
    requiresApiKey: true,
    supportsThinking: false
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    apiKeyEnv: "FIREWORKS_API_KEY",
    modelEnv: "FIREWORKS_MODEL",
    baseUrlEnv: "FIREWORKS_BASE_URL",
    requiresApiKey: true,
    supportsThinking: false
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    baseUrlEnv: "DEEPSEEK_BASE_URL",
    requiresApiKey: true,
    supportsThinking: false
  },
  {
    id: "mistral",
    label: "Mistral",
    adapter: "openai-compatible",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-large-latest",
    apiKeyEnv: "MISTRAL_API_KEY",
    modelEnv: "MISTRAL_MODEL",
    baseUrlEnv: "MISTRAL_BASE_URL",
    requiresApiKey: true,
    supportsThinking: false
  },
  {
    id: "custom-openai-compatible",
    label: "Custom OpenAI-compatible",
    adapter: "openai-compatible",
    defaultBaseUrl: "",
    defaultModel: "",
    apiKeyEnv: "LLM_API_KEY",
    modelEnv: "LLM_MODEL",
    baseUrlEnv: "LLM_BASE_URL",
    requiresApiKey: true,
    supportsThinking: true
  }
];

const CONTRACT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const NEW_CONTRACT_DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    contractName: {
      type: "string",
      pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$"
    },
    contract: {
      type: "object",
      additionalProperties: false,
      properties: {
        description: { type: "string", minLength: 1 },
        rules: {
          type: "array",
          items: { type: "string" },
          default: []
        },
        operations: {
          type: "object",
          additionalProperties: true
        },
        schema: {
          type: "object",
          additionalProperties: true
        },
        examples: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
            properties: {
              input: {},
              output: {}
            },
            required: ["input", "output"]
          },
          default: []
        }
      },
      required: ["description", "rules", "schema", "examples"]
    }
  },
  required: ["contractName", "contract"]
};

const NEW_CONTRACT_RULES = [
  "Generate one prompt-to-json contract draft for the requested app behavior.",
  "Return a wrapper object with contractName and contract fields.",
  "contractName must be a safe filename-style identifier such as churn-risk or support-ticket; do not include .json.",
  "The contract.schema must be valid JSON Schema for the final app JSON.",
  "Use additionalProperties:false for object schemas unless the user asks for arbitrary fields.",
  "Prefer optional fields over forced unknown values unless unknown is an intentional business enum value.",
  "Use required only for fields that every valid output should contain.",
  "Include 1 to 3 high-quality examples whose outputs validate against the generated schema.",
  "Examples must not contradict the rules.",
  "Add rules for how context should be used when app/system variables are likely.",
  "Do not include a version field.",
  "Do not include secrets, code, markdown, or commentary."
];

function createLlmConfig(env) {
  return {
    defaultProvider: env.LLM_PROVIDER ?? env.STUDIO_LLM_PROVIDER ?? "openai",
    defaultThinking: normalizeThinking(env.LLM_THINKING ?? env.OLLAMA_THINKING ?? "medium"),
    requestTimeoutMs: parsePositiveInteger(env.LLM_REQUEST_TIMEOUT_MS ?? env.OLLAMA_REQUEST_TIMEOUT_MS, 120_000),
    ollamaFormatMode: normalizeOllamaFormat(env.OLLAMA_FORMAT ?? "schema"),
    ollamaAllowNoAuth: parseBoolean(env.OLLAMA_ALLOW_NO_AUTH, false),
    anthropicVersion: env.ANTHROPIC_VERSION ?? "2023-06-01"
  };
}

function publicLlmConfig() {
  const providers = PROVIDERS.map((provider) => {
    const defaultBaseUrl = envBaseUrlFor(provider) || provider.defaultBaseUrl;
    const isLocalOllama = provider.adapter === "ollama" && defaultBaseUrl && isLocalOllamaBaseUrl(defaultBaseUrl);
    const requiresApiKey = provider.adapter === "ollama"
      ? !isLocalOllama && !llmConfig.ollamaAllowNoAuth
      : provider.requiresApiKey;
    const hasApiKey = Boolean(envApiKeyFor(provider));

    return {
      id: provider.id,
      label: provider.label,
      adapter: provider.adapter,
      defaultBaseUrl: defaultBaseUrl ? redactUrl(defaultBaseUrl) : "",
      defaultModel: envModelFor(provider) || provider.defaultModel,
      requiresApiKey,
      hasApiKey,
      configured: !requiresApiKey || hasApiKey,
      supportsThinking: provider.supportsThinking,
      defaultThinking: llmConfig.defaultThinking
    };
  });

  return {
    providers,
    defaultProvider: providerExists(llmConfig.defaultProvider) ? llmConfig.defaultProvider : "openai",
    defaultThinking: llmConfig.defaultThinking,
    thinkingLevels: THINKING_LEVELS,
    requestTimeoutMs: llmConfig.requestTimeoutMs,
    keyHandling: "Keys entered in the browser are sent only to this local Studio server for the current request. They are saved only when Save config is checked, and then only to the local .env file."
  };
}

function providerExists(providerId) {
  return PROVIDERS.some((provider) => provider.id === providerId);
}

function getProvider(providerId) {
  const provider = PROVIDERS.find((entry) => entry.id === providerId);
  if (!provider) {
    throw httpError(400, `Unknown LLM provider: ${providerId}`);
  }
  return provider;
}

function envApiKeyFor(provider) {
  return (
    process.env[provider.apiKeyEnv] ??
    (provider.tokenEnv ? process.env[provider.tokenEnv] : undefined) ??
    process.env.LLM_API_KEY ??
    ""
  ).trim();
}

function envModelFor(provider) {
  return (process.env[provider.modelEnv] ?? process.env.LLM_MODEL ?? "").trim();
}

function envBaseUrlFor(provider) {
  return (process.env[provider.baseUrlEnv] ?? process.env.LLM_BASE_URL ?? "").trim();
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function normalizeOllamaFormat(value) {
  const normalized = value.toLowerCase();
  if (["schema", "json", "none"].includes(normalized)) return normalized;
  throw new Error("OLLAMA_FORMAT must be one of: schema, json, none");
}

function normalizeThinking(value) {
  if (value === undefined || value === null || value === "") return "medium";
  if (typeof value === "boolean") return value ? "medium" : "off";

  const normalized = String(value).trim().toLowerCase();
  if (THINKING_LEVELS.includes(normalized)) return normalized;
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return "medium";
  if (["0", "false", "no", "none", "disabled"].includes(normalized)) return "off";
  if (["default", "omit"].includes(normalized)) return "auto";

  throw new Error(`Thinking must be one of: ${THINKING_LEVELS.join(", ")}`);
}

function parsePort(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return parsed;
}

function parsePositiveInteger(value, fallback) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${value}`);
  }
  return parsed;
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function formatMeta(meta) {
  if (meta === undefined) return "";
  if (meta instanceof Error) return ` ${meta.message}`;
  if (typeof meta === "string") return ` ${meta}`;

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [unserializable metadata]";
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    const handled = await handleApiRequest(request, response, url);
    if (!handled) {
      sendJson(response, 404, { error: `API route not found: ${url.pathname}` });
    }
    return;
  }

  await serveStatic(request, response, url.pathname);
}

async function handleApiRequest(request, response, url) {
  const { method } = request;
  const { pathname } = url;

  if (method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      contractsDir,
      contracts: store.listNames(),
      llm: publicLlmConfig()
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/contracts-dir") {
    sendJson(response, 200, publicContractsDirConfig());
    return true;
  }

  if (method === "POST" && pathname === "/api/contracts-dir") {
    const body = await readJsonBody(request);
    const nextContractsDir = requiredString(body.contractsDir, "contractsDir");
    const loaded = await switchContractsDir(nextContractsDir);
    sendJson(response, 200, {
      ...publicContractsDirConfig(),
      loaded: loaded.length
    });
    return true;
  }

  if (method === "GET" && pathname === "/api/contracts") {
    sendJson(response, 200, await handlers.list_contracts({}));
    return true;
  }

  if (method === "GET" && pathname.startsWith("/api/contracts/")) {
    const contract = decodePathSegment(pathname.slice("/api/contracts/".length));
    sendJson(response, 200, await handlers.read_contract({ contract }));
    return true;
  }

  if (method === "POST" && pathname.startsWith("/api/contracts/") && pathname.endsWith("/schema")) {
    const prefix = "/api/contracts/";
    const suffix = "/schema";
    const contract = decodePathSegment(pathname.slice(prefix.length, -suffix.length));
    const body = await readJsonBody(request);
    sendJson(response, 200, await saveContractSchemaRequest(contract, body));
    return true;
  }

  if (method === "POST" && pathname.startsWith("/api/contracts/") && pathname.endsWith("/rules")) {
    const prefix = "/api/contracts/";
    const suffix = "/rules";
    const contract = decodePathSegment(pathname.slice(prefix.length, -suffix.length));
    const body = await readJsonBody(request);
    sendJson(response, 200, await saveContractRulesRequest(contract, body));
    return true;
  }

  if (method === "GET" && (pathname === "/api/llm/providers" || pathname === "/api/llm/config")) {
    sendJson(response, 200, publicLlmConfig());
    return true;
  }

  if (method === "POST" && pathname === "/api/llm/save-config") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await saveLlmConfigRequest(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/contract-drafts/generate") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await generateContractDraftWithLlm(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/contract-drafts/validate") {
    const body = await readJsonBody(request);
    sendJson(response, 200, validateContractDraftRequest(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/contract-drafts/save") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await saveContractDraftRequest(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/json-contract") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await handlers.get_json_contract(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/edit-contract") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await handlers.get_edit_contract(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/validate") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await handlers.validate_json(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/repair-contract") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await handlers.get_repair_contract(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/llm/generate") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await generateJsonWithLlm(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/llm/edit") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await editJsonWithLlm(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/llm/repair") {
    const body = await readJsonBody(request);
    sendJson(response, 200, await repairJsonWithLlm(body));
    return true;
  }

  if (method === "POST" && pathname === "/api/reload") {
    sendJson(response, 200, await handlers.reload_contracts({}));
    return true;
  }

  return false;
}

async function saveLlmConfigRequest(input) {
  const llm = resolveLlmRequest(input);
  return saveLlmConfig(input, llm, {
    saveAsDefault: optionalBoolean(input.saveAsDefault)
  });
}

async function generateContractDraftWithLlm(input) {
  const llm = resolveLlmRequest(input);
  const suggestedName = optionalString(input.suggestedName);
  const description = requiredString(input.description, "description");
  const desiredFields = normalizeStringList(input.desiredFields);
  const exampleInputs = normalizeStringList(input.exampleInputs);
  const userContext = optionalContext(input.context);

  const requestPayload = {
    suggestedName: suggestedName || slugFromText(description),
    description,
    desiredFields,
    exampleInputs,
    context: withStudioContext(userContext, {
      mode: "contract-draft",
      llmProvider: llm.provider.id,
      note: "This payload asks the provider to draft a new prompt-to-json contract."
    })
  };

  const promptPayload = {
    contract: "new-contract",
    instructions: [
      "Create a new prompt-to-json contract draft.",
      "Return JSON only.",
      "Do not return markdown.",
      "The returned JSON must match the schema exactly."
    ],
    description: "Generate a prompt-to-json contract file from a natural-language app behavior description.",
    rules: NEW_CONTRACT_RULES,
    schema: NEW_CONTRACT_DRAFT_SCHEMA,
    examples: [newContractExample()],
    input: requestPayload
  };

  const llmResponse = await callLlmForJson({
    llm,
    schema: NEW_CONTRACT_DRAFT_SCHEMA,
    messages: [
      {
        role: "system",
        content: "You are a careful prompt-to-json contract author. Return one JSON value only. Do not include markdown, code fences, commentary, or extra keys."
      },
      {
        role: "user",
        content: buildNewContractPrompt(promptPayload)
      }
    ]
  });
  const savedConfig = await trySaveLlmConfig(input, llm);
  const parsed = parseModelJson(llmResponse.content);

  const baseResult = {
    provider: llm.provider.id,
    providerLabel: llm.provider.label,
    adapter: llm.provider.adapter,
    mode: "contract-draft",
    baseUrl: redactUrl(llm.baseUrl),
    model: llm.model,
    thinking: llm.thinking,
    ...(llmResponse.reasoning ? { reasoning: llmResponse.reasoning } : {}),
    ...(llmResponse.usage ? { usage: llmResponse.usage } : {}),
    ...(llmResponse.providerResponse ? { providerResponse: llmResponse.providerResponse } : {}),
    ...(savedConfig ? { savedConfig } : {}),
    rawText: llmResponse.content
  };

  if (!parsed.ok) {
    return {
      ...baseResult,
      parseError: parsed.error,
      validation: {
        valid: false,
        errors: [parsed.error],
        warnings: []
      }
    };
  }

  const validation = validateContractDraftValue(parsed.value);
  return {
    ...baseResult,
    draft: parsed.value,
    validation
  };
}

function validateContractDraftRequest(input) {
  const draft = normalizeContractDraftInput(input);
  const validation = validateContractDraftValue(draft);
  return {
    draft,
    validation
  };
}

async function saveContractDraftRequest(input) {
  const draft = normalizeContractDraftInput(input);
  const overwrite = optionalBoolean(input.overwrite);
  const validation = validateContractDraftValue(draft);

  if (!validation.valid) {
    throw httpError(400, `Contract draft is invalid: ${validation.errors.join("; ")}`);
  }

  const filePath = contractDraftPath(draft.contractName);
  await mkdir(contractsDir, { recursive: true });

  try {
    await writeFile(filePath, `${JSON.stringify(draft.contract, null, 2)}\n`, {
      encoding: "utf8",
      flag: overwrite ? "w" : "wx"
    });
  } catch (error) {
    if (error && error.code === "EEXIST") {
      throw httpError(409, `Contract already exists: ${draft.contractName}. Tick Overwrite existing to replace it.`);
    }
    throw error;
  }

  const reload = await handlers.reload_contracts({});
  return {
    saved: true,
    contractName: draft.contractName,
    path: path.relative(process.cwd(), filePath),
    validation,
    reload
  };
}

async function saveContractSchemaRequest(contractNameInput, input) {
  const contractName = requiredString(contractNameInput, "contract");
  if (!isSafeContractName(contractName)) {
    throw httpError(400, `Invalid contract name: ${contractName}`);
  }

  if (!isPlainObject(input) || !isPlainObject(input.schema)) {
    throw httpError(400, "schema must be a JSON object.");
  }

  const { contract, filePath } = await readContractFileForEdit(contractName);
  contract.schema = input.schema;
  const validation = validateContractDraftValue({ contractName, contract });
  if (!validation.valid) {
    throw httpError(400, `Edited schema is invalid for this contract: ${validation.errors.join("; ")}`);
  }

  await writeFile(filePath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  const reload = await handlers.reload_contracts({});

  return {
    saved: true,
    contractName,
    path: path.relative(process.cwd(), filePath),
    schema: contract.schema,
    validation,
    reload
  };
}

async function saveContractRulesRequest(contractNameInput, input) {
  const contractName = requiredString(contractNameInput, "contract");
  if (!isSafeContractName(contractName)) {
    throw httpError(400, `Invalid contract name: ${contractName}`);
  }

  if (!isPlainObject(input) || !Array.isArray(input.rules) || !input.rules.every((rule) => typeof rule === "string")) {
    throw httpError(400, "rules must be an array of strings.");
  }

  const rules = input.rules.map((rule) => rule.trim()).filter(Boolean);
  const { contract, filePath } = await readContractFileForEdit(contractName);
  contract.rules = rules;

  const validation = validateContractDraftValue({ contractName, contract });
  if (!validation.valid) {
    throw httpError(400, `Edited rules are invalid for this contract: ${validation.errors.join("; ")}`);
  }

  await writeFile(filePath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  const reload = await handlers.reload_contracts({});

  return {
    saved: true,
    contractName,
    path: path.relative(process.cwd(), filePath),
    rules: contract.rules,
    validation,
    reload
  };
}

async function readContractFileForEdit(contractName) {
  const filePath = contractDraftPath(contractName);
  let currentText;
  try {
    currentText = await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw httpError(404, `Contract file not found: ${contractName}.`);
    }
    throw error;
  }

  let contract;
  try {
    contract = JSON.parse(currentText);
  } catch (error) {
    throw httpError(400, `Contract file is not valid JSON: ${messageFor(error)}`);
  }

  if (!isPlainObject(contract)) {
    throw httpError(400, "Contract file must contain a JSON object.");
  }

  return { contract, filePath };
}

function normalizeContractDraftInput(input) {
  const candidate = isPlainObject(input?.draft) ? input.draft : input;
  if (!isPlainObject(candidate)) {
    throw httpError(400, "Contract draft must be a JSON object.");
  }

  const contractName = requiredString(candidate.contractName, "contractName");
  const contract = candidate.contract;
  if (!isPlainObject(contract)) {
    throw httpError(400, "contract must be a JSON object.");
  }

  return { contractName, contract };
}

function validateContractDraftValue(draft) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(draft)) {
    return { valid: false, errors: ["Draft must be a JSON object."], warnings };
  }

  const { contractName, contract } = draft;
  if (typeof contractName !== "string" || contractName.trim() === "") {
    errors.push("contractName must be a non-empty string.");
  } else if (!isSafeContractName(contractName)) {
    errors.push("contractName must be a safe filename-style contract name.");
  }

  if (!isPlainObject(contract)) {
    errors.push("contract must be a JSON object.");
    return { valid: false, errors, warnings };
  }

  if (Object.prototype.hasOwnProperty.call(contract, "version")) {
    errors.push("contract must not include a version field; use Git for versioning.");
  }

  if (typeof contract.description !== "string" || contract.description.trim() === "") {
    errors.push("contract.description must be a non-empty string.");
  }

  if (!Array.isArray(contract.rules) || !contract.rules.every((rule) => typeof rule === "string")) {
    errors.push("contract.rules must be an array of strings.");
  } else if (contract.rules.length === 0) {
    warnings.push("No rules included. Add rules to make app-specific behavior explicit.");
  }

  if (!isPlainObject(contract.schema)) {
    errors.push("contract.schema must be a JSON Schema object.");
  } else {
    try {
      new JsonValidator().validateSchema(contract.schema);
    } catch (error) {
      errors.push(messageFor(error));
    }

    if (contract.schema.type === "object" && contract.schema.additionalProperties !== false) {
      warnings.push("Object schema does not set additionalProperties:false.");
    }

    if (schemaContainsUnknownEnum(contract.schema)) {
      warnings.push("Schema contains an enum value named unknown. Consider making that field optional unless unknown is intentional.");
    }
  }

  if (!Array.isArray(contract.examples)) {
    errors.push("contract.examples must be an array.");
  } else {
    if (contract.examples.length === 0) warnings.push("No examples included. Add at least one high-quality example.");

    if (isPlainObject(contract.schema)) {
      const validator = new JsonValidator();
      const loaded = {
        name: typeof contractName === "string" ? contractName : "draft",
        description: typeof contract.description === "string" ? contract.description : "",
        rules: Array.isArray(contract.rules) ? contract.rules : [],
        schema: contract.schema,
        examples: contract.examples,
        sourcePath: "<draft>"
      };

      contract.examples.forEach((example, index) => {
        if (!isPlainObject(example)) {
          errors.push(`examples[${index}] must be an object.`);
          return;
        }
        if (!Object.prototype.hasOwnProperty.call(example, "input")) {
          errors.push(`examples[${index}].input is required.`);
        }
        if (!Object.prototype.hasOwnProperty.call(example, "output")) {
          errors.push(`examples[${index}].output is required.`);
          return;
        }

        try {
          const result = validator.validateAgainstContract(loaded, example.output);
          if (!result.valid) {
            errors.push(`examples[${index}].output does not validate: ${result.errors.map((error) => `${error.path || "/"} ${error.message}`).join(", ")}`);
          }
        } catch (error) {
          errors.push(`examples[${index}].output validation failed: ${messageFor(error)}`);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function contractDraftPath(contractName) {
  if (!isSafeContractName(contractName)) {
    throw httpError(400, `Invalid contract name: ${contractName}`);
  }

  const filePath = path.resolve(contractsDir, `${contractName}.json`);
  const relative = path.relative(contractsDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw httpError(400, "Contract path escapes contracts directory.");
  }
  return filePath;
}

function isSafeContractName(name) {
  return (
    CONTRACT_NAME_RE.test(name) &&
    !name.includes("..") &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes(path.sep)
  );
}

function normalizeStringList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugFromText(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "new-contract";
}

function schemaContainsUnknownEnum(schema) {
  if (Array.isArray(schema)) return schema.some(schemaContainsUnknownEnum);
  if (!isPlainObject(schema)) return false;
  if (Array.isArray(schema.enum) && schema.enum.includes("unknown")) return true;
  return Object.values(schema).some(schemaContainsUnknownEnum);
}

function buildNewContractPrompt(promptPayload) {
  return [
    "Use this prompt-to-json meta-contract to generate a new contract draft.",
    "Return JSON only. Do not include markdown or explanation.",
    "The meta-contract payload is below:",
    JSON.stringify(promptPayload, null, 2)
  ].join("\n\n");
}

function newContractExample() {
  return {
    input: {
      suggestedName: "churn-risk",
      description: "Convert customer cancellation emails into structured churn-risk records for a SaaS customer success team.",
      desiredFields: ["customerIntent", "cancellationReason", "urgency", "refundRequested", "sentiment", "recommendedFollowUp"],
      exampleInputs: ["I need to cancel before my renewal next week. Your product is too expensive and we barely use it anymore."],
      context: {
        current_datetime: "2026-05-03T00:00:00Z"
      }
    },
    output: {
      contractName: "churn-risk",
      contract: {
        description: "Convert customer cancellation messages into a structured churn-risk record.",
        rules: [
          "Only include fields supported by the message or context.",
          "Use refundRequested only when the customer asks for a refund or credit.",
          "Use urgency high when cancellation is requested before a near-term renewal or deadline."
        ],
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            customerIntent: { type: "string", enum: ["cancel", "downgrade", "complaint", "question"] },
            cancellationReason: { type: "string" },
            urgency: { type: "string", enum: ["low", "medium", "high"] },
            refundRequested: { type: "boolean" },
            sentiment: { type: "string", enum: ["negative", "neutral", "positive"] },
            recommendedFollowUp: { type: "string", enum: ["support", "success_manager", "billing", "retention_offer"] }
          },
          required: ["customerIntent", "urgency", "sentiment", "recommendedFollowUp"]
        },
        examples: [
          {
            input: "I need to cancel before my renewal next week. Your product is too expensive and we barely use it anymore.",
            output: {
              customerIntent: "cancel",
              cancellationReason: "too expensive and low usage",
              urgency: "high",
              refundRequested: false,
              sentiment: "negative",
              recommendedFollowUp: "success_manager"
            }
          }
        ]
      }
    }
  };
}

async function generateJsonWithLlm(input) {
  const contract = requiredString(input.contract, "contract");
  const userInput = requiredString(input.input, "input");
  const userContext = optionalContext(input.context);
  const llm = resolveLlmRequest(input);

  const jsonContract = await handlers.get_json_contract({
    contract,
    input: userInput,
    context: withStudioContext(userContext, {
      mode: "llm",
      llmProvider: llm.provider.id,
      note: "This payload was sent to the selected LLM provider by the example Studio."
    })
  });

  const llmResponse = await callLlmForJson({
    llm,
    schema: jsonContract.schema,
    messages: [
      {
        role: "system",
        content: "You convert natural language into schema-valid JSON. Return one JSON value only. Do not return markdown, code fences, commentary, or extra keys."
      },
      {
        role: "user",
        content: buildGenerationPrompt(jsonContract)
      }
    ]
  });
  const savedConfig = await trySaveLlmConfig(input, llm);

  return buildLlmResult({
    mode: "generate",
    llm,
    contract,
    jsonContract,
    rawText: llmResponse.content,
    reasoning: llmResponse.reasoning,
    providerResponse: llmResponse.providerResponse,
    usage: llmResponse.usage,
    savedConfig
  });
}

async function editJsonWithLlm(input) {
  const contract = requiredString(input.contract, "contract");
  const currentJson = requiredValue(input.currentJson, "currentJson");
  const userInput = requiredString(input.input, "input");
  const userContext = optionalContext(input.context);
  const llm = resolveLlmRequest(input);

  const editContract = await handlers.get_edit_contract({
    contract,
    currentJson,
    input: userInput,
    context: withStudioContext(userContext, {
      mode: "llm-edit",
      llmProvider: llm.provider.id,
      note: "This edit payload was sent to the selected LLM provider by the example Studio."
    })
  });

  const llmResponse = await callLlmForJson({
    llm,
    schema: editContract.schema,
    messages: [
      {
        role: "system",
        content: "You edit existing JSON so it matches the user's requested change while preserving unspecified fields. Return one complete JSON value only. Do not return markdown, code fences, commentary, or extra keys."
      },
      {
        role: "user",
        content: buildEditPrompt(editContract)
      }
    ]
  });
  const savedConfig = await trySaveLlmConfig(input, llm);

  return buildLlmResult({
    mode: "edit",
    llm,
    contract,
    editContract,
    rawText: llmResponse.content,
    reasoning: llmResponse.reasoning,
    providerResponse: llmResponse.providerResponse,
    usage: llmResponse.usage,
    savedConfig
  });
}

async function repairJsonWithLlm(input) {
  const contract = requiredString(input.contract, "contract");
  const invalidJson = requiredValue(input.invalidJson, "invalidJson");
  const validationErrors = Array.isArray(input.validationErrors) ? input.validationErrors : [];
  const llm = resolveLlmRequest(input);

  const repairContract = await handlers.get_repair_contract({
    contract,
    invalidJson,
    validationErrors
  });

  const llmResponse = await callLlmForJson({
    llm,
    schema: repairContract.schema,
    messages: [
      {
        role: "system",
        content: "You repair JSON so it matches the provided JSON Schema and rules. Return one JSON value only. Do not return markdown, code fences, commentary, or extra keys."
      },
      {
        role: "user",
        content: buildRepairPrompt(repairContract)
      }
    ]
  });
  const savedConfig = await trySaveLlmConfig(input, llm);

  return buildLlmResult({
    mode: "repair",
    llm,
    contract,
    repairContract,
    rawText: llmResponse.content,
    reasoning: llmResponse.reasoning,
    providerResponse: llmResponse.providerResponse,
    usage: llmResponse.usage,
    savedConfig
  });
}

function resolveLlmRequest(input) {
  const providerId = optionalString(input.provider) || (providerExists(llmConfig.defaultProvider) ? llmConfig.defaultProvider : "openai");
  const provider = getProvider(providerId);
  const rawBaseUrl = optionalString(input.baseUrl) || envBaseUrlFor(provider) || provider.defaultBaseUrl;

  if (!rawBaseUrl) {
    throw httpError(400, `${provider.label} needs a base URL. Use the Base URL field or LLM_BASE_URL.`);
  }

  const baseUrl = normalizeBaseUrl(rawBaseUrl);
  const isLocalOllama = provider.adapter === "ollama" && isLocalOllamaBaseUrl(baseUrl);
  const requiresApiKey = provider.adapter === "ollama"
    ? !isLocalOllama && !llmConfig.ollamaAllowNoAuth
    : provider.requiresApiKey;
  const apiKey = optionalString(input.apiKey) || envApiKeyFor(provider);

  if (requiresApiKey && !apiKey) {
    throw httpError(400, `${provider.label} requires an API key. Paste one in the Studio UI or set ${provider.apiKeyEnv}.`);
  }

  const model = optionalString(input.model) || envModelFor(provider) || provider.defaultModel;
  if (!model) {
    throw httpError(400, `${provider.label} needs a model name.`);
  }

  return {
    provider,
    baseUrl,
    apiKey,
    model,
    thinking: optionalThinking(input.thinking),
    temperature: optionalTemperature(input.temperature),
    requestTimeoutMs: llmConfig.requestTimeoutMs
  };
}

async function trySaveLlmConfig(input, llm) {
  const saveAsDefault = optionalBoolean(input.saveAsDefault);
  const saveConfig = optionalBoolean(input.saveConfig) || saveAsDefault;
  if (!saveConfig) return undefined;

  try {
    return await saveLlmConfig(input, llm, { saveAsDefault });
  } catch (error) {
    return {
      saved: false,
      envPath: studioEnvPath,
      saveAsDefault,
      error: messageFor(error)
    };
  }
}

async function saveLlmConfig(input, llm, { saveAsDefault }) {
  const updates = llmEnvUpdates(input, llm, { saveAsDefault });
  await updateEnvFile(studioEnvPath, updates);

  for (const [key, value] of updates) {
    process.env[key] = value;
  }

  refreshLlmConfigFromEnvironment();

  return {
    saved: true,
    envPath: studioEnvPath,
    saveAsDefault,
    keys: [...updates.keys()],
    publicConfig: publicLlmConfig()
  };
}

function llmEnvUpdates(input, llm, { saveAsDefault }) {
  const updates = new Map();
  const provider = llm.provider;
  const apiKey = optionalString(input.apiKey);
  const baseUrlOverride = optionalString(input.baseUrl);

  if (saveAsDefault) {
    updates.set("LLM_PROVIDER", provider.id);
  }

  updates.set("LLM_THINKING", llm.thinking);
  updates.set(provider.modelEnv, llm.model);

  if (apiKey) {
    updates.set(provider.apiKeyEnv, apiKey);
  }

  if (baseUrlOverride) {
    updates.set(provider.baseUrlEnv, normalizeBaseUrl(baseUrlOverride));
  }

  return updates;
}

function refreshLlmConfigFromEnvironment() {
  llmConfig.defaultProvider = process.env.LLM_PROVIDER ?? process.env.STUDIO_LLM_PROVIDER ?? "openai";
  llmConfig.defaultThinking = normalizeThinking(process.env.LLM_THINKING ?? process.env.OLLAMA_THINKING ?? "medium");
}

async function updateEnvFile(filePath, updates) {
  let existing = "";

  try {
    existing = await readFile(filePath, "utf8");
  } catch (error) {
    const nodeError = error;
    if (!nodeError || nodeError.code !== "ENOENT") throw error;
  }

  const next = upsertEnvAssignments(existing, updates);
  await writeFile(filePath, next, "utf8");
}

function upsertEnvAssignments(text, updates) {
  const lines = text ? text.split(/\r?\n/) : [];
  if (lines.length > 0 && lines.at(-1) === "") lines.pop();

  const lastIndexByKey = new Map();
  lines.forEach((line, index) => {
    const key = activeEnvKeyFromLine(line);
    if (updates.has(key)) lastIndexByKey.set(key, index);
  });

  const written = new Set();
  const nextLines = [];

  lines.forEach((line, index) => {
    const key = activeEnvKeyFromLine(line);
    if (updates.has(key)) {
      if (lastIndexByKey.get(key) !== index) return;
      nextLines.push(formatEnvAssignment(key, updates.get(key)));
      written.add(key);
      return;
    }

    nextLines.push(line);
  });

  const missing = [...updates.keys()].filter((key) => !written.has(key));
  if (missing.length > 0) {
    if (nextLines.length > 0 && nextLines.at(-1).trim() !== "") nextLines.push("");
    nextLines.push("# prompt-to-json Studio saved LLM config");
    for (const key of missing) {
      nextLines.push(formatEnvAssignment(key, updates.get(key)));
    }
  }

  return `${nextLines.join("\n")}\n`;
}

function activeEnvKeyFromLine(rawLine) {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith("#")) return "";

  const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const equalsIndex = normalized.indexOf("=");
  if (equalsIndex <= 0) return "";

  const key = normalized.slice(0, equalsIndex).trim();
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : "";
}

function formatEnvAssignment(key, value) {
  return `${key}=${quoteEnvValue(value)}`;
}

function quoteEnvValue(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_@%+=:,./-]*$/.test(text)) return text;
  if (!text.includes("'") && !/[\r\n]/.test(text)) return `'${text}'`;
  return `"${text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")}"`;
}

async function buildLlmResult({ mode, llm, contract, jsonContract, editContract, repairContract, rawText, reasoning, providerResponse, usage, savedConfig }) {
  const parsed = parseModelJson(rawText);
  const baseResult = {
    provider: llm.provider.id,
    providerLabel: llm.provider.label,
    adapter: llm.provider.adapter,
    mode,
    baseUrl: redactUrl(llm.baseUrl),
    model: llm.model,
    thinking: llm.thinking,
    ...(reasoning ? { reasoning } : {}),
    ...(usage ? { usage } : {}),
    ...(providerResponse ? { providerResponse } : {}),
    ...(savedConfig ? { savedConfig } : {}),
    ...(jsonContract ? { jsonContract } : {}),
    ...(editContract ? { editContract } : {}),
    ...(repairContract ? { repairContract } : {}),
    rawText
  };

  if (!parsed.ok) {
    return {
      ...baseResult,
      parseError: parsed.error,
      validation: null
    };
  }

  const validation = await handlers.validate_json({
    contract,
    json: parsed.value
  });

  return {
    ...baseResult,
    json: parsed.value,
    validation
  };
}

function buildGenerationPrompt(jsonContract) {
  return [
    "Use this prompt-to-json contract to convert the input into JSON.",
    "Return JSON only. Do not include markdown or explanation.",
    "The selected contract payload is below:",
    JSON.stringify(jsonContract, null, 2)
  ].join("\n\n");
}

function buildEditPrompt(editContract) {
  return [
    "Use this prompt-to-json edit contract to edit the current JSON.",
    "Apply only the requested change and preserve unspecified fields exactly.",
    "Return the complete updated JSON object only. Do not include markdown or explanation.",
    "The selected edit payload is below:",
    JSON.stringify(editContract, null, 2)
  ].join("\n\n");
}

function buildRepairPrompt(repairContract) {
  return [
    "Use this prompt-to-json repair contract to fix the invalid JSON.",
    "Return JSON only. Do not include markdown or explanation.",
    "The selected repair payload is below:",
    JSON.stringify(repairContract, null, 2)
  ].join("\n\n");
}

async function callLlmForJson({ llm, schema, messages }) {
  switch (llm.provider.adapter) {
    case "openai-compatible":
      return callOpenAiCompatibleForJson({ llm, messages });
    case "anthropic":
      return callAnthropicForJson({ llm, messages });
    case "ollama":
      return callOllamaForJson({ llm, schema, messages });
    default:
      throw httpError(400, `Unsupported LLM adapter: ${llm.provider.adapter}`);
  }
}

async function callOpenAiCompatibleForJson({ llm, messages }) {
  const endpoint = openAiCompatibleEndpoint(llm.baseUrl);
  const reasoningEffort = llm.provider.supportsThinking ? openAiReasoningEffort(llm.thinking) : undefined;
  const baseBody = {
    model: llm.model,
    messages,
    temperature: llm.temperature
  };

  const attempts = [
    { responseFormat: true, reasoning: Boolean(reasoningEffort) },
    { responseFormat: true, reasoning: false },
    { responseFormat: false, reasoning: false }
  ];

  let lastError = "";

  for (const attempt of attempts) {
    const body = { ...baseBody };
    if (attempt.responseFormat) body.response_format = { type: "json_object" };
    if (attempt.reasoning && reasoningEffort) body.reasoning_effort = reasoningEffort;

    const response = await postJson(endpoint, {
      headers: openAiCompatibleHeaders(llm),
      body,
      timeoutMs: llm.requestTimeoutMs,
      providerLabel: llm.provider.label
    });

    if (response.ok) {
      const payload = response.payload;
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        throw httpError(502, `${llm.provider.label} response did not include choices[0].message.content.`);
      }

      const message = payload.choices[0].message;
      return {
        content,
        reasoning: extractOpenAiReasoning(message),
        usage: payload.usage,
        providerResponse: {
          id: payload.id,
          model: payload.model,
          finishReason: payload.choices?.[0]?.finish_reason,
          usedResponseFormat: attempt.responseFormat,
          usedReasoningEffort: attempt.reasoning ? reasoningEffort : undefined
        }
      };
    }

    lastError = response.errorText;
    if (!shouldRetryOpenAiCompatible(response.status, response.errorText, attempt)) break;
  }

  throw httpError(502, `${llm.provider.label} API error: ${lastError}`);
}

function openAiCompatibleEndpoint(baseUrl) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = basePath.endsWith("/chat/completions")
    ? basePath
    : `${basePath}/chat/completions`.replace(/\/+/g, "/");
  url.search = "";
  url.hash = "";
  return url;
}

function openAiCompatibleHeaders(llm) {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Title": "prompt-to-json Studio"
  };

  if (llm.apiKey) headers.Authorization = `Bearer ${llm.apiKey}`;
  return headers;
}

function openAiReasoningEffort(thinking) {
  switch (thinking) {
    case "low":
    case "medium":
    case "high":
      return thinking;
    case "xhigh":
      return "high";
    default:
      return undefined;
  }
}

function shouldRetryOpenAiCompatible(status, errorText, attempt) {
  if (![400, 404, 422].includes(status)) return false;
  const text = errorText.toLowerCase();
  if (attempt.reasoning && text.includes("reasoning")) return true;
  if (attempt.responseFormat && (text.includes("response_format") || text.includes("json_object") || text.includes("unsupported"))) return true;
  return false;
}

function extractOpenAiReasoning(message) {
  if (!message || typeof message !== "object") return "";
  const candidates = [
    message.reasoning,
    message.reasoning_content,
    message.thinking,
    message.thinking_content
  ];
  return candidates.filter((value) => typeof value === "string" && value.trim()).join("\n\n");
}

async function callAnthropicForJson({ llm, messages }) {
  const endpoint = anthropicEndpoint(llm.baseUrl, "messages");
  const thinking = anthropicThinking(llm.thinking);
  const body = {
    model: llm.model,
    max_tokens: thinking ? Math.max(4096, thinking.budget_tokens + 2048) : 4096,
    system: messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n"),
    messages: [
      {
        role: "user",
        content: messages.filter((message) => message.role !== "system").map((message) => message.content).join("\n\n")
      }
    ]
  };

  if (thinking) {
    body.thinking = thinking;
  } else {
    body.temperature = llm.temperature;
  }

  const response = await postJson(endpoint, {
    headers: anthropicHeaders(llm),
    body,
    timeoutMs: llm.requestTimeoutMs,
    providerLabel: llm.provider.label
  });

  if (!response.ok) {
    throw httpError(response.status, `${llm.provider.label} API error ${response.status}: ${response.errorText}`);
  }

  const payload = response.payload;
  const content = extractAnthropicText(payload);
  if (!content) {
    throw httpError(502, `${llm.provider.label} response did not include text content.`);
  }

  return {
    content,
    reasoning: extractAnthropicThinking(payload),
    usage: payload.usage,
    providerResponse: {
      id: payload.id,
      model: payload.model,
      stopReason: payload.stop_reason,
      thinkingBudgetTokens: thinking?.budget_tokens
    }
  };
}

function anthropicEndpoint(baseUrl, pathname) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = basePath.endsWith("/v1") ? `${basePath}/${pathname}` : `${basePath}/v1/${pathname}`;
  url.search = "";
  url.hash = "";
  return url;
}

function anthropicHeaders(llm) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-api-key": llm.apiKey,
    "anthropic-version": llmConfig.anthropicVersion
  };
}

function anthropicThinking(thinking) {
  const budgets = {
    low: 1024,
    medium: 4096,
    high: 8192,
    xhigh: 16384
  };

  const budget = budgets[thinking];
  return budget ? { type: "enabled", budget_tokens: budget } : undefined;
}

function extractAnthropicText(payload) {
  if (!Array.isArray(payload?.content)) return "";
  return payload.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

function extractAnthropicThinking(payload) {
  if (!Array.isArray(payload?.content)) return "";
  return payload.content
    .filter((block) => block?.type === "thinking" || block?.type === "redacted_thinking")
    .map((block) => {
      if (typeof block.thinking === "string") return block.thinking;
      if (typeof block.text === "string") return block.text;
      if (typeof block.data === "string") return "[redacted thinking returned]";
      return "";
    })
    .filter(Boolean)
    .join("\n\n");
}

async function callOllamaForJson({ llm, schema, messages }) {
  const endpoint = ollamaEndpoint(llm.baseUrl, "chat");
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json"
  };

  if (llm.apiKey) {
    headers.Authorization = `Bearer ${llm.apiKey}`;
  }

  const requestBody = {
    model: llm.model,
    messages,
    stream: false,
    options: {
      temperature: llm.temperature
    }
  };

  const think = ollamaThinkValue(llm.thinking);
  if (think !== undefined) {
    requestBody.think = think;
  }

  const format = ollamaFormatFor(schema);
  if (format !== undefined) {
    requestBody.format = format;
  }

  const response = await postJson(endpoint, {
    headers,
    body: requestBody,
    timeoutMs: llm.requestTimeoutMs,
    providerLabel: llm.provider.label
  });

  if (!response.ok) {
    throw httpError(response.status, `${llm.provider.label} API error ${response.status}: ${response.errorText}`);
  }

  const payload = response.payload;
  const content = payload?.message?.content;
  if (typeof content !== "string") {
    throw httpError(502, `${llm.provider.label} response did not include message.content.`);
  }

  return {
    content,
    reasoning: typeof payload?.message?.thinking === "string" ? payload.message.thinking : "",
    usage: summarizeOllamaResponse(payload),
    providerResponse: {
      model: payload.model,
      done: payload.done,
      usedThink: think,
      formatMode: llmConfig.ollamaFormatMode
    }
  };
}

function ollamaThinkValue(thinking) {
  if (thinking === "off") return false;
  if (thinking === "auto") return undefined;
  return thinking;
}

function ollamaFormatFor(schema) {
  if (llmConfig.ollamaFormatMode === "none") return undefined;
  if (llmConfig.ollamaFormatMode === "json") return "json";
  return isPlainObject(schema) ? schema : "json";
}

function summarizeOllamaResponse(payload) {
  return {
    model: payload.model,
    createdAt: payload.created_at,
    done: payload.done,
    hasThinking: typeof payload?.message?.thinking === "string" && payload.message.thinking.length > 0,
    totalDuration: payload.total_duration,
    loadDuration: payload.load_duration,
    promptEvalCount: payload.prompt_eval_count,
    evalCount: payload.eval_count
  };
}

function ollamaEndpoint(baseUrl, pathname) {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = basePath.endsWith("/api")
    ? `${basePath}/${pathname}`
    : `${basePath}/api/${pathname}`;
  url.search = "";
  url.hash = "";
  return url;
}

function isLocalOllamaBaseUrl(baseUrl) {
  const { hostname } = new URL(baseUrl);
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname.toLowerCase());
}

async function postJson(endpoint, { headers, body, timeoutMs, providerLabel }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw httpError(504, `${providerLabel} request timed out after ${timeoutMs}ms.`);
    }
    throw httpError(502, `Could not reach ${providerLabel} API at ${redactUrl(endpoint.toString())}: ${messageFor(error)}`);
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let payload = null;

  if (responseText.trim()) {
    try {
      payload = JSON.parse(responseText);
    } catch (error) {
      if (response.ok) {
        throw httpError(502, `${providerLabel} returned non-JSON response: ${messageFor(error)}`);
      }
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    errorText: response.ok ? "" : safeProviderErrorText(responseText, payload)
  };
}

function safeProviderErrorText(responseText, payload) {
  if (payload?.error?.message) return String(payload.error.message);
  if (payload?.message) return String(payload.message);
  return responseText.slice(0, 2000);
}

function redactUrl(value) {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function requiredString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw httpError(400, `${name} must be a non-empty string.`);
  }
  return value.trim();
}

function optionalString(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function optionalBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function requiredValue(value, name) {
  if (value === undefined) {
    throw httpError(400, `${name} is required.`);
  }
  return value;
}

function optionalContext(value) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) {
    throw httpError(400, "context must be a JSON object when provided.");
  }
  return value;
}

function withStudioContext(context, studio) {
  return {
    ...context,
    _studio: {
      app: "prompt-to-json Studio",
      ...studio
    }
  };
}

function optionalTemperature(value) {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw httpError(400, "temperature must be a number.");
  }
  return Math.min(2, Math.max(0, parsed));
}

function optionalThinking(value) {
  if (value === undefined || value === null || value === "") return llmConfig.defaultThinking;
  return normalizeThinking(value);
}

function parseModelJson(content) {
  const trimmed = content.trim();
  const candidates = [trimmed];
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const balanced = extractFirstJsonValue(trimmed);
  if (balanced) candidates.push(balanced);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next candidate.
    }
  }

  return {
    ok: false,
    error: "The model response was not parseable JSON. Raw text is included in rawText."
  };
}

function extractFirstJsonValue(text) {
  for (let start = 0; start < text.length; start += 1) {
    const char = text[start];
    if (char !== "{" && char !== "[") continue;

    const extracted = extractBalancedJsonFrom(text, start);
    if (extracted) return extracted;
  }
  return "";
}

function extractBalancedJsonFrom(text, start) {
  const stack = [];
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }

    if (char === "[") {
      stack.push("]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.at(-1) !== char) return "";
      stack.pop();
      if (stack.length === 0) return text.slice(start, index + 1);
    }
  }

  return "";
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonBody(request) {
  const maxBytes = 1024 * 1024;
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw httpError(413, "Request body is too large for the Studio demo.");
    }
    chunks.push(buffer);
  }

  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) return {};

  try {
    return JSON.parse(text);
  } catch (error) {
    throw httpError(400, `Invalid JSON request body: ${messageFor(error)}`);
  }
}

async function serveStatic(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const filePath = resolvePublicPath(pathname);

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": "no-store"
    });
    if (request.method !== "HEAD") {
      response.end(body);
    } else {
      response.end();
    }
  } catch (error) {
    const nodeError = error;
    if (nodeError && nodeError.code === "ENOENT") {
      sendJson(response, 404, { error: "Not found" });
      return;
    }
    throw error;
  }
}

function resolvePublicPath(pathname) {
  let requestedPath;
  try {
    requestedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  } catch {
    throw httpError(400, "Invalid URL path");
  }

  if (requestedPath.endsWith("/")) requestedPath += "index.html";

  const normalized = path.normalize(requestedPath).replace(/^[/\\]+/, "");
  const absolutePath = path.resolve(publicDir, normalized);
  const relativePath = path.relative(publicDir, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw httpError(403, "Path escapes the Studio public directory");
  }

  return absolutePath;
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

function decodePathSegment(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    throw httpError(400, "Invalid path segment");
  }
}

function sendJson(response, statusCode, value) {
  if (response.headersSent) return;
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function statusCodeFor(error) {
  if (error && Number.isInteger(error.statusCode)) return error.statusCode;
  return 400;
}

function messageFor(error) {
  return error instanceof Error ? error.message : String(error);
}

async function shutdown(signal) {
  console.log(`\n[studio] Received ${signal}; shutting down.`);
  if (store) await store.close();
  await new Promise((resolve) => server.close(resolve));
  process.exit(0);
}
