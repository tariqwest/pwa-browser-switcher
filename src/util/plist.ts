import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import plist from "plist";

export type PlistDict = Record<string, unknown>;

/** Read a binary or XML plist into a plain object. */
export function readPlist(filePath: string): PlistDict {
  if (!existsSync(filePath)) {
    throw new Error(`plist not found: ${filePath}`);
  }
  // Prefer plutil JSON for robust binary plist support on macOS
  try {
    const json = execFileSync("plutil", ["-convert", "json", "-o", "-", filePath], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(json) as PlistDict;
  } catch {
    const raw = readFileSync(filePath, "utf8");
    return plist.parse(raw) as PlistDict;
  }
}

export function readAppInfoPlist(appPath: string): PlistDict {
  return readPlist(join(appPath, "Contents", "Info.plist"));
}

export function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

export function bool(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}
