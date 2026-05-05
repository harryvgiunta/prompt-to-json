export type JsonObject = Record<string, unknown>;

export type ContractOperation = JsonObject & {
  enabled: boolean;
  rules: string[];
  examples: unknown[];
  return?: "full_object" | "json_patch";
};

export type ContractOperations = {
  create: ContractOperation;
  edit: ContractOperation;
  [operation: string]: ContractOperation;
};

export type JsonContractFile = {
  name?: string;
  description?: string;
  rules?: string[];
  operations?: Partial<Record<string, Partial<ContractOperation>>>;
  schema: JsonObject;
  examples?: Array<{
    input: unknown;
    output: unknown;
    [key: string]: unknown;
  }>;
};

export type LoadedContract = {
  name: string;
  description?: string;
  rules: string[];
  operations: ContractOperations;
  schema: JsonObject;
  examples: unknown[];
  sourcePath: string;
};

export type ContractHashes = {
  contractHash: string;
  schemaHash: string;
};

export type PublicContract = ContractHashes & {
  name: string;
  description?: string;
  rules: string[];
  operations: ContractOperations;
  schema: JsonObject;
  examples: unknown[];
};

export type ContractSummary = ContractHashes & {
  name: string;
  description?: string;
};

export type FormattedValidationError = {
  path: string;
  message: string;
  keyword: string;
};

export type ValidationSuccess = {
  valid: true;
  contract: string;
  json: unknown;
  errors: [];
};

export type ValidationFailure = {
  valid: false;
  contract: string;
  errors: FormattedValidationError[];
};

export type ValidationResult = ValidationSuccess | ValidationFailure;

export type ContractLoaderOptions = {
  contractsDir: string;
  allowInvalidContracts?: boolean;
  maxContractFileBytes?: number;
  maxSchemaBytes?: number;
  maxExamples?: number;
  logger?: Logger;
};

export type Logger = {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
};

export type ResourceDescription = {
  uri: string;
  name: string;
  mimeType: "application/json";
  description?: string;
};

export type JsonContractResponse = ContractHashes & {
  contract: string;
  operation: "create";
  instructions: string[];
  description: string;
  rules: string[];
  operationRules: string[];
  schema: JsonObject;
  examples: unknown[];
  operationExamples: unknown[];
  input: string;
  context: JsonObject;
};

export type EditContractResponse = ContractHashes & {
  contract: string;
  operation: "edit";
  instructions: string[];
  description: string;
  rules: string[];
  operationRules: string[];
  schema: JsonObject;
  examples: unknown[];
  operationExamples: unknown[];
  currentJson: unknown;
  input: string;
  context: JsonObject;
};

export type RepairContractResponse = ContractHashes & {
  contract: string;
  instructions: string[];
  schema: JsonObject;
  rules: string[];
  examples: unknown[];
  invalidJson: unknown;
  validationErrors: FormattedValidationError[];
};

export type StatusResponse = {
  server: "prompt-to-json";
  version: string;
  contractsDir: string;
  loaded: number;
  contracts: ContractSummary[];
  watchContracts: boolean;
  allowInvalidContracts: boolean;
};
