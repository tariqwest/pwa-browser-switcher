import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { BrowserAlias, PwaDescriptor, ScanOptions } from "../types.js";
import { detectBrowser, detectBrowsers } from "../browsers/registry.js";
import {
  collectAppPaths,
  extractFromAppBundle,
} from "../extract/fromAppBundle.js";
import { userApplications } from "../util/paths.js";
import { warn } from "../util/log.js";

/**
 * Scan known PWA locations and/or explicit paths for installable descriptors.
 */
export function scanPwas(options: ScanOptions = {}): PwaDescriptor[] {
  const seen = new Set<string>();
  const results: PwaDescriptor[] = [];

  const add = (appPath: string) => {
    const resolved = appPath;
    if (seen.has(resolved)) return;
    seen.add(resolved);
    const desc = extractFromAppBundle(resolved);
    if (desc) {
      if (options.browser && desc.source.browserAlias && desc.source.browserAlias !== options.browser) {
        // Allow filter by source browser when known
        if (desc.source.browserAlias !== options.browser) return;
      }
      results.push(desc);
    }
  };

  if (options.paths?.length) {
    for (const p of options.paths) {
      for (const app of collectAppPaths(p)) add(app);
    }
    return results;
  }

  // Known Chromium / Orion / generic dirs from registry
  for (const b of detectBrowsers()) {
    if (options.browser && b.alias !== options.browser) continue;
    for (const dir of b.pwaAppDirs) {
      for (const app of collectAppPaths(dir)) add(app);
    }
  }

  // Also pick up any *Apps.localized under ~/Applications not covered above
  scanChromiumStyleDirs(userApplications(), add, options.browser);

  // Safari web apps live flat in ~/Applications
  if (!options.browser || options.browser === "safari" || options.browser === "stp") {
    scanSafariStyleApps(userApplications(), add);
  }

  // Orion path even if not in registry dirs
  if (!options.browser || options.browser === "orion") {
    const orionDir = join(userApplications(), "Orion", "WebApps");
    if (existsSync(orionDir)) {
      for (const app of collectAppPaths(orionDir)) add(app);
    }
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

function scanChromiumStyleDirs(
  root: string,
  add: (p: string) => void,
  filter?: BrowserAlias,
): void {
  if (!existsSync(root)) return;
  let ents: string[];
  try {
    ents = readdirSync(root);
  } catch {
    return;
  }
  for (const ent of ents) {
    if (!/apps/i.test(ent)) continue;
    const p = join(root, ent);
    try {
      if (!statSync(p).isDirectory()) continue;
    } catch {
      continue;
    }
    // If filtering by browser, only scan that browser's dirs
    if (filter) {
      const def = detectBrowser(filter);
      if (def && !def.pwaAppDirs.includes(p) && !def.pwaAppDirNames?.some((n) => p.endsWith(n))) {
        // still allow if alias matches folder name loosely
        if (!p.toLowerCase().includes(filter)) continue;
      }
    }
    for (const app of collectAppPaths(p)) add(app);
  }
}

function scanSafariStyleApps(root: string, add: (p: string) => void): void {
  if (!existsSync(root)) return;
  let ents: string[];
  try {
    ents = readdirSync(root);
  } catch (e) {
    warn(`cannot read ${root}: ${e}`);
    return;
  }
  for (const ent of ents) {
    if (!ent.endsWith(".app")) continue;
    const p = join(root, ent);
    const desc = extractFromAppBundle(p);
    if (desc?.source.family === "webkit" && desc.source.browserAlias !== "orion") {
      add(p);
    }
  }
}
