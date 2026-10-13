import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AppContext } from "../../app";
import { notFound } from "../../http/errors";
import { requireObject, validationError } from "../../http/validate";
import { createAdminRouter } from "./base";

const FILE_RE = /^(menu|full|pre-[a-z0-9-]+)-\d{8}-\d{4}\.(db|zip)$/i;

export function backupsAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const backupsDir = join(ctx.runtime.dataDir, "backups");
  if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });

  app.get("/api/admin/backups", (c) => {
    const items = readdirSync(backupsDir)
      .filter((f) => f.endsWith(".db") || f.endsWith(".zip"))
      .map((file) => {
        const st = statSync(join(backupsDir, file));
        const kind = file.startsWith("full") ? "full" : "db";
        return {
          file,
          kind,
          bytes: st.size,
          createdAt: st.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return c.json({
      items,
      lastAutoAt: ctx.repos.settings.getJson<string | null>("backup.last_at", null),
      keepDaily: ctx.runtime.config.backup.keepDaily,
    });
  });

  app.post("/api/admin/backups", async (c) => {
    const body = requireObject(await c.req.json().catch(() => ({ kind: "db" })));
    const kind = body.kind === "full" ? "full" : "db";
    if (kind === "full") {
      // Zip completo llega en F4; por ahora solo BD
      throw validationError("Copia full aún no implementada (F4); use kind=db");
    }
    const stamp = new Date()
      .toISOString()
      .replace(/[-:TZ.]/g, "")
      .slice(0, 12);
    const file = `menu-${stamp.slice(0, 8)}-${stamp.slice(8, 12)}.db`;
    const dest = join(backupsDir, file).replace(/\\/g, "/");
    ctx.db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    const bytes = statSync(join(backupsDir, file)).size;
    ctx.repos.settings.setJson("backup.last_at", new Date().toISOString());
    return c.json({ file, bytes }, 201);
  });

  app.get("/api/admin/backups/:file", (c) => {
    const file = c.req.param("file");
    if (!FILE_RE.test(file)) throw validationError("Nombre de archivo inválido");
    const path = join(backupsDir, file);
    if (!existsSync(path)) throw notFound("Copia no encontrada");
    const bunFile = Bun.file(path);
    return new Response(bunFile, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      },
    });
  });

  app.post("/api/admin/backups/restore", async (c) => {
    const body = requireObject(await c.req.json().catch(() => ({})));
    if (body.confirm !== true) {
      throw validationError("Se requiere confirm: true");
    }
    // Restauración completa en F4
    throw validationError("Restauración pendiente de F4 (backup.ts completo)");
  });

  return app;
}
