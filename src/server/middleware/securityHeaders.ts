import type { MiddlewareHandler } from "hono";

/** Cabeceras de seguridad básicas (Carta + Admin). */
export const securityHeaders = (): MiddlewareHandler => async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "no-referrer");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // CSP estricta en producción; en --dev se relaja desde app.ts si hace falta
  if (!c.res.headers.has("Content-Security-Policy")) {
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
    );
  }
};
