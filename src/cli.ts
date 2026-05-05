import { ContractLoadError, ContractStore } from "./contract-loader.js";
import { lintContracts } from "./contract-linter.js";
import { createLogger, parseBooleanEnv, resolveContractsDir } from "./security.js";

type ParsedCliArgs = {
  command: "validate" | "lint" | "help";
  contractsDir?: string;
  strict: boolean;
  json: boolean;
};

function usage(): string {
  return [
    "prompt-to-json",
    "",
    "Usage:",
    "  prompt-to-json                 Start the stdio MCP server",
    "  prompt-to-json validate        Validate all contracts for CI",
    "  prompt-to-json lint            Validate and print advisory contract warnings",
    "  prompt-to-json lint --strict   Exit nonzero when lint warnings are found",
    "",
    "Options:",
    "  --contracts <dir>, -c <dir>    Contracts directory (default: PROMPT_TO_JSON_CONTRACTS_DIR or ./json-contracts)",
    "  --json                         Print machine-readable JSON for validate/lint",
    "  --help, -h                     Show this help"
  ].join("\n");
}

function parseArgs(args: string[]): ParsedCliArgs {
  const [commandArg, ...rest] = args;
  const command = commandArg === "validate" || commandArg === "lint" ? commandArg : "help";
  if (commandArg === "--help" || commandArg === "-h" || commandArg === "help") {
    return { command: "help", strict: false, json: false };
  }

  if (command === "help") {
    throw new Error(`Unknown command: ${commandArg ?? ""}`.trim());
  }

  const parsed: ParsedCliArgs = {
    command,
    strict: false,
    json: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    switch (arg) {
      case "--contracts":
      case "-c": {
        const value = rest[index + 1];
        if (!value) throw new Error(`${arg} requires a directory path`);
        parsed.contractsDir = value;
        index += 1;
        break;
      }
      case "--strict": {
        parsed.strict = true;
        break;
      }
      case "--json": {
        parsed.json = true;
        break;
      }
      case "--help":
      case "-h": {
        return { command: "help", strict: false, json: false };
      }
      default: {
        throw new Error(`Unknown option: ${arg}`);
      }
    }
  }

  return parsed;
}

function writeStdout(text: string): void {
  process.stdout.write(`${text}\n`);
}

function writeStderr(text: string): void {
  process.stderr.write(`${text}\n`);
}

function formatLoadError(error: unknown): string[] {
  if (error instanceof ContractLoadError) {
    return [
      error.message,
      ...error.failures.map((failure) => `- ${failure.file}: ${failure.error.message}`)
    ];
  }

  return [error instanceof Error ? error.message : String(error)];
}

async function loadContracts(contractsDir: string, debug: boolean) {
  const store = new ContractStore({
    contractsDir,
    allowInvalidContracts: false,
    logger: createLogger(debug)
  });
  const contracts = await store.reload({ emitChange: false });
  return { store, contracts };
}

export async function runCli(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  let parsed: ParsedCliArgs;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    writeStderr(error instanceof Error ? error.message : String(error));
    writeStderr(usage());
    return 2;
  }

  if (parsed.command === "help") {
    writeStdout(usage());
    return 0;
  }

  const debug = parseBooleanEnv(env.DEBUG, false);
  const contractsDir = resolveContractsDir(parsed.contractsDir ?? env.PROMPT_TO_JSON_CONTRACTS_DIR ?? "./json-contracts");

  try {
    const { store, contracts } = await loadContracts(contractsDir, debug);
    try {
      if (parsed.command === "validate") {
        if (parsed.json) {
          writeStdout(JSON.stringify({ valid: true, contractsDir, loaded: contracts.length, contracts: store.listSummaries() }, null, 2));
        } else {
          writeStdout(`Validated ${contracts.length} contract(s) in ${contractsDir}.`);
          for (const contract of store.listSummaries()) {
            writeStdout(`- ${contract.name} ${contract.contractHash}`);
          }
        }
        return 0;
      }

      const warnings = lintContracts(contracts);
      const ok = !parsed.strict || warnings.length === 0;
      if (parsed.json) {
        writeStdout(
          JSON.stringify(
            {
              valid: true,
              ok,
              strict: parsed.strict,
              contractsDir,
              loaded: contracts.length,
              warnings
            },
            null,
            2
          )
        );
      } else {
        writeStdout(`Linted ${contracts.length} contract(s) in ${contractsDir}.`);
        if (warnings.length === 0) {
          writeStdout("No lint warnings.");
        } else {
          writeStdout(`${warnings.length} warning(s):`);
          for (const warning of warnings) {
            writeStdout(`- ${warning.contract} ${warning.path}: ${warning.message}`);
          }
        }
      }
      return ok ? 0 : 1;
    } finally {
      await store.close();
    }
  } catch (error) {
    const details = formatLoadError(error);
    if (parsed.json) {
      writeStdout(JSON.stringify({ valid: false, contractsDir, errors: details }, null, 2));
    } else {
      writeStderr("Contract validation failed:");
      for (const detail of details) writeStderr(detail);
    }
    return 1;
  }
}
