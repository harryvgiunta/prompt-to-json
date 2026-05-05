#!/usr/bin/env node
import { runCli } from "./cli.js";
import { optionsFromEnvironment, startStdioMcpServer } from "./mcp-server.js";
import { createLogger, parseBooleanEnv } from "./security.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 0 && args[0] !== "serve") {
    process.exitCode = await runCli(args, process.env);
    return;
  }

  const debug = parseBooleanEnv(process.env.DEBUG, false);
  const logger = createLogger(debug);
  const transport = process.env.MCP_TRANSPORT ?? "stdio";

  if (transport !== "stdio") {
    logger.error(`Unsupported MCP_TRANSPORT: ${transport}. Only stdio is implemented in v1.`);
    process.exitCode = 1;
    return;
  }

  const options = optionsFromEnvironment(process.env);
  await startStdioMcpServer(options);
}

main().catch((error: unknown) => {
  const logger = createLogger(parseBooleanEnv(process.env.DEBUG, false));
  logger.error("Fatal startup error", error);
  process.exit(1);
});
