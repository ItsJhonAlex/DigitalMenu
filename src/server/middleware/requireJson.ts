import type { MiddlewareHandler } from "hono";
import { errorJson, unsupportedMedia } from "../http/errors";

const WRITE = new Set(["POST", "PUT", "PATCH"]);

/**
 * Escrituras del Admin deben ser application/json,
 * salvo POST /api/admin/images (multipart/form-data).
 * DELETE no exige Content-Type (suele ir sin cuerpo).
 */
export const requireJsonWrites = (): MiddlewareHandler => {
  return async (c, next) => {
    const method = c.req.method;
    if (!WRITE.has(method)) {
      await next();
      return;
    }

    const path = c.req.path.replace(/\/+$/, "") || "/";
    const ct = (c.req.header("content-type") ?? "").toLowerCase();

    if (method === "POST" && path === "/api/admin/images") {
      if (!ct.includes("multipart/form-data")) {
        const err = unsupportedMedia("Content-Type debe ser multipart/form-data");
        return c.json(errorJson(err), 415);
      }
      await next();
      return;
    }

    if (!ct.includes("application/json")) {
      const err = unsupportedMedia("Content-Type debe ser application/json");
      return c.json(errorJson(err), 415);
    }

    await next();
  };
};
