/**
 * Build de distribución: web + manifiesto + MenuDigital.exe (baseline).
 * Target obligatorio: bun-windows-x64-baseline (ADR-02 / POS sin AVX2).
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import pkg from "../package.json";

/** Prioridad: APP_VERSION / VERSION (CI por tag) → package.json */
const version = (
  process.env.APP_VERSION?.trim() ||
  process.env.VERSION?.trim() ||
  pkg.version
).replace(/^v/i, "");
const ROOT = join(import.meta.dir, "..");
const DIST = join(ROOT, "dist");
const ICON = join(ROOT, "assets", "icon.ico");

console.log(`DigitalMenu build v${version}`);
mkdirSync(DIST, { recursive: true });

await $`bun scripts/ensure-assets-stub.ts`;
await $`bun run build:web`;
await $`bun scripts/gen-assets-manifest.ts`;
await $`bun scripts/check-budget.ts`;

const define = `process.env.APP_VERSION="${version}"`;

const iconArgs = existsSync(ICON) ? (["--windows-icon", ICON] as string[]) : [];
if (!existsSync(ICON)) {
  console.warn("Aviso: no hay assets/icon.ico — se compila sin icono de Windows.");
}

const prodOut = join(DIST, "MenuDigital.exe");
const debugOut = join(DIST, "MenuDigital-debug.exe");

/**
 * Producción: sin --sourcemap (binario más pequeño; el POS no necesita stacks).
 * Debug: con --sourcemap y consola visible — sí se publica en el Release (diagnóstico POS).
 */
async function compile(
  outfile: string,
  opts: { hideConsole: boolean; sourcemap: boolean },
): Promise<void> {
  const args = [
    "build",
    join(ROOT, "src", "server", "main.ts"),
    "--compile",
    "--target=bun-windows-x64-baseline",
    "--minify",
    ...(opts.sourcemap ? ["--sourcemap"] : []),
    "--define",
    define,
    ...(opts.hideConsole ? ["--windows-hide-console"] : []),
    ...iconArgs,
    "--outfile",
    outfile,
  ];
  console.log(
    opts.hideConsole
      ? "Compilando MenuDigital.exe (sin consola, sin sourcemap)…"
      : "Compilando MenuDigital-debug.exe (consola + sourcemap)…",
  );
  const proc = Bun.spawn(["bun", ...args], { stdout: "inherit", stderr: "inherit", cwd: ROOT });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`bun build falló (${code}) para ${outfile}`);
}

await compile(prodOut, { hideConsole: true, sourcemap: false });
await compile(debugOut, { hideConsole: false, sourcemap: true });

// Restaurar stub versionado (el .exe ya embebó los assets en compile)
await $`bun scripts/ensure-assets-stub.ts --force`;

// Scripts de instalación POS (09 §3 / T7) junto al .exe
for (const name of ["install.ps1", "uninstall.ps1"] as const) {
  const src = join(ROOT, "scripts", name);
  const dest = join(ROOT, "dist", name);
  await Bun.write(dest, await Bun.file(src).arrayBuffer());
}

console.log(`OK: dist/MenuDigital.exe v${version}`);
console.log(`OK: dist/MenuDigital-debug.exe v${version}`);
console.log("OK: dist/install.ps1, dist/uninstall.ps1");
console.log("Target: bun-windows-x64-baseline");
