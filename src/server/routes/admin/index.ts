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

  app.get("/admin", async (c) => {
    const file = Bun.file("src/admin/index.html");
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return c.html(adminPlaceholderHtml(ctx.runtime.version));
  });
  app.get("/admin/", (c) => c.redirect("/admin"));

  // Assets SPA (TS/CSS) — solo en --dev; en prod irán embebidos
  if (ctx.runtime.dev) {
    app.get("/admin/*", async (c) => {
      const rel = c.req.path.replace(/^\/admin\//, "").replace(/\\/g, "/");
      if (!rel || rel.includes("..")) return c.notFound();
      if (!(rel.endsWith(".ts") || rel.endsWith(".css") || rel.endsWith(".js"))) {
        return c.notFound();
      }
      const file = Bun.file(`src/admin/${rel}`);
      if (!(await file.exists())) return c.notFound();
      if (rel.endsWith(".ts")) {
        let js = new Bun.Transpiler({ loader: "ts" }).transformSync(await file.text());
        // El navegador exige extensión en imports ESM relativos
        js = js.replace(
          /(from\s*["'])(\.[^"']+)(["'])/g,
          (_m, a: string, spec: string, b: string) =>
            a + (/\.(ts|js|css|json)$/.test(spec) ? spec : `${spec}.ts`) + b,
        );
        return new Response(js, {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
      return new Response(file, {
        headers: {
          "Content-Type": rel.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    });
  }

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
  <title>Avanzar In Time — Admin</title>
  <link rel="stylesheet" href="/admin/styles.css" />
</head>
<body>
  <p>Admin no embebido (falta src/admin/index.html). v${escapeHtml(version)}</p>
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
