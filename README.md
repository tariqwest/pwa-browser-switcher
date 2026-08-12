# pwa-browser-switcher

**macOS CLI** that migrates Progressive Web App (PWA) / “install as app” desktop shortcuts from one browser to another.

When you switch default browsers, re-creating every site-specific app by hand is tedious. This tool finds those apps, reads their name/URL/icon, and recreates them in the browser you want.

```bash
pwa-switch convert ~/Applications/"Brave Browser Apps.localized" --to safari --dry-run
```

> **Platform:** macOS only (v1) · **License:** [MIT](./LICENSE)

---

## Who this is for

| Audience | Start here |
|----------|------------|
| **End users** | [Install](#install) → [Quick start](#quick-start) → [Commands](#commands) |
| **Contributors** | [Development](#development) → [Project layout](#project-layout) → [Contributing](#contributing) |
| **Coding agents / bots** | See **[AGENTS.md](./AGENTS.md)** (architecture, conventions, do/don’t) |

---

## Features

- **Scan** installed PWA desktop apps across Chromium, Safari/Orion, and Firefox-family locations
- **Convert** one app, a batch of paths, or a whole folder
- **Export / import** a portable JSON list of apps
- Targets **Safari, Orion, Safari Technology Preview**, **Chrome, Edge, Brave, Helium**, and **Firefox, Zen, LibreWolf** (via [PWAsForFirefox](https://pwasforfirefox.filips.si/))

### Supported browsers

| Family | First-class targets | How install works |
|--------|---------------------|-------------------|
| **WebKit** | Safari, Orion, Safari Technology Preview | Safari/STP: *File → Add to Dock* (macOS 14+). Orion: *Tools → Install This Site as an App* |
| **Chromium** | Chrome, Edge, Brave, Helium | UI automation (Install / Create shortcut); `--app=` window fallback |
| **Firefox (Gecko)** | Firefox, Zen, LibreWolf | `firefoxpwa site install <manifest-url>` |

Other Chromium forks (Opera, Vivaldi, ungoogled Chromium, …) are **best-effort** when they use `* Apps.localized` and `CrAppMode*` plists.

### What does *not* migrate

Cookies, localStorage, service workers, and push subscriptions stay with the old browser. Expect to **sign in again** in the new apps.

---

## Requirements

- **macOS** (Safari web apps need **macOS 14+** / Sonoma or later)
- **Node.js 20+** (or [Bun](https://bun.sh) for development)
- For UI-driven installs (Safari / Chromium / Orion): grant **Accessibility** to your terminal app  
  **System Settings → Privacy & Security → Accessibility**
- For Firefox targets: [PWAsForFirefox](https://pwasforfirefox.filips.si/) (`firefoxpwa` on your `PATH`) and a site with a web app manifest when possible

---

## Install

### From this repository

```bash
git clone https://github.com/tariqwest/pwa-browser-switcher.git
cd pwa-browser-switcher
npm install          # or: bun install

# Link the CLI as `pwa-switch`
npm link
pwa-switch --help
```

Without linking:

```bash
node bin/pwa-switch.mjs --help
npm start -- browsers
```

### How the CLI runs (no compile step)

The npm binary is [`bin/pwa-switch.mjs`](./bin/pwa-switch.mjs). It starts Node with [`tsx`](https://tsx.is) and runs TypeScript from `src/` **without** emitting a `dist/` folder. `tsx` is a **runtime dependency**; package publish includes `bin/` and `src/`.

---

## Quick start

```bash
# 1. See which browsers this Mac has
pwa-switch browsers

# 2. List PWA desktop apps already installed
pwa-switch scan

# 3. Preview converting Brave PWAs into Safari web apps
pwa-switch convert ~/Applications/"Brave Browser Apps.localized" --to safari --dry-run

# 4. Actually convert one app
pwa-switch convert ~/Applications/"Brave Browser Apps.localized"/YouTube.app --to safari
```

After a successful Safari convert, look under **`~/Applications`**, Launchpad, or Spotlight for the new app.

---

## Commands

Global options: `--json` (machine-readable where applicable), `-q` / `--quiet`, `-V` / `--version`, `-h` / `--help`.

### `browsers`

List supported browser aliases, support tier, install status, and known PWA folders.

```bash
pwa-switch browsers
pwa-switch --json browsers
```

### `scan`

Discover installed PWA `.app` bundles.

```bash
pwa-switch scan
pwa-switch scan --browser brave
pwa-switch scan ~/Applications/"Brave Browser Apps.localized"
pwa-switch --json scan
```

### `convert`

Recreate app(s) in a target browser.

```bash
pwa-switch convert <path> [<path>...] --to <browser>
```

| Option | Description |
|--------|-------------|
| `-t, --to <browser>` | **Required.** Target alias (see table below) |
| `--dry-run` | Print the plan; do not install |
| `--remove-source` | Delete the source `.app` only after a **successful** install |
| `--profile <id>` | firefoxpwa profile id (Firefox family) |
| `-y, --yes` | Skip confirmation prompts (reserved for interactive flows) |

**Target aliases:**  
`safari` · `stp` · `orion` · `chrome` · `edge` · `brave` · `helium` · `firefox` · `zen` · `librewolf`  
(plus best-effort: `chromium` · `opera` · `vivaldi`)

Examples:

```bash
# One app → Helium
pwa-switch convert ~/Applications/"Brave Browser Apps.localized"/Gmail.app --to helium

# Whole Chromium apps folder → Safari (preview first)
pwa-switch convert ~/Applications/"Brave Browser Apps.localized" --to safari --dry-run

# Firefox family (needs firefoxpwa + usually a web manifest)
pwa-switch convert ./SomePwa.app --to firefox
```

### `export` / `import`

Portable JSON for backup or another machine (same-Mac re-import is the common case).

```bash
pwa-switch export -o apps.json
pwa-switch export -o brave-only.json ~/Applications/"Brave Browser Apps.localized"

pwa-switch import apps.json --to safari --dry-run
pwa-switch import apps.json --to helium
```

---

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| Install fails with AppleScript / menu errors | Enable **Accessibility** for Terminal, iTerm, VS Code, etc., then retry |
| Safari convert does nothing useful | Confirm macOS 14+; open Safari once; retry with a single app |
| Firefox target fails | Install `firefoxpwa`, run `firefoxpwa runtime install`; site may need a `manifest.json` |
| Chromium app not detected after convert | Check `~/Applications/*Apps.localized` and the browser’s apps page; UI labels vary by browser |
| Partial success | The site may have opened for manual **Install** / **Add to Dock** — finish in the UI |

---

## Development

### Setup

```bash
npm install   # or bun install
npm test      # bun test
npm run typecheck
```

### Run during development

```bash
# Preferred published-style entry (Node + tsx)
node bin/pwa-switch.mjs scan

# Direct TS runners
bun src/cli.ts scan
npx tsx src/cli.ts scan
node --import tsx src/cli.ts scan
```

### Scripts

| Script | Purpose |
|--------|---------|
| `npm start -- <args>` | `node bin/pwa-switch.mjs` |
| `npm run pwa-switch -- <args>` | Same |
| `npm run dev -- <args>` | `bun src/cli.ts` (if Bun is installed) |
| `npm test` | Unit tests (Bun test runner) |
| `npm run typecheck` | `tsc --noEmit` |

### Project layout

```
bin/pwa-switch.mjs       # Node bin → tsx → src/cli.ts
src/
  cli.ts                 # Commander CLI
  types.ts               # Shared types
  browsers/registry.ts   # Bundle IDs, paths, tiers
  discover/scan.ts       # Find installed PWAs
  extract/               # .app → PwaDescriptor (+ manifest fetch)
  install/               # Per-family installers
tests/unit/              # Fixture-based unit tests
.agents/plans/           # Design / planning notes
AGENTS.md                # Instructions for coding agents
```

### Contributing

1. Prefer small, focused changes (discover, one installer family, or CLI).
2. Keep **macOS-only** scope unless you extend platform support deliberately.
3. Add or update unit tests when changing extract/registry logic (`tests/unit/`).
4. Run `npm test` and `npm run typecheck` before opening a PR.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) in commit messages (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
6. Do **not** commit secrets, local PWA data, or `node_modules/`.
7. Live install automation can change browser UIs; document fragile menu paths when you touch them.

Questions about architecture, install strategies, and “what not to do” live in **[AGENTS.md](./AGENTS.md)**.

---

## Prior art

No maintained tool was found that **migrates already-installed** desktop PWAs **between browsers** on macOS. Related tools solve adjacent problems only:

| Tool | Gap vs this project |
|------|---------------------|
| Fluid, Unite, Coherence X | Create SSBs from a URL; don’t import browser PWAs |
| Nativefier | Electron wrappers, not real browser PWAs |
| PWAsForFirefox | Firefox-only install/management |
| Chrome/Edge `WebAppInstallForceList` | Enterprise deploy, not personal migration |

This project is the **interop layer**: discover → normalize → install via each browser’s native path.

---

## Safety notes

- Default behavior **keeps** source apps. Only `--remove-source` deletes them after success.
- Prefer `--dry-run` before bulk converts.
- Accessibility automation controls UI in Safari/Chromium/Orion; review prompts and cancel if something looks wrong.

---

## Releases

Maintainers can cut a release with the scripted pipeline (GitHub + Homebrew by default; npm optional):

```bash
# Preview (no writes)
npm run release:dry

# Auto-version from conventional commits since last tag, then
# GitHub release + update tariqwest/homebrew-tap
npm run release -- auto -y

# Explicit bump / version
npm run release -- patch -y
npm run release -- 0.2.0 -y

# Also publish to npm
npm run release -- minor --npm -y

# Channels
npm run release -- --github-only
npm run release -- --homebrew-only 0.1.0
npm run release -- --npm-only 0.1.0
```

**Semver heuristic (`auto` or omitted):** since the last `v*` tag — `feat!` / `BREAKING CHANGE` → major, `feat` → minor, otherwise patch.

**Homebrew install (after a release):**

```bash
brew tap tariqwest/tap
brew install pwa-browser-switcher
pwa-switch --help
```

Formula generator only: `npm run formula -- 0.1.0`

---

## License

[MIT](./LICENSE)
