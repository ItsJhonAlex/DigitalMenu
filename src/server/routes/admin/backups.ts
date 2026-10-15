import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AppContext } from "../../app";
import { HttpError, notFound } from "../../http/errors";
import { requireObject, validationError } from "../../http/validate";
import {
  BACKUP_FILE_RE,
  createBackupService,
  preRestoreFullBackupFileName,
} from "../../services/backup";
import { RestoreError, createRestoreService } from "../../services/restore";
import { createAdminRouter } from "./base";

const MAX_RESTORE_UPLOAD = 256 * 1024 * 1024;

function mapRestoreError(err: RestoreError): never {
  const status =
    err.code === "NOT_FOUND"
      ? 404
      : err.code === "BUSY"
        ? 409
        : err.code === "NEWER_SCHEMA" || err.code === "INVALID_BACKUP"
          ? 400
          : 500;
  const code =
    err.code === "FAILED" ? "INTERNAL_ERROR" : err.code === "BUSY" ? "CONFLICT" : err.code;
  throw new HttpError(status, code, err.message);
}

export function backupsAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);

  const backups = createBackupService({
    dataDir: ctx.runtime.dataDir,
    getDb: () => ctx.db,
    keepDaily: ctx.runtime.config.backup.keepDaily,
    hour: ctx.runtime.config.backup.hour,
    getLastAutoAt: () => ctx.repos.settings.getJson<string | null>("backup.last_at", null),
    setLastAutoAt: (iso) => ctx.repos.settings.setJson("backup.last_at", iso),
    log: (level, msg, extra) => ctx.log[level](msg, extra),
  });

  const restoreSvc = createRestoreService({
    dataDir: ctx.runtime.dataDir,
    getDb: () => ctx.db,
    createSafetyBackup: () => backups.createFullZip(new Date(), preRestoreFullBackupFileName()),
    replaceDatabase: (next) => ctx.rebindDatabase(next),
    log: (level, msg, extra) => ctx.log[level](msg, extra),
  });

  app.get("/api/admin/backups", (c) => {
    return c.json({
      items: backups.list().map(({ file, kind, bytes, createdAt }) => ({
        file,
        kind,
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
    const ct = (c.req.header("content-type") ?? "").toLowerCase();
    try {
      if (ct.includes("multipart/form-data")) {
        const form = await c.req.parseBody({ all: true });
        const confirmRaw = form.confirm;
        const asFlag = (v: unknown) => v === "true" || v === "1";
        const confirm = Array.isArray(confirmRaw) ? confirmRaw.some(asFlag) : asFlag(confirmRaw);
        if (!confirm) {
          throw validationError("Se requiere confirm: true");
        }
        const file = form.file;
        if (!(file instanceof File)) {
          throw validationError("Se requiere archivo (campo file)");
        }
        if (file.size > MAX_RESTORE_UPLOAD) {
          throw validationError("Archivo demasiado grande (máx. 256 MB)");
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        const result = await restoreSvc.restore({
          type: "upload",
          fileName: file.name || "upload.db",
          bytes,
        });
        return c.json(result);
      }

      const body = requireObject(await c.req.json().catch(() => ({})));
      if (body.confirm !== true) {
        throw validationError("Se requiere confirm: true");
      }
      const file = typeof body.file === "string" ? body.file : "";
      if (!file || !BACKUP_FILE_RE.test(file)) {
        throw validationError("Nombre de archivo inválido");
      }
      const result = await restoreSvc.restore({ type: "file", fileName: file });
      return c.json(result);
    } catch (err) {
      if (err instanceof RestoreError) mapRestoreError(err);
      throw err;
    }
  });

  return app;
}
