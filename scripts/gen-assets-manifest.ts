/**
 * Tras build:web, prepara HTML/CSS hasheados y genera src/server/assets.generated.ts
 * con imports `with { type: "file" }` para embeberlos en el .exe.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = join(import.meta.dir, "..");
const WEB = join(ROOT, "dist", "web");
const OUT_TS = join(ROOT, "src", "server", "assets.generated.ts");

type Entry = { url: string; absPath: string; type: string };

function mime(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webmanifest") || path.endsWith(".json")) {
    return "application/manifest+json; charset=utf-8";
  }
  if (path.endsWith(".woff2")) return "font/woff2";
  return "application/octet-stream";
}

function shortHash(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 8);
}

function findMainJs(app: "carta" | "admin"): string {
  const dir = join(WEB, app);
  if (!existsSync(dir)) {
    throw new Error(`Falta ${dir}. Ejecute primero: bun run build:web`);
  }
  const files = readdirSync(dir).filter((f) => /^main-[a-z0-9]+\.js$/i.test(f));
  if (files.length === 0) {
    // fallback: cualquier .js
    const any = readdirSync(dir).filter((f) => f.endsWith(".js"));
    if (any.length === 0) throw new Error(`No hay JS en ${dir}`);
    return join(dir, any[0]!);
  }
  files.sort();
  return join(dir, files[0]!);
}

function writeHashedCss(app: "carta" | "admin"): { url: string; absPath: string } {
  const src = join(ROOT, "src", app, "styles.css");
  if (!existsSync(src)) throw new Error(`Falta ${src}`);
  const css = readFileSync(src);
  const hash = shortHash(css);
  const outDir = join(WEB, app);
  mkdirSync(outDir, { recursive: true });
  const name = `styles-${hash}.css`;
  const absPath = join(outDir, name);
  writeFileSync(absPath, css);
  writeFileSync(`${absPath}.gz`, gzipSync(css));
  return { url: `/${app}/${name}`, absPath };
}

function writeHtml(
  app: "carta" | "admin",
  opts: { cssUrl: string; jsUrl: string; title: string },
): { url: string; absPath: string } {
  const srcHtml = readFileSync(join(ROOT, "src", app, "index.html"), "utf8");
  let html = srcHtml;
  html = html.replace(/href="\/[^"]+\.css"/, `href="${opts.cssUrl}"`);
  html = html.replace(/src="\/[^"]+\.(ts|js)"/, `src="${opts.jsUrl}"`);
  // Asegurar type=module
  if (!html.includes('type="module"')) {
    html = html.replace(`src="${opts.jsUrl}"`, `type="module" src="${opts.jsUrl}"`);
  }
  const outDir = join(WEB, app);
  mkdirSync(outDir, { recursive: true });
  const absPath = join(outDir, "index.html");
  writeFileSync(absPath, html, "utf8");
  writeFileSync(`${absPath}.gz`, gzipSync(Buffer.from(html, "utf8")));
  const url = app === "carta" ? "/" : "/admin";
  return { url, absPath };
}

function importId(url: string): string {
  return `a_${createHash("sha1").update(url).digest("hex").slice(0, 12)}`;
}

function toImportPath(absPath: string): string {
  const rel = relative(join(ROOT, "src", "server"), absPath).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function collectJsGz(jsPath: string): void {
  const buf = readFileSync(jsPath);
  writeFileSync(`${jsPath}.gz`, gzipSync(buf));
}

function main(): void {
  mkdirSync(WEB, { recursive: true });

  const cartaJs = findMainJs("carta");
  const adminJs = findMainJs("admin");
  collectJsGz(cartaJs);
  collectJsGz(adminJs);

  const cartaCss = writeHashedCss("carta");
  const adminCss = writeHashedCss("admin");

  const cartaJsUrl = `/carta/${cartaJs.replace(/\\/g, "/").split("/").pop()!}`;
  const adminJsUrl = `/admin/${adminJs.replace(/\\/g, "/").split("/").pop()!}`;

  const cartaHtml = writeHtml("carta", {
    cssUrl: cartaCss.url,
    jsUrl: cartaJsUrl,
    title: "carta",
  });
  const adminHtml = writeHtml("admin", {
    cssUrl: adminCss.url,
    jsUrl: adminJsUrl,
    title: "admin",
  });

  const entries: Entry[] = [
    { url: cartaHtml.url, absPath: cartaHtml.absPath, type: mime(cartaHtml.absPath) },
    { url: cartaJsUrl, absPath: cartaJs, type: mime(cartaJs) },
    { url: cartaCss.url, absPath: cartaCss.absPath, type: mime(cartaCss.absPath) },
    { url: adminHtml.url, absPath: adminHtml.absPath, type: mime(adminHtml.absPath) },
    { url: adminJsUrl, absPath: adminJs, type: mime(adminJs) },
    { url: adminCss.url, absPath: adminCss.absPath, type: mime(adminCss.absPath) },
  ];

  // Marca / favicons / PWA (carpeta assets/ del repo)
  const brandDir = join(ROOT, "assets");
  if (existsSync(brandDir)) {
    for (const f of readdirSync(brandDir)) {
      if (!/\.(png|webp|svg|webmanifest|json)$/i.test(f)) continue;
      const absPath = join(brandDir, f);
      entries.push({ url: `/assets/${f}`, absPath, type: mime(absPath) });
    }
  }

  // Limpiar CSS antiguos sin hash si quedaran
  for (const app of ["carta", "admin"] as const) {
    const dir = join(WEB, app);
    for (const f of readdirSync(dir)) {
      if (f === "styles.css") rmSync(join(dir, f), { force: true });
    }
  }

  const lines: string[] = [
    "/** GENERADO por scripts/gen-assets-manifest.ts — no editar. */",
    '// @ts-nocheck — imports `with { type: "file" }` (Bun embed)',
    "",
  ];
  for (const e of entries) {
    const id = importId(e.url);
    lines.push(`import ${id} from "${toImportPath(e.absPath)}" with { type: "file" };`);
  }
  lines.push("");
  lines.push("export const ASSETS: Record<string, { path: string; type: string }> = {");
  for (const e of entries) {
    const id = importId(e.url);
    lines.push(`  ${JSON.stringify(e.url)}: { path: ${id}, type: ${JSON.stringify(e.type)} },`);
  }
  lines.push("};");
  lines.push("");

  writeFileSync(OUT_TS, `${lines.join("\n")}\n`, "utf8");
  console.log(`assets.generated.ts: ${entries.length} archivos`);
  for (const e of entries) {
    console.log(`  ${e.url} ← ${relative(ROOT, e.absPath)}`);
  }
}

main();
