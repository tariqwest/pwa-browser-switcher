import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ConvertResult, PwaDescriptor } from "../types.js";
import { detectBrowser } from "../browsers/registry.js";
import { asLiteral, runAppleScript } from "../util/applescript.js";
import { info } from "../util/log.js";
import { userApplications } from "../util/paths.js";
import { sleep } from "../util/sleep.js";

export interface InstallOptions {
  dryRun?: boolean;
}

/**
 * Install an Orion web app via Tools → Install This Site as an App.
 */
export async function installOrion(
  descriptor: PwaDescriptor,
  opts: InstallOptions = {},
): Promise<ConvertResult> {
  const target = "orion" as const;
  const browser = detectBrowser("orion");
  if (!browser?.installed) {
    return {
      descriptor,
      target,
      status: "failed",
      message: "Orion is not installed",
    };
  }
  if (!descriptor.startUrl) {
    return { descriptor, target, status: "failed", message: "missing startUrl" };
  }

  const webAppsDir = join(userApplications(), "Orion", "WebApps");
  const expected = join(webAppsDir, `${descriptor.name}.app`);

  if (opts.dryRun) {
    return {
      descriptor,
      target,
      status: "dry-run",
      message: `Would install Orion web app "${descriptor.name}" (${descriptor.startUrl})`,
      outputPath: expected,
    };
  }

  const before = listOrionApps(webAppsDir);
  info(`Installing Orion web app "${descriptor.name}"…`);

  try {
    runAppleScript(`
      tell application "Orion"
        activate
        open location ${asLiteral(descriptor.startUrl)}
      end tell
    `);
    await sleep(3000);

    runAppleScript(`
      set webAppName to ${asLiteral(descriptor.name)}
      tell application "System Events"
        tell process "Orion"
          set frontmost to true
          delay 0.5
          -- Tools → Install This Site as an App
          try
            click menu item "Install This Site as an App" of menu "Tools" of menu bar 1
          on error
            try
              click menu item "Install This Site as an App…" of menu "Tools" of menu bar 1
            on error
              error "Could not find Tools → Install This Site as an App"
            end try
          end try
          delay 1.0
          -- Confirm dialog if present
          try
            set value of text field 1 of window 1 to webAppName
          end try
          try
            click button "Install" of window 1
          end try
          try
            click button "Add" of window 1
          end try
          try
            click button "OK" of window 1
          end try
        end tell
      end tell
    `);
  } catch (e) {
    return {
      descriptor,
      target,
      status: "failed",
      message: `Orion install automation failed: ${e}. Grant Accessibility permission and try again.`,
    };
  }

  const found = await waitForOrionApp(webAppsDir, before, descriptor.name, 40_000);
  if (found) {
    return {
      descriptor,
      target,
      status: "success",
      message: `Installed Orion web app "${descriptor.name}"`,
      outputPath: found,
    };
  }
  if (existsSync(expected)) {
    return {
      descriptor,
      target,
      status: "success",
      message: `Installed Orion web app at ${expected}`,
      outputPath: expected,
    };
  }
  return {
    descriptor,
    target,
    status: "partial",
    message: `Orion install UI ran; check ${webAppsDir}`,
    outputPath: expected,
  };
}

function listOrionApps(dir: string): Set<string> {
  const set = new Set<string>();
  if (!existsSync(dir)) return set;
  try {
    for (const ent of readdirSync(dir)) {
      if (ent.endsWith(".app")) set.add(join(dir, ent));
    }
  } catch {
    /* ignore */
  }
  return set;
}

async function waitForOrionApp(
  dir: string,
  before: Set<string>,
  name: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(dir)) {
      try {
        for (const ent of readdirSync(dir)) {
          if (!ent.endsWith(".app")) continue;
          const p = join(dir, ent);
          if (!before.has(p) || ent === `${name}.app`) {
            if (ent === `${name}.app` || !before.has(p)) return p;
          }
        }
      } catch {
        /* ignore */
      }
    }
    await sleep(1000);
  }
  return undefined;
}
