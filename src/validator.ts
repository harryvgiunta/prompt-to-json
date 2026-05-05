import type { ErrorObject, ValidateFunction } from "ajv";
import { Ajv as AjvDraft7 } from "ajv/dist/ajv.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { FormattedValidationError, LoadedContract, ValidationResult } from "./types.js";

type SupportedJsonSchemaDialect = "draft-07" | "2020-12";

type AjvLike = {
  errors: ErrorObject[] | null | undefined;
  validateSchema(schema: unknown): boolean;
  errorsText(errors?: ErrorObject[] | null): string;
  compile(schema: unknown): ValidateFunction;
};

const AJV_OPTIONS = {
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
  addUsedSchema: false
} as const;

function addJsonFormats<T>(ajv: T): T {
  (addFormats as unknown as (ajvInstance: T) => void)(ajv);
  return ajv;
}

function createDraft7Ajv(): AjvLike {
  return addJsonFormats(new AjvDraft7(AJV_OPTIONS)) as unknown as AjvLike;
}

function createDraft2020Ajv(): AjvLike {
  return addJsonFormats(new Ajv2020(AJV_OPTIONS)) as unknown as AjvLike;
}

function jsonSchemaDialect(schema: unknown): SupportedJsonSchemaDialect {
  const schemaObject = asRecord(schema);
  const schemaId = schemaObject?.$schema;

  if (schemaId === undefined) return "2020-12";
  if (typeof schemaId !== "string") {
    throw new Error("Invalid JSON Schema: $schema must be a string when present");
  }

  const normalized = schemaId.toLowerCase();
  if (normalized.includes("draft-07")) return "draft-07";
  if (normalized.includes("2020-12")) return "2020-12";

  throw new Error(
    `Unsupported JSON Schema dialect: ${schemaId}. Supported dialects are draft-07 and 2020-12.`
  );
}

function createAjvForSchema(schema: unknown): AjvLike {
  const ajv = jsonSchemaDialect(schema) === "draft-07" ? createDraft7Ajv() : createDraft2020Ajv();
  return ajv as unknown as AjvLike;
}

