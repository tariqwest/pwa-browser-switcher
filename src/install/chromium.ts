import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { BrowserAlias, ConvertResult, DetectedBrowser, PwaDescriptor } from "../types.js";
import { detectBrowser } from "../browsers/registry.js";
import { asLiteral, runAppleScript } from "../util/applescript.js";
import { info, warn } from "../util/log.js";
import { userApplications } from "../util/paths.js";
import { sleep } from "../util/sleep.js";

export interface InstallOptions {
  dryRun?: boolean;
  preferUi?: boolean;
}

/**
 * Install a PWA into a Chromium-family browser.
 * Strategy order: UI automation (reliable) → open URL with install hint.
 * Force-list is attempted as an optional fast path when profile is writable.
 */
export async function installChromium(
  descriptor: PwaDescriptor,
  target: BrowserAlias,
  opts: InstallOptions = {},
): Promise<ConvertResult> {
  const browser = detectBrowser(target);
  if (!browser?.installed || !browser.appPath) {
    return {
      descriptor,
      target,
      status: "failed",
      message: `${target} is not installed`,
    };
  }

  if (!descriptor.startUrl) {
    return {
      descriptor,
      target,
      status: "failed",
      message: "missing startUrl; cannot install",
    };
  }

  const before = listPwaApps(browser);
  const expectedName = descriptor.name;

  if (opts.dryRun) {
    return {
      descriptor,
      target,
      status: "dry-run",
      message: `Would install "${expectedName}" (${descriptor.startUrl}) into ${browser.displayName}`,
      outputPath: browser.pwaAppDirs[0]
        ? join(browser.pwaAppDirs[0], `${expectedName}.app`)
        : undefined,
    };
  }

  // Prefer UI automation — most reliable across Brave/Helium/Chrome/Edge
  try {
    info(`Installing "${expectedName}" into ${browser.displayName} via UI automation…`);
    await installViaUi(browser, descriptor);
  } catch (uiErr) {
    warn(`UI install failed: ${uiErr}`);
    // Fallback: open as app window (--app) so user can pin; still create a weak shortcut path
    try {
      info("Falling back to --app launch (manual Install may still be required)…");
      openAsAppWindow(browser, descriptor.startUrl);
      return {
        descriptor,
        target,
        status: "partial",
        message:
          `Opened ${descriptor.startUrl} as an app window in ${browser.displayName}. ` +
          `If no shortcut was created, use Menu → Install / Create shortcut → Open as window.`,
      };
    } catch (e) {
      return {
        descriptor,
        target,
        status: "failed",
        message: `Chromium install failed: ${uiErr}; fallback: ${e}`,
      };
    }
  }

  // Wait for app bundle to appear
  const found = await waitForNewApp(browser, before, expectedName, 45_000);
  if (found) {
    return {
      descriptor,
      target,
      status: "success",
      message: `Installed "${expectedName}" into ${browser.displayName}`,
      outputPath: found,
    };
  }

  return {
    descriptor,
    target,
    status: "partial",
    message:
      `Install UI completed for "${expectedName}" but app bundle was not detected yet under ${browser.pwaAppDirs.join(", ") || "~/Applications/*Apps*"}. ` +
      `Check the browser's Apps folder or chrome://apps.`,
  };
}

