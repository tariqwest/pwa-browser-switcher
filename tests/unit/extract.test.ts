import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extractFromAppBundle } from "../../src/extract/fromAppBundle.ts";
import { resolveAlias, getBrowserDefinition } from "../../src/browsers/registry.ts";

function writeFakeChromiumApp(root: string, name: string, url: string, hostId: string): string {
  const app = join(root, `${name}.app`);
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(app, "Contents", "Resources"), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleIdentifier</key><string>${hostId}.app.abc123</string>
  <key>CrAppModeShortcutURL</key><string>${url}</string>
  <key>CrAppModeShortcutName</key><string>${name}</string>
  <key>CrAppModeShortcutID</key><string>abc123def456</string>
  <key>CrBundleIdentifier</key><string>${hostId}</string>
</dict>
</plist>`;
  writeFileSync(join(app, "Contents", "Info.plist"), plist);
  writeFileSync(join(app, "Contents", "MacOS", "app_mode_loader"), "");
  return app;
}

function writeFakeSafariApp(root: string, name: string, url: string): string {
  const app = join(root, `${name}.app`);
  mkdirSync(join(app, "Contents", "Resources"), { recursive: true });
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleIdentifier</key><string>com.apple.Safari.WebApp.TEST-UUID</string>
  <key>LSTemplateApplication</key><true/>
  <key>Manifest</key>
  <dict>
    <key>name</key><string>${name}</string>
    <key>start_url</key><string>${url}</string>
    <key>scope</key><string>https://example.com/</string>
    <key>display</key><string>standalone</string>
  </dict>
</dict>
</plist>`;
  writeFileSync(join(app, "Contents", "Info.plist"), plist);
  return app;
}

describe("resolveAlias", () => {
  test("maps common names", () => {
    expect(resolveAlias("brave")).toBe("brave");
    expect(resolveAlias("Google Chrome")).toBe("chrome");
    expect(resolveAlias("helium")).toBe("helium");
    expect(resolveAlias("stp")).toBe("stp");
  });
});

describe("registry", () => {
  test("helium is first-class chromium", () => {
    const h = getBrowserDefinition("helium");
    expect(h?.family).toBe("chromium");
    expect(h?.tier).toBe("A");
    expect(h?.bundleId).toBe("net.imput.helium");
  });
});

describe("extractFromAppBundle", () => {
  const root = join(tmpdir(), `pwa-switch-test-${Date.now()}`);

  test("extracts chromium app-mode plist", () => {
    mkdirSync(root, { recursive: true });
    const app = writeFakeChromiumApp(
      root,
      "Gmail",
      "https://mail.google.com/mail/?usp=installed_webapp",
      "com.brave.Browser",
    );
    const d = extractFromAppBundle(app);
    expect(d).not.toBeNull();
    expect(d!.name).toBe("Gmail");
    expect(d!.startUrl).toContain("mail.google.com");
    expect(d!.source.family).toBe("chromium");
    expect(d!.source.browserAlias).toBe("brave");
    expect(d!.source.shortcutId).toBe("abc123def456");
  });

  test("extracts safari web app manifest", () => {
    mkdirSync(root, { recursive: true });
    const app = writeFakeSafariApp(root, "Example", "https://example.com/");
    const d = extractFromAppBundle(app);
    expect(d).not.toBeNull();
    expect(d!.name).toBe("Example");
    expect(d!.startUrl).toBe("https://example.com/");
    expect(d!.source.family).toBe("webkit");
    expect(d!.scope).toBe("https://example.com/");
  });

  test("returns null for normal app", () => {
    mkdirSync(root, { recursive: true });
    const app = join(root, "Normal.app");
    mkdirSync(join(app, "Contents"), { recursive: true });
    writeFileSync(
      join(app, "Contents", "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.example.Normal</string>
  <key>CFBundleName</key><string>Normal</string>
</dict></plist>`,
    );
    expect(extractFromAppBundle(app)).toBeNull();
  });

  // cleanup
  test("cleanup tmp", () => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    expect(true).toBe(true);
  });
});
