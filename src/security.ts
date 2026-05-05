import path from "node:path";
import type { Logger } from "./types.js";

export const DEFAULT_CONTRACTS_DIR = "./json-contracts";
export const MAX_CONTRACT_FILE_BYTES = 256 * 1024;
export const MAX_SCHEMA_BYTES = 128 * 1024;
export const MAX_EXAMPLES = 50;

export const SAFE_CONTRACT_NAME_PATTERN = String.raw`^(?!.*\.\.)(?!.*[\\/])[A-Za-z0-9][A-Za-z0-9._-]*$`;
const SAFE_CONTRACT_NAME_RE = new RegExp(SAFE_CONTRACT_NAME_PATTERN);

export function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function isSafeContractName(name: string): boolean {
  return SAFE_CONTRACT_NAME_RE.test(name) && !name.includes(path.sep);
}

export function assertSafeContractName(name: string): void {
  if (!isSafeContractName(name)) {
    throw new Error(`Invalid contract name: ${name}`);
  }
}

export function resolveContractsDir(input = DEFAULT_CONTRACTS_DIR): string {
  return path.resolve(process.cwd(), input);
}

export function assertInsideDirectory(parent: string, child: string): void {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  const relative = path.relative(resolvedParent, resolvedChild);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }

  throw new Error(`Path escapes contracts directory: ${child}`);
}

export function parseJsonContractUri(uri: string): string {
  const prefix = "json-contract://";
  if (!uri.startsWith(prefix)) {
    throw new Error(`Invalid resource URI scheme: ${uri}`);
  }

  const name = uri.slice(prefix.length);
  if (name.length === 0 || name.includes("?") || name.includes("#")) {
    throw new Error(`Invalid resource URI: ${uri}`);
  }

  assertSafeContractName(name);
  return name;
}

export function contractResourceUri(name: string): string {
  assertSafeContractName(name);
  return `json-contract://${name}`;
}

export function safeJsonSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function formatMeta(meta: unknown): string {
  if (meta === undefined) return "";
  if (meta instanceof Error) return ` ${meta.message}`;
  if (typeof meta === "string") return ` ${meta}`;

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [unserializable metadata]";
  }
}

export function createLogger(debugEnabled: boolean): Logger {
  const write = (level: string, message: string, meta?: unknown): void => {
    const line = `[prompt-to-json] ${level}: ${message}${formatMeta(meta)}\n`;
    process.stderr.write(line);
  };

  return {
    debug(message, meta) {
      if (debugEnabled) write("debug", message, meta);
    },
    info(message, meta) {
      if (debugEnabled) write("info", message, meta);
    },
    warn(message, meta) {
      write("warn", message, meta);
    },
    error(message, meta) {
      write("error", message, meta);
    }
  };
}
