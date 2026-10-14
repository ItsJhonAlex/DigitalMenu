import { existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import type { HealthResponse } from "../../shared/api-types";
import type { AppContext } from "../app";
import { hasEmbeddedAssets, serveEmbedded } from "../assets";
import { createMenuService } from "../services/menu";
import { MENU_EVENTS_MAX_CLIENTS, menuEventsResponse } from "../services/menu-events";

const IMG_RE = /^[a-f0-9]{16}(_t)?\.webp$/;

export function publicRoutes(ctx: AppContext) {
  const app = new Hono();
  const menu = createMenuService({ getRepos: () => ctx.repos });

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

  /** SSE: revisión del menú en vivo (M1). Latido 25 s; tope de clientes. */
  app.get("/api/menu/events", (c) => {
    // Bun cierra conexiones idle a los 10 s por defecto; el latido va a 25 s → sin timeout.
    const server = (
      c.env as { server?: { timeout: (req: Request, sec: number) => void } } | undefined
    )?.server;
    try {
      server?.timeout(c.req.raw, 0);
    } catch {
      // app.request() en tests sin Bun.serve
    }
    if (ctx.menuEvents.clientCount() >= MENU_EVENTS_MAX_CLIENTS) {
      return c.json(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: `Demasiadas conexiones en vivo (máx. ${MENU_EVENTS_MAX_CLIENTS})`,
          },
        },
        503,
      );
    }
    return menuEventsResponse(ctx.menuEvents, () => ctx.repos.settings.getMenuRevision());
  });

  const serveCartaHtml = async () => {
    if (!ctx.runtime.dev && hasEmbeddedAssets()) {
      const embedded = serveEmbedded("/");
      if (embedded) return embedded;
    }
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

  if (!ctx.runtime.dev) {
    app.get("/carta/*", (c) => {
      const embedded = serveEmbedded(c.req.path);
      if (embedded) return embedded;
      return c.notFound();
    });
  }

  return app;
}

function cartaFallbackHtml(version: string): string {
  return `<!DOCTYPE html><html lang="es"><body><p>Carta no encontrada (v${version})</p></body></html>`;
}
