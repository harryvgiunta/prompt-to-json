import { EventEmitter } from "node:events";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { z } from "zod";
import {
  assertInsideDirectory,
  assertSafeContractName,
  MAX_CONTRACT_FILE_BYTES,
  MAX_EXAMPLES,
  MAX_SCHEMA_BYTES,
  safeJsonSize
} from "./security.js";
import type {
  ContractLoaderOptions,
  ContractOperation,
  ContractOperations,
  ContractSummary,
  LoadedContract,
  Logger,
  PublicContract
} from "./types.js";
import { sha256Json } from "./hashing.js";
import { JsonValidator, validateJsonSchema } from "./validator.js";

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {}
};

const RequiredJsonValueSchema = z.custom<unknown>(
  (value) => value !== undefined,
  "value is required"
);

const ExampleSchema = z
  .object({
    input: RequiredJsonValueSchema,
    output: RequiredJsonValueSchema
  })
  .passthrough();

const OperationConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    return: z.enum(["full_object", "json_patch"]).optional(),
    rules: z.array(z.string()).optional(),
    examples: z.array(ExampleSchema).optional()
  })
  .passthrough();

const OperationsSchema = z
  .object({
    create: OperationConfigSchema.optional(),
    edit: OperationConfigSchema.optional()
  })
  .catchall(OperationConfigSchema);

const ContractFileSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    rules: z.array(z.string()).optional(),
    operations: OperationsSchema.optional(),
    schema: z
      .unknown()
      .refine(
        (value) => value !== null && typeof value === "object" && !Array.isArray(value),
        "schema must be a JSON Schema object"
      ),
    examples: z.array(ExampleSchema).optional()
  })
  .passthrough();

type ReloadOptions = {
  emitChange?: boolean;
};

type ContractLoadFailure = {
  file: string;
  error: Error;
};

export class ContractLoadError extends Error {
  readonly failures: ContractLoadFailure[];

  constructor(message: string, failures: ContractLoadFailure[]) {
    super(message);
    this.name = "ContractLoadError";
    this.failures = failures;
  }
}

const DEFAULT_CREATE_OPERATION: ContractOperation = {
  enabled: true,
  rules: [],
  examples: []
};

