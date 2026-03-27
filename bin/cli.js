#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = {
  debug: {
    description: "Run the iroh debug server",
    script: resolve(__dirname, "..", "examples", "debug", "server.ts"),
  },
  echo: {
    description: "Run the iroh echo server",
    script: resolve(__dirname, "..", "examples", "echo-server", "server.ts"),
  },
};

function printUsage() {
  console.log("\niroh — CLI for iroh-ts examples\n");
  console.log("Usage: iroh <command> [options]\n");
  console.log("Commands:");
  for (const [name, cmd] of Object.entries(commands)) {
    console.log(`  ${name.padEnd(12)} ${cmd.description}`);
  }
  console.log("\nExamples:");
  console.log("  npx @salvatoret/iroh debug");
  console.log("  npx @salvatoret/iroh debug --mode connect <endpoint-id>");
  console.log("  npx @salvatoret/iroh echo");
  console.log();
}

const [command, ...rest] = process.argv.slice(2);

if (!command || command === "--help" || command === "-h") {
  printUsage();
  process.exit(0);
}

const cmd = commands[command];
if (!cmd) {
  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

// Use tsx to run the TypeScript server files
const child = spawn("npx", ["tsx", cmd.script, ...rest], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
