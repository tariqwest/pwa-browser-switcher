import type { BrowserAlias, ConvertResult, PwaDescriptor } from "../types.js";
import { familyOf, getBrowserDefinition } from "../browsers/registry.js";
import { installChromium } from "./chromium.js";
import { installSafari } from "./safari.js";
import { installOrion } from "./orion.js";
import { installFirefox, noteFirefoxTarget } from "./firefox.js";

export interface ConvertOptions {
  dryRun?: boolean;
  profile?: string;
  preferUi?: boolean;
}

export async function installIntoBrowser(
  descriptor: PwaDescriptor,
  target: BrowserAlias,
  opts: ConvertOptions = {},
): Promise<ConvertResult> {
  const def = getBrowserDefinition(target);
  if (!def) {
    return {
      descriptor,
      target,
      status: "failed",
      message: `Unknown target browser: ${target}`,
    };
  }

  const family = familyOf(target) ?? def.family;

  switch (family) {
    case "chromium":
      return installChromium(descriptor, target, opts);
    case "webkit":
      if (target === "orion") return installOrion(descriptor, opts);
      return installSafari(descriptor, target, opts);
    case "firefox":
      noteFirefoxTarget(target);
      return installFirefox(descriptor, target, opts);
    default:
      return {
        descriptor,
        target,
        status: "failed",
        message: `No installer for family ${family}`,
      };
  }
}
