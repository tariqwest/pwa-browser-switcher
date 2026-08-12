# Plan: PWA Browser Switcher (macOS)

> **Canonical copy:** [`.agents/plans/pwa-browser-switcher.md`](../../../../Developer/pwa-browser-switcher/.agents/plans/pwa-browser-switcher.md) in the repo.

## Goal

Build a **CLI tool** that takes one, a batch, or a folder of installed PWA / site-specific desktop apps on macOS, extracts their identity (name, URL, icon, scope), and **re-creates them in a preferred browser** in that browser’s normal PWA app location.

**Scope (v1):** macOS only · three engine families · **top 3 browsers per family as first-class targets**, plus **Helium** as an explicit Chromium first-class target (see below). Generic Chromium detection remains for other forks as best-effort.

**Stack (per product choice):** TypeScript on **Bun** for development; **Node + `tsx` entrypoint** so production can run TypeScript without a separate compile-to-JS step. Optional later: `tsc` emit or `bun build` binary.

---

## Target browsers: top 3 per family (macOS) + Helium

First-class v1 support is scoped to the **three most relevant/popular browsers in each engine family on macOS**, **plus Helium** as an explicit Chromium first-class target (product requirement; privacy-focused Chromium already on the dev machine). Popularity draws from global/desktop market share (StatCounter-class data: Chrome ≫ Edge ≫ others; Safari dominates Mac) plus macOS-specific adoption for privacy/alt browsers (Brave, Helium, Orion, Zen, LibreWolf).

| Family | Rank | Browser | Why | Bundle ID / notes (typical) |
|--------|------|---------|-----|-----------------------------|
| **WebKit** | 1 | **Safari** | Default Mac browser; native web apps (Sonoma+) | `com.apple.Safari` |
| **WebKit** | 2 | **Orion** | Leading third-party WebKit browser on Mac; first-class “Install as App” | `com.kagi.kagimacOS` (verify on device) |
| **WebKit** | 3 | **Safari Technology Preview** | Only other widely used WebKit host with Apple’s web-app machinery; developer-adjacent but real installs | `com.apple.SafariTechnologyPreview` |
| **Chromium** | 1 | **Google Chrome** | Dominant share; reference Chromium PWA implementation | `com.google.Chrome` → `~/Applications/Chrome Apps.localized` |
| **Chromium** | 2 | **Microsoft Edge** | #2 desktop Chromium by share; same app-mode / policy install surface | `com.microsoft.edgemac` → Edge Apps.localized |
| **Chromium** | 3 | **Brave** | Top privacy Chromium on Mac; large PWA user base (local fixtures already present) | `com.brave.Browser` → `Brave Browser Apps.localized` |
| **Chromium** | + | **Helium** | Explicit first-class target (not market-share top-3); ungoogled-style Chromium with normal PWA install; support data under `~/Library/Application Support/net.imput.helium`; binary `/Applications/Helium.app` | Verify bundle id (e.g. `net.imput.helium` / similar) → Helium Apps.localized when present |
| **Firefox (Gecko)** | 1 | **Firefox** | Primary Gecko browser | `org.mozilla.firefox` + **PWAsForFirefox** |
| **Firefox (Gecko)** | 2 | **Zen Browser** | Most popular modern Firefox-based daily driver on Mac right now | Zen bundle ID; `firefoxpwa` custom runtime and/or Zen-specific paths |
| **Firefox (Gecko)** | 3 | **LibreWolf** | Most established privacy Firefox fork on desktop/Mac | LibreWolf bundle ID; `firefoxpwa` with LibreWolf runtime (documented upstream) |

### Tiering

- **Tier A (must work well in v1):** Safari, Chrome, Edge, Brave, **Helium**, Firefox, Orion — primary migrate-to/from set when switching default browsers.
- **Tier A′ (same adapters, explicit IDs):** Safari Technology Preview (Safari adapter), Zen + LibreWolf (Firefox/`firefoxpwa` adapter with runtime/profile overrides).
- **Tier B (best-effort / generic):** Other Chromium forks (Arc/Dia, Opera, Vivaldi, Chromium, ungoogled-chromium, …) via the shared Chromium discover/install path when `* Apps.localized` + `CrAppMode*` plists match.

### CLI target aliases (v1)

```
--to safari | stp | orion
--to chrome | edge | brave | helium
--to firefox | zen | librewolf
# Tier B examples (optional flags, same chromium installer):
--to chromium | opera | vivaldi   # if detected
```

