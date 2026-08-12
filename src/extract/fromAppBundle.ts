import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { PwaDescriptor } from "../types.js";
import { aliasFromBundleId } from "../browsers/registry.js";
import { copyIconToTemp, findAppIcon } from "../util/icon.js";
import { bool, readAppInfoPlist, str, type PlistDict } from "../util/plist.js";

export function isAppBundle(path: string): boolean {
  return path.endsWith(".app") && existsSync(path) && statSync(path).isDirectory();
}

/**
 * Classify and extract a PwaDescriptor from a macOS .app that looks like a PWA/SSB.
 * Returns null if the bundle is not a recognized PWA app.
 */
export function extractFromAppBundle(appPath: string): PwaDescriptor | null {
  if (!isAppBundle(appPath)) return null;

  let info: PlistDict;
  try {
    info = readAppInfoPlist(appPath);
  } catch {
    return null;
  }

  // Chromium app-mode shortcut
  const crUrl = str(info.CrAppModeShortcutURL);
  if (crUrl) {
    return extractChromium(appPath, info, crUrl);
  }

  // Safari / WebKit template web app
  if (bool(info.LSTemplateApplication) || isSafariWebAppId(str(info.CFBundleIdentifier))) {
    return extractSafari(appPath, info);
  }

  // Orion (often under Orion/WebApps; may embed URL in different keys)
  if (appPath.includes("/Orion/WebApps/") || appPath.includes("/Orion/Web Apps/")) {
    return extractOrion(appPath, info);
  }

  // firefoxpwa apps: often have FFPwa or similar; also check bundle id patterns
  const bid = str(info.CFBundleIdentifier) ?? "";
  if (bid.includes("firefoxpwa") || bid.startsWith("org.mozilla.firefoxpwa") || bid.includes(".pwa.")) {
    return extractFirefoxPwa(appPath, info);
  }

  // Heuristic: some firefoxpwa bundles store start URL in custom keys
  const maybeUrl =
    str(info.FirefoxPwaUrl) ||
    str(info.FFPWAUrl) ||
    str(info.WebAppURL) ||
    str((info.CFBundleURLTypes as unknown) as string);
  if (maybeUrl?.startsWith("http") && (bid.includes("firefox") || bid.includes("pwa"))) {
    return extractFirefoxPwa(appPath, info, maybeUrl);
  }

  return null;
}

function isSafariWebAppId(id: string | undefined): boolean {
  if (!id) return false;
  return (
    id.startsWith("com.apple.Safari.WebApp") ||
    id.startsWith("com.apple.SafariTechnologyPreview.WebApp")
  );
}

function extractChromium(appPath: string, info: PlistDict, url: string): PwaDescriptor {
  const name =
    str(info.CrAppModeShortcutName) ||
    str(info.CFBundleName) ||
    basename(appPath, ".app");
  const hostId = str(info.CrBundleIdentifier) || str(info.CFBundleIdentifier) || "unknown";
  const shortcutId = str(info.CrAppModeShortcutID);
  const iconSrc = findAppIcon(appPath);
  const iconPath = iconSrc ? copyIconToTemp(iconSrc, name) : undefined;

  return {
    name,
    startUrl: url,
    iconPath,
    source: {
      family: "chromium",
      browserAlias: aliasFromBundleId(hostId),
      browserId: hostId,
      appPath,
      shortcutId,
    },
  };
}

function extractSafari(appPath: string, info: PlistDict): PwaDescriptor | null {
  const name = str(info.CFBundleName) || basename(appPath, ".app");
  const manifest = info.Manifest as PlistDict | undefined;
  const startUrl =
    str(manifest?.start_url) ||
    str(info.WKAppBoundManifestStartURL) ||
    extractStartUrlFromTemplate(info);
  if (!startUrl) return null;

  const scope = str(manifest?.scope);
  const display = str(manifest?.display);
  const bid = str(info.CFBundleIdentifier) || "com.apple.Safari.WebApp";
  const iconSrc = findAppIcon(appPath);
  const iconPath = iconSrc ? copyIconToTemp(iconSrc, name) : undefined;

  const rawManifest = manifest
    ? (Object.fromEntries(
        Object.entries(manifest).map(([k, v]) => [k, v]),
      ) as Record<string, unknown>)
    : undefined;

  return {
    name,
    startUrl,
    scope,
    display,
    iconPath,
    rawManifest,
    source: {
      family: "webkit",
      browserAlias: bid.includes("TechnologyPreview") ? "stp" : "safari",
      browserId: bid,
      appPath,
    },
  };
}

function extractStartUrlFromTemplate(info: PlistDict): string | undefined {
  const params = info.LSTemplateApplicationParameters as PlistDict | undefined;
  // Some builds store URL only inside Manifest; nothing else available
  void params;
  return undefined;
}

function extractOrion(appPath: string, info: PlistDict): PwaDescriptor | null {
  const name = str(info.CFBundleName) || basename(appPath, ".app");
  // Orion may store URL in various keys — try common ones
  const url =
    str(info.OrionWebAppURL) ||
    str(info.WebAppURL) ||
    str(info.URL) ||
    str((info.Manifest as PlistDict | undefined)?.start_url);
  if (!url) {
    // Still return a partial descriptor so scan can show the app
    return {
      name,
      startUrl: "",
      source: {
        family: "webkit",
        browserAlias: "orion",
        browserId: str(info.CFBundleIdentifier) || "com.kagi.kagimacOS",
        appPath,
      },
    };
  }
  const iconSrc = findAppIcon(appPath);
  return {
    name,
    startUrl: url,
    iconPath: iconSrc ? copyIconToTemp(iconSrc, name) : undefined,
    source: {
      family: "webkit",
      browserAlias: "orion",
      browserId: str(info.CFBundleIdentifier) || "com.kagi.kagimacOS",
      appPath,
    },
  };
}

function extractFirefoxPwa(
  appPath: string,
  info: PlistDict,
  urlOverride?: string,
): PwaDescriptor | null {
  const name = str(info.CFBundleName) || basename(appPath, ".app");
  const url =
    urlOverride ||
    str(info.FirefoxPwaUrl) ||
    str(info.FFPWAUrl) ||
    str(info.WebAppURL) ||
    str((info.Manifest as PlistDict | undefined)?.start_url);
  if (!url) return null;
  const iconSrc = findAppIcon(appPath);
  return {
    name,
    startUrl: url,
    iconPath: iconSrc ? copyIconToTemp(iconSrc, name) : undefined,
    source: {
      family: "firefox",
      browserAlias: "firefox",
      browserId: str(info.CFBundleIdentifier) || "firefoxpwa",
      appPath,
    },
  };
}

/** Collect .app paths from a file or directory (one level of .app children). */
export function collectAppPaths(inputPath: string): string[] {
  if (isAppBundle(inputPath)) return [inputPath];
  if (!existsSync(inputPath) || !statSync(inputPath).isDirectory()) return [];

  const results: string[] = [];
  try {
    for (const ent of readdirSync(inputPath)) {
      const p = join(inputPath, ent);
      if (isAppBundle(p)) results.push(p);
    }
  } catch {
    /* ignore */
  }

  // Nested level (e.g. Orion/WebApps or *.localized containers)
  try {
    for (const ent of readdirSync(inputPath)) {
      const p = join(inputPath, ent);
      if (!statSync(p).isDirectory() || p.endsWith(".app")) continue;
      for (const child of readdirSync(p)) {
        const cp = join(p, child);
        if (isAppBundle(cp)) results.push(cp);
      }
    }
  } catch {
    /* ignore */
  }

  return results;
}
