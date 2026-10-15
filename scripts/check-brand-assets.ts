/**
 * Comprueba que existan iconos / marca necesarios para release y runtime.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const ASSETS = join(ROOT, "assets");

const REQUIRED = [
  "icon.ico",
  "favicon-32.png",
  "favicon-180.png",
  "favicon-192.png",
  "favicon-512.png",
  "wordmark-transparent.png",
  "wordmark-512.png",
  "marca-ait-32.png",
  "site.webmanifest",
] as const;

function main(): void {
  const missing: string[] = [];
  for (const name of REQUIRED) {
    const path = join(ASSETS, name);
    if (!existsSync(path) || statSync(path).size < 16) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    console.error("Faltan assets de marca:");
    for (const m of missing) console.error(`  - assets/${m}`);
    if (missing.includes("icon.ico")) {
      console.error("Generar icono: powershell -NoProfile -File scripts/gen-icon-ico.ps1");
    }
    if (missing.includes("favicon-192.png")) {
      console.error("Generar 192: powershell -NoProfile -File scripts/gen-favicon-192.ps1");
    }
    process.exit(1);
  }
  console.log(`check-brand-assets: OK (${REQUIRED.length} archivos)`);
}

main();