`pwa-switch browsers` lists installed Tier A/A′/B browsers with family, path, and support tier.

### Family notes tied to top-3 (+ Helium)

- **WebKit:** Only Safari (and STP) use Apple’s `LSTemplateApplication` / `Web App.app` path. Orion uses its own WebApps directory and install UI — separate adapter, same family for user mental model. There is no meaningful fourth WebKit PWA host on macOS today.
- **Chromium:** Chrome, Edge, Brave, and **Helium** all use (or should use) standard `app_mode_loader` + `CrAppModeShortcutURL` shortcuts; install strategy is shared, with per-browser paths, bundle IDs, and Application Support roots in `browsers/registry.ts`. Helium is a first-class registry entry and CI/dev validation target (installed on the authoring machine).
- **Firefox:** None of the top 3 ship complete first-class desktop PWA install comparable to Chrome/Safari. v1 standardizes on **PWAsForFirefox** (`firefoxpwa site install`), with optional runtime pointing at Firefox / Zen / LibreWolf per upstream docs. If Zen gains a native install path later, add a thin adapter without dropping `firefoxpwa`.

---

## Prior-art review (does this already exist?)

### Direct competitors: **none found**

No maintained tool was found that **migrates or converts already-installed PWA desktop apps between browsers** on macOS (extract → recreate in target browser’s PWA store).

Searches covered GitHub topics, “migrate/convert/transfer PWA”, Chrome Apps ↔ Brave/Edge, Safari web apps deployment, and SSB tooling. Closest hits are **installers**, not **migrators**.

### Related tools (create PWAs/SSBs; do not migrate between browsers)

| Tool | What it does | Gap vs this project |
|------|----------------|---------------------|
| **Fluid**, **Unite**, **Coherence X** | Create macOS SSBs from a URL | New apps only; proprietary/own engine; no import of existing browser PWAs |
| **Nativefier** / Electron wrappers | Wrap a site as an Electron app | Not a real browser PWA; different runtime |
| **chromeless**, **chrome-ssb-osx**, Fluid-style scripts | Generate Chromium app-mode shortcuts | Create-from-URL only; no multi-family conversion |
| **PWAsForFirefox** (`firefoxpwa`) | Install/manage Firefox PWAs (CLI + extension) | Firefox-only install; no import from Chrome/Safari apps |
| **Chrome/Edge `WebAppInstallForceList`** | Enterprise silent install of URL list | Policy-based deploy, not user migration; force-installed apps often non-uninstallable by user |
| **PWABuilder / pwa-install** | Help *sites* become installable | Dev-side, not user desktop migration |

### Conclusion

**Greenfield is justified.** Value is the **interop layer**: discover installed app bundles → normalize metadata → install via each family’s real mechanism into the correct on-disk location.

---

## How PWAs live on macOS (implementation facts)

### Chromium family — Chrome, Edge, Brave, Helium (+ generic Tier B)

Observed on this machine (**Brave** PWAs; **Helium** browser installed):

- **App location:** `~/Applications/<Browser Name> Apps.localized/*.app`
  - Example: `~/Applications/Brave Browser Apps.localized/Gmail.app`
  - Chrome: `Chrome Apps.localized`; Edge: analogous Edge Apps folder; Helium: discover actual Apps.localized name once a PWA is installed (may mirror Chromium naming)
- **Bundle contents:** `app_mode_loader` binary, `app.icns`, `Info.plist`
- **Critical plist keys:**
  - `CrAppModeShortcutURL` — launch URL
  - `CrAppModeShortcutName` — display name
  - `CrAppModeShortcutID` — app id (32-char hex)
  - `CrBundleIdentifier` — host browser (e.g. `com.brave.Browser`, `com.google.Chrome`, `com.microsoft.edgemac`, Helium’s id)
  - `CrAppModeUserDataDir` — profile web-app data path
- **Profile registry:** `~/Library/Application Support/<Vendor>/<Product>/<Profile>/Web Applications/` (Manifest Resources, LevelDB, icons). A bare `.app` copy is **not** enough; the host browser must register the web app.
- **Helium data root (observed):** `~/Library/Application Support/net.imput.helium`
- **Registry entries (first-class):** map Chrome / Edge / Brave / **Helium** to app dir name, Application Support root, and executable path. Tier B browsers (Opera, Vivaldi, …) use the same shape when detected.

### WebKit family — top 3: Safari, Orion, Safari Technology Preview

**Safari / STP web apps (macOS Sonoma+):**

