import type { Database } from "bun:sqlite";
import { Hono } from "hono";
import type { RuntimeOptions } from "./config";
import type { Repos } from "./db/repos";
import { HttpError, errorJson } from "./http/errors";
import type { Logger } from "./logger";
import { securityHeaders } from "./middleware/securityHeaders";
import { adminRoutes } from "./routes/admin";
import { publicRoutes } from "./routes/public";

export type AppContext = {
  runtime: RuntimeOptions;
  log: Logger;
  startedAt: number;
  db: Database;
  repos: Repos;
};

export function createApp(ctx: AppContext) {
  const app = new Hono();

  app.use("*", securityHeaders());

  app.route("/", publicRoutes(ctx));
  app.route("/", adminRoutes(ctx));

  // En --dev: assets TS/CSS de Carta y shared (Admin también en routes/admin)
  if (ctx.runtime.dev) {
    app.get("/carta/*", async (c) => {
      const rel = c.req.path.replace(/^\/carta\//, "");
      return serveDevFile(`src/carta/${safeRel(rel)}`);
    });
    app.get("/shared/*", async (c) => {
      const rel = c.req.path.replace(/^\/shared\//, "");
      return serveDevFile(`src/shared/${safeRel(rel)}`);
    });
  }

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Not Found" } }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(errorJson(err), err.status as 400);
    }
    ctx.log.error("Unhandled error", { message: err.message, stack: err.stack });
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Error interno" } }, 500);
  });

  return app;
}

function safeRel(rel: string): string {
  const cleaned = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!cleaned || cleaned.includes(".."))
    throw new HttpError(400, "VALIDATION_ERROR", "Ruta inválida");
  return cleaned;
}

async function serveDevFile(relPath: string): Promise<Response> {
  const file = Bun.file(relPath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  // El navegador no ejecuta TS: transpilar al vuelo en --dev
  if (relPath.endsWith(".ts")) {
    const source = await file.text();
    let js = new Bun.Transpiler({ loader: "ts" }).transformSync(source);
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

  const type = contentType(relPath);
  return new Response(file, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "no-store",
    },
  });
}

function contentType(path: string): string {
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js") || path.endsWith(".ts") || path.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8";
  }
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}