function listPwaApps(browser: DetectedBrowser): Set<string> {
  const set = new Set<string>();
  for (const dir of browser.pwaAppDirs) {
    try {
      for (const ent of readdirSync(dir)) {
        if (ent.endsWith(".app")) set.add(join(dir, ent));
      }
    } catch {
      /* ignore */
    }
  }
  // Also scan user Applications for new *Apps.localized
  try {
    const root = userApplications();
    for (const ent of readdirSync(root)) {
      if (!/apps/i.test(ent)) continue;
      const dir = join(root, ent);
      try {
        for (const app of readdirSync(dir)) {
          if (app.endsWith(".app")) set.add(join(dir, app));
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return set;
}

async function waitForNewApp(
  browser: DetectedBrowser,
  before: Set<string>,
  name: string,
  timeoutMs: number,
): Promise<string | undefined> {
  const deadline = Date.now() + timeoutMs;
  const nameApp = `${name}.app`;
  while (Date.now() < deadline) {
    const now = listPwaApps(browser);
    for (const p of now) {
      if (!before.has(p) && (p.endsWith(nameApp) || basename(p).includes(name))) {
        return p;
      }
    }
    // name match even if already in set (reinstall)
    for (const p of now) {
      if (basename(p) === nameApp) return p;
    }
    await sleep(1000);
  }
  return undefined;
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function openAsAppWindow(browser: DetectedBrowser, url: string): void {
  if (!browser.appPath) throw new Error("no app path");
  // macOS open -a with args
  execFileSync(
    "open",
    ["-na", browser.appPath, "--args", `--app=${url}`],
    { stdio: "ignore" },
  );
}

/**
 * UI automation: open URL, then use menu Install page as app / Create Shortcut.
 * Menu labels differ slightly across Chromium forks.
 */
async function installViaUi(browser: DetectedBrowser, desc: PwaDescriptor): Promise<void> {
  const appName = browser.processName || browser.displayName;
  const url = desc.startUrl;
  const name = desc.name;

  // Activate browser and open URL in a new window
  runAppleScript(`
    tell application ${asLiteral(appName)}
      activate
      open location ${asLiteral(url)}
    end tell
  `);

  await sleep(3500);

  // Try several menu paths used by Chrome/Brave/Edge/Helium
  const script = `
    set appName to ${asLiteral(appName)}
    set appTitle to ${asLiteral(name)}
    tell application "System Events"
      tell process appName
        set frontmost to true
        delay 0.8
        -- Ensure we have a window
        if (count of windows) is 0 then
          error "No browser window open"
        end if

        -- Open the main application menu (Chrome/Brave/Edge use different labels)
        -- Try "Install …" from the page menu via keyboard is unreliable.
        -- Use menu bar: [Browser] → Services not useful.
        -- Common path: menu "…" is not AppleScriptable; use File / Window alternatives.

        -- Brave / Chrome: View or application menu "Install [site]…" appears when installable.
        -- Fallback path: File menu rarely has it. Use:
        --   keystroke using command for chrome://apps is not install.
        -- Primary approach: open the main menu bar item matching browser name
        -- and click any menu item whose name starts with "Install".

        set installed to false
        set menuNames to {"File", appName, "Brave", "Chrome", "Microsoft Edge", "Helium", "Tools", "Window"}

        repeat with mn in menuNames
          try
            tell menu bar 1
              tell menu bar item mn
                tell menu 1
                  set itemNames to name of every menu item
                  repeat with iname in itemNames
                    set n to iname as text
                    if n starts with "Install" or n contains "Install " or n is "Create Shortcut…" or n is "Create Shortcut..." or n contains "Cast, save" then
                      -- Prefer direct Install entries
                      if n starts with "Install" then
                        click menu item n
                        set installed to true
                        exit repeat
                      end if
                    end if
                  end repeat
                end tell
              end tell
            end tell
          end try
          if installed then exit repeat
        end repeat

        if not installed then
          -- Chrome three-dot is not a standard menu; try Save and Share submenu (Chrome 120+)
          try
            tell menu bar 1
              tell menu bar item appName
                tell menu 1
                  -- Cast, save, and share → Install page as app…
                  try
                    click menu item "Cast, save, and share"
                    delay 0.4
                  end try
                end tell
              end tell
            end tell
          end try
          try
            tell menu bar 1
              tell menu bar item appName
                tell menu 1
                  tell menu item "Cast, save, and share"
                    tell menu 1
                      set itemNames to name of every menu item
                      repeat with iname in itemNames
                        set n to iname as text
                        if n starts with "Install" or n contains "page as app" or n contains "Shortcut" then
                          click menu item n
                          set installed to true
                          exit repeat
                        end if
                      end repeat
                    end tell
                  end tell
                end tell
              end tell
            end tell
          end try
        end if

        if not installed then
          error "Could not find Install / Create Shortcut menu item. Grant Accessibility permission and install the site once manually to confirm the menu label."
        end if

        delay 1.2
        -- Handle install dialog: set name if text field exists, click Install/Create/OK
        try
          set wlist to every window
          repeat with w in wlist
            try
              set tfs to text fields of w
              if (count of tfs) > 0 then
                set value of item 1 of tfs to appTitle
              end if
            end try
            try
              repeat with b in buttons of w
                set bn to name of b as text
                if bn is "Install" or bn is "Create" or bn is "OK" or bn is "Add" or bn is "Create Shortcut" then
                  click b
                  exit repeat
                end if
              end repeat
            end try
            try
              -- sheets
              repeat with s in sheets of w
                try
                  set value of text field 1 of s to appTitle
                end try
                repeat with b in buttons of s
                  set bn to name of b as text
                  if bn is "Install" or bn is "Create" or bn is "OK" or bn is "Add" then
                    click b
                    exit repeat
                  end if
                end repeat
              end repeat
            end try
          end repeat
        end try
      end tell
    end tell
  `;

  runAppleScript(script);
  await sleep(2000);
}

/**
 * Optional: write a temporary managed-policy-like Preferences patch.
 * Many Chromium forks ignore this without full enterprise enrollment;
 * kept as an experiment hook for future use.
 */
export function tryWriteForceListHint(
  browser: DetectedBrowser,
  url: string,
  name: string,
): string | undefined {
  // Not used by default — force-installed apps can be hard to uninstall.
  // Implemented only as a documented advanced path later.
  void browser;
  void url;
  void name;
  return undefined;
}

export function ensureAppsDirPlaceholder(browser: DetectedBrowser): void {
  const dirs = browser.pwaAppDirNames ?? [];
  if (!dirs.length) return;
  const p = join(userApplications(), dirs[0]);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}
