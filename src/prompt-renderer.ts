import type { FormattedValidationError, JsonObject, LoadedContract } from "./types.js";

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function renderRules(rules: string[]): string {
  if (!rules.length) return "[]";
  return rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n");
}

export type JsonContractPromptArgs = {
  contract: LoadedContract;
  input: string;
  context?: JsonObject;
};

export type EditContractPromptArgs = {
  contract: LoadedContract;
  currentJson: unknown;
  input: string;
  context?: JsonObject;
};

export type RepairContractPromptArgs = {
  contract: LoadedContract;
  invalidJson: unknown;
  validationErrors?: FormattedValidationError[];
};

export function renderJsonContractPrompt({
  contract,
  input,
  context = {}
}: JsonContractPromptArgs): string {
  return [
    "Convert the input into JSON.",
    "The agent/model performs the conversion; the MCP server only provides this contract.",
    "Return JSON only.",
    "Do not return markdown.",
    "Do not include prose.",
    "Do not include commentary.",
    "Do not include extra keys.",
    "Match the schema exactly.",
    "Use enum values exactly.",
    "Follow all rules.",
    "Use examples as guidance.",
    "If information is missing, infer only when rules/examples justify it.",
    "Otherwise use safe defaults only if the schema/rules specify them.",
    "",
    `Contract: ${contract.name}`,
    "Operation: create",
    contract.description ? `Description: ${contract.description}` : "Description: ",
    "",
    "Rules:",
    renderRules(contract.rules),
    "",
    "Create operation rules:",
    renderRules(contract.operations.create.rules),
    "",
    "JSON Schema:",
    pretty(contract.schema),
    "",
    "Examples:",
    pretty(contract.examples),
    "",
    "Create operation examples:",
    pretty(contract.operations.create.examples),
    "",
    "Input:",
    input,
    "",
    "Context:",
    pretty(context)
  ].join("\n");
}

export function renderEditContractPrompt({
  contract,
  currentJson,
  input,
  context = {}
}: EditContractPromptArgs): string {
  return [
    "Edit the current JSON using the user's requested change.",
    "The agent/model performs the edit; the MCP server only provides this contract.",
    "Start from currentJson.",
    "Apply only the user's requested change.",
    "Preserve all unspecified fields exactly.",
    "Return the complete updated JSON object, not a patch.",
    "Return JSON only.",
    "Do not return markdown.",
    "Do not include prose.",
    "Do not include commentary.",
    "Do not include extra keys.",
    "Match the schema exactly.",
    "Use enum values exactly.",
    "Follow all rules.",
    "Use examples as guidance.",
    "",
    `Contract: ${contract.name}`,
    "Operation: edit",
    contract.description ? `Description: ${contract.description}` : "Description: ",
    "",
    "Rules:",
    renderRules(contract.rules),
    "",
    "Edit operation rules:",
    renderRules(contract.operations.edit.rules),
    "",
    "JSON Schema:",
    pretty(contract.schema),
    "",
    "Examples:",
    pretty(contract.examples),
    "",
    "Edit operation examples:",
    pretty(contract.operations.edit.examples),
    "",
    "Current JSON:",
    pretty(currentJson),
    "",
    "Requested change:",
    input,
    "",
    "Context:",
    pretty(context)
  ].join("\n");
}

export function renderRepairContractPrompt({
  contract,
  invalidJson,
  validationErrors = []
}: RepairContractPromptArgs): string {
  return [
    "The previous JSON failed validation.",
    "Repair it so it matches the schema.",
    "Return corrected JSON only.",
    "Do not explain the fix.",
    "Do not return markdown.",
    "Do not include prose.",
    "Do not include commentary.",
    "Do not include extra keys.",
    "Preserve valid fields where possible.",
    "",
    `Contract: ${contract.name}`,
    contract.description ? `Description: ${contract.description}` : "Description: ",
    "",
    "Rules:",
    renderRules(contract.rules),
    "",
    "JSON Schema:",
    pretty(contract.schema),
    "",
    "Examples:",
    pretty(contract.examples),
    "",
    "Invalid JSON:",
    pretty(invalidJson),
    "",
    "Validation errors:",
    pretty(validationErrors)
  ].join("\n");
}
