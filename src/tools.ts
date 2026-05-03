import { z } from "zod";
import { isSafeContractName } from "./security.js";
import type {
  FormattedValidationError,
  JsonContractResponse,
  JsonObject,
  RepairContractResponse,
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

export const REPAIR_CONTRACT_INSTRUCTIONS = [
  "Repair the JSON so it validates against the schema.",
  "Return JSON only.",
  "Do not return markdown.",
  "Do not include commentary.",
  "Do not include extra keys.",
  "Preserve valid fields where possible."
];

export type ToolHandlers = ReturnType<typeof createToolHandlers>;

const validationErrorInputSchema = {
  type: "array",
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      path: { type: "string" },
      message: { type: "string" },
      keyword: { type: "string" }
    },
    required: ["path", "message", "keyword"]
  },
  default: []
} as const;

export const toolDefinitions = [
  {
    name: "list_contracts",
    description: "List currently loaded JSON contracts.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: "read_contract",
    description: "Read a loaded JSON contract.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: { type: "string" }
      },
      required: ["contract"]
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
        contract: { type: "string" },
        input: { type: "string" },
        context: { type: "object", additionalProperties: true, default: {} }
      },
      required: ["contract", "input"]
    }
  },
  {
    name: "validate_json",
    description: "Validate agent-produced JSON against a contract schema.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: { type: "string" },
        json: {}
      },
      required: ["contract", "json"]
    }
  },
  {
    name: "get_repair_contract",
    description: "Return schema, rules, previous invalid JSON, validation errors, and repair instructions.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        contract: { type: "string" },
        invalidJson: {},
        validationErrors: validationErrorInputSchema
      },
      required: ["contract", "invalidJson"]
    }
  },
  {
    name: "reload_contracts",
    description: "Rescan the JSON contracts directory and reload valid contracts.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {}
    }
  }
] as const;

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  return schema.parse(input ?? {});
}

function descriptionOrEmpty(description: string | undefined): string {
  return description ?? "";
}

export function createToolHandlers(store: ContractStore, validator: JsonValidator) {
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
        description: descriptionOrEmpty(contract.description),
        rules: contract.rules,
        schema: contract.schema,
        examples: contract.examples
      };
    },

    async get_json_contract(input: unknown): Promise<JsonContractResponse> {
      const parsed = parseInput(GetJsonContractInputSchema, input);
      const contract = store.getContract(parsed.contract);
      const context = parsed.context as JsonObject;

      return {
        contract: contract.name,
        instructions: JSON_CONTRACT_INSTRUCTIONS,
        description: descriptionOrEmpty(contract.description),
        rules: contract.rules,
        schema: contract.schema,
        examples: contract.examples,
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

      return {
        contract: contract.name,
        instructions: REPAIR_CONTRACT_INSTRUCTIONS,
        schema: contract.schema,
        rules: contract.rules,
        examples: contract.examples,
        invalidJson: parsed.invalidJson,
        validationErrors
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