export function validateJsonSchema(schema: unknown): void {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("Contract schema must be a JSON Schema object");
  }

  const ajv = createAjvForSchema(schema);
  const schemaIsValid = ajv.validateSchema(schema);
  if (!schemaIsValid) {
    throw new Error(`Invalid JSON Schema: ${ajv.errorsText(ajv.errors)}`);
  }

  try {
    ajv.compile(schema);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON Schema: ${message}`);
  }
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function joinJsonPointer(base: string, child: string): string {
  const escaped = escapeJsonPointerSegment(child);
  if (!base || base === "/") return `/${escaped}`;
  return `${base}/${escaped}`;
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined): FormattedValidationError[] {
  return (errors ?? []).map((error) => {
    let path = error.instancePath ?? "";

    if (error.keyword === "required" && typeof error.params?.missingProperty === "string") {
      path = joinJsonPointer(path, error.params.missingProperty);
    }

    if (
      error.keyword === "additionalProperties" &&
      typeof error.params?.additionalProperty === "string"
    ) {
      path = joinJsonPointer(path, error.params.additionalProperty);
    }

    return {
      path,
      message: error.message ?? "validation failed",
      keyword: error.keyword
    };
  });
}

function validationErrorKey(error: FormattedValidationError): string {
  return `${error.keyword}:${error.path}:${error.message}`;
}

function mergeValidationErrors(
  primary: FormattedValidationError[],
  secondary: FormattedValidationError[]
): FormattedValidationError[] {
  const seen = new Set<string>();
  const merged: FormattedValidationError[] = [];

  for (const error of [...primary, ...secondary]) {
    const key = validationErrorKey(error);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(error);
    }
  }

  return merged;
}

function pointerSegments(path: string): string[] {
  if (!path) return [];
  return path
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean)
    .map(unescapeJsonPointerSegment);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function getByJsonPointer(root: unknown, pointer: string): unknown {
  if (pointer === "#" || pointer === "#/" || pointer === "") return root;
  if (!pointer.startsWith("#/")) return undefined;

  let current: unknown = root;
  for (const segment of pointer
    .slice(2)
    .split("/")
    .map(unescapeJsonPointerSegment)) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      current = Number.isInteger(index) ? current[index] : undefined;
      continue;
    }

    const currentRecord = asRecord(current);
    if (!currentRecord || !Object.prototype.hasOwnProperty.call(currentRecord, segment)) {
      return undefined;
    }
    current = currentRecord[segment];
  }

  return current;
}

function compositionSchemas(schema: Record<string, unknown>): unknown[] {
  const branches: unknown[] = [];
  for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
    const value = schema[keyword];
    if (Array.isArray(value)) branches.push(...value);
  }
  return branches;
}

function numericIndex(segment: string): number | undefined {
  if (!/^\d+$/.test(segment)) return undefined;
  const index = Number(segment);
  return Number.isSafeInteger(index) ? index : undefined;
}

function arrayItemSchemas(schema: Record<string, unknown>, segment: string): unknown[] {
  const schemas: unknown[] = [];
  const index = numericIndex(segment);

  if (Array.isArray(schema.prefixItems) && index !== undefined && index < schema.prefixItems.length) {
    schemas.push(schema.prefixItems[index]);
  }

  if (Array.isArray(schema.items) && index !== undefined && index < schema.items.length) {
    schemas.push(schema.items[index]);
  } else if (schema.items !== undefined && typeof schema.items !== "boolean") {
    schemas.push(schema.items);
  }

  if (schemas.length === 0 && schema.additionalItems !== undefined && typeof schema.additionalItems !== "boolean") {
    schemas.push(schema.additionalItems);
  }

  return schemas;
}

function childSchemasForSegment(schema: Record<string, unknown>, segment: string): unknown[] {
  const schemas: unknown[] = [];
  const properties = asRecord(schema.properties);

  if (properties && Object.prototype.hasOwnProperty.call(properties, segment)) {
    schemas.push(properties[segment]);
  } else if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
    schemas.push(schema.additionalProperties);
  }

  schemas.push(...arrayItemSchemas(schema, segment));
  return schemas;
}

function collectSchemaCandidatesAtPath(
  root: unknown,
  schema: unknown,
  segments: string[],
  seenRefs = new Set<string>(),
  depth = 0
): Record<string, unknown>[] {
  if (depth > 64) return [];

  const schemaRecord = asRecord(schema);
  if (!schemaRecord) return [];

  const directCandidates: Record<string, unknown>[] = [schemaRecord];
  const ref = schemaRecord.$ref;
  if (typeof ref === "string" && ref.startsWith("#") && !seenRefs.has(ref)) {
    const nextSeenRefs = new Set(seenRefs);
    nextSeenRefs.add(ref);
    directCandidates.push(...collectSchemaCandidatesAtPath(root, getByJsonPointer(root, ref), [], nextSeenRefs, depth + 1));
  }

  if (segments.length === 0) {
    const terminalCandidates = [...directCandidates];
    for (const branch of compositionSchemas(schemaRecord)) {
      terminalCandidates.push(...collectSchemaCandidatesAtPath(root, branch, [], seenRefs, depth + 1));
    }
    return terminalCandidates;
  }

  const [segment, ...remaining] = segments;
  const childCandidates: Record<string, unknown>[] = [];
  for (const candidate of directCandidates) {
    for (const childSchema of childSchemasForSegment(candidate, segment)) {
      childCandidates.push(...collectSchemaCandidatesAtPath(root, childSchema, remaining, seenRefs, depth + 1));
    }
  }

  for (const branch of compositionSchemas(schemaRecord)) {
    childCandidates.push(...collectSchemaCandidatesAtPath(root, branch, segments, seenRefs, depth + 1));
  }

  return childCandidates;
}

function schemaCandidatesAtDataPath(schema: unknown, dataPath: string): Record<string, unknown>[] {
  const candidates = collectSchemaCandidatesAtPath(schema, schema, pointerSegments(dataPath));
  const seen = new Set<Record<string, unknown>>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

function enumValuesForPath(contract: LoadedContract, path: string): unknown[] | undefined {
  const enumValues: unknown[] = [];
  const seen = new Set<string>();

  for (const schemaAtPath of schemaCandidatesAtDataPath(contract.schema, path)) {
    if (!Array.isArray(schemaAtPath.enum)) continue;
    for (const value of schemaAtPath.enum) {
      const key = JSON.stringify(value);
      if (!seen.has(key)) {
        seen.add(key);
        enumValues.push(value);
      }
    }
  }

  return enumValues.length ? enumValues : undefined;
}

function typeForPath(contract: LoadedContract, path: string): string | undefined {
  const types: string[] = [];
  const seen = new Set<string>();

  for (const schemaAtPath of schemaCandidatesAtDataPath(contract.schema, path)) {
    const type = schemaAtPath.type;
    const typeValues = Array.isArray(type) ? type : [type];
    for (const value of typeValues) {
      if (typeof value === "string" && !seen.has(value)) {
        seen.add(value);
        types.push(value);
      }
    }
  }

  return types.length ? types.join(" or ") : undefined;
}

function formatList(values: unknown[]): string {
  return values.map((value) => String(value)).join(", ");
}

export class JsonValidator {
  private readonly draft7Ajv = createDraft7Ajv();
  private readonly draft2020Ajv = createDraft2020Ajv();
  private readonly compiledSchemas = new WeakMap<object, ValidateFunction>();

  validateSchema(schema: unknown): void {
    validateJsonSchema(schema);
  }

  validateAgainstContract(contract: LoadedContract, json: unknown): ValidationResult {
    const validate = this.compileContractSchema(contract);
    const valid = validate(json);

    if (valid) {
      return {
        valid: true,
        contract: contract.name,
        json,
        errors: []
      };
    }

    return {
      valid: false,
      contract: contract.name,
      errors: formatAjvErrors(validate.errors)
    };
  }

  buildRepairInstructions(
    contract: LoadedContract,
    json: unknown,
    providedErrors: FormattedValidationError[] = []
  ): string[] {
    const validationResult = this.validateAgainstContract(contract, json);
    const actualErrors = validationResult.valid ? [] : validationResult.errors;
    const errors = mergeValidationErrors(providedErrors, actualErrors);
    const instructions: string[] = [];
    const seen = new Set<string>();

    const add = (instruction: string): void => {
      if (!seen.has(instruction)) {
        seen.add(instruction);
        instructions.push(instruction);
      }
    };

    for (const error of errors) {
      const path = error.path || "the JSON value";

      switch (error.keyword) {
        case "enum": {
          const enumValues = enumValuesForPath(contract, error.path);
          if (enumValues?.length) {
            add(`Set ${path} to one of: ${formatList(enumValues)}.`);
          } else {
            add(`Set ${path} to an allowed enum value.`);
          }
          break;
        }
        case "required": {
          add(`Add missing required field ${error.path}.`);
          break;
        }
        case "additionalProperties": {
          add(`Remove extra field ${error.path}.`);
          break;
        }
        case "type": {
          const expectedType = typeForPath(contract, error.path);
          if (expectedType) {
            add(`Set ${path} to a valid ${expectedType} value.`);
          } else {
            add(`Set ${path} to the required type.`);
          }
          break;
        }
        case "maxLength": {
          add(`Shorten ${path} to satisfy the maximum length.`);
          break;
        }
        case "minLength": {
          add(`Lengthen ${path} to satisfy the minimum length.`);
          break;
        }
        case "minimum":
        case "exclusiveMinimum": {
          add(`Increase ${path} to satisfy the minimum value.`);
          break;
        }
        case "maximum":
        case "exclusiveMaximum": {
          add(`Decrease ${path} to satisfy the maximum value.`);
          break;
        }
        case "pattern": {
          add(`Set ${path} to match the required pattern.`);
          break;
        }
        default: {
          add(`Fix ${path}: ${error.message}.`);
        }
      }
    }

    add("Return JSON only.");
    return instructions;
  }

  private compileContractSchema(contract: LoadedContract): ValidateFunction {
    const schemaObject = contract.schema as object;
    const cached = this.compiledSchemas.get(schemaObject);
    if (cached) return cached;

    validateJsonSchema(contract.schema);
    const compiled = this.ajvForSchema(contract.schema).compile(contract.schema);
    this.compiledSchemas.set(schemaObject, compiled);
    return compiled;
  }

  private ajvForSchema(schema: unknown): AjvLike {
    return jsonSchemaDialect(schema) === "draft-07" ? this.draft7Ajv : this.draft2020Ajv;
  }
}
