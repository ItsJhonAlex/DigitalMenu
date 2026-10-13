import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { HealthResponse } from "../../shared/api-types";
import type { AppContext } from "../app";
import { createMenuService } from "../services/menu";

const IMG_RE = /^[a-f0-9]{16}(_t)?\.webp$/;

export function publicRoutes(ctx: AppContext) {
  const app = new Hono();
  const menu = createMenuService({ db: ctx.db, repos: ctx.repos });

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

  app.get("/api/menu", (c) => {
    const lang = c.req.query("lang") ?? undefined;
    const { body, etag } = menu.get(lang);
    const inm = c.req.header("if-none-match");
    if (inm && inm === etag) {
      return c.body(null, 304, {
        ETag: etag,
        "Cache-Control": "no-cache",
        "Content-Language": body.lang,
      });
    }
    return c.json(body, 200, {
      ETag: etag,
      "Cache-Control": "no-cache",
      "Content-Language": body.lang,
    });
  });

  const serveCartaHtml = async () => {
    const file = Bun.file("src/carta/index.html");
    if (await file.exists()) {
      return new Response(file, {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    return new Response(cartaFallbackHtml(ctx.runtime.version), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  };

  app.get("/", () => serveCartaHtml());
  // Deep link del detalle de producto (History API)
  app.get("/p/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isFinite(id) || id <= 0) return c.notFound();
    return serveCartaHtml();
  });

  return app;
}

function cartaFallbackHtml(version: string): string {
  return `<!DOCTYPE html><html lang="es"><body><p>Carta no encontrada (v${version})</p></body></html>`;
}
