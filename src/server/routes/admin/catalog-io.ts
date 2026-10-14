import type { AppContext } from "../../app";
import { validationError } from "../../http/validate";
import {
  type CatalogIoFormat,
  applyCatalogImport,
  backupBeforeImport,
  clearImportPlan,
  exportCatalog,
  loadImportPlan,
  parseCatalogFile,
  previewCatalogImport,
  storeImportPlan,
} from "../../services/catalog-io";
import { isRestoreBusy } from "../../services/restore";
import { createAdminRouter } from "./base";

const MAX_UPLOAD = 8 * 1024 * 1024;

export function catalogIoAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);

  app.get("/api/admin/catalog/export", (c) => {
    const format = (c.req.query("format") ?? "xlsx") as CatalogIoFormat;
    if (format !== "xlsx" && format !== "csvzip" && format !== "csv") {
      throw validationError("format debe ser xlsx, csvzip o csv");
    }
    const { bytes, filename, contentType } = exportCatalog(ctx.repos, format);
    // Copia a ArrayBuffer propio (tsc: Uint8Array<ArrayBufferLike> ≠ BlobPart)
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return new Response(body as ArrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });

  app.post("/api/admin/catalog/import/preview", async (c) => {
    if (isRestoreBusy()) {
      throw validationError("Hay una restauración en curso; espere a que termine");
    }
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      throw validationError("Se requiere archivo (campo file)");
    }
    if (file.size > MAX_UPLOAD) {
      throw validationError("Archivo demasiado grande (máx. 8 MB)");
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    let sheets: ReturnType<typeof parseCatalogFile>;
    try {
      sheets = parseCatalogFile(file.name, buf);
    } catch (err) {
      throw validationError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    }
    const preview = previewCatalogImport(ctx.repos, sheets);
    let token: string | null = null;
    if (preview.errors.length === 0 && (preview.creates.length > 0 || preview.updates.length > 0)) {
      token = storeImportPlan(ctx.repos, preview.plan);
    }
    return c.json({
      creates: preview.creates,
      updates: preview.updates,
      errors: preview.errors,
      token,
      summary: {
        createCount: preview.creates.length,
        updateCount: preview.updates.length,
        errorCount: preview.errors.length,
      },
    });
  });

  app.post("/api/admin/catalog/import/apply", async (c) => {
    if (isRestoreBusy()) {
      throw validationError("Hay una restauración en curso; espere a que termine");
    }
    const body = (await c.req.json().catch(() => ({}))) as {
      confirm?: boolean;
      token?: string;
    };
    if (body.confirm !== true) {
      throw validationError("Se requiere confirm: true");
    }
    if (typeof body.token !== "string" || !body.token) {
      throw validationError("Se requiere token de la vista previa");
    }
    const plan = loadImportPlan(ctx.repos, body.token);
    if (!plan) {
      throw validationError("Plan de importación expirado o inválido; vuelva a previsualizar");
    }
    if (plan.categories.length === 0 && plan.products.length === 0) {
      throw validationError("Plan vacío");
    }

    const safetyBackup = backupBeforeImport(ctx.db, ctx.runtime.dataDir);
    const result = applyCatalogImport(ctx.db, ctx.repos, plan);
    clearImportPlan(ctx.repos, body.token);

    ctx.log.info("Importación de carta aplicada", {
      ...result,
      safetyBackup,
    });

    return c.json({
      ok: true,
      ...result,
      safetyBackup,
    });
  });

  return app;
}
