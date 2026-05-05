import { z } from "zod";
import { SAFE_CONTRACT_NAME_PATTERN, isSafeContractName } from "./security.js";
import type {
  EditContractResponse,
  FormattedValidationError,
  JsonContractResponse,
  JsonObject,
  LoadedContract,
  RepairContractResponse,
  StatusResponse,
  ValidationResult
} from "./types.js";
import type { ContractStore } from "./contract-loader.js";
import type { JsonValidator } from "./validator.js";

const ContractNameSchema = z
  .string()
  .min(1)
  .refine(isSafeContractName, "contract must be a safe contract name");

const EmptyInputSchema = z.object({}).strict();

const ContextSchema = z
  .record(z.string(), z.unknown())
  .optional()
  .default({});

const RequiredJsonValueSchema = z.custom<unknown>(
  (value) => value !== undefined,
  "value is required"
);

const ValidationErrorInputSchema = z.object({
  path: z.string(),
  message: z.string(),
  keyword: z.string()
});

const ReadContractInputSchema = z
  .object({
    contract: ContractNameSchema
  })
  .strict();

const GetJsonContractInputSchema = z
  .object({
    contract: ContractNameSchema,
    input: z.string(),
    context: ContextSchema
  })
  .strict();

const GetEditContractInputSchema = z
  .object({
    contract: ContractNameSchema,
    currentJson: RequiredJsonValueSchema,
    input: z.string(),
    context: ContextSchema
  })
  .strict();

const ValidateJsonInputSchema = z
  .object({
    contract: ContractNameSchema,
    json: RequiredJsonValueSchema
  })
  .strict();

const GetRepairContractInputSchema = z
  .object({
    contract: ContractNameSchema,
    invalidJson: RequiredJsonValueSchema,
    validationErrors: z.array(ValidationErrorInputSchema).optional().default([])
  })
  .strict();

export const JSON_CONTRACT_INSTRUCTIONS = [
  "Convert the input into JSON.",
  "Return JSON only.",
  "Do not return markdown.",
  "Do not include commentary.",
  "Do not include extra keys.",
  "Match the schema exactly.",
  "Use enum values exactly.",
  "Follow all rules.",
  "Use examples as guidance."
];

export const EDIT_CONTRACT_INSTRUCTIONS = [
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
];

export const REPAIR_CONTRACT_INSTRUCTIONS = [
  "Repair the JSON so it validates against the schema.",
  "Return JSON only.",
  "Do not return markdown.",
  "Do not include commentary.",
  "Do not include extra keys.",
  "Preserve valid fields where possible."
];

export type ToolHandlers = ReturnType<typeof createToolHandlers>;

const contractNameJsonSchema = {
  type: "string",
  minLength: 1,
  pattern: SAFE_CONTRACT_NAME_PATTERN
} as const;

const jsonObjectSchema = {
  type: "object",
  additionalProperties: true
} as const;

const stringArraySchema = {
  type: "array",
  items: { type: "string" }
} as const;

const unknownArraySchema = {
  type: "array",
  items: {}
} as const;

const validationErrorObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string" },
    message: { type: "string" },
    keyword: { type: "string" }
  },
  required: ["path", "message", "keyword"]
} as const;

const validationErrorInputSchema = {
  type: "array",
  items: validationErrorObjectSchema,
  default: []
} as const;

const hashJsonSchema = {
  type: "string",
  pattern: "^sha256:[a-f0-9]{64}$"
} as const;

const contractHashProperties = {
  contractHash: hashJsonSchema,
  schemaHash: hashJsonSchema
} as const;

const contractSummaryOutputSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: contractNameJsonSchema,
    description: { type: "string" },
    ...contractHashProperties
  },
  required: ["name", "contractHash", "schemaHash"]
} as const;

