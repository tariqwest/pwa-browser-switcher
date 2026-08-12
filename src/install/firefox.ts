import { execFileSync, spawnSync } from "node:child_process";
import type { BrowserAlias, ConvertResult, PwaDescriptor } from "../types.js";
import { detectBrowser } from "../browsers/registry.js";
import { discoverManifestUrl, enrichFromWebManifest } from "../extract/manifest.js";
import { info, warn } from "../util/log.js";

export interface InstallOptions {
  dryRun?: boolean;
  profile?: string;
}

/**
 * Install via PWAsForFirefox `firefoxpwa site install <manifest-url>`.
 * Targets: firefox | zen | librewolf (runtime notes in message for forks).
 */
export async function installFirefox(
  descriptor: PwaDescriptor,
  target: BrowserAlias = "firefox",
  opts: InstallOptions = {},
): Promise<ConvertResult> {
  const browser = detectBrowser(target);
  // firefoxpwa can work even if the branded browser app is missing if runtime is installed
  const hasCli = which("firefoxpwa");

  if (!descriptor.startUrl && !descriptor.manifestUrl) {
    return { descriptor, target, status: "failed", message: "missing startUrl/manifestUrl" };
  }

  const enriched = await enrichFromWebManifest(descriptor);
  const manifestUrl = enriched.manifestUrl ?? (await discoverManifestUrl(enriched.startUrl));

  if (!manifestUrl) {
    return {
      descriptor: { ...descriptor, ...enriched },
      target,
      status: "failed",
      message:
        `No web app manifest found for ${enriched.startUrl}. ` +
        `firefoxpwa requires a manifest URL. Install manually via the PWAsForFirefox extension, or pick a site with manifest.json.`,
    };
  }

  const name = enriched.name || descriptor.name;
  const args = ["site", "install", manifestUrl, "--name", name];
  if (opts.profile) {
    args.push("--profile", opts.profile);
  }

  let runtimeNote = "";
  if (target === "librewolf") {
    runtimeNote =
      " Target=librewolf: configure firefoxpwa custom runtime for LibreWolf (see PWAsForFirefox FAQ).";
  } else if (target === "zen") {
    runtimeNote =
      " Target=zen (experimental): configure firefoxpwa custom runtime for Zen if desired.";
  } else if (browser && !browser.installed) {
    runtimeNote = ` ${browser.displayName} app not detected; relying on firefoxpwa runtime only.`;
  }

  if (opts.dryRun) {
    const cliNote = hasCli
      ? ""
      : " (firefoxpwa not installed yet — install from https://pwasforfirefox.filips.si/)";
    return {
      descriptor: { ...descriptor, ...enriched, manifestUrl },
      target,
      status: "dry-run",
      message: `Would run: firefoxpwa ${args.map(shellQuote).join(" ")}${runtimeNote}${cliNote}`,
    };
  }

  if (!hasCli) {
    return {
      descriptor: { ...descriptor, ...enriched, manifestUrl },
      target,
      status: "failed",
      message:
        "firefoxpwa CLI not found. Install PWAsForFirefox: https://pwasforfirefox.filips.si/ " +
        "(e.g. brew install firefoxpwa) and ensure the runtime is set up (`firefoxpwa runtime install`).",
    };
  }

  info(`Running firefoxpwa site install for "${name}"…`);
  const result = spawnSync("firefoxpwa", args, {
    encoding: "utf8",
    timeout: 180_000,
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    return {
      descriptor: { ...descriptor, ...enriched, manifestUrl },
      target,
      status: "failed",
      message: `firefoxpwa failed (exit ${result.status}): ${err || "unknown error"}${runtimeNote}`,
    };
  }

  const out = (result.stdout || "").trim();
  return {
    descriptor: { ...descriptor, ...enriched, manifestUrl },
    target,
    status: "success",
    message: `Installed via firefoxpwa: ${out || name}.${runtimeNote}`,
  };
}

function which(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function shellQuote(s: string): string {
  if (/^[a-zA-Z0-9_./:-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export function firefoxpwaAvailable(): boolean {
  return which("firefoxpwa");
}

/** Warn-only helper for convert path */
export function noteFirefoxTarget(target: BrowserAlias): void {
  if (target === "zen") {
    warn("Zen support is experimental and goes through firefoxpwa.");
  }
  if (target === "librewolf") {
    warn("LibreWolf requires a firefoxpwa custom runtime for best results.");
  }
}
