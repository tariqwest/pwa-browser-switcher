#!/usr/bin/env node
/**
 * Release pwa-browser-switcher: version bump, GitHub release, Homebrew tap,
 * and optionally npm.
 *
 * Defaults:
 *   - GitHub release: on
 *   - Homebrew formula → tariqwest/homebrew-tap: on
 *   - npm publish: off (pass --npm to enable)
 *   - Version: auto from conventional-commit heuristic when omitted
 *
 * Usage:
 *   node scripts/release.mjs [version|bump|auto] [options]
 *   npm run release -- [version|bump|auto] [options]
 *
 * Version argument:
 *   (omitted) | auto   Conventional-commit heuristic since last tag
 *                      (feat!/BREAKING → major, feat → minor, else patch)
 *   patch|minor|major|prepatch|preminor|premajor|prerelease
 *   1.2.3 | v1.2.3     Explicit semver
 *
 * Examples:
 *   npm run release -- --dry-run
 *   npm run release -- auto -y
 *   npm run release -- patch
 *   npm run release -- 0.2.0 --npm
 *   npm run release -- minor --no-homebrew
 *   npm run release -- --npm-only 0.1.1
 *   npm run release -- --homebrew-only 0.1.0
 *
 * Options:
 *   --github / --no-github     Create GitHub release (default: on)
 *   --npm / --no-npm           Publish to npm (default: off)
 *   --homebrew / --no-homebrew Update Homebrew formula (default: on)
 *   --github-only              GitHub only
 *   --npm-only                 npm only
 *   --homebrew-only            Homebrew only
 *   --tap OWNER/NAME           Homebrew tap (default: tariqwest/homebrew-tap)
 *   --dry-run                  Print actions; no git/npm/GitHub/tap writes
 *   --skip-checks              Skip typecheck + tests
 *   --skip-push                Local tag/commit only (disables Homebrew)
 *   --draft                    Draft GitHub release
 *   --prerelease               Mark GitHub release as prerelease
 *   --yes, -y                  Skip confirmation
 *   --notes-file PATH          Release notes from file
 *   --generate-notes           gh auto notes (default when no notes file)
 *   --no-generate-notes        Disable auto notes
 *   --title TEXT               Release title (default: vX.Y.Z)
 *   --otp CODE                 npm OTP
 *   --tag-prefix STR           Tag prefix (default: v)
 *   --help, -h
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const FORMULA_NAME = "pwa-browser-switcher.rb";
const FORMULA_CLASS_DEFAULT = "PwaBrowserSwitcher";
const FORMULA_BREW_NAME = "pwa-browser-switcher";

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const BUMP_KINDS = new Set([
  "patch",
  "minor",
  "major",
  "prepatch",
  "preminor",
  "premajor",
  "prerelease",
]);

function usage(exitCode = 0) {
  const text = fs.readFileSync(fileURLToPath(import.meta.url), "utf8");
  const block = text.match(/\/\*\*([\s\S]*?)\*\//)?.[1] ?? "";
  console.log(
    block
      .split("\n")
      .map((l) => l.replace(/^\s*\*\s?/, "").replace(/^\s*$/, ""))
      .join("\n")
      .trim(),
  );
  process.exit(exitCode);
}

function fail(message, code = 1) {
  console.error(`error: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    versionArg: null,
    github: true,
    npm: false, // optional; opt in with --npm
    homebrew: true,
    tap: "tariqwest/homebrew-tap",
    dryRun: false,
    skipChecks: false,
    skipPush: false,
    draft: false,
    prerelease: false,
    yes: false,
    notesFile: null,
    generateNotes: true,
    title: null,
    otp: null,
    tagPrefix: "v",
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--help" || a === "-h") usage(0);

    if (a === "--github") {
      opts.github = true;
      continue;
    }
    if (a === "--no-github") {
      opts.github = false;
      continue;
    }
    if (a === "--npm") {
      opts.npm = true;
      continue;
    }
    if (a === "--no-npm") {
      opts.npm = false;
      continue;
    }
    if (a === "--homebrew") {
      opts.homebrew = true;
      continue;
    }
    if (a === "--no-homebrew") {
      opts.homebrew = false;
      continue;
    }
    if (a === "--github-only") {
      opts.github = true;
      opts.npm = false;
      opts.homebrew = false;
      continue;
    }
    if (a === "--npm-only") {
      opts.github = false;
      opts.npm = true;
      opts.homebrew = false;
      continue;
    }
    if (a === "--homebrew-only") {
      opts.github = false;
      opts.npm = false;
      opts.homebrew = true;
      continue;
    }
    if (a === "--tap") {
      opts.tap = argv[++i];
      if (!opts.tap) fail("--tap requires OWNER/NAME");
      continue;
    }
    if (a.startsWith("--tap=")) {
      opts.tap = a.slice("--tap=".length);
      continue;
    }
    if (a === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (a === "--skip-checks") {
      opts.skipChecks = true;
      continue;
    }
    if (a === "--skip-push") {
      opts.skipPush = true;
      continue;
    }
    if (a === "--draft") {
      opts.draft = true;
      continue;
    }
    if (a === "--prerelease") {
      opts.prerelease = true;
      continue;
    }
    if (a === "--yes" || a === "-y") {
      opts.yes = true;
      continue;
    }
    if (a === "--generate-notes") {
      opts.generateNotes = true;
      continue;
    }
    if (a === "--no-generate-notes") {
      opts.generateNotes = false;
      continue;
    }
    if (a === "--notes-file") {
      opts.notesFile = argv[++i];
      opts.generateNotes = false;
      if (!opts.notesFile) fail("--notes-file requires a path");
      continue;
    }
    if (a.startsWith("--notes-file=")) {
      opts.notesFile = a.slice("--notes-file=".length);
      opts.generateNotes = false;
      continue;
    }
    if (a === "--title") {
      opts.title = argv[++i];
      if (!opts.title) fail("--title requires a value");
      continue;
    }
    if (a.startsWith("--title=")) {
      opts.title = a.slice("--title=".length);
      continue;
    }
    if (a === "--otp") {
      opts.otp = argv[++i];
      if (!opts.otp) fail("--otp requires a code");
      continue;
    }
    if (a.startsWith("--otp=")) {
      opts.otp = a.slice("--otp=".length);
      continue;
    }
    if (a === "--tag-prefix") {
      opts.tagPrefix = argv[++i] ?? "";
      continue;
    }
    if (a.startsWith("--tag-prefix=")) {
      opts.tagPrefix = a.slice("--tag-prefix=".length);
      continue;
    }
    if (a.startsWith("-")) fail(`unknown option: ${a}\nRun with --help for usage.`);
    positionals.push(a);
  }

  if (positionals.length > 1) fail("expected at most one version argument");
  opts.versionArg = positionals[0] ?? null;
  return opts;
}

function run(cmd, args, { cwd = ROOT, stdio = "inherit", env = process.env, input } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    env,
    stdio: input != null ? ["pipe", "inherit", "inherit"] : stdio,
    encoding: "utf8",
    input,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`command failed (${result.status}): ${cmd} ${args.join(" ")}`);
  }
  return result;
}

function capture(cmd, args, { cwd = ROOT, allowFail = false } = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFail) {
    const detail = (result.stderr || result.stdout || "").trim();
    fail(
      detail
        ? `command failed (${result.status}): ${cmd} ${args.join(" ")}\n${detail}`
        : `command failed (${result.status}): ${cmd} ${args.join(" ")}`,
    );
  }
  return {
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function requireCmd(cmd) {
  const which = process.platform === "win32" ? "where" : "which";
  const res = spawnSync(which, [cmd], { encoding: "utf8" });
  if (res.status !== 0) fail(`required command not found on PATH: ${cmd}`);
}

function readPackage() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf8"));
}

function writePackage(pkg) {
  fs.writeFileSync(PACKAGE_JSON, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function parseSemver(version) {
  const m = SEMVER_RE.exec(version);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
    build: m[5] ?? null,
  };
}

function formatSemver({ major, minor, patch, prerelease, build }) {
  let out = `${major}.${minor}.${patch}`;
  if (prerelease) out += `-${prerelease}`;
  if (build) out += `+${build}`;
  return out;
}

function bumpVersion(current, kind) {
  const parsed = parseSemver(current);
  if (!parsed) fail(`package.json version is not valid semver: ${current}`);

  const next = { ...parsed, build: null };
  switch (kind) {
    case "major":
      next.major += 1;
      next.minor = 0;
      next.patch = 0;
      next.prerelease = null;
      break;
    case "minor":
      next.minor += 1;
      next.patch = 0;
      next.prerelease = null;
      break;
    case "patch":
      next.patch += 1;
      next.prerelease = null;
      break;
    case "premajor":
      next.major += 1;
      next.minor = 0;
      next.patch = 0;
      next.prerelease = "0";
      break;
    case "preminor":
      next.minor += 1;
      next.patch = 0;
      next.prerelease = "0";
      break;
    case "prepatch":
      next.patch += 1;
      next.prerelease = "0";
      break;
    case "prerelease": {
      if (!next.prerelease) {
        next.patch += 1;
        next.prerelease = "0";
      } else if (/^\d+$/.test(next.prerelease)) {
        next.prerelease = String(Number(next.prerelease) + 1);
      } else {
        const parts = next.prerelease.split(".");
        const last = parts[parts.length - 1];
        if (/^\d+$/.test(last)) {
          parts[parts.length - 1] = String(Number(last) + 1);
          next.prerelease = parts.join(".");
        } else {
          next.prerelease = `${next.prerelease}.0`;
        }
      }
      break;
    }
    default:
      fail(`unknown bump kind: ${kind}`);
  }
  return formatSemver(next);
}

/**
 * Simple conventional-commit heuristic since the last git tag.
 * - BREAKING CHANGE / feat!: / !: → major
 * - feat: → minor
 * - otherwise → patch (including no commits)
 */
