import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { HealthResponse } from "../../shared/api-types";
import type { AppContext } from "../app";

const IMG_RE = /^[a-f0-9]{16}(_t)?\.webp$/;

export function publicRoutes(ctx: AppContext) {
  const app = new Hono();

  app.get("/img/:name", (c) => {
    const name = c.req.param("name");
    if (!IMG_RE.test(name)) return c.notFound();
    const path = join(ctx.runtime.dataDir, "images", name);
    if (!existsSync(path)) return c.notFound();
    return new Response(Bun.file(path), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });

  app.get("/api/health", (c) => {
    let dbOk = false;
    try {
      ctx.db.prepare("SELECT 1").get();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    const body: HealthResponse & { db: boolean } = {
      app: "DigitalMenu",
      version: ctx.runtime.version,
      uptime: Math.floor((Date.now() - ctx.startedAt) / 1000),
      ok: true,
      db: dbOk,
    };
    return c.json(body);
  });

  app.get("/", (c) => {
    return c.html(cartaPlaceholderHtml(ctx.runtime.version));
  });

  app.get("/api/menu", (c) => {
    // Stub hasta F3 / services/menu.ts
    return c.json({
      version: 0,
      languages: ["es", "en"],
      currencies: [],
      categories: [],
      products: [],
      offers: [],
      message: "Menú aún no implementado (esqueleto F0/F1)",
    });
  });

  return app;
}

function cartaPlaceholderHtml(version: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Menú Digital</title>
  <link rel="stylesheet" href="/carta/styles.css" />
</head>
<body>
  <main class="shell">
    <p class="brand">DigitalMenu</p>
    <h1>Carta</h1>
    <p class="muted">Esqueleto de desarrollo · v${escapeHtml(version)}</p>
    <p><a href="/admin">Admin</a> · <a href="/api/health">/api/health</a></p>
  </main>
  <script type="module" src="/carta/main.ts"></script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
