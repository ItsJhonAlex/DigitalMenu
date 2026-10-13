import type { AppContext } from "../../app";
import { conflict, notFound } from "../../http/errors";
import { optionalBool, requireObject, requireString } from "../../http/validate";
import { createAdminRouter } from "./base";

export function languagesAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos } = ctx;

  app.get("/api/admin/languages", (c) => {
    return c.json({
      items: repos.languages.list().map((l) => ({
        code: l.code,
        nativeName: l.native_name,
        active: l.active === 1,
        sortOrder: l.sort_order,
      })),
    });
  });

  app.post("/api/admin/languages", async (c) => {
    const body = requireObject(await c.req.json());
    const code = requireString(body.code, "code", 2, 10).toLowerCase();
    if (repos.languages.get(code)) throw conflict(`El idioma ${code} ya existe`);
    const nativeName = requireString(body.nativeName, "nativeName", 1, 80);
    const active = optionalBool(body.active, "active") ?? true;
    repos.languages.create({ code, native_name: nativeName, active });
    const row = repos.languages.get(code)!;
    return c.json(
      {
        code: row.code,
        nativeName: row.native_name,
        active: row.active === 1,
        sortOrder: row.sort_order,
      },
      201,
    );
  });

  app.patch("/api/admin/languages/:code", async (c) => {
    const code = c.req.param("code").toLowerCase();
    if (!repos.languages.get(code)) throw notFound("Idioma no encontrado");
    const body = requireObject(await c.req.json());
    if (body.active !== undefined) {
      const active = optionalBool(body.active, "active")!;
      try {
        repos.languages.setActive(code, active);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("desactivar el idioma es")) {
          throw conflict("No se puede desactivar el idioma es");
        }
        throw err;
      }
    }
    const row = repos.languages.get(code)!;
    return c.json({
      code: row.code,
      nativeName: row.native_name,
      active: row.active === 1,
      sortOrder: row.sort_order,
    });
  });

  app.delete("/api/admin/languages/:code", (c) => {
    const code = c.req.param("code").toLowerCase();
    if (!repos.languages.get(code)) throw notFound("Idioma no encontrado");
    if (code === "es") throw conflict("No se puede eliminar el idioma es");
    try {
      repos.languages.remove(code);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("eliminar el idioma es")) throw conflict(msg);
      throw err;
    }
    return c.body(null, 204);
  });

  return app;
}