function inferBumpFromCommits() {
  const lastTag = capture(
    "git",
    ["describe", "--tags", "--abbrev=0", "--match", "v*"],
    { allowFail: true },
  );
  const range =
    lastTag.status === 0 && lastTag.stdout
      ? `${lastTag.stdout}..HEAD`
      : "HEAD";

  const log = capture("git", ["log", range, "--pretty=%s%n%b%n---"], {
    allowFail: true,
  });
  const text = (log.stdout || "").trim();
  if (!text) {
    return {
      kind: "patch",
      reason: "no commits since last tag (default patch)",
      lastTag: lastTag.stdout || null,
    };
  }

  const subjects = text
    .split("\n---")
    .map((b) => b.trim())
    .filter(Boolean);

  let major = false;
  let minor = false;
  for (const block of subjects) {
    const lines = block.split("\n");
    const subject = lines[0] || "";
    const body = lines.slice(1).join("\n");
    if (
      /BREAKING CHANGE/i.test(block) ||
      /^[a-zA-Z0-9.()-]+!:/.test(subject) ||
      /!:/.test(subject.split(":")[0] || "")
    ) {
      major = true;
    }
    if (/^feat(\([^)]*\))?!?:/i.test(subject) || /^feat!/i.test(subject)) {
      if (/!:/.test(subject.split(":")[0] || "") || /BREAKING CHANGE/i.test(body)) {
        major = true;
      } else {
        minor = true;
      }
    }
  }

  if (major) {
    return {
      kind: "major",
      reason: "conventional commits include breaking change / feat!",
      lastTag: lastTag.stdout || null,
    };
  }
  if (minor) {
    return {
      kind: "minor",
      reason: "conventional commits include feat",
      lastTag: lastTag.stdout || null,
    };
  }
  return {
    kind: "patch",
    reason: "conventional commits are fix/chore/docs/etc. (or uncategorized)",
    lastTag: lastTag.stdout || null,
  };
}

