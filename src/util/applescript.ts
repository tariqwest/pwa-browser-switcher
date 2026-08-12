import { execFileSync } from "node:child_process";

export function runAppleScript(script: string, timeoutMs = 120_000): string {
  try {
    return execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: 5 * 1024 * 1024,
    }).trim();
  } catch (err) {
    const e = err as { stderr?: string; message?: string; status?: number };
    const detail = e.stderr?.toString() || e.message || String(err);
    throw new Error(`AppleScript failed: ${detail}`);
  }
}

/** Escape a string for embedding in an AppleScript quoted string. */
export function asLiteral(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
