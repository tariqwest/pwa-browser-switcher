import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BrowserAlias, ConvertResult, PwaDescriptor } from "../types.js";
import { detectBrowser } from "../browsers/registry.js";
import { asLiteral, runAppleScript } from "../util/applescript.js";
import { info } from "../util/log.js";
import { userApplications } from "../util/paths.js";
import { sleep } from "../util/sleep.js";
import { extractFromAppBundle } from "../extract/fromAppBundle.js";

export interface InstallOptions {
  dryRun?: boolean;
}

/**
 * Install a Safari (or STP) web app via File → Add to Dock automation.
 * Requires macOS 14+, Accessibility permission for System Events.
 */
export async function installSafari(
  descriptor: PwaDescriptor,
  target: BrowserAlias = "safari",
  opts: InstallOptions = {},
): Promise<ConvertResult> {
  if (target !== "safari" && target !== "stp") {
    return {
      descriptor,
      target,
      status: "failed",
      message: `installSafari called with non-Safari target ${target}`,
    };
  }

  const browser = detectBrowser(target);
  if (!browser?.installed) {
    return {
      descriptor,
      target,
      status: "failed",
      message: `${browser?.displayName ?? target} is not installed`,
    };
  }

  if (!descriptor.startUrl) {
    return {
      descriptor,
      target,
      status: "failed",
      message: "missing startUrl",
    };
  }

  const processName = browser.processName || "Safari";
  const expectedPath = join(userApplications(), `${descriptor.name}.app`);

  if (opts.dryRun) {
    return {
      descriptor,
      target,
      status: "dry-run",
      message: `Would Add to Dock "${descriptor.name}" (${descriptor.startUrl}) via ${browser.displayName}`,
      outputPath: expectedPath,
    };
  }

  // macOS version check (soft)
  try {
    const { execFileSync } = await import("node:child_process");
    const ver = execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim();
    const major = Number(ver.split(".")[0]);
    if (major < 14) {
      return {
        descriptor,
        target,
        status: "failed",
        message: `Safari web apps require macOS 14+ (found ${ver})`,
      };
    }
  } catch {
    /* continue */
  }

  const before = listUserWebApps();

  info(`Installing Safari web app "${descriptor.name}" via Add to Dock…`);

  try {
    runAppleScript(`
      tell application ${asLiteral(processName)}
        activate
        open location ${asLiteral(descriptor.startUrl)}
      end tell
    `);
    await sleep(3000);

    runAppleScript(`
      set appName to ${asLiteral(processName)}
      set webAppName to ${asLiteral(descriptor.name)}
      tell application "System Events"
        tell process appName
          set frontmost to true
          delay 0.5
          -- File → Add to Dock…
          try
            click menu item "Add to Dock…" of menu "File" of menu bar 1
          on error
            try
              click menu item "Add to Dock..." of menu "File" of menu bar 1
            on error
              -- Share menu fallback is harder; rethrow
              error "Could not find File → Add to Dock. Is this macOS Sonoma or later?"
            end try
          end try
          delay 1.0
          -- Name sheet
          try
            set value of text field 1 of sheet 1 of window 1 to webAppName
          end try
          try
            click button "Add" of sheet 1 of window 1
          on error
            try
              click button "Add" of window 1
            end try
          end try
        end tell
      end tell
    `);
  } catch (e) {
    return {
      descriptor,
      target,
      status: "failed",
      message: `Safari Add to Dock automation failed: ${e}. Grant Accessibility to your terminal and try again.`,
    };
  }

  const found = await waitForWebApp(before, descriptor, 40_000);
  if (found) {
    return {
      descriptor,
      target,
      status: "success",
      message: `Created Safari web app "${descriptor.name}"`,
      outputPath: found,
    };
  }

  if (existsSync(expectedPath)) {
    return {
      descriptor,
      target,
      status: "success",
      message: `Created Safari web app at ${expectedPath}`,
      outputPath: expectedPath,
    };
  }

  return {
    descriptor,
    target,
    status: "partial",
    message:
      `Add to Dock flow ran for "${descriptor.name}" but the app was not found in ~/Applications yet. ` +
      `Check the Dock or Launchpad.`,
    outputPath: expectedPath,
  };
}

function listUserWebApps(): Set<string> {
  const set = new Set<string>();
  const root = userApplications();
  try {
    for (const ent of readdirSync(root)) {
      if (!ent.endsWith(".app")) continue;
      const p = join(root, ent);
      const d = extractFromAppBundle(p);
      if (d?.source.family === "webkit") set.add(p);
    }
  } catch {
    /* ignore */
  }
  return set;
}

async function waitForWebApp(
  before: Set<string>,
  desc: PwaDescriptor,
  timeoutMs: number,
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const root = userApplications();
    try {
      for (const ent of readdirSync(root)) {
        if (!ent.endsWith(".app")) continue;
        const p = join(root, ent);
        if (before.has(p)) {
          // same path might be overwrite
          if (ent === `${desc.name}.app`) return p;
          continue;
        }
        const d = extractFromAppBundle(p);
        if (!d) continue;
        if (d.source.family !== "webkit") continue;
        if (d.name === desc.name || d.startUrl === desc.startUrl || ent === `${desc.name}.app`) {
          return p;
        }
      }
    } catch {
      /* ignore */
    }
    await sleep(1000);
  }
  return undefined;
}
