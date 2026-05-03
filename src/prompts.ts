import { z } from "zod";
import { isSafeContractName } from "./security.js";
import type { FormattedValidationError, JsonObject } from "./types.js";
import type { ContractStore } from "./contract-loader.js";
import { renderJsonContractPrompt, renderRepairContractPrompt } from "./prompt-renderer.js";

const ContractNameSchema = z
  .string()
  .min(1)
  .refine(isSafeContractName, "contract must be a safe contract name");

const JsonContractPromptInputSchema = z
  .object({
    contract: ContractNameSchema,
    input: z.string(),
    context: z.record(z.string(), z.unknown()).optional().default({})
  })
  .strict();

const RequiredJsonValueSchema = z.custom<unknown>(
  (value) => value !== undefined,
  "value is required"
);

const ValidationErrorInputSchema = z.object({
  path: z.string(),
  message: z.string(),
  keyword: z.string()
});

const RepairContractPromptInputSchema = z
  .object({
    contract: ContractNameSchema,
    invalidJson: RequiredJsonValueSchema,
    validationErrors: z.array(ValidationErrorInputSchema).optional().default([])
  })
  .strict();

export const promptDefinitions = [
  {
    name: "json_contract_prompt",
    description:
      "Render a reusable prompt that tells the agent/model how to produce JSON from a selected contract.",
    arguments: [
      {
        name: "contract",
        description: "Contract name, for example support-ticket.",
        required: true
      },
      {
        name: "input",
        description: "Natural-language input to convert.",
        required: true
      },
      {
        name: "context",
        description: "Optional JSON object encoded as a string.",
        required: false
      }
    ]
  },
  {
    name: "repair_contract_prompt",
    description: "Render a reusable prompt that tells the agent/model how to repair JSON that failed validation.",
    arguments: [
      {
        name: "contract",
        description: "Contract name, for example support-ticket.",
        required: true
      },
      {
        name: "invalidJson",
        description: "Invalid JSON value encoded as a string.",
        required: true
      },
      {
        name: "validationErrors",
        description: "Validation errors encoded as a JSON array string.",
        required: false
      }
    ]
  }
] as const;

function parseMaybeJson(value: unknown, fallback: unknown): unknown {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function normalizePromptArguments(args: Record<string, unknown> | undefined): Record<string, unknown> {
  const input = args ?? {};
  return {
    ...input,
    context: parseMaybeJson(input.context, {}),
    invalidJson: parseMaybeJson(input.invalidJson, undefined),
    validationErrors: parseMaybeJson(input.validationErrors, [])
  };
}

export function createPromptHandlers(store: ContractStore) {
  return {
    async json_contract_prompt(input: unknown): Promise<string> {
      const parsed = JsonContractPromptInputSchema.parse(input ?? {});
      const contract = store.getContract(parsed.contract);
      return renderJsonContractPrompt({
        contract,
        input: parsed.input,
        context: parsed.context as JsonObject
      });
    },

    async repair_contract_prompt(input: unknown): Promise<string> {
      const parsed = RepairContractPromptInputSchema.parse(input ?? {});
      const contract = store.getContract(parsed.contract);
      return renderRepairContractPrompt({
        contract,
        invalidJson: parsed.invalidJson,
        validationErrors: parsed.validationErrors as FormattedValidationError[]
      });
    }
  };
}

export type PromptHandlers = ReturnType<typeof createPromptHandlers>;

export async function getPromptText(
  handlers: PromptHandlers,
  name: string,
  args: Record<string, unknown> | undefined
): Promise<string> {
  const normalized = normalizePromptArguments(args);
  const handler = handlers[name as keyof PromptHandlers];
  if (!handler) {
    throw new Error(`Unknown prompt: ${name}`);
  }
  return handler(normalized as never);
}
