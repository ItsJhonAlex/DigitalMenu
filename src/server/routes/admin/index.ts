import { Hono } from "hono";
import type { AppContext } from "../../app";
import { HttpError, errorJson } from "../../http/errors";
import { adminPin } from "../../middleware/adminPin";
import { localOnly } from "../../middleware/localOnly";
import { backupsAdmin } from "./backups";
import { categoriesAdmin } from "./categories";
import { currenciesAdmin } from "./currencies";
import { diagnosticsAdmin } from "./diagnostics";
import { imagesAdmin } from "./images";
import { languagesAdmin } from "./languages";
import { networkAdmin } from "./network";
import { offersAdmin } from "./offers";
import { productsAdmin } from "./products";
import { settingsAdmin } from "./settings";
import { translationsAdmin } from "./translations";

export function adminRoutes(ctx: AppContext) {
  const app = new Hono();
  const port = ctx.runtime.config.port;

  app.use("/api/admin/*", localOnly(port, { looseHost: ctx.runtime.dev }));
  app.use("/admin/*", localOnly(port, { looseHost: ctx.runtime.dev }));
  app.use("/admin", localOnly(port, { looseHost: ctx.runtime.dev }));
  app.use("/api/admin/*", adminPin());
  app.use("/api/admin/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "no-store");
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(errorJson(err), err.status as 400);
    }
    ctx.log.error("Admin route error", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Error interno" } }, 500);
  });

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

  // Session PIN stub (RF-07) — sin PIN activo acepta
  app.post("/api/admin/session", async (c) => {
    const pinHash = ctx.repos.settings.get("admin.pin_hash");
    if (!pinHash) return c.json({ ok: true, pinRequired: false });
    return c.json({ ok: false, pinRequired: true, message: "PIN pendiente (RF-07)" }, 401);
  });

  app.route("/", categoriesAdmin(ctx));
  app.route("/", productsAdmin(ctx));
  app.route("/", offersAdmin(ctx));
  app.route("/", currenciesAdmin(ctx));
  app.route("/", languagesAdmin(ctx));
  app.route("/", translationsAdmin(ctx));
  app.route("/", settingsAdmin(ctx));
  app.route("/", imagesAdmin(ctx));
  app.route("/", networkAdmin(ctx));
  app.route("/", backupsAdmin(ctx));
  app.route("/", diagnosticsAdmin(ctx));

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
      <p class="muted">API admin activa · v${escapeHtml(version)}</p>
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
