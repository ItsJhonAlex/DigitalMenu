/**
 * Garantiza src/server/assets.generated.ts importable (tests/CI).
 * Si falta o apunta a dist/ inexistente, escribe el stub vacío.
 * El build real lo sobrescribe con gen-assets-manifest.ts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = join(import.meta.dir, "..");
const GEN = join(ROOT, "src", "server", "assets.generated.ts");
const SERVER_DIR = join(ROOT, "src", "server");

const STUB = `/** GENERADO — stub hasta gen-assets-manifest. No editar a mano. */
export const ASSETS: Record<string, { path: string; type: string }> = {};
`;

function embeddedPathsExist(source: string): boolean {
  if (!source.includes('with { type: "file" }')) return true;
  const re = /from\s+"([^"]+)"\s+with\s+\{\s*type:\s*"file"/g;
  for (const m of source.matchAll(re)) {
    const abs = resolve(SERVER_DIR, m[1]!);
    if (!existsSync(abs)) return false;
  }
  return true;
}

mkdirSync(dirname(GEN), { recursive: true });

const force = Bun.argv.includes("--force");
let write = force || !existsSync(GEN);
if (!write) {
  const cur = readFileSync(GEN, "utf8");
  write = !embeddedPathsExist(cur);
}

if (write) {
  writeFileSync(GEN, STUB, "utf8");
  console.log(
    force ? "assets.generated.ts: stub (--force)" : "assets.generated.ts: stub (tests/CI)",
  );
} else {
  console.log("assets.generated.ts: OK");
}
