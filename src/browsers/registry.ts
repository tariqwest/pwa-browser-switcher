import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  BrowserAlias,
  BrowserDefinition,
  BrowserFamily,
  DetectedBrowser,
} from "../types.js";
import { applicationSupport, systemApplications, userApplications } from "../util/paths.js";
import { readAppInfoPlist, str } from "../util/plist.js";

/**
 * First-class + Tier B browser definitions for macOS.
 * Bundle IDs verified where possible on the authoring machine.
 */
export const BROWSER_DEFINITIONS: BrowserDefinition[] = [
  // WebKit
  {
    alias: "safari",
    displayName: "Safari",
    family: "webkit",
    tier: "A",
    bundleId: "com.apple.Safari",
    appNames: ["Safari.app"],
    processName: "Safari",
    notes: "Web apps via File → Add to Dock (macOS 14+); apps in ~/Applications",
  },
  {
    alias: "stp",
    displayName: "Safari Technology Preview",
    family: "webkit",
    tier: "A'",
    bundleId: "com.apple.SafariTechnologyPreview",
    appNames: ["Safari Technology Preview.app"],
    processName: "Safari Technology Preview",
    notes: "Same Add to Dock flow as Safari when used as host",
  },
  {
    alias: "orion",
    displayName: "Orion",
    family: "webkit",
    tier: "A",
    bundleId: "com.kagi.kagimacOS",
    appNames: ["Orion.app"],
    pwaAppDirNames: ["Orion/WebApps"],
    processName: "Orion",
    notes: "Tools → Install This Site as an App → ~/Applications/Orion/WebApps",
  },
  // Chromium
  {
    alias: "chrome",
    displayName: "Google Chrome",
    family: "chromium",
    tier: "A",
    bundleId: "com.google.Chrome",
    appNames: ["Google Chrome.app"],
    pwaAppDirNames: ["Chrome Apps.localized", "Chrome Apps"],
    applicationSupportSubdir: "Google/Chrome",
    processName: "Google Chrome",
  },
  {
    alias: "edge",
    displayName: "Microsoft Edge",
    family: "chromium",
    tier: "A",
    bundleId: "com.microsoft.edgemac",
    appNames: ["Microsoft Edge.app"],
    pwaAppDirNames: ["Edge Apps.localized", "Microsoft Edge Apps.localized", "Edge Apps"],
    applicationSupportSubdir: "Microsoft Edge",
    processName: "Microsoft Edge",
  },
  {
    alias: "brave",
    displayName: "Brave Browser",
    family: "chromium",
    tier: "A",
    bundleId: "com.brave.Browser",
    appNames: ["Brave Browser.app"],
    pwaAppDirNames: ["Brave Browser Apps.localized", "Brave Browser Apps"],
    applicationSupportSubdir: "BraveSoftware/Brave-Browser",
    processName: "Brave Browser",
  },
  {
    alias: "helium",
    displayName: "Helium",
    family: "chromium",
    tier: "A",
    bundleId: "net.imput.helium",
    appNames: ["Helium.app"],
    pwaAppDirNames: ["Helium Apps.localized", "Helium Apps"],
    applicationSupportSubdir: "net.imput.helium",
    processName: "Helium",
    notes: "First-class Chromium target; PWA folder name confirmed after first install",
  },
  {
    alias: "chromium",
    displayName: "Chromium",
    family: "chromium",
    tier: "B",
    bundleId: "org.chromium.Chromium",
    appNames: ["Chromium.app"],
    pwaAppDirNames: ["Chromium Apps.localized", "Chromium Apps"],
    applicationSupportSubdir: "Chromium",
    processName: "Chromium",
  },
  {
    alias: "opera",
    displayName: "Opera",
    family: "chromium",
    tier: "B",
    bundleId: "com.operasoftware.Opera",
    appNames: ["Opera.app"],
    pwaAppDirNames: ["Opera Apps.localized", "Opera Apps"],
    applicationSupportSubdir: "com.operasoftware.Opera",
    processName: "Opera",
  },
  {
    alias: "vivaldi",
    displayName: "Vivaldi",
    family: "chromium",
    tier: "B",
    bundleId: "com.vivaldi.Vivaldi",
    appNames: ["Vivaldi.app"],
    pwaAppDirNames: ["Vivaldi Apps.localized", "Vivaldi Apps"],
    applicationSupportSubdir: "Vivaldi",
    processName: "Vivaldi",
  },
  // Firefox family
  {
    alias: "firefox",
    displayName: "Firefox",
    family: "firefox",
    tier: "A",
    bundleId: "org.mozilla.firefox",
    appNames: ["Firefox.app"],
    applicationSupportSubdir: "firefoxpwa",
    processName: "Firefox",
    notes: "Requires PWAsForFirefox (firefoxpwa CLI)",
  },
  {
    alias: "zen",
    displayName: "Zen Browser",
    family: "firefox",
    tier: "A'",
    bundleId: "app.zen-browser.zen",
    appNames: ["Zen Browser.app", "Zen.app"],
    applicationSupportSubdir: "firefoxpwa",
    processName: "Zen",
    notes: "Experimental; uses firefoxpwa with custom runtime when configured",
  },
  {
    alias: "librewolf",
    displayName: "LibreWolf",
    family: "firefox",
    tier: "A'",
    bundleId: "io.gitlab.librewolf-community",
    appNames: ["LibreWolf.app"],
    applicationSupportSubdir: "firefoxpwa",
    processName: "LibreWolf",
    notes: "Uses firefoxpwa with LibreWolf custom runtime (see PWAsForFirefox docs)",
  },
];

