import type { MiddlewareHandler } from "hono";
import { errorJson, unsupportedMedia } from "../http/errors";

const WRITE = new Set(["POST", "PUT", "PATCH"]);

const MULTIPART_POSTS = new Set(["/api/admin/images", "/api/admin/catalog/import/preview"]);

/** JSON o multipart (RF-52: restaurar desde lista o subida). */
const JSON_OR_MULTIPART_POSTS = new Set(["/api/admin/backups/restore"]);

/**
 * Escrituras del Admin deben ser application/json,
 * salvo POST multipart (imágenes, importación CSV/XLSX)
 * o rutas que aceptan ambos (restauración).
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

    if (method === "POST" && MULTIPART_POSTS.has(path)) {
      if (!ct.includes("multipart/form-data")) {
        const err = unsupportedMedia("Content-Type debe ser multipart/form-data");
        return c.json(errorJson(err), 415);
      }
      await next();
      return;
    }

    if (method === "POST" && JSON_OR_MULTIPART_POSTS.has(path)) {
      if (!ct.includes("application/json") && !ct.includes("multipart/form-data")) {
        const err = unsupportedMedia(
          "Content-Type debe ser application/json o multipart/form-data",
        );
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
