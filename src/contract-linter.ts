import type { LoadedContract } from "./types.js";

type JsonSchemaRecord = Record<string, unknown>;

export type ContractLintWarning = {
  contract: string;
  path: string;
  message: string;
};

function isRecord(value: unknown): value is JsonSchemaRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addWarning(warnings: ContractLintWarning[], contract: string, path: string, message: string): void {
  warnings.push({ contract, path, message });
}

function childPath(parent: string, key: string): string {
  if (parent === "$") return `$.${key}`;
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) return `${parent}.${key}`;
  return `${parent}[${JSON.stringify(key)}]`;
}

function walkSchema(
  schema: unknown,
  contractName: string,
  path: string,
  warnings: ContractLintWarning[],
  seen: WeakSet<object>
): void {
  if (!isRecord(schema)) return;
  if (seen.has(schema)) return;
  seen.add(schema);

  if (Object.keys(schema).length === 0) {
    addWarning(warnings, contractName, path, "Schema object is empty and accepts any JSON value.");
    return;
  }

  const hasObjectShape = schema.type === "object" || isRecord(schema.properties);
  if (hasObjectShape) {
    if (schema.additionalProperties === true) {
      addWarning(warnings, contractName, path, "Object schema uses additionalProperties:true; prefer explicit fields when possible.");
    } else if (schema.additionalProperties !== false) {
      addWarning(warnings, contractName, path, "Object schema does not set additionalProperties:false.");
    }
  }

  const properties = schema.properties;
  if (isRecord(properties)) {
    for (const [name, propertySchema] of Object.entries(properties)) {
      walkSchema(propertySchema, contractName, childPath(childPath(path, "properties"), name), warnings, seen);
    }
  }

  for (const key of ["items", "additionalProperties", "additionalItems", "contains", "not", "if", "then", "else"] as const) {
    const value = schema[key];
    if (isRecord(value)) walkSchema(value, contractName, childPath(path, key), warnings, seen);
    if (Array.isArray(value)) {
      value.forEach((item, index) => walkSchema(item, contractName, `${childPath(path, key)}[${index}]`, warnings, seen));
    }
  }

  for (const key of ["prefixItems", "allOf", "anyOf", "oneOf"] as const) {
    const value = schema[key];
    if (!Array.isArray(value)) continue;
    value.forEach((item, index) => walkSchema(item, contractName, `${childPath(path, key)}[${index}]`, warnings, seen));
  }

  for (const key of ["$defs", "definitions", "dependentSchemas", "patternProperties"] as const) {
    const value = schema[key];
    if (!isRecord(value)) continue;
    for (const [name, nestedSchema] of Object.entries(value)) {
      walkSchema(nestedSchema, contractName, childPath(childPath(path, key), name), warnings, seen);
    }
  }
}

function exampleCount(contract: LoadedContract): number {
  const operationExamples = Object.values(contract.operations).reduce(
    (count, operation) => count + operation.examples.length,
    0
  );
  return contract.examples.length + operationExamples;
}

export function lintContracts(contracts: LoadedContract[]): ContractLintWarning[] {
  const warnings: ContractLintWarning[] = [];

  for (const contract of contracts) {
    if (exampleCount(contract) === 0) {
      addWarning(warnings, contract.name, "examples", "Contract has no examples.");
    }

    walkSchema(contract.schema, contract.name, "$.schema", warnings, new WeakSet<object>());
  }

  return warnings;
}
