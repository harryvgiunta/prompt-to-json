import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger, parseBooleanEnv, resolveContractsDir } from "./security.js";
import { ContractStore } from "./contract-loader.js";
import { JsonValidator } from "./validator.js";
import { callToolHandler, createToolHandlers, toolDefinitions } from "./tools.js";
import {
  listContractResources,
  listContractResourceTemplates,
  readContractResource
} from "./resources.js";
import { createPromptHandlers, getPromptText, promptDefinitions } from "./prompts.js";
import type { Logger } from "./types.js";

export type PromptToJsonServerOptions = {
  contractsDir?: string;
  allowInvalidContracts?: boolean;
  watchContracts?: boolean;
  debug?: boolean;
  logger?: Logger;
};

export type PromptToJsonMcpServer = {
  server: Server;
  store: ContractStore;
  validator: JsonValidator;
  close(): Promise<void>;
};

const SERVER_VERSION = "0.1.0";

function asStructuredContent(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ],
    structuredContent: asStructuredContent(value)
  };
}

function errorContent(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const structuredContent = { error: message };
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(structuredContent, null, 2)
      }
    ],
    structuredContent
  };
}

async function sendResourceListChanged(server: Server, logger: Logger): Promise<void> {
  try {
    await server.notification({
      method: "notifications/resources/list_changed",
      params: {}
    });
  } catch (error) {
    logger.debug("Resource list changed notification was not sent", error);
  }
}

export async function createPromptToJsonMcpServer(
  options: PromptToJsonServerOptions = {}
): Promise<PromptToJsonMcpServer> {
  const debug = options.debug ?? false;
  const logger = options.logger ?? createLogger(debug);
  const contractsDir = resolveContractsDir(options.contractsDir);
  const allowInvalidContracts = options.allowInvalidContracts ?? false;
  const watchContracts = options.watchContracts ?? true;

  const store = new ContractStore({
    contractsDir,
    allowInvalidContracts,
    logger
  });

  await store.reload({ emitChange: false });

  const validator = new JsonValidator();
  const toolHandlers = createToolHandlers(store, validator);
  const promptHandlers = createPromptHandlers(store, validator);

  const server = new Server(
    {
      name: "prompt-to-json",
      version: SERVER_VERSION
    },
    {
      capabilities: {
        resources: {
          listChanged: true
        },
        tools: {},
        prompts: {}
      }
    }
  );

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listContractResources(store)
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const content = readContractResource(store, request.params.uri);
    return {
      contents: [content]
    };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: listContractResourceTemplates()
  }));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema
    }))
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await callToolHandler(
        toolHandlers,
        request.params.name,
        request.params.arguments ?? {}
      );
      return jsonContent(result);
    } catch (error) {
      return errorContent(error);
    }
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: promptDefinitions.map((prompt) => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments
    }))
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const text = await getPromptText(
      promptHandlers,
      request.params.name,
      request.params.arguments as Record<string, unknown> | undefined
    );

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text
          }
        }
      ]
    };
  });

  store.on("changed", () => {
    void sendResourceListChanged(server, logger);
  });

  if (watchContracts) {
    store.startWatching();
  }

  return {
    server,
    store,
    validator,
    async close() {
      await store.close();
      await server.close();
    }
  };
}

export async function startStdioMcpServer(
  options: PromptToJsonServerOptions = {}
): Promise<PromptToJsonMcpServer> {
  const app = await createPromptToJsonMcpServer(options);
  const transport = new StdioServerTransport();
  await app.server.connect(transport);
  return app;
}

export function optionsFromEnvironment(env: NodeJS.ProcessEnv = process.env): Required<PromptToJsonServerOptions> {
  const debug = parseBooleanEnv(env.DEBUG, false);
  return {
    contractsDir: env.PROMPT_TO_JSON_CONTRACTS_DIR ?? "./json-contracts",
    allowInvalidContracts: parseBooleanEnv(env.ALLOW_INVALID_CONTRACTS, false),
    watchContracts: parseBooleanEnv(env.WATCH_CONTRACTS, true),
    debug,
    logger: createLogger(debug)
  };
}