function normalizeVersionArg(arg, current) {
  if (!arg || arg === "auto") {
    const inferred = inferBumpFromCommits();
    const next = bumpVersion(current, inferred.kind);
    return { version: next, meta: inferred };
  }
  if (BUMP_KINDS.has(arg)) {
    return {
      version: bumpVersion(current, arg),
      meta: { kind: arg, reason: `explicit bump: ${arg}`, lastTag: null },
    };
  }
  const cleaned = arg.startsWith("v") ? arg.slice(1) : arg;
  if (!parseSemver(cleaned)) fail(`invalid version: ${arg}`);
  return {
    version: cleaned,
    meta: { kind: "explicit", reason: "explicit version", lastTag: null },
  };
}

function git(args, opts) {
  return capture("git", args, opts);
}

function ensureGitReady({ dryRun }) {
  requireCmd("git");
  const inside = git(["rev-parse", "--is-inside-work-tree"], { allowFail: true });
  if (inside.status !== 0 || inside.stdout !== "true") fail("not inside a git repository");

  const dirty = git(["status", "--porcelain"]);
  if (dirty.stdout && !dryRun) {
    fail("working tree is dirty; commit or stash changes before releasing");
  }

  const branch = git(["branch", "--show-current"]).stdout;
  if (branch && branch !== "main" && branch !== "master") {
    console.warn(`warning: current branch is '${branch}' (expected main/master)`);
  }

  return { branch };
}

