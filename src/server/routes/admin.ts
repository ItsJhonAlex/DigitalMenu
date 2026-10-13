import { Hono } from "hono";
import type { AppContext } from "../app";
import { adminPin } from "../middleware/adminPin";
import { localOnly } from "../middleware/localOnly";

export function adminRoutes(ctx: AppContext) {
  const app = new Hono();
  const port = ctx.runtime.config.port;

  app.use("*", localOnly(port, { looseHost: ctx.runtime.dev }));
  app.use("*", adminPin());

  app.get("/admin", (c) => c.html(adminPlaceholderHtml(ctx.runtime.version)));
  app.get("/admin/", (c) => c.redirect("/admin"));

  app.get("/api/admin/ping", (c) =>
    c.json({
      ok: true,
      dataDir: ctx.runtime.dataDir,
      version: ctx.runtime.version,
      db: {
        languages: ctx.repos.languages.list().length,
        currencies: ctx.repos.currencies.list().length,
        categories: ctx.repos.categories.list().length,
        products: ctx.repos.products.list().length,
        baseCurrency: ctx.repos.currencies.getBase()?.code ?? null,
      },
    }),
  );

  return app;
}

function adminPlaceholderHtml(version: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Menú Digital — Admin</title>
  <link rel="stylesheet" href="/admin/styles.css" />
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <strong>Menú Digital</strong>
      <nav>
        <a href="#/">Inicio</a>
        <a href="#/productos">Productos</a>
        <a href="#/ajustes">Ajustes</a>
      </nav>
    </aside>
    <main>
      <h1>Admin</h1>
      <p class="muted">Esqueleto · v${escapeHtml(version)} · solo localhost</p>
      <p id="status">Cargando…</p>
    </main>
  </div>
  <script type="module" src="/admin/main.ts"></script>
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
