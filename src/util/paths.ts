import { homedir } from "node:os";
import { join } from "node:path";

export function home(): string {
  return homedir();
}

export function userApplications(): string {
  return join(home(), "Applications");
}

export function systemApplications(): string {
  return "/Applications";
}

export function applicationSupport(...parts: string[]): string {
  return join(home(), "Library", "Application Support", ...parts);
}

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(home(), p.slice(2));
  if (p === "~") return home();
  return p;
}