export const toolDefinitions = [
  {
    name: "list_contracts",
    description: "List currently loaded JSON contracts.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contracts: {
          type: "array",
          items: contractSummaryOutputSchema
        }
      },
      required: ["contracts"]
    }
  },
  {
    name: "read_contract",
    description: "Read a loaded JSON contract.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema
      },
      required: ["contract"]
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema,
        ...contractHashProperties,
        description: { type: "string" },
        rules: stringArraySchema,
        operations: jsonObjectSchema,
        schema: jsonObjectSchema,
        examples: unknownArraySchema
      },
      required: ["contract", "contractHash", "schemaHash", "description", "rules", "operations", "schema", "examples"]
    }
  },
  {
    name: "get_json_contract",
    description:
      "Return schema, rules, examples, instructions, and input so the agent/model can produce JSON.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema,
        input: { type: "string" },
        context: { type: "object", additionalProperties: true, default: {} }
      },
      required: ["contract", "input"]
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema,
        ...contractHashProperties,
        operation: { const: "create" },
        instructions: stringArraySchema,
        description: { type: "string" },
        rules: stringArraySchema,
        operationRules: stringArraySchema,
        schema: jsonObjectSchema,
        examples: unknownArraySchema,
        operationExamples: unknownArraySchema,
        input: { type: "string" },
        context: jsonObjectSchema
      },
      required: [
        "contract",
        "contractHash",
        "schemaHash",
        "operation",
        "instructions",
        "description",
        "rules",
        "operationRules",
        "schema",
        "examples",
        "operationExamples",
        "input",
        "context"
      ]
    }
  },
  {
    name: "get_edit_contract",
    description:
      "Return schema, rules, current JSON, edit instructions, and input so the agent/model can edit existing JSON.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema,
        currentJson: {},
        input: { type: "string" },
        context: { type: "object", additionalProperties: true, default: {} }
      },
      required: ["contract", "currentJson", "input"]
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema,
        ...contractHashProperties,
        operation: { const: "edit" },
        instructions: stringArraySchema,
        description: { type: "string" },
        rules: stringArraySchema,
        operationRules: stringArraySchema,
        schema: jsonObjectSchema,
        examples: unknownArraySchema,
        operationExamples: unknownArraySchema,
        currentJson: {},
        input: { type: "string" },
        context: jsonObjectSchema
      },
      required: [
        "contract",
        "contractHash",
        "schemaHash",
        "operation",
        "instructions",
        "description",
        "rules",
        "operationRules",
        "schema",
        "examples",
        "operationExamples",
        "currentJson",
        "input",
        "context"
      ]
    }
  },
  {
    name: "validate_json",
    description: "Validate agent-produced JSON against a contract schema.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema,
        json: {}
      },
      required: ["contract", "json"]
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        valid: { type: "boolean" },
        contract: contractNameJsonSchema,
        json: {},
        errors: validationErrorInputSchema
      },
      required: ["valid", "contract", "errors"]
    }
  },
  {
    name: "get_repair_contract",
    description: "Return schema, rules, previous invalid JSON, validation errors, and repair instructions.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema,
        invalidJson: {},
        validationErrors: validationErrorInputSchema
      },
      required: ["contract", "invalidJson"]
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: contractNameJsonSchema,
        ...contractHashProperties,
        instructions: stringArraySchema,
        schema: jsonObjectSchema,
        rules: stringArraySchema,
        examples: unknownArraySchema,
        invalidJson: {},
        validationErrors: validationErrorInputSchema
      },
      required: [
        "contract",
        "contractHash",
        "schemaHash",
        "instructions",
        "schema",
        "rules",
        "examples",
        "invalidJson",
        "validationErrors"
      ]
    }
  },
  {
    name: "status",
    description: "Return prompt-to-json MCP server status and loaded contract metadata.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        server: { const: "prompt-to-json" },
        version: { type: "string" },
        contractsDir: { type: "string" },
        loaded: { type: "number" },
        contracts: {
          type: "array",
          items: contractSummaryOutputSchema
        },
        watchContracts: { type: "boolean" },
        allowInvalidContracts: { type: "boolean" }
      },
      required: [
        "server",
        "version",
        "contractsDir",
        "loaded",
        "contracts",
        "watchContracts",
        "allowInvalidContracts"
      ]
    }
  },
  {
    name: "reload_contracts",
    description: "Rescan the JSON contracts directory and reload valid contracts.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        loaded: { type: "number" },
        contracts: {
          type: "array",
          items: contractNameJsonSchema
        }
      },
      required: ["loaded", "contracts"]
    }
  }
] as const;

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  return schema.parse(input ?? {});
}

function descriptionOrEmpty(description: string | undefined): string {
  return description ?? "";
}

function requireOperation(contract: LoadedContract, operation: "create" | "edit") {
  const config = contract.operations[operation];
  if (!config || config.enabled === false) {
    throw new Error(`Contract ${contract.name} does not enable the ${operation} operation.`);
  }
  return config;
}

function formatValidationErrors(errors: FormattedValidationError[]): string {
  if (!errors.length) return "unknown validation error";
  return errors.map((error) => `${error.path || "/"}: ${error.message} (${error.keyword})`).join("; ");
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      deduped.push(value);
    }
  }

  return deduped;
}

type ToolRuntimeOptions = {
  serverVersion?: string;
  watchContracts?: boolean;
};

