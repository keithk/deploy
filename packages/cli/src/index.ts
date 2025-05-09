#!/usr/bin/env bun
// packages/cli/src/index.ts

import { resolve } from "path";
import { Command } from "commander";
import { registerCommands } from "./commands";
import { debug, info, LogLevel, setLogLevel } from "@keithk/deploy-core";

// Resolve the sites directory relative to the project root, not the CLI package
const ROOT_DIR = process.env.ROOT_DIR || resolve(__dirname, "../../../sites");
const DEFAULT_PORT = 3000;

// --- Commander CLI Setup ---
const program = new Command();

program
  .name("DailUpDeploy")
  .description("Dail Up Deploy - Command Line Tool")
  .version("0.1.0");

// Register all commands
registerCommands(program);

// Global options
program
  .option(
    "-p, --port <port>",
    "Set the server port",
    process.env.PORT || "3000"
  )
  .option(
    "-r, --root <dir>",
    "Set the root sites directory",
    process.env.ROOT_DIR || "./sites"
  )
  .option(
    "-l, --log-level <level>",
    "Set logging level (0=none, 1=error, 2=warn, 3=info, 4=debug)",
    process.env.LOG_LEVEL || "2"
  );

// Parse command line arguments
program.parse(process.argv);

// Set environment variables from options
const opts = program.opts();
if (opts.port) process.env.PORT = opts.port;
if (opts.root) process.env.ROOT_DIR = opts.root;

// Set log level if provided
const logLevelOpt = opts["log-level"];
if (logLevelOpt) {
  const logLevel = parseInt(logLevelOpt);
  if (!isNaN(logLevel) && logLevel >= 0 && logLevel <= 4) {
    setLogLevel(logLevel as LogLevel);
    process.env.LOG_LEVEL = logLevelOpt;
  }
}

// If this file is run directly, execute the CLI
if (import.meta.main) {
  debug(`CLI started with ROOT_DIR: ${process.env.ROOT_DIR}`);
}
