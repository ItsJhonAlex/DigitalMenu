import type { MiddlewareHandler } from "hono";

/**
 * PIN opcional del Admin (RF-07). Stub: sin PIN activo en Fase 0/1 inicial.
 * Se conectará a settings cuando exista la BD.
 */
export const adminPin = (): MiddlewareHandler => async (_c, next) => {
  await next();
};
