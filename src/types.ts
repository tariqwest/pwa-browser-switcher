export type BrowserFamily = "chromium" | "webkit" | "firefox";

export type SupportTier = "A" | "A'" | "B";

/** Canonical CLI target aliases. */
export type BrowserAlias =
  | "safari"
  | "stp"
  | "orion"
  | "chrome"
  | "edge"
  | "brave"
  | "helium"
  | "firefox"
  | "zen"
  | "librewolf"
  | "chromium"
  | "opera"
  | "vivaldi";

export interface BrowserDefinition {
  alias: BrowserAlias;
  displayName: string;
  family: BrowserFamily;
  tier: SupportTier;
  /** CFBundleIdentifier of the host browser app */
  bundleId: string;
  /** Path segments under /Applications or common install locations */
  appNames: string[];
  /**
   * Folder under ~/Applications that holds installed PWAs, when known.
   * Chromium: "* Apps.localized". Orion: "Orion/WebApps". Safari: apps live flat in ~/Applications.
   */
  pwaAppDirNames?: string[];
  /** Application Support relative path under ~/Library/Application Support */
  applicationSupportSubdir?: string;
  /** AppleScript / process name for UI automation */
  processName?: string;
  /** Notes shown by `browsers` / errors */
  notes?: string;
}

export interface DetectedBrowser extends BrowserDefinition {
  installed: boolean;
  appPath?: string;
  pwaAppDirs: string[];
}

export interface PwaSource {
  family: BrowserFamily;
  /** Host browser alias when known, else raw bundle id */
  browserAlias?: BrowserAlias;
  browserId: string;
  appPath: string;
  shortcutId?: string;
}

export interface PwaDescriptor {
  name: string;
  startUrl: string;
  scope?: string;
  iconPath?: string;
  display?: string;
  source: PwaSource;
  manifestUrl?: string;
  rawManifest?: Record<string, unknown>;
}

export interface ConvertResult {
  descriptor: PwaDescriptor;
  target: BrowserAlias;
  status: "success" | "dry-run" | "skipped" | "failed" | "partial";
  message: string;
  outputPath?: string;
}

export interface ScanOptions {
  browser?: BrowserAlias;
  paths?: string[];
}
