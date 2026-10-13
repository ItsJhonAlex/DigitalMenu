import type { MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Guardia Admin: IP loopback + Host + Origin en escrituras (RF-02, ADR-08).
 * En modo `dev` solo exige IP loopback (permite herramientas locales).
 */
export const localOnly = (port: number, opts: { looseHost?: boolean } = {}): MiddlewareHandler => {
  return async (c, next) => {
    let ip = "";
    try {
      ip = getConnInfo(c).remote.address ?? "";
    } catch {
      // app.request() / sin Bun.serve: no hay conninfo
      ip = "";
    }
    // En --dev / tests (app.request sin socket) la IP puede venir vacía
    if (!LOOPBACK.has(ip) && !(opts.looseHost && ip === "")) {
      return c.text("Forbidden", 403);
    }

    if (!opts.looseHost) {
      const host = (c.req.header("host") ?? "").toLowerCase();
      const okHost = host === `localhost:${port}` || host === `127.0.0.1:${port}`;
      if (!okHost) return c.text("Forbidden", 403);
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      if (origin) {
        const okOrigin =
          origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
        if (!okOrigin) return c.text("Forbidden", 403);
      }
    }

    await next();
  };
};

/** Exportado para tests unitarios sin servidor. */
export function isLoopbackIp(ip: string): boolean {
  return LOOPBACK.has(ip);
}

export function isAllowedAdminHost(host: string, port: number): boolean {
  const h = host.toLowerCase();
  return h === `localhost:${port}` || h === `127.0.0.1:${port}`;
}
