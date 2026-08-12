#!/usr/bin/env -S npx --yes tsx
import { Command } from "commander";
import { writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { detectBrowsers, resolveAlias } from "./browsers/registry.js";
import { scanPwas } from "./discover/scan.js";
import {
  collectAppPaths,
  extractFromAppBundle,
} from "./extract/fromAppBundle.js";
import { installIntoBrowser } from "./install/index.js";
import type { BrowserAlias, ConvertResult, PwaDescriptor } from "./types.js";
import { error, info, out, setLogMode, warn } from "./util/log.js";
import { expandHome } from "./util/paths.js";

const program = new Command();

program
  .name("pwa-switch")
  .description(
    "Convert macOS PWA desktop apps between Safari/Orion, Chromium (Chrome, Edge, Brave, Helium), and Firefox-family browsers",
  )
  .version("0.1.0")
  .option("--json", "JSON output where applicable", false)
  .option("-q, --quiet", "Less logging", false)
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts() as { json?: boolean; quiet?: boolean };
    setLogMode({ json: opts.json, quiet: opts.quiet });
  });

program
  .command("browsers")
  .description("List supported browsers and whether they are installed")
  .action(() => {
    const list = detectBrowsers().map((b) => ({
      alias: b.alias,
      name: b.displayName,
      family: b.family,
      tier: b.tier,
      installed: b.installed,
      appPath: b.appPath ?? null,
      pwaAppDirs: b.pwaAppDirs,
      notes: b.notes ?? null,
    }));
    const root = program.opts() as { json?: boolean };
    if (root.json) {
      out(list);
    } else {
      console.log(
        "Alias".padEnd(12) +
          "Tier".padEnd(6) +
          "Family".padEnd(10) +
          "Installed".padEnd(10) +
          "Name",
      );
      console.log("-".repeat(72));
      for (const b of list) {
        console.log(
          b.alias.padEnd(12) +
            b.tier.padEnd(6) +
            b.family.padEnd(10) +
            (b.installed ? "yes" : "no").padEnd(10) +
            b.name,
        );
        if (b.pwaAppDirs.length) {
          for (const d of b.pwaAppDirs) console.log(`             apps: ${d}`);
        }
      }
    }
  });

program
  .command("scan")
  .description("Discover installed PWA desktop apps on this Mac")
  .option("-b, --browser <alias>", "Filter by source browser alias")
  .argument("[paths...]", "Optional app bundles or folders to scan instead of defaults")
  .action((paths: string[], cmdOpts: { browser?: string }) => {
    const root = program.opts() as { json?: boolean };
    let browser: BrowserAlias | undefined;
    if (cmdOpts.browser) {
      browser = resolveAlias(cmdOpts.browser);
      if (!browser) {
        error(`Unknown browser: ${cmdOpts.browser}`);
        process.exitCode = 1;
        return;
      }
    }
    const expanded = paths.map((p) => expandHome(p));
    const results = scanPwas({
      browser,
      paths: expanded.length ? expanded : undefined,
    });
    if (root.json) {
      out(
        results.map((r) => ({
          name: r.name,
          startUrl: r.startUrl,
          family: r.source.family,
          browser: r.source.browserAlias ?? r.source.browserId,
          appPath: r.source.appPath,
          shortcutId: r.source.shortcutId,
        })),
      );
    } else if (!results.length) {
      console.log("No PWA desktop apps found.");
    } else {
      console.log(`Found ${results.length} PWA app(s):\n`);
      for (const r of results) {
        const src = r.source.browserAlias ?? r.source.browserId;
        console.log(`• ${r.name}`);
        console.log(`    url:    ${r.startUrl || "(unknown)"}`);
        console.log(`    source: ${r.source.family} / ${src}`);
        console.log(`    path:   ${r.source.appPath}`);
      }
    }
  });

program
  .command("export")
  .description("Export PWA descriptors to JSON")
  .requiredOption("-o, --output <file>", "Output JSON file")
  .argument("[paths...]", "App bundles or folders (default: scan all)")
  .action((paths: string[], cmdOpts: { output: string }) => {
    const expanded = paths.map((p) => expandHome(p));
    const results = scanPwas({ paths: expanded.length ? expanded : undefined });
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      apps: results.map(serializeDescriptor),
    };
    writeFileSync(cmdOpts.output, JSON.stringify(payload, null, 2));
    info(`Exported ${results.length} app(s) to ${cmdOpts.output}`);
    if ((program.opts() as { json?: boolean }).json) out(payload);
  });

program
  .command("import")
  .description("Import descriptors from JSON and install into a target browser")
  .requiredOption("-t, --to <browser>", "Target browser alias")
  .option("--dry-run", "Do not install", false)
  .option("--profile <id>", "Firefoxpwa profile id")
  .argument("<file>", "JSON file from `export`")
  .action(async (file: string, cmdOpts: { to: string; dryRun?: boolean; profile?: string }) => {
    const target = resolveAlias(cmdOpts.to);
    if (!target) {
      error(`Unknown target: ${cmdOpts.to}`);
      process.exitCode = 1;
      return;
    }
    if (!existsSync(file)) {
      error(`File not found: ${file}`);
      process.exitCode = 1;
      return;
    }
    const data = JSON.parse(readFileSync(file, "utf8")) as {
      apps: ReturnType<typeof serializeDescriptor>[];
    };
    const results: ConvertResult[] = [];
    for (const raw of data.apps ?? []) {
      const desc = deserializeDescriptor(raw);
      results.push(
        await installIntoBrowser(desc, target, {
          dryRun: cmdOpts.dryRun,
          profile: cmdOpts.profile,
        }),
      );
    }
    printResults(results, (program.opts() as { json?: boolean }).json);
    if (results.some((r) => r.status === "failed")) process.exitCode = 1;
  });

