import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AppContext } from "../../app";
import { notFound } from "../../http/errors";
import { requireObject, validationError } from "../../http/validate";
import { BACKUP_FILE_RE, createBackupService } from "../../services/backup";
import { createAdminRouter } from "./base";

export function backupsAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);

  const backups = createBackupService({
    dataDir: ctx.runtime.dataDir,
    db: ctx.db,
    keepDaily: ctx.runtime.config.backup.keepDaily,
    hour: ctx.runtime.config.backup.hour,
    getLastAutoAt: () => ctx.repos.settings.getJson<string | null>("backup.last_at", null),
    setLastAutoAt: (iso) => ctx.repos.settings.setJson("backup.last_at", iso),
    log: (level, msg, extra) => ctx.log[level](msg, extra),
  });

  app.get("/api/admin/backups", (c) => {
    return c.json({
      items: backups.list().map(({ file, kind, bytes, createdAt }) => ({
        file,
        kind: kind === "full" ? "full" : "db",
        bytes,
        createdAt,
      })),
      lastAutoAt: ctx.repos.settings.getJson<string | null>("backup.last_at", null),
      keepDaily: ctx.runtime.config.backup.keepDaily,
      hour: ctx.runtime.config.backup.hour,
    });
  });

  app.post("/api/admin/backups", async (c) => {
    const body = requireObject(await c.req.json().catch(() => ({ kind: "db" })));
    const kind = body.kind === "full" ? "full" : "db";
    try {
      const result = kind === "full" ? backups.createFullZip() : backups.createDailyDb();
      return c.json({ file: result.file, bytes: result.bytes, kind }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.log.error("Error al crear copia", { kind, msg });
      throw validationError(`No se pudo crear la copia: ${msg}`);
    }
  });

  app.get("/api/admin/backups/:file", (c) => {
    const file = c.req.param("file");
    if (!BACKUP_FILE_RE.test(file)) throw validationError("Nombre de archivo inválido");
    const path = join(backups.backupsDir(), file);
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
    // Restauración completa en F4 / RF-52
    throw validationError("Restauración pendiente de F4 (backup.ts completo)");
  });

  return app;
}