const DEFAULT_EDIT_OPERATION: ContractOperation = {
  enabled: true,
  return: "full_object",
  rules: [],
  examples: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeOperation(
  operation: unknown,
  defaults: ContractOperation
): ContractOperation {
  const input = isRecord(operation) ? operation : {};
  const rules = Array.isArray(input.rules) ? input.rules.filter((rule): rule is string => typeof rule === "string") : defaults.rules;
  const examples = Array.isArray(input.examples) ? input.examples : defaults.examples;
  const enabled = typeof input.enabled === "boolean" ? input.enabled : defaults.enabled;
  const returnMode = input.return === "full_object" || input.return === "json_patch" ? input.return : defaults.return;

  return {
    ...input,
    enabled,
    ...(returnMode ? { return: returnMode } : {}),
    rules: [...rules],
    examples: [...examples]
  } as ContractOperation;
}

export function normalizeOperations(operations: unknown): ContractOperations {
  const input = isRecord(operations) ? operations : {};
  const normalized: Record<string, ContractOperation> = {
    create: normalizeOperation(input.create, DEFAULT_CREATE_OPERATION),
    edit: normalizeOperation(input.edit, DEFAULT_EDIT_OPERATION)
  };

  for (const [name, operation] of Object.entries(input)) {
    if (name === "create" || name === "edit") continue;
    normalized[name] = normalizeOperation(operation, DEFAULT_CREATE_OPERATION);
  }

  return normalized as ContractOperations;
}

function formatValidationErrors(errors: Array<{ path: string; message: string; keyword: string }>): string {
  if (!errors.length) return "unknown validation error";
  return errors.map((error) => `${error.path || "/"}: ${error.message} (${error.keyword})`).join("; ");
}

function validateExampleOutputs(contract: LoadedContract): void {
  const validator = new JsonValidator();
  const exampleGroups: Array<{ label: string; examples: unknown[] }> = [
    { label: "examples", examples: contract.examples },
    ...Object.entries(contract.operations).map(([operationName, operation]) => ({
      label: `operations.${operationName}.examples`,
      examples: operation.examples
    }))
  ];

  for (const group of exampleGroups) {
    for (const [index, example] of group.examples.entries()) {
      if (!isRecord(example) || !Object.prototype.hasOwnProperty.call(example, "output")) continue;

      const validation = validator.validateAgainstContract(contract, example.output);
      if (!validation.valid) {
        throw new Error(
          `Example output at ${group.label}[${index}] does not validate against contract schema: ${formatValidationErrors(validation.errors)}`
        );
      }
    }
  }
}

export class ContractStore extends EventEmitter {
  readonly contractsDir: string;
  readonly allowInvalidContracts: boolean;
  readonly maxContractFileBytes: number;
  readonly maxSchemaBytes: number;
  readonly maxExamples: number;

  private readonly logger: Logger;
  private contracts = new Map<string, LoadedContract>();
  private watcher?: FSWatcher;
  private reloadTimer?: NodeJS.Timeout;

  constructor(options: ContractLoaderOptions) {
    super();
    this.contractsDir = path.resolve(options.contractsDir);
    this.allowInvalidContracts = options.allowInvalidContracts ?? false;
    this.maxContractFileBytes = options.maxContractFileBytes ?? MAX_CONTRACT_FILE_BYTES;
    this.maxSchemaBytes = options.maxSchemaBytes ?? MAX_SCHEMA_BYTES;
    this.maxExamples = options.maxExamples ?? MAX_EXAMPLES;
    this.logger = options.logger ?? noopLogger;
  }

  async reload(options: ReloadOptions = {}): Promise<LoadedContract[]> {
    const previousSignature = this.contractsSignature();
    const nextContracts = await this.scanContracts();
    this.contracts = nextContracts;

    const currentNames = this.listNames();
    if (options.emitChange ?? true) {
      if (previousSignature !== this.contractsSignature()) {
        this.emit("changed", currentNames);
      }
    }

    return this.listContracts();
  }

  listContracts(): LoadedContract[] {
    return [...this.contracts.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private contractsSignature(): string {
    return JSON.stringify(
      this.listContracts().map((contract) => ({
        name: contract.name,
        description: contract.description ?? "",
        rules: contract.rules,
        schema: contract.schema,
        operations: contract.operations,
        examples: contract.examples
      }))
    );
  }

  listNames(): string[] {
    return this.listContracts().map((contract) => contract.name);
  }

  listSummaries(): ContractSummary[] {
    return this.listContracts().map((contract) => ({
      name: contract.name,
      ...(contract.description ? { description: contract.description } : {}),
      ...this.contractHashes(contract)
    }));
  }

  getContract(name: string): LoadedContract {
    assertSafeContractName(name);
    const contract = this.contracts.get(name);
    if (!contract) {
      throw new Error(`Contract not found: ${name}`);
    }
    return contract;
  }

  hasContract(name: string): boolean {
    assertSafeContractName(name);
    return this.contracts.has(name);
  }

  contractHashes(contract: LoadedContract) {
    return {
      contractHash: sha256Json(this.publicContractBody(contract)),
      schemaHash: sha256Json(contract.schema)
    };
  }

  toPublicContract(contract: LoadedContract): PublicContract {
    return {
      ...this.publicContractBody(contract),
      ...this.contractHashes(contract)
    };
  }

  private publicContractBody(contract: LoadedContract) {
    return {
      name: contract.name,
      ...(contract.description ? { description: contract.description } : {}),
      rules: contract.rules,
      operations: contract.operations,
      schema: contract.schema,
      examples: contract.examples
    };
  }

  startWatching(): void {
    if (this.watcher) return;

    this.watcher = chokidar.watch(this.contractsDir, {
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 25
      }
    });

    const schedule = (): void => this.scheduleReload();
    this.watcher.on("add", schedule);
    this.watcher.on("change", schedule);
    this.watcher.on("unlink", schedule);
  }

  async close(): Promise<void> {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = undefined;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = undefined;
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);

    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = undefined;
      this.reload().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn("Contract reload failed; keeping previous cache", message);
      });
    }, 150);
  }

  private async scanContracts(): Promise<Map<string, LoadedContract>> {
    const failures: ContractLoadFailure[] = [];
    const contracts = new Map<string, LoadedContract>();
    const duplicateNames = new Set<string>();

    let entries: Dirent[];
    try {
      entries = await fs.readdir(this.contractsDir, { withFileTypes: true });
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        this.logger.warn("Contracts directory does not exist; no contracts loaded", this.contractsDir);
        return contracts;
      }
      throw error;
    }

    const jsonFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .sort((a, b) => a.name.localeCompare(b.name));

    const namesByLowercase = new Map<string, string[]>();
    for (const entry of jsonFiles) {
      const contractName = path.basename(entry.name, ".json");
      const lower = contractName.toLowerCase();
      const names = namesByLowercase.get(lower) ?? [];
      names.push(entry.name);
      namesByLowercase.set(lower, names);
    }

    for (const [lowerName, names] of namesByLowercase.entries()) {
      if (names.length > 1) {
        duplicateNames.add(lowerName);
        failures.push({
          file: names.join(", "),
          error: new Error(`Duplicate contract name: ${names.join(", ")}`)
        });
      }
    }

    for (const entry of jsonFiles) {
      const contractName = path.basename(entry.name, ".json");
      if (duplicateNames.has(contractName.toLowerCase())) continue;

      try {
        const loaded = await this.loadContractFile(entry.name, contractName);
        contracts.set(loaded.name, loaded);
      } catch (error) {
        failures.push({
          file: entry.name,
          error: error instanceof Error ? error : new Error(String(error))
        });
      }
    }

    if (failures.length) {
      if (this.allowInvalidContracts) {
        for (const failure of failures) {
          this.logger.warn(`Skipping invalid contract ${failure.file}`, failure.error.message);
        }
      } else {
        const details = failures
          .map((failure) => `${failure.file}: ${failure.error.message}`)
          .join("; ");
        throw new ContractLoadError(`Failed to load JSON contracts: ${details}`, failures);
      }
    }

    return contracts;
  }

  private async loadContractFile(fileName: string, contractName: string): Promise<LoadedContract> {
    assertSafeContractName(contractName);

    const filePath = path.resolve(this.contractsDir, fileName);
    assertInsideDirectory(this.contractsDir, filePath);

    const stat = await fs.stat(filePath);
    if (stat.size > this.maxContractFileBytes) {
      throw new Error(
        `Contract file exceeds size limit (${stat.size} > ${this.maxContractFileBytes} bytes)`
      );
    }

    const raw = await fs.readFile(filePath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON: ${message}`);
    }

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.prototype.hasOwnProperty.call(parsed, "version")
    ) {
      throw new Error("Contract must not include a version field; use Git for versioning");
    }

    const result = ContractFileSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`Invalid contract shape: ${result.error.issues.map((issue) => issue.message).join(", ")}`);
    }

    const rules = result.data.rules ?? [];
    const operations = normalizeOperations(result.data.operations);
    const examples = result.data.examples ?? [];
    const operationExamplesCount = Object.values(operations).reduce(
      (count, operation) => count + operation.examples.length,
      0
    );
    const totalExamples = examples.length + operationExamplesCount;

    if (totalExamples > this.maxExamples) {
      throw new Error(`Contract examples exceed limit (${totalExamples} > ${this.maxExamples})`);
    }

    const schemaSize = safeJsonSize(result.data.schema);
    if (schemaSize > this.maxSchemaBytes) {
      throw new Error(`Contract schema exceeds size limit (${schemaSize} > ${this.maxSchemaBytes} bytes)`);
    }

    validateJsonSchema(result.data.schema);

    const loadedContract: LoadedContract = {
      name: contractName,
      ...(result.data.description ? { description: result.data.description } : {}),
      rules,
      operations,
      schema: result.data.schema as Record<string, unknown>,
      examples,
      sourcePath: filePath
    };

    validateExampleOutputs(loadedContract);
    return loadedContract;
  }
}