function ensureTools({ github, npm, homebrew }) {
  if (github || homebrew) requireCmd("gh");
  if (npm) requireCmd("npm");
  requireCmd("git");
  requireCmd("node");
}

function ensureGhAuth() {
  const res = capture("gh", ["auth", "status"], { allowFail: true });
  if (res.status !== 0) fail("gh is not authenticated; run `gh auth login`");
}

function ensureNpmAuth() {
  const npm = capture("npm", ["whoami"], { allowFail: true });
  if (npm.status === 0 && npm.stdout) {
    console.log(`npm authenticated as ${npm.stdout}`);
    return;
  }
  fail("not logged in to npm; run `npm login` before npm publish");
}

function assertPackagePublishable(pkg) {
  if (pkg.private) fail('package.json has "private": true; refusing to publish');
  if (!pkg.name) fail("package.json missing name");
  if (!pkg.version) fail("package.json missing version");
  if (!pkg.license) fail("package.json missing license");
  if (!pkg.bin && !pkg.main && !pkg.exports) {
    console.warn(
      "warning: package.json has no bin/main/exports; package may be empty for consumers",
    );
  }
}

function tagExistsLocally(tag) {
  return git(["rev-parse", "-q", "--verify", `refs/tags/${tag}`], { allowFail: true }).status === 0;
}

