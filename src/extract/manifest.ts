/**
 * Resolve web app manifest URL and content from a start URL.
 */

export async function discoverManifestUrl(startUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(startUrl, {
      redirect: "follow",
      headers: { "User-Agent": "pwa-browser-switcher/0.1" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    const base = new URL(res.url);
    // link rel="manifest"
    const re =
      /<link\b[^>]*rel\s*=\s*["'](?:manifest|alternate manifest)["'][^>]*>/gi;
    const reHref =
      /<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'](?:manifest|alternate manifest)["'][^>]*>/i;
    const reHref2 =
      /<link\b[^>]*rel\s*=\s*["'](?:manifest|alternate manifest)["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>/i;
    let m = html.match(reHref) || html.match(reHref2);
    if (!m) {
      // broader scan
      for (const tag of html.match(re) ?? []) {
        const href = tag.match(/href\s*=\s*["']([^"']+)["']/i);
        if (href) {
          m = href;
          break;
        }
      }
    }
    if (!m?.[1]) {
      // common fallbacks
      for (const guess of ["/manifest.webmanifest", "/manifest.json", "/site.webmanifest"]) {
        const u = new URL(guess, base).href;
        if (await urlExists(u)) return u;
      }
      return undefined;
    }
    return new URL(m[1], base).href;
  } catch {
    return undefined;
  }
}

export async function fetchManifest(
  manifestUrl: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const res = await fetch(manifestUrl, {
      redirect: "follow",
      headers: { "User-Agent": "pwa-browser-switcher/0.1", Accept: "application/manifest+json,application/json,*/*" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return undefined;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Enrich a descriptor with manifest URL/name/scope when missing. */
export async function enrichFromWebManifest(
  desc: { name: string; startUrl: string; scope?: string; manifestUrl?: string; rawManifest?: Record<string, unknown> },
): Promise<{
  name: string;
  startUrl: string;
  scope?: string;
  manifestUrl?: string;
  rawManifest?: Record<string, unknown>;
}> {
  if (!desc.startUrl) return desc;
  const manifestUrl = desc.manifestUrl ?? (await discoverManifestUrl(desc.startUrl));
  if (!manifestUrl) return desc;
  const raw = desc.rawManifest ?? (await fetchManifest(manifestUrl));
  if (!raw) return { ...desc, manifestUrl };

  const name =
    (typeof raw.name === "string" && raw.name) ||
    (typeof raw.short_name === "string" && raw.short_name) ||
    desc.name;
  let startUrl = desc.startUrl;
  if (typeof raw.start_url === "string") {
    try {
      startUrl = new URL(raw.start_url, manifestUrl).href;
    } catch {
      /* keep */
    }
  }
  let scope = desc.scope;
  if (typeof raw.scope === "string") {
    try {
      scope = new URL(raw.scope, manifestUrl).href;
    } catch {
      scope = raw.scope;
    }
  }
  return { name, startUrl, scope, manifestUrl, rawManifest: raw };
}
