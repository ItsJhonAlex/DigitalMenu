import { ASSETS as EMBEDDED } from "./assets.generated";

export type EmbeddedAsset = {
  path: string;
  type: string;
};

export const ASSETS: Record<string, EmbeddedAsset> = EMBEDDED as Record<string, EmbeddedAsset>;

export function hasEmbeddedAssets(): boolean {
  return Object.keys(ASSETS).length > 0;
}

export function serveEmbedded(url: string): Response | null {
  const asset = ASSETS[url];
  if (!asset) return null;
  const isHtml =
    url === "/" || url === "/admin" || url.endsWith(".html") || asset.type.startsWith("text/html");
  const filePath = String(asset.path);
  return new Response(Bun.file(filePath), {
    headers: {
      "Content-Type": asset.type,
      "Cache-Control": isHtml ? "no-store" : "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
