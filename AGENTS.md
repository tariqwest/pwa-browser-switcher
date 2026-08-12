# AGENTS.md

Instructions for **coding agents, bots, and automated assistants** working in this repository.

Human-facing product docs: **[README.md](./README.md)**  
Design history / future notes: **[.agents/plans/pwa-browser-switcher.md](./.agents/plans/pwa-browser-switcher.md)**

---

## Mission

`pwa-browser-switcher` is a **macOS-only CLI** that:

1. Discovers installed PWA / site-specific desktop `.app` bundles  
2. Extracts a canonical descriptor (name, start URL, icon, source family)  
3. Recreates them in a **target browser’s normal PWA location** using best-effort native install paths  

Package name: `pwa-browser-switcher` · CLI bin: **`pwa-switch`**

---

## Hard constraints

| Rule | Detail |
|------|--------|
| **macOS only (v1)** | Do not add Windows/Linux installers unless explicitly scoped |
| **No compile-to-JS required** | Ship TS via `bin/pwa-switch.mjs` + runtime `tsx`; do not introduce a mandatory `tsc` emit for the published bin |
| **No session migration** | Never claim to migrate cookies, localStorage, SW caches, or push |
| **Don’t invent Safari registration** | Hand-built Safari web apps without Launch Services registration **fail**. Prefer Safari Add to Dock automation (or documented future APIs) |
| **Don’t only rewrite Chromium plists** | Copying `.app` + changing `CrBundleIdentifier` without Web Applications registration is insufficient |
| **Source apps stay by default** | Only delete with explicit `--remove-source` after **success** |
| **No exploits / malware** | No payloads, no attacking systems; local tooling only |

---

## Runtime & entrypoints

| How | Command |
|-----|---------|
| **Published Node entry (preferred)** | `node bin/pwa-switch.mjs <args>` |
| npm script | `npm start -- <args>` |
| Bun (dev) | `bun src/cli.ts <args>` |
| tsx direct | `npx tsx src/cli.ts <args>` |
| Tests | `bun test` or `npm test` |
| Types | `npm run typecheck` (`tsc --noEmit`) |

**Bin contract:**

- `package.json` → `"bin": { "pwa-switch": "./bin/pwa-switch.mjs" }`
- Launcher resolves **`tsx` from this package** (`createRequire(import.meta.url)`), then  
  `node --import <tsx-loader> src/cli.ts …`
- `tsx` is a **dependency** (not only devDependency)
- `"files"` must include **`bin/`** and **`src/`** for publish

Do not switch the bin to raw `src/cli.ts` with `npx tsx` shebangs for production; the `.mjs` launcher is intentional for global/npx installs.

---

## Architecture (mental model)

```
paths (.app / folder / scan defaults)
        │
        ▼
  extract/fromAppBundle  →  PwaDescriptor
        │
        ▼
  install/index  →  family adapter
        │
        ├─ chromium  (UI / --app fallback)
        ├─ safari    (Add to Dock AppleScript; also stp)
        ├─ orion     (Install Site as App)
        └─ firefox   (firefoxpwa CLI)
```

| Path | Role |
|------|------|
| `src/types.ts` | `PwaDescriptor`, aliases, tiers |
| `src/browsers/registry.ts` | Bundle IDs, app names, PWA dirs, Application Support roots, tiers |
| `src/discover/scan.ts` | Default locations + optional path list |
| `src/extract/fromAppBundle.ts` | Classify + parse Info.plist |
| `src/extract/manifest.ts` | Fetch `rel=manifest` / enrich descriptor |
| `src/install/*.ts` | Per-family install |
| `src/cli.ts` | Commander commands |
| `src/util/*` | plist, icon, applescript, paths, log |

**Canonical descriptor fields that matter for convert:** `name`, `startUrl`, optional `scope` / `manifestUrl` / `iconPath`, `source.{family,browserAlias,browserId,appPath,shortcutId}`.

---

## Browser registry rules

First-class targets (keep in sync with README):

- **WebKit:** `safari`, `stp`, `orion`
- **Chromium:** `chrome`, `edge`, `brave`, `helium` (Helium is first-class by product choice, not market-share alone)
- **Firefox:** `firefox`, `zen`, `librewolf` (via firefoxpwa; Zen/LibreWolf may need custom runtime docs)

Tiers: `A` / `A'` / `B` in `BrowserDefinition.tier`.

When adding a browser:

1. Extend `BROWSER_DEFINITIONS` in `registry.ts`  
2. Add alias mapping in `resolveAlias`  
3. Ensure discover can find its PWA dir **or** generic `*Apps.localized` still picks it up  
4. Route install via existing family adapter or add a thin adapter  
5. Update README + this file  

Verified Helium bundle id: **`net.imput.helium`**.

---

## Install strategy notes (do not “simplify” casually)

### Chromium

- Primary: AppleScript UI (Install / Create shortcut / Cast-save-share menus)  
- Fallback: `open -na <Browser> --args --app=<url>`  
- Optional future: temporary `WebAppInstallForceList` (policy apps can be hard to uninstall)  
- Profile data under Application Support is often **TCC-protected**; prefer reading **app bundles** for extract  

