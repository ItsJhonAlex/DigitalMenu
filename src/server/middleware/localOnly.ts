import type { MiddlewareHandler } from "hono";
import { getConnInfo } from "hono/bun";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * Guardia Admin: IP loopback + Host + Origin en escrituras (RF-02, ADR-08, RNF-20).
 * En modo `dev` solo relaja Host/IP (permite herramientas locales / app.request).
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
      if (!isAllowedAdminHost(host, port)) return c.text("Forbidden", 403);
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("origin");
      const secFetchSite = c.req.header("sec-fetch-site");
      if (!isWriteOriginAllowed({ origin, secFetchSite, port })) {
        return c.text("Forbidden", 403);
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

export function isAllowedAdminOrigin(origin: string, port: number): boolean {
  return origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
}

/**
 * Escrituras: Origin válido, o sin Origin solo si Sec-Fetch-Site es same-origin.
 * Sin Origin y sin same-origin → rechazo (CSRF / fetch cross-site).
 */
export function isWriteOriginAllowed(opts: {
  origin: string | undefined | null;
  secFetchSite: string | undefined | null;
  port: number;
}): boolean {
  const origin = opts.origin?.trim() || "";
  if (origin) return isAllowedAdminOrigin(origin, opts.port);
  const site = (opts.secFetchSite ?? "").toLowerCase();
  return site === "same-origin";
}
