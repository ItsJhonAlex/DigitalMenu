/**
 * Build de distribución: web + manifiesto + MenuDigital.exe (baseline).
 * Se completa en F6; aquí solo deja el esqueleto y valida el target.
 */
import { $ } from "bun";
import pkg from "../package.json";

const version = pkg.version;
console.log(`DigitalMenu build v${version}`);
console.log("TODO F6: build:web → gen-assets-manifest → check-budget → compile baseline");
console.log("Target obligatorio: bun-windows-x64-baseline (ADR-02)");

// Comprobar que el script de compile está documentado (no compilar aún sin assets).
await $`bun --version`;
console.log("OK: entorno Bun listo. Ejecuta bun run build cuando F0/F6 estén listos.");
