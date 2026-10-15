import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { hasEmbeddedAssets, serveEmbedded } from "./assets";

const ASSET_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(png|webp|svg|webmanifest|json)$/;

function mimeFor(name: string): string {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  if (name.endsWith(".webmanifest") || name.endsWith(".json")) {
    return "application/manifest+json; charset=utf-8";
  }
  return "application/octet-stream";
}

/** Carpeta `assets/` junto al cwd del proceso o relativa al código del server. */
export function resolveBrandAssetsDir(): string | null {
  const candidates = [resolve(process.cwd(), "assets"), resolve(import.meta.dir, "../../assets")];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

/** Sirve `/assets/<file>` embebido (exe) o desde disco (dev / start). */
export function serveBrandAsset(urlPath: string): Response | null {
  const m = urlPath.match(/^\/assets\/([^/]+)$/);
  if (!m) return null;
  const name = m[1]!;
  if (!ASSET_NAME_RE.test(name)) return null;

  if (hasEmbeddedAssets()) {
    const embedded = serveEmbedded(`/assets/${name}`);
    if (embedded) return embedded;
  }

  const dir = resolveBrandAssetsDir();
  if (!dir) return null;
  const filePath = join(dir, name);
  if (!existsSync(filePath)) return null;

  return new Response(Bun.file(filePath), {
    headers: {
      "Content-Type": mimeFor(name),
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
