export type JsonObject = Record<string, unknown>;

export type JsonContractFile = {
  name?: string;
  description?: string;
  rules?: string[];
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
  schema: JsonObject;
  examples: unknown[];
  sourcePath: string;
};

export type PublicContract = {
  name: string;
  description?: string;
  rules: string[];
  schema: JsonObject;
  examples: unknown[];
};

export type ContractSummary = {
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

export type JsonContractResponse = {
  contract: string;
  instructions: string[];
  description: string;
  rules: string[];
  schema: JsonObject;
  examples: unknown[];
  input: string;
  context: JsonObject;
};

export type RepairContractResponse = {
  contract: string;
  instructions: string[];
  schema: JsonObject;
  rules: string[];
  examples: unknown[];
  invalidJson: unknown;
  validationErrors: FormattedValidationError[];
};
