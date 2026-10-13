import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContext } from "../../app";
import { HttpError, errorJson } from "../../http/errors";

/** Sub-router admin con manejo de HttpError. */
export function createAdminRouter(ctx: AppContext) {
  const app = new Hono();
  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json(errorJson(err), err.status as ContentfulStatusCode);
    }
    ctx.log.error("Admin route error", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return c.json({ error: { code: "INTERNAL_ERROR", message: "Error interno" } }, 500);
  });
  return app;
}