- **App location:** `~/Applications/<Name>.app` (user Applications, not system)
- **No executable in the bundle** — Launch Services template app (`LSTemplateApplication`); runs via system `Web App.app` cryptex
- **Plist:** `CFBundleIdentifier` = `com.apple.Safari.WebApp.<…UUID…>` (STP may use a parallel id — verify in spike), embedded `Manifest` dict (`start_url`, `scope`, `name`, icons, `display`)
- **Constraint:** Hand-crafted bundles without Launch Services registration **fail to launch** (Eclectic Light / reverse-engineering reports). Creation must go through Safari/STP’s install path or LS template registration.
- **Container:** `~/Library/Containers/com.apple.Safari.WebApp/`
- **STP:** Same user flow (Add to Dock) when STP is the host; separate app id in automation (`Safari Technology Preview` process name)

**Orion (WebKit #2):**

- **Install UI:** Tools → Install This Site as an App
- **App location:** `~/Applications/Orion/WebApps/`
- Separate adapter from Safari (paths + menus differ); still family=webkit for scanning/CLI grouping.

### Firefox family — top 3: Firefox, Zen, LibreWolf

- Stock Firefox / forks: historically **no** first-class desktop PWA install comparable to Chrome/Safari (SSB work was dropped; native revival incomplete on macOS).
- **Practical path for all three:** [PWAsForFirefox](https://github.com/filips123/PWAsForFirefox) — CLI:
  - `firefoxpwa site install <MANIFEST-URL> [--name …] [--profile …]`
  - Apps land under `~/Applications`; data under `~/Library/Application Support/firefoxpwa/`
- **Per-browser runtime:**
  - **Firefox:** default `firefoxpwa` runtime
  - **LibreWolf:** upstream-documented custom runtime install into firefoxpwa runtime dir
  - **Zen:** custom runtime or profile notes if compatible; mark experimental until validated; if Zen ships native web apps later, add adapter without removing `firefoxpwa`

---

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Interface | **CLI-first** |
| Install strategy | **Best-effort native install** (real browser install paths) |
| Language | **TypeScript / Bun** + **Node/`tsx` entry** for production without compile step |
| Family coverage | **All three families in v1** (equal priority) |
| Named targets | **Top 3 per family + Helium** (10 first-class): Safari/Orion/STP · Chrome/Edge/Brave/**Helium** · Firefox/Zen/LibreWolf |
| Platform | **macOS only** for now |

---

## Architecture

```
                    ┌─────────────────────────────────────┐
  .app / folder ──► │  Discover + classify source family  │
  batch paths       └──────────────┬──────────────────────┘
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  Extract canonical PwaDescriptor    │
                    │  { name, startUrl, scope?, icon,    │
                    │    source, rawManifest?, appId? }   │
                    └──────────────┬──────────────────────┘
                                   ▼
                    ┌─────────────────────────────────────┐
                    │  Resolve target browser + adapter   │
                    └──────────────┬──────────────────────┘
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼                       ▼
    ChromiumInstaller       Safari/OrionInstaller    FirefoxInstaller
    (policy / CDP /         (AppleScript +           (firefoxpwa CLI
     UI automation)          LS-aware flow)           + manifest URL)
           │                       │                       │
           └───────────────────────┴───────────────────────┘
                                   ▼
                    Write to browser’s standard PWA location
                    + report success / partial / failed
```

### Canonical model

```ts
type BrowserFamily = "chromium" | "webkit" | "firefox";

interface PwaDescriptor {
  name: string;
  startUrl: string;
  scope?: string;
  iconPath?: string;       // extracted .icns or PNG
  display?: string;
  source: {
    family: BrowserFamily;
    browserId: string;     // e.g. com.brave.Browser
    appPath: string;
    shortcutId?: string;   // Chromium CrAppModeShortcutID
  };
  manifestUrl?: string;    // if discovered (needed for firefoxpwa)
  rawManifest?: Record<string, unknown>;
}
```

### Package layout (proposed)

```
pwa-browser-switcher/
  package.json          # "type": "module", bin entry
  tsconfig.json
  README.md
  src/
    cli.ts              # entry (commander/yargs)
    types.ts
    discover/
      scan.ts           # known locations + classify
      chromium.ts
      safari.ts
      orion.ts
      firefoxpwa.ts
    extract/
      fromAppBundle.ts  # plist + icon
      manifest.ts       # fetch web app manifest from startUrl
    install/
      chromium.ts
      safari.ts
      orion.ts
      firefox.ts
    browsers/
      registry.ts       # installed browsers, paths, bundle IDs
    util/
      plist.ts
      icon.ts
      paths.ts
      applescript.ts
      log.ts
  tests/
    fixtures/           # sample Info.plists (sanitized)
    unit/
```

### CLI surface (v1)

```bash
# Discover everything known on this Mac
pwa-switch scan
pwa-switch scan --browser brave

# Convert one app, batch, or folder
pwa-switch convert ~/Applications/Brave\ Browser\ Apps.localized/Gmail.app --to chrome
pwa-switch convert ~/Applications/Brave\ Browser\ Apps.localized --to helium
pwa-switch convert ./export-folder --to safari --dry-run

# Explicit targets — top 3 per family + Helium (Tier A / A′)
pwa-switch convert <paths...> --to safari|stp|orion
pwa-switch convert <paths...> --to chrome|edge|brave|helium
pwa-switch convert <paths...> --to firefox|zen|librewolf

# List supported browsers detected on machine (tier + family)
pwa-switch browsers

# Optional: export intermediate JSON (portable descriptor list)
pwa-switch export <paths...> -o apps.json
pwa-switch import apps.json --to safari
```

Flags: `--dry-run`, `--keep-source` / `--remove-source`, `--yes`, `--name-prefix`, `--profile` (Firefox family), `--json` output.

---

## Install adapters (best-effort native)

### 1. Any → Chromium first-class (Chrome, Edge, Brave, Helium) [+ Tier B]

**Validate install path on all four Tier A Chromium targets** (not only Brave). Helium is a required validation target on the authoring machine.

1. Extract `name`, `startUrl`, icon from source.
2. Optionally resolve / fetch `manifest.json` from the site for better icons/names.
3. Install into target via one of (in preference order):
   - **A. Temporary `WebAppInstallForceList`-style prefs** written into the target profile (or managed prefs), restart/launch browser long enough to install, then **remove the policy** so apps remain user-uninstallable if possible. **Chrome and Edge** document this policy; **Brave** and **Helium** need explicit spikes (Chromium policy keys often work with caveats; Helium may strip/disable some enterprise policy surfaces).
   - **B. Chrome DevTools Protocol / remote debugging:** open URL, trigger install if installability is available. Fragile across UIs; test per browser.
   - **C. AppleScript UI automation:** open site → More tools → Create shortcut / Install → Open as window. Per-browser menu wording may differ (Brave vs Chrome vs Edge vs Helium); keep script tables in `install/chromium-ui.ts`.

**Do not** only rewrite `CrBundleIdentifier` on a copied `.app` without registering in the target’s Web Applications store — launches will break or attach to the wrong browser.

**Placement:** target browser creates `~/Applications/<Chrome|Edge|Brave|Helium …> Apps.localized/<Name>.app`.

### 2. Any → Safari / Safari Technology Preview

1. Require macOS 14+ for web apps.
2. AppleScript / Shortcuts automation against **Safari** or **Safari Technology Preview** (process name + bundle id from registry):
   - Open `startUrl` in the chosen host
   - Invoke **File → Add to Dock** (or Share → Add to Dock)
   - Set name when the sheet appears
3. Verify `~/Applications/<Name>.app` exists and `LSTemplateApplication` is set.
4. Research spike: private Launch Services “TemplateApp” APIs without UI (likely unstable) — optional future.

**Limitation:** cookie/session migration is browser-internal; converted apps typically require re-login.

### 3. Any → Orion

1. AppleScript: open URL in Orion → Tools → Install This Site as an App.
2. Confirm output under `~/Applications/Orion/WebApps/`.
3. Fallback: stable on-disk format only if launches succeed without Tools menu (spike).

### 4. Any → Firefox / Zen / LibreWolf

1. Detect `firefoxpwa` on `PATH`; if missing, print install instructions (Homebrew / project docs).
2. Resolve **manifest URL** from page HTML (`link rel="manifest"`). Non-manifest sites: clear error or extension-assisted guidance.
3. `firefoxpwa site install <manifestUrl> --name "…"` with runtime/profile notes:
   - Firefox: default runtime
   - LibreWolf: follow upstream custom-runtime steps
   - Zen: experimental; document required runtime layout after spike
4. Verify app appears under `~/Applications` and is listed by `firefoxpwa profile list` / site list.

---

## Discovery algorithm

Known roots to scan (expandable registry; prioritize top-3 hosts):

| Source | Paths |
|--------|--------|
| Chromium apps (Chrome, Edge, Brave, Helium, …) | `~/Applications/*Apps.localized/*.app` |
| Safari / STP web apps | `~/Applications/*.app` with `LSTemplateApplication` / `com.apple.Safari.WebApp` |
| Orion | `~/Applications/Orion/WebApps/*.app` |
| Firefox / Zen / LibreWolf via firefoxpwa | `~/Applications` + `~/Library/Application Support/firefoxpwa` metadata if present |

`browsers/registry.ts` hard-codes Tier A/A′ bundle IDs, app-dir names, and Application Support roots for the **ten** named browsers (9 market top-3 + Helium); Tier B Chromium is discovered by folder naming + `CrAppMode*` plists.

Classification order: Orion path → Chromium Apps.localized + `CrAppMode*` keys → Safari template/WebApp id → Firefoxpwa markers → unknown (skip with warning).

Folder input: recurse one level for `.app` bundles; ignore non-apps.

---

## Permissions & UX notes

- Reading `~/Library/Application Support/<browser>/` may require **Full Disk Access** for the terminal app (TCC). Prefer **reading only app bundles** for extract when possible; only touch profile data when needed for install verification.
- Automation of Safari/Orion needs **Accessibility** permission for System Events.
- Never delete source apps unless `--remove-source` is explicit.
- Dry-run prints planned descriptors and target paths without side effects.

---

## Implementation phases

### Phase 0 — Repo bootstrap

- Init package: Bun + TypeScript, dual-friendly scripts:
  - `"bin": { "pwa-switch": "./src/cli.ts" }` with shebang `#!/usr/bin/env -S npx tsx` or `bun`
  - `package.json` scripts: `dev` (bun), `start` (tsx), `test`
- ESLint/prettier optional light setup
- README: problem statement, prior-art summary, install, macOS permissions

### Phase 1 — Discover + extract (no install)

- Browser registry for **all 10 first-class targets** (top-3 × 3 families + Helium; detect installed + paths + support tier)
- Scan + classify + extract from Chromium / Safari / Orion / firefoxpwa apps
- Icon extract (`.icns` → PNG for intermediate storage)
- CLI: `scan`, `export`, `browsers`
- Unit tests with fixture plists (Brave Gmail-like, Safari Manifest-like)

### Phase 2 — Chromium installer (Chrome, Edge, Brave, Helium)

- Spike A/B/C install methods on **Chrome, Edge, Brave, and Helium** (dev machine has Brave + Helium; install Chrome/Edge as needed)
- Implement primary method + fallback; registry-driven paths including Helium’s Application Support root
- CLI: `convert --to chrome|edge|brave|helium` (+ optional Tier B aliases)
- Integration tests: Brave → Helium and Brave → Chrome (or reverse), launchable app

### Phase 3 — WebKit installers (Safari, STP, Orion)

- AppleScript for Safari **and** Safari Technology Preview Add to Dock
- AppleScript for Orion Install Site as App
- Timeouts, name collision handling, verification
- CLI: `--to safari|stp|orion`

### Phase 4 — Firefox-family installer (Firefox, Zen, LibreWolf)

- Wrap `firefoxpwa`; manifest discovery from `startUrl`
- Runtime notes/flags for LibreWolf and Zen
- Clear errors if runtime/extension not set up
- CLI: `--to firefox|zen|librewolf`

### Phase 5 — Polish

- Batch progress, JSON output, exit codes
- Collision policy (skip / rename / overwrite prompt)
- `--remove-source` safety
- Document known limitations (sessions, non-installable sites, policy quirks)
- README table of top-3-per-family support matrix

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Safari apps need LS registration | Prefer AppleScript install; never ship “fake” unregistered bundles as complete |
| Chromium silent install API undocumented | Spike force-list vs CDP vs UI on **Chrome, Edge, Brave, Helium**; pluggable installers |
| Force-list apps hard to uninstall | Prefer temporary policy or UI install; document if permanent |
| Brave / Edge / Helium policy quirks vs Chrome | Validate each first-class Chromium target; UI fallback per browser |
| Helium may omit enterprise policy hooks | Prefer UI/CDP install for Helium if force-list is no-op |
| Sites without manifest (Firefox family) | Manifest fetch + clear firefoxpwa error; optional guided install |
| TCC / FDA / Accessibility | Document; fail with actionable messages |
| Browser UI changes break AppleScript | Per-browser script tables; version-detect; fallback messages |
| Zen / LibreWolf runtime setup | Document firefoxpwa custom runtime; mark Zen experimental until validated |
| STP vs Safari web-app differences | Verify process names / bundle ids in Phase 3 spike |
| Icon / name fidelity | Prefer source icon; fall back to favicon/manifest icons |

---

## Out of scope (v1)

- Windows / Linux
- Migrating cookies, localStorage, service-worker caches, or push subscriptions
- Electron/Nativefier/Fluid apps as sources (may detect and refuse with message)
- GUI
- Changing the **system default browser** (only PWA desktop apps)
- Code-signing notarized distribution (local CLI is enough initially)

---

## Success criteria

1. Prior-art conclusion documented in README (no direct migrator found).
2. README + `pwa-switch browsers` document the **top-3-per-family + Helium** matrix (10 named targets + Tier B).
3. `pwa-switch scan` lists real Brave PWAs on a machine with `Brave Browser Apps.localized`.
4. Convert Chromium PWA between **at least two of** Chrome / Edge / Brave / **Helium** with a launchable app (prefer including Helium in one path).
5. Convert at least one PWA → **Safari** web app (Sonoma+) via automation; STP path implemented if STP is installed.
6. Convert at least one site with a web manifest → **Firefox** via `firefoxpwa`; CLI accepts `zen` and `librewolf` targets with documented runtime setup.
7. Orion install path works when Orion is installed (`~/Applications/Orion/WebApps/`).
8. Batch/folder input works; dry-run does not mutate disk.
9. Runs via Bun in dev and `node --import tsx` / `tsx` in production-style invocation without a separate emit step.

---

## First spike tasks (when implementation starts)

1. Scaffold package + CLI stub + browser registry for 10 first-class targets (incl. Helium).
2. Implement Chromium `.app` extractor against local Brave fixtures.
3. Time-box Chromium install spike on **Brave + Helium** (add Chrome/Edge when available): force-list vs automation.
4. Confirm Helium bundle id, Apps.localized folder name, and profile Web Applications path after installing one test PWA.
5. Time-box Safari Add to Dock AppleScript spike; note STP process name.
6. Time-box Orion install automation if Orion is available.
7. Wire `firefoxpwa site install` for Firefox; sketch LibreWolf/Zen runtime docs.

---

## Open implementation details (resolve during spikes, not blockers)

- Exact Chromium install path chosen after Phase 2 spike (force-list vs UI) — must work for Chrome, Edge, Brave, and Helium.
- Helium: exact `CFBundleIdentifier`, Apps folder name, and whether force-list policies apply.
- Whether Orion supports any non-UI install format.
- Zen vs LibreWolf: separate adapters vs shared `firefoxpwa` + runtime flag only.
- Safari Technology Preview: identical web-app on-disk format vs Safari-only quirks.

---

## Future exploration (pinned)

### Declarative / non-GUI install (no osascript)

**Status:** Parked idea — not v1 priority. v1 uses best-effort native install with AppleScript/UI where needed (Safari Add to Dock, Chromium Install menus). Revisit when hardening install reliability or reducing Accessibility TCC requirements.

**Question:** Can we create and register target PWAs **declaratively** (or via browser/OS APIs) instead of driving menus with `osascript`?

**Family sketch (research so far):**

| Family | Declarative path? | Notes |
|--------|-------------------|--------|
| **Firefox / Zen / LibreWolf** | **Yes today** | `firefoxpwa site install <manifest-url>` — already non-GUI |
| **Chromium** | **Partial / unofficial** | `WebAppInstallForceList` (enterprise; apps often non-uninstallable); optional profile `Web Applications` + LevelDB surgery (fragile); no public `installPWA(url)` API; CDP still product automation |
| **Safari / STP** | **No public API** | Bundles need Launch Services TemplateApp registration; hand-crafted `.app` without LS fails to launch; Add to Dock remains the supported creation path |
| **Orion** | **Unknown** | Spike non-UI format if one exists |

**Possible product follow-ups (when un-pinned):**

- `--strategy declarative|ui|auto` — prefer force-list / `firefoxpwa` first; fall back to UI only when required
- Temporary Chromium force-list install + policy teardown (validate uninstallability)
- Re-check each macOS major for Shortcuts / public “Add to Dock” / LS TemplateApp APIs
- Document “guided mode” for Safari (open URL + instruct user) as a no-Accessibility middle ground

**Why it matters:** Removes Accessibility permission dependency for some targets; more CI/script-friendly; less breakage when browser menus change.
