import type { AppContext } from "../../app";
import { validationError } from "../../http/validate";
import {
  applyCatalogImport,
  backupBeforeImport,
  clearImportPlan,
  exportCatalog,
  loadImportPlan,
  parseCatalogFile,
  previewCatalogImport,
  storeImportPlan,
  type CatalogIoFormat,
  type ImportPlan,
} from "../../services/catalog-io";
import { createAdminRouter } from "./base";

const MAX_UPLOAD = 8 * 1024 * 1024;

export function catalogIoAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos, db, runtime } = ctx;

  app.get("/api/admin/catalog/export", (c) => {
    const format = (c.req.query("format") ?? "xlsx") as CatalogIoFormat;
    if (format !== "xlsx" && format !== "csvzip" && format !== "csv") {
      throw validationError("format debe ser xlsx, csvzip o csv");
    }
    const { bytes, filename, contentType } = exportCatalog(repos, format);
    return new Response(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  });

  app.post("/api/admin/catalog/import/preview", async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      throw validationError("Se requiere archivo (campo file)");
    }
    if (file.size > MAX_UPLOAD) {
      throw validationError("Archivo demasiado grande (máx. 8 MB)");
    }
    const buf = new Uint8Array(await file.arrayBuffer());
    let sheets;
    try {
      sheets = parseCatalogFile(file.name, buf);
    } catch (err) {
      throw validationError(err instanceof Error ? err.message : "No se pudo leer el archivo");
    }
    const preview = previewCatalogImport(repos, sheets);
    let token: string | null = null;
    if (preview.errors.length === 0 && (preview.creates.length > 0 || preview.updates.length > 0)) {
      token = storeImportPlan(repos, preview.plan);
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
    const body = (await c.req.json().catch(() => ({}))) as {
      confirm?: boolean;
      token?: string;
      plan?: ImportPlan;
    };
    if (body.confirm !== true) {
      throw validationError("Se requiere confirm: true");
    }
    let plan: ImportPlan | null = null;
    if (typeof body.token === "string" && body.token) {
      plan = loadImportPlan(repos, body.token);
      if (!plan) throw validationError("Plan de importación expirado o inválido; vuelva a previsualizar");
    } else if (body.plan) {
      plan = body.plan;
    }
    if (!plan) throw validationError("Falta token o plan");
    if (plan.categories.length === 0 && plan.products.length === 0) {
      throw validationError("Plan vacío");
    }

    const safetyBackup = backupBeforeImport(db, runtime.dataDir);
    const result = applyCatalogImport(repos, plan);
    if (typeof body.token === "string") clearImportPlan(repos, body.token);

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