### Safari / STP

- Requires macOS 14+  
- AppleScript: open URL → **File → Add to Dock** → set name → Add  
- Success indicator: `~/Applications/<Name>.app` with `LSTemplateApplication` / `com.apple.Safari.WebApp.*`  

### Orion

- `~/Applications/Orion/WebApps/`  
- Tools → Install This Site as an App  

### Firefox family

- Requires `firefoxpwa` on `PATH` for real install  
- Dry-run may still resolve manifest URL without the CLI present  
- `firefoxpwa site install <manifest-url> --name …`  
- Non-manifest sites: fail clearly; don’t invent fake manifests unless product asks  

### Future (pinned, not v1)

Declarative / non-GUI install research is parked in the plan doc:

- Firefox already declarative via firefoxpwa  
- Chromium: force-list / profile surgery (fragile)  
- Safari: **no** public Shortcuts “create web app” action as of last research  
- Possible later: `--strategy declarative|ui|auto`  

Do not spend a large refactor on this unless the user un-pins it.

---

## CLI surface (keep stable)

| Command | Purpose |
|---------|---------|
| `browsers` | Detect installed targets |
| `scan` | List PWAs (`--browser`, optional paths) |
| `convert` | `--to` required; `--dry-run`, `--remove-source`, `--profile` |
| `export` | `-o` JSON |
| `import` | JSON → `--to` |

Global: `--json`, `--quiet`.

Exit non-zero if any convert/import result is `failed`.

---

## Testing & verification

```bash
bun test
npm run typecheck
node bin/pwa-switch.mjs browsers
node bin/pwa-switch.mjs scan
node bin/pwa-switch.mjs convert <app> --to <target> --dry-run
```

- Unit tests live under `tests/unit/`; prefer **fixtures** (temp plists), not the user’s real `~/Applications` for CI-style tests  
- Live UI conversion needs Accessibility; may hang or fail in headless/agent environments without it  
- When reporting success of a Safari convert, verify plist keys (`LSTemplateApplication`, `Manifest.start_url`) not only file existence  

---

## Coding conventions

- **TypeScript**, ESM (`"type": "module"`), imports use `.js` extensions in TS sources (NodeNext/bundler resolution)  
- Prefer small modules; keep installers family-scoped  
- Use `src/util/log.ts` for user-facing stderr progress; keep `--json` stdout clean for machine output  
- Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, with optional scopes (`feat(install):`, `feat(cli):`)  
- Avoid drive-by refactors and unrelated file edits  
- Do not commit `node_modules/`, secrets, or user PWA data  

---

## Git & GitHub

- Default branch: `main`  
- Remote (if present): `https://github.com/tariqwest/pwa-browser-switcher`  
- Prefer `gh` for GitHub operations when available  
- Never force-push `main` unless the user explicitly requests it  
- Never update git config  

## Releases

Use **`scripts/release.mjs`** (see `npm run release -- --help`).

| Default | Channel |
|---------|---------|
| On | GitHub tag + `gh release create` |
| On | Homebrew formula → `tariqwest/homebrew-tap` (`Formula/pwa-browser-switcher.rb`) |
| Off | npm (`--npm` to enable) |

Versioning:

- Omitted / `auto` → conventional-commit heuristic since last `v*` tag  
- `patch` \| `minor` \| `major` \| pre* → explicit bump  
- `1.2.3` → pin  

Related: `scripts/generate-homebrew-formula.mjs` (`npm run formula`).

Release requires a **clean** working tree (unless `--dry-run`). Do not release with uncommitted WIP unless the user asks to commit first.

---

## Safe change checklist

Before finishing a task:

1. [ ] Still macOS-scoped (or documented exception)  
2. [ ] Bin still works: `node bin/pwa-switch.mjs --help`  
3. [ ] `bun test` / relevant checks pass  
4. [ ] README / AGENTS updated if user-visible CLI or browser support changed  
5. [ ] No accidental `--remove-source` defaults  
6. [ ] Safari/Chromium install paths still go through real registration mechanisms  

---

## What not to build (unless asked)

- Cross-platform ports  
- GUI app  
- Cookie/session transfer  
- Mandatory Webpack/tsc dist pipeline for the CLI  
- Fake Safari TemplateApp bundles without LS registration  
- Silent Chromium force-install as the only path without documenting uninstall caveats  

---

## Quick map for common agent tasks

| User ask | Likely touch points |
|----------|---------------------|
| New browser alias | `registry.ts`, README, maybe install router |
| Better scan | `discover/scan.ts`, `extract/fromAppBundle.ts` |
| Safari install flaky | `install/safari.ts`, `util/applescript.ts` |
| Chromium install flaky | `install/chromium.ts` |
| Firefox/manifest | `install/firefox.ts`, `extract/manifest.ts` |
| CLI flags | `cli.ts`, README |
| Packaging / node entry | `bin/pwa-switch.mjs`, `package.json` `bin`/`files`/`dependencies` |