const byAlias = new Map(BROWSER_DEFINITIONS.map((b) => [b.alias, b]));

export function getBrowserDefinition(alias: string): BrowserDefinition | undefined {
  return byAlias.get(alias as BrowserAlias);
}

export function resolveAlias(input: string): BrowserAlias | undefined {
  const key = input.trim().toLowerCase();
  const aliases: Record<string, BrowserAlias> = {
    safari: "safari",
    stp: "stp",
    "safari-technology-preview": "stp",
    "safari technology preview": "stp",
    orion: "orion",
    chrome: "chrome",
    "google-chrome": "chrome",
    "google chrome": "chrome",
    edge: "edge",
    "microsoft-edge": "edge",
    "microsoft edge": "edge",
    brave: "brave",
    "brave-browser": "brave",
    helium: "helium",
    firefox: "firefox",
    zen: "zen",
    "zen-browser": "zen",
    librewolf: "librewolf",
    chromium: "chromium",
    opera: "opera",
    vivaldi: "vivaldi",
  };
  return aliases[key];
}

export function findAppPath(def: BrowserDefinition): string | undefined {
  const roots = [systemApplications(), userApplications()];
  for (const root of roots) {
    for (const name of def.appNames) {
      const p = join(root, name);
      if (existsSync(p)) return p;
    }
  }
  // Fallback: scan /Applications for matching bundle id
  try {
    for (const ent of readdirSync(systemApplications())) {
      if (!ent.endsWith(".app")) continue;
      const p = join(systemApplications(), ent);
      try {
        const info = readAppInfoPlist(p);
        if (str(info.CFBundleIdentifier) === def.bundleId) return p;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function resolvePwaAppDirs(def: BrowserDefinition): string[] {
  const ua = userApplications();
  const dirs: string[] = [];
  for (const name of def.pwaAppDirNames ?? []) {
    const p = join(ua, name);
    if (existsSync(p) && statSync(p).isDirectory()) dirs.push(p);
  }
  return dirs;
}

export function detectBrowsers(): DetectedBrowser[] {
  return BROWSER_DEFINITIONS.map((def) => {
    const appPath = findAppPath(def);
    return {
      ...def,
      installed: Boolean(appPath),
      appPath,
      pwaAppDirs: resolvePwaAppDirs(def),
    };
  });
}

export function detectBrowser(alias: BrowserAlias): DetectedBrowser | undefined {
  return detectBrowsers().find((b) => b.alias === alias);
}

export function familyOf(alias: BrowserAlias): BrowserFamily | undefined {
  return getBrowserDefinition(alias)?.family;
}

export function applicationSupportRoot(def: BrowserDefinition): string | undefined {
  if (!def.applicationSupportSubdir) return undefined;
  return applicationSupport(...def.applicationSupportSubdir.split("/"));
}

/** Map a host CrBundleIdentifier / CFBundleIdentifier to a known alias. */
export function aliasFromBundleId(bundleId: string): BrowserAlias | undefined {
  const hit = BROWSER_DEFINITIONS.find((b) => b.bundleId === bundleId);
  if (hit) return hit.alias;
  // Chromium PWA host ids look like com.brave.Browser.app.<id>
  for (const b of BROWSER_DEFINITIONS) {
    if (bundleId === b.bundleId || bundleId.startsWith(b.bundleId + ".")) {
      return b.alias;
    }
  }
  return undefined;
}