export function createToolHandlers(
  store: ContractStore,
  validator: JsonValidator,
  runtimeOptions: ToolRuntimeOptions = {}
) {
  return {
    async list_contracts(input: unknown = {}) {
      parseInput(EmptyInputSchema, input);
      return {
        contracts: store.listSummaries()
      };
    },

    async read_contract(input: unknown) {
      const parsed = parseInput(ReadContractInputSchema, input);
      const contract = store.getContract(parsed.contract);
      return {
        contract: contract.name,
        ...store.contractHashes(contract),
        description: descriptionOrEmpty(contract.description),
        rules: contract.rules,
        operations: contract.operations,
        schema: contract.schema,
        examples: contract.examples
      };
    },

    async get_json_contract(input: unknown): Promise<JsonContractResponse> {
      const parsed = parseInput(GetJsonContractInputSchema, input);
      const contract = store.getContract(parsed.contract);
      const createOperation = requireOperation(contract, "create");
      const context = parsed.context as JsonObject;

      return {
        contract: contract.name,
        ...store.contractHashes(contract),
        operation: "create",
        instructions: JSON_CONTRACT_INSTRUCTIONS,
        description: descriptionOrEmpty(contract.description),
        rules: contract.rules,
        operationRules: createOperation.rules,
        schema: contract.schema,
        examples: contract.examples,
        operationExamples: createOperation.examples,
        input: parsed.input,
        context
      };
    },

    async get_edit_contract(input: unknown): Promise<EditContractResponse> {
      const parsed = parseInput(GetEditContractInputSchema, input);
      const contract = store.getContract(parsed.contract);
      const editOperation = requireOperation(contract, "edit");
      if (editOperation.return !== "full_object") {
        throw new Error(`Contract ${contract.name} edit operation must return full_object for get_edit_contract.`);
      }

      const currentValidation = validator.validateAgainstContract(contract, parsed.currentJson);
      if (!currentValidation.valid) {
        throw new Error(
          `currentJson does not validate against contract ${contract.name}: ${formatValidationErrors(currentValidation.errors)}`
        );
      }

      const context = parsed.context as JsonObject;
      return {
        contract: contract.name,
        ...store.contractHashes(contract),
        operation: "edit",
        instructions: EDIT_CONTRACT_INSTRUCTIONS,
        description: descriptionOrEmpty(contract.description),
        rules: contract.rules,
        operationRules: editOperation.rules,
        schema: contract.schema,
        examples: contract.examples,
        operationExamples: editOperation.examples,
        currentJson: parsed.currentJson,
        input: parsed.input,
        context
      };
    },

    async validate_json(input: unknown): Promise<ValidationResult> {
      const parsed = parseInput(ValidateJsonInputSchema, input);
      const contract = store.getContract(parsed.contract);
      return validator.validateAgainstContract(contract, parsed.json);
    },

    async get_repair_contract(input: unknown): Promise<RepairContractResponse> {
      const parsed = parseInput(GetRepairContractInputSchema, input);
      const contract = store.getContract(parsed.contract);
      const validationResult = validator.validateAgainstContract(contract, parsed.invalidJson);
      const providedErrors = parsed.validationErrors as FormattedValidationError[];
      const validationErrors = validationResult.valid
        ? providedErrors
        : dedupeValidationErrors([...validationResult.errors, ...providedErrors]);

      const detailedInstructions = validator.buildRepairInstructions(
        contract,
        parsed.invalidJson,
        validationErrors
      );

      return {
        contract: contract.name,
        ...store.contractHashes(contract),
        instructions: dedupeStrings([...REPAIR_CONTRACT_INSTRUCTIONS, ...detailedInstructions]),
        schema: contract.schema,
        rules: contract.rules,
        examples: contract.examples,
        invalidJson: parsed.invalidJson,
        validationErrors
      };
    },

    async status(input: unknown = {}): Promise<StatusResponse> {
      parseInput(EmptyInputSchema, input);
      const contracts = store.listSummaries();
      return {
        server: "prompt-to-json",
        version: runtimeOptions.serverVersion ?? "0.1.0",
        contractsDir: store.contractsDir,
        loaded: contracts.length,
        contracts,
        watchContracts: runtimeOptions.watchContracts ?? false,
        allowInvalidContracts: store.allowInvalidContracts
      };
    },

    async reload_contracts(input: unknown = {}) {
      parseInput(EmptyInputSchema, input);
      const contracts = await store.reload();
      return {
        loaded: contracts.length,
        contracts: contracts.map((contract) => contract.name)
      };
    }
  };
}

function dedupeValidationErrors(errors: FormattedValidationError[]): FormattedValidationError[] {
  const seen = new Set<string>();
  const deduped: FormattedValidationError[] = [];

  for (const error of errors) {
    const key = `${error.keyword}:${error.path}:${error.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(error);
    }
  }

  return deduped;
}

export async function callToolHandler(
  handlers: ToolHandlers,
  name: string,
  input: unknown
): Promise<unknown> {
  const handler = handlers[name as keyof ToolHandlers];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler(input as never);
}