program
  .command("convert")
  .description("Convert one/batch/folder of PWA apps into a target browser")
  .requiredOption("-t, --to <browser>", "Target browser alias")
  .option("--dry-run", "Show what would be done without installing", false)
  .option("--remove-source", "Delete source .app after successful install", false)
  .option("--profile <id>", "Firefoxpwa profile id")
  .option("-y, --yes", "Skip confirmation prompts", false)
  .argument("<paths...>", "App bundle(s) and/or folder(s)")
  .action(
    async (
      paths: string[],
      cmdOpts: {
        to: string;
        dryRun?: boolean;
        removeSource?: boolean;
        profile?: string;
        yes?: boolean;
      },
    ) => {
      const target = resolveAlias(cmdOpts.to);
      if (!target) {
        error(`Unknown target browser: ${cmdOpts.to}`);
        error(
          "Try: safari | stp | orion | chrome | edge | brave | helium | firefox | zen | librewolf",
        );
        process.exitCode = 1;
        return;
      }

      const appPaths: string[] = [];
      for (const p of paths) {
        const exp = resolve(expandHome(p));
        appPaths.push(...collectAppPaths(exp));
      }
      // de-dupe
      const unique = [...new Set(appPaths)];
      if (!unique.length) {
        error("No .app bundles found in the given paths.");
        process.exitCode = 1;
        return;
      }

      const descriptors: PwaDescriptor[] = [];
      for (const app of unique) {
        const d = extractFromAppBundle(app);
        if (!d) {
          warn(`Skipping unrecognized app: ${app}`);
          continue;
        }
        if (!d.startUrl) {
          warn(`Skipping ${d.name}: could not determine start URL (${app})`);
          continue;
        }
        descriptors.push(d);
      }

      if (!descriptors.length) {
        error("No convertible PWA apps found.");
        process.exitCode = 1;
        return;
      }

      info(`Converting ${descriptors.length} app(s) → ${target}${cmdOpts.dryRun ? " (dry-run)" : ""}`);

      const results: ConvertResult[] = [];
      for (const desc of descriptors) {
        info(`→ ${desc.name} (${desc.startUrl})`);
        if (desc.source.browserAlias === target) {
          warn(`  source is already ${target}; reinstalling anyway`);
        }
        const result = await installIntoBrowser(desc, target, {
          dryRun: cmdOpts.dryRun,
          profile: cmdOpts.profile,
        });
        results.push(result);

        if (
          result.status === "success" &&
          cmdOpts.removeSource &&
          !cmdOpts.dryRun &&
          desc.source.appPath
        ) {
          try {
            rmSync(desc.source.appPath, { recursive: true, force: true });
            info(`  removed source ${desc.source.appPath}`);
          } catch (e) {
            warn(`  failed to remove source: ${e}`);
          }
        }
      }

      printResults(results, (program.opts() as { json?: boolean }).json);
      if (results.some((r) => r.status === "failed")) process.exitCode = 1;
    },
  );

function serializeDescriptor(d: PwaDescriptor) {
  return {
    name: d.name,
    startUrl: d.startUrl,
    scope: d.scope,
    display: d.display,
    manifestUrl: d.manifestUrl,
    rawManifest: d.rawManifest,
    source: d.source,
    // iconPath is temp; omit or keep for same-machine use
    iconPath: d.iconPath,
  };
}

function deserializeDescriptor(raw: ReturnType<typeof serializeDescriptor>): PwaDescriptor {
  return {
    name: raw.name,
    startUrl: raw.startUrl,
    scope: raw.scope,
    display: raw.display,
    manifestUrl: raw.manifestUrl,
    rawManifest: raw.rawManifest,
    iconPath: raw.iconPath,
    source: raw.source,
  };
}

function printResults(results: ConvertResult[], json?: boolean): void {
  if (json) {
    out(results);
    return;
  }
  console.log("");
  for (const r of results) {
    const mark =
      r.status === "success"
        ? "✓"
        : r.status === "dry-run"
          ? "·"
          : r.status === "partial"
            ? "!"
            : r.status === "skipped"
              ? "–"
              : "✗";
    console.log(`${mark} [${r.status}] ${r.descriptor.name} → ${r.target}`);
    console.log(`    ${r.message}`);
    if (r.outputPath) console.log(`    path: ${r.outputPath}`);
  }
  const ok = results.filter((r) => r.status === "success" || r.status === "dry-run").length;
  console.log(`\nDone: ${ok}/${results.length} ok-ish, ${results.filter((r) => r.status === "failed").length} failed.`);
}

program.parseAsync(process.argv).catch((e) => {
  error(String(e));
  process.exit(1);
});
