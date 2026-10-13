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

async function compile(outfile: string, hideConsole: boolean): Promise<void> {
  const args = [
    "build",
    join(ROOT, "src", "server", "main.ts"),
    "--compile",
    "--target=bun-windows-x64-baseline",
    "--minify",
    "--sourcemap",
    "--define",
    define,
    ...(hideConsole ? ["--windows-hide-console"] : []),
    ...iconArgs,
    "--outfile",
    outfile,
  ];
  console.log(hideConsole ? "Compilando MenuDigital.exe (sin consola)…" : "Compilando MenuDigital-debug.exe (con consola)…");
  const proc = Bun.spawn(["bun", ...args], { stdout: "inherit", stderr: "inherit", cwd: ROOT });
  const code = await proc.exited;
  if (code !== 0) throw new Error(`bun build falló (${code}) para ${outfile}`);
}

await compile(prodOut, true);
await compile(debugOut, false);

console.log(`OK: dist/MenuDigital.exe v${version}`);
console.log(`OK: dist/MenuDigital-debug.exe v${version}`);
console.log("Target: bun-windows-x64-baseline");
