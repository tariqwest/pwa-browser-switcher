# pwa-browser-switcher

CLI tool for **macOS** that converts Progressive Web App (PWA) / site-specific desktop apps from one browser to another.

When you switch default browsers, re-creating every “installed as app” shortcut is painful. This tool:

1. **Discovers** installed PWA desktop apps (or accepts a single app, batch, or folder)
2. **Extracts** name, start URL, icon, and source metadata
3. **Re-creates** them in your preferred browser’s normal PWA location

## Prior art

No maintained tool was found that **migrates already-installed** desktop PWAs **between browsers** on macOS.

Related (but different) tools:

| Tool | Gap |
|------|-----|
| Fluid, Unite, Coherence X | Create SSBs from a URL; don’t import browser PWAs |
| Nativefier | Electron wrappers, not real browser PWAs |
| PWAsForFirefox | Firefox-only install/management |
| Chrome/Edge `WebAppInstallForceList` | Enterprise deploy, not user migration |

**This project is the interop layer:** discover → normalize → native install per browser family.

## Supported browsers (v1)

| Family | First-class targets |
|--------|---------------------|
| **WebKit** | Safari, Orion, Safari Technology Preview |
| **Chromium** | Chrome, Edge, Brave, **Helium** |
| **Firefox (Gecko)** | Firefox, Zen, LibreWolf (via [PWAsForFirefox](https://pwasforfirefox.filips.si/)) |

Other Chromium forks (Opera, Vivaldi, Chromium, …) are best-effort when they use `* Apps.localized` + `CrAppMode*` plists.

## Install

```bash
# From this repo
bun install          # or: npm install
# Run with Bun:
bun src/cli.ts --help
# Or Node + tsx (no separate compile step):
npx tsx src/cli.ts --help
# Optional global link:
npm link
pwa-switch --help
```

Requires **macOS**. Install automation needs **Accessibility** permission for your terminal (System Settings → Privacy & Security → Accessibility).

## Usage

```bash
# What browsers are installed?
pwa-switch browsers

# Discover PWAs already on this Mac
pwa-switch scan
pwa-switch scan --browser brave

# Convert one app
pwa-switch convert ~/Applications/Brave\ Browser\ Apps.localized/Gmail.app --to helium

# Convert a whole folder (batch)
pwa-switch convert ~/Applications/Brave\ Browser\ Apps.localized --to chrome --dry-run

# Export / import portable JSON
pwa-switch export -o apps.json
pwa-switch import apps.json --to safari --dry-run

# Firefox family (needs firefoxpwa CLI + site web manifest)
pwa-switch convert ./SomePwa.app --to firefox
```

### Flags

| Flag | Meaning |
|------|---------|
| `--to <alias>` | Target: `safari` `stp` `orion` `chrome` `edge` `brave` `helium` `firefox` `zen` `librewolf` |
| `--dry-run` | Plan only |
| `--remove-source` | Delete source `.app` after **successful** install |
| `--profile <id>` | firefoxpwa profile id |
| `--json` | Machine-readable output |

## How install works

| Target family | Mechanism |
|---------------|-----------|
| Chromium | UI automation (Install / Create shortcut → open as window), with `--app=` fallback |
| Safari / STP | AppleScript **File → Add to Dock** (macOS 14+) |
| Orion | AppleScript **Tools → Install This Site as an App** |
| Firefox / Zen / LibreWolf | `firefoxpwa site install <manifest-url>` |

**Not migrated:** cookies, localStorage, service workers, push subscriptions (you will usually need to sign in again).

## Project layout

```
src/
  cli.ts                 # entry
  browsers/registry.ts   # browser paths & bundle IDs
  discover/scan.ts
  extract/               # .app → PwaDescriptor
  install/               # per-family installers
```

## Development

```bash
bun install
bun test
bun src/cli.ts scan
bun src/cli.ts browsers
```

## License

MIT
