import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";
import type { FormattedValidationError, LoadedContract, ValidationResult } from "./types.js";

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    addUsedSchema: false
  });
  (addFormats as unknown as (ajvInstance: Ajv2020) => void)(ajv);
  return ajv;
}

export function validateJsonSchema(schema: unknown): void {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
    throw new Error("Contract schema must be a JSON Schema object");
  }

  const ajv = createAjv();
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

function getSchemaAtDataPath(schema: unknown, dataPath: string): Record<string, unknown> | undefined {
  let current: unknown = schema;

  for (const segment of pointerSegments(dataPath)) {
    const currentRecord = asRecord(current);
    if (!currentRecord) return undefined;

    const properties = asRecord(currentRecord.properties);
    if (properties && Object.prototype.hasOwnProperty.call(properties, segment)) {
      current = properties[segment];
      continue;
    }

    if (currentRecord.items !== undefined) {
      current = currentRecord.items;
      continue;
    }

    return undefined;
  }

  return asRecord(current);
}

function enumValuesForPath(contract: LoadedContract, path: string): unknown[] | undefined {
  const schemaAtPath = getSchemaAtDataPath(contract.schema, path);
  const enumValues = schemaAtPath?.enum;
  return Array.isArray(enumValues) ? enumValues : undefined;
}

function typeForPath(contract: LoadedContract, path: string): string | undefined {
  const schemaAtPath = getSchemaAtDataPath(contract.schema, path);
  const type = schemaAtPath?.type;
  if (Array.isArray(type)) return type.join(" or ");
  if (typeof type === "string") return type;
  return undefined;
}

function formatList(values: unknown[]): string {
  return values.map((value) => String(value)).join(", ");
}

export class JsonValidator {
  private readonly ajv = createAjv();
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
    const compiled = this.ajv.compile(contract.schema);
    this.compiledSchemas.set(schemaObject, compiled);
    return compiled;
  }
}
