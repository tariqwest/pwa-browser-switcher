import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

/** Locate app.icns or ApplicationIcon.icns inside an .app bundle. */
export function findAppIcon(appPath: string): string | undefined {
  const candidates = [
    join(appPath, "Contents", "Resources", "app.icns"),
    join(appPath, "Contents", "Resources", "ApplicationIcon.icns"),
    join(appPath, "Contents", "Resources", "AppIcon.icns"),
  ];
  return candidates.find((p) => existsSync(p));
}

/**
 * Copy icon to a temp path (keeps .icns). Returns destination path or undefined.
 */
export function copyIconToTemp(iconPath: string, nameHint = "icon"): string | undefined {
  if (!existsSync(iconPath)) return undefined;
  const dir = join(tmpdir(), "pwa-switch", randomUUID());
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, `${sanitize(nameHint)}.icns`);
  copyFileSync(iconPath, dest);
  return dest;
}

/**
 * Convert .icns to PNG using `sips` (macOS built-in). Returns PNG path.
 */
export function icnsToPng(icnsPath: string, outPng?: string): string | undefined {
  if (!existsSync(icnsPath)) return undefined;
  const dest =
    outPng ??
    join(tmpdir(), "pwa-switch", randomUUID(), `${sanitize(basenameNoExt(icnsPath))}.png`);
  mkdirSync(dirname(dest), { recursive: true });
  try {
    execFileSync("sips", ["-s", "format", "png", icnsPath, "--out", dest], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return existsSync(dest) ? dest : undefined;
  } catch {
    return undefined;
  }
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 64) || "icon";
}

function basenameNoExt(p: string): string {
  const base = p.split("/").pop() ?? "icon";
  return base.replace(/\.icns$/i, "");
}
