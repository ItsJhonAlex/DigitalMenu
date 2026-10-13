/**
 * Presupuesto de la Carta (RNF-06): ≤ 60 KB gzip (HTML + JS + CSS de carta).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CARTA = join(ROOT, "dist", "web", "carta");
const LIMIT = 60 * 1024;

function main(): void {
  if (!existsSync(CARTA)) {
    throw new Error("Falta dist/web/carta. Ejecute build:web + gen-assets-manifest.");
  }
  const gzFiles = readdirSync(CARTA).filter((f) => f.endsWith(".gz"));
  if (gzFiles.length === 0) {
    throw new Error("No hay .gz de la carta. Ejecute gen-assets-manifest.");
  }
  let total = 0;
  for (const f of gzFiles) {
    const size = readFileSync(join(CARTA, f)).byteLength;
    total += size;
    console.log(`  ${f}: ${(size / 1024).toFixed(1)} KB`);
  }
  console.log(`Total carta gzip: ${(total / 1024).toFixed(1)} KB (límite ${LIMIT / 1024} KB)`);
  if (total > LIMIT) {
    throw new Error(`Presupuesto excedido: ${total} > ${LIMIT} bytes`);
  }
  console.log("check-budget: OK");
}

main();
