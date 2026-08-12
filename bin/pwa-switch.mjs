#!/usr/bin/env node
/**
 * Node entrypoint for the published package.
 * Runs TypeScript sources via tsx — no tsc emit / dist/ required.
 *
 *   pwa-switch <command>
 *   node bin/pwa-switch.mjs <command>
 *
 * Equivalent low-level form (from package root):
 *   node --import tsx src/cli.ts <command>
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const cliPath = join(root, "src", "cli.ts");

if (!existsSync(cliPath)) {
  console.error(`pwa-switch: missing CLI source at ${cliPath}`);
  process.exit(1);
}

// Resolve tsx from *this package's* node_modules (works for global/npx installs
// even when cwd is elsewhere — bare `--import tsx` would only search cwd).
const require = createRequire(import.meta.url);
let tsxLoader;
try {
  tsxLoader = require.resolve("tsx");
} catch {
  console.error(
    "pwa-switch: cannot resolve dependency `tsx`. Run npm/bun install in the package.",
  );
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [
    "--import",
    pathToFileURL(tsxLoader).href,
    cliPath,
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("error", (err) => {
  console.error(`pwa-switch: failed to start Node/tsx: ${err.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