function tagExistsRemote(tag) {
  const res = git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`], { allowFail: true });
  return res.status === 0 && res.stdout.includes(`refs/tags/${tag}`);
}

function releaseExists(tag) {
  const res = capture("gh", ["release", "view", tag, "--json", "tagName"], { allowFail: true });
  return res.status === 0;
}

async function confirm(promptText, { yes }) {
  if (yes) return true;
  if (!process.stdin.isTTY) fail("refusing to continue non-interactively without --yes");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${promptText} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

function step(label) {
  console.log(`\n==> ${label}`);
}

function runChecks({ dryRun }) {
  // Prefer npm scripts so Node-only environments work; fall back to bun if present.
  const hasBun = capture("which", ["bun"], { allowFail: true }).status === 0;
  if (dryRun) {
    console.log("[dry-run] npm run typecheck");
    console.log("[dry-run] npm test  (or bun test)");
    return;
  }
  run("npm", ["run", "typecheck"]);
  if (hasBun) {
    run("bun", ["test"]);
  } else {
    run("npm", ["test"]);
  }
}

function publishHomebrewFormula({ version, tap, dryRun }) {
  requireCmd("gh");
  const genScript = path.join(ROOT, "scripts", "generate-homebrew-formula.mjs");
  if (!fs.existsSync(genScript)) fail(`missing formula generator: ${genScript}`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pwa-switch-brew-"));
  const formulaPath = path.join(tmpRoot, FORMULA_NAME);

  if (dryRun) {
    console.log(
      `[dry-run] node ${genScript} ${version} --source github --class ${FORMULA_CLASS_DEFAULT} --write ${formulaPath}`,
    );
    const previewArgs = [
      genScript,
      version,
      "--source",
      "github",
      "--class",
      FORMULA_CLASS_DEFAULT,
      "--sha256",
      "0".repeat(64),
      "--write",
      formulaPath,
    ];
    run("node", previewArgs);
    console.log(`[dry-run] gh repo clone ${tap} … && push Formula/${FORMULA_NAME}`);
    if (fs.existsSync(formulaPath)) {
      console.log(fs.readFileSync(formulaPath, "utf8"));
    }
    return;
  }

  run("node", [
    genScript,
    version,
    "--source",
    "github",
    "--class",
    FORMULA_CLASS_DEFAULT,
    "--write",
    formulaPath,
  ]);

  const tapDir = path.join(tmpRoot, "tap");
  run("gh", ["repo", "clone", tap, tapDir, "--", "--depth", "1"]);
  const destDir = path.join(tapDir, "Formula");
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, FORMULA_NAME);
  fs.copyFileSync(formulaPath, dest);

  const status = capture("git", ["-C", tapDir, "status", "--porcelain", `Formula/${FORMULA_NAME}`]);
  if (!status.stdout) {
    console.log("Homebrew formula already up to date");
    return;
  }
  run("git", ["-C", tapDir, "add", `Formula/${FORMULA_NAME}`]);
  run("git", ["-C", tapDir, "commit", "-m", `formula(${FORMULA_BREW_NAME}): ${version}`]);
  run("git", ["-C", tapDir, "push", "origin", "HEAD"]);
  const owner = tap.split("/")[0] || "tariqwest";
  console.log(
    `Homebrew formula updated: https://github.com/${tap}/blob/main/Formula/${FORMULA_NAME}`,
  );
  console.log(`Install: brew tap ${owner}/tap && brew install ${FORMULA_BREW_NAME}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  process.chdir(ROOT);

  if (!opts.github && !opts.npm && !opts.homebrew) {
    fail("nothing to do: all channels disabled");
  }

  if (opts.homebrew && opts.skipPush) {
    console.warn(
      "warning: --skip-push disables Homebrew formula update (no remote tag tarball)",
    );
    opts.homebrew = false;
  }

  if (opts.homebrew && !opts.github && !opts.dryRun) {
    console.warn(
      "warning: Homebrew-only release expects an existing GitHub tag tarball for the version",
    );
  }

  ensureTools({ github: opts.github, npm: opts.npm, homebrew: opts.homebrew });
  const { branch } = ensureGitReady({ dryRun: opts.dryRun });
  if ((opts.github || opts.homebrew) && !opts.dryRun) ensureGhAuth();

  const pkg = readPackage();
  assertPackagePublishable(pkg);
  if (opts.npm && !opts.dryRun) ensureNpmAuth();
  const currentVersion = pkg.version;
  if (!parseSemver(currentVersion)) {
    fail(`package.json version is not valid semver: ${currentVersion}`);
  }

  const { version, meta } = normalizeVersionArg(opts.versionArg, currentVersion);
  const tag = `${opts.tagPrefix}${version}`;
  const title = opts.title || tag;
  const versionChanged = version !== currentVersion;

  if (opts.notesFile && !fs.existsSync(opts.notesFile)) {
    fail(`notes file not found: ${opts.notesFile}`);
  }

  if (!opts.dryRun && opts.github) {
    if (tagExistsLocally(tag)) fail(`local tag already exists: ${tag}`);
    if (tagExistsRemote(tag)) fail(`remote tag already exists: ${tag}`);
    if (releaseExists(tag)) fail(`GitHub release already exists: ${tag}`);
  }

  console.log("Release plan");
  console.log(`  package:        ${pkg.name}`);
  console.log(`  branch:         ${branch || "(detached)"}`);
  console.log(`  current:        ${currentVersion}`);
  console.log(`  release:        ${version}`);
  console.log(`  bump:           ${meta.kind} — ${meta.reason}`);
  if (meta.lastTag) console.log(`  since tag:      ${meta.lastTag}`);
  console.log(`  tag:            ${tag}`);
  console.log(
    `  github release: ${opts.github ? "yes" : "no"}${opts.draft ? " (draft)" : ""}${opts.prerelease ? " (prerelease)" : ""}`,
  );
  console.log(`  npm publish:    ${opts.npm ? "yes" : "no"}`);
  console.log(`  homebrew tap:   ${opts.homebrew ? opts.tap : "no"}`);
  console.log(`  checks:         ${opts.skipChecks ? "skip" : "typecheck + test"}`);
  console.log(`  push:           ${opts.skipPush ? "no" : "yes"}`);
  console.log(`  dry-run:        ${opts.dryRun ? "yes" : "no"}`);

  const ok = await confirm("Proceed?", { yes: opts.yes || opts.dryRun });
  if (!ok) fail("aborted", 0);

  if (!opts.skipChecks) {
    step("Running checks");
    runChecks({ dryRun: opts.dryRun });
  }

  if (versionChanged && (opts.github || opts.npm || opts.homebrew)) {
    step(`Bumping package.json ${currentVersion} -> ${version}`);
    if (opts.dryRun) {
      console.log(`[dry-run] write package.json version=${version}`);
      if (opts.github) {
        console.log(`[dry-run] git commit -am "chore(release): ${version}"`);
      }
    } else {
      const nextPkg = readPackage();
      nextPkg.version = version;
      writePackage(nextPkg);
      if (opts.github) {
        run("git", ["add", "package.json"]);
        run("git", ["commit", "-m", `chore(release): ${version}`]);
      } else {
        console.log("version bumped locally (no github channel — commit yourself if needed)");
      }
    }
  } else {
    step("package.json already at release version");
  }

  if (opts.github) {
    step(`Creating tag ${tag}`);
    if (opts.dryRun) {
      console.log(`[dry-run] git tag -a ${tag} -m "Release ${version}"`);
    } else {
      run("git", ["tag", "-a", tag, "-m", `Release ${version}`]);
    }

    if (!opts.skipPush) {
      step("Pushing commit and tag");
      if (opts.dryRun) {
        if (versionChanged) console.log(`[dry-run] git push origin HEAD`);
        console.log(`[dry-run] git push origin ${tag}`);
      } else {
        if (versionChanged) run("git", ["push", "origin", "HEAD"]);
        run("git", ["push", "origin", tag]);
      }
    } else {
      console.log("\n(skipping push)");
    }

    step(`Creating GitHub release ${tag}`);
    const ghArgs = ["release", "create", tag, "--title", title];
    if (opts.draft) ghArgs.push("--draft");
    if (opts.prerelease) ghArgs.push("--prerelease");
    if (opts.notesFile) ghArgs.push("--notes-file", opts.notesFile);
    else if (opts.generateNotes) ghArgs.push("--generate-notes");
    else ghArgs.push("--notes", `Release ${version}`);

    if (opts.dryRun) {
      console.log(`[dry-run] gh ${ghArgs.join(" ")}`);
    } else {
      run("gh", ghArgs);
    }
  } else {
    console.log("\n(skipping GitHub release)");
  }

  if (opts.npm) {
    step("Publishing to npm");
    const publishArgs = ["publish", "--access", "public"];
    if (opts.otp) publishArgs.push("--otp", opts.otp);
    if (opts.dryRun) {
      console.log(`[dry-run] npm ${publishArgs.join(" ")}`);
      console.log("[dry-run] npm pack --dry-run");
      run("npm", ["pack", "--dry-run"]);
    } else {
      run("npm", ["pack", "--dry-run"]);
      run("npm", publishArgs);
    }
  } else {
    console.log("\n(skipping npm publish)");
  }

  if (opts.homebrew) {
    step(`Updating Homebrew formula on ${opts.tap}`);
    publishHomebrewFormula({
      version,
      tap: opts.tap,
      dryRun: opts.dryRun,
    });
  } else {
    console.log("\n(skipping Homebrew formula update)");
  }

  step("Done");
  if (!opts.dryRun) {
    if (opts.github) {
      const repo = capture("gh", ["repo", "view", "--json", "url", "-q", ".url"], {
        allowFail: true,
      });
      if (repo.status === 0 && repo.stdout) {
        console.log(`GitHub release: ${repo.stdout}/releases/tag/${tag}`);
      } else {
        console.log(`GitHub release tag: ${tag}`);
      }
    }
    if (opts.npm) console.log(`npm: https://www.npmjs.com/package/${pkg.name}/v/${version}`);
    if (opts.homebrew) {
      const owner = opts.tap.split("/")[0] || "tariqwest";
      console.log(`Homebrew: brew tap ${owner}/tap && brew install ${FORMULA_BREW_NAME}`);
      console.log(`Formula: https://github.com/${opts.tap}/blob/main/Formula/${FORMULA_NAME}`);
    }
  } else {
    console.log("Dry run complete — no changes were made.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
