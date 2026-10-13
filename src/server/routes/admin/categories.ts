import type { AppContext } from "../../app";
import { conflict, notFound } from "../../http/errors";
import { categoryDto } from "../../http/mappers";
import {
  loadI18n,
  optionalBool,
  parseI18n,
  parseIdParam,
  parseImageHash,
  requireObject,
  saveI18n,
  validationError,
} from "../../http/validate";
import { createAdminRouter } from "./base";

export function categoriesAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos } = ctx;

  app.get("/api/admin/categories", (c) => {
    const items = repos.categories
      .list()
      .map((row) =>
        categoryDto(
          row,
          loadI18n(repos, "category", row.id),
          repos.categories.productCount(row.id),
        ),
      );
    return c.json({ items });
  });

  app.put("/api/admin/categories/order", async (c) => {
    const body = requireObject(await c.req.json());
    const ids = body.ids;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "number" && Number.isInteger(x))) {
      throw validationError("ids inválidos", [{ field: "ids", issue: "type" }]);
    }
    const all = repos.categories.allIds().sort((a, b) => a - b);
    const sorted = [...ids].sort((a, b) => a - b);
    if (all.length !== sorted.length || all.some((id, i) => id !== sorted[i])) {
      throw validationError("ids debe contener todas las categorías exactamente una vez", [
        { field: "ids", issue: "mismatch" },
      ]);
    }
    repos.categories.reorder(ids as number[]);
    return c.json({ ok: true });
  });

  app.get("/api/admin/categories/:id", (c) => {
    const id = parseIdParam(c.req.param("id"));
    const row = repos.categories.get(id);
    if (!row) throw notFound("Categoría no encontrada");
    return c.json(
      categoryDto(row, loadI18n(repos, "category", id), repos.categories.productCount(id)),
    );
  });

  app.post("/api/admin/categories", async (c) => {
    const body = requireObject(await c.req.json());
    const visible = optionalBool(body.visible, "visible") ?? true;
    const image = parseImageHash(body.image) ?? null;
    const i18n = parseI18n(body.i18n, repos);
    const id = repos.categories.create({ visible, image });
    saveI18n(repos, "category", id, i18n);
    const row = repos.categories.get(id)!;
    return c.json(categoryDto(row, loadI18n(repos, "category", id), 0), 201);
  });

  app.put("/api/admin/categories/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const existing = repos.categories.get(id);
    if (!existing) throw notFound("Categoría no encontrada");
    const body = requireObject(await c.req.json());
    const visible = optionalBool(body.visible, "visible") ?? existing.visible === 1;
    const image = body.image !== undefined ? (parseImageHash(body.image) ?? null) : existing.image;
    const i18n =
      body.i18n !== undefined ? parseI18n(body.i18n, repos) : loadI18n(repos, "category", id);
    repos.categories.update(id, { sort_order: existing.sort_order, visible, image });
    saveI18n(repos, "category", id, i18n);
    const row = repos.categories.get(id)!;
    return c.json(
      categoryDto(row, loadI18n(repos, "category", id), repos.categories.productCount(id)),
    );
  });

  app.patch("/api/admin/categories/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (!repos.categories.get(id)) throw notFound("Categoría no encontrada");
    const body = requireObject(await c.req.json());
    if (body.visible !== undefined) {
      const visible = optionalBool(body.visible, "visible");
      if (visible !== undefined) repos.categories.setVisible(id, visible);
    }
    const row = repos.categories.get(id)!;
    return c.json({
      id: row.id,
      visible: row.visible === 1,
      updatedAt: row.updated_at,
    });
  });

  app.delete("/api/admin/categories/:id", (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (!repos.categories.get(id)) throw notFound("Categoría no encontrada");
    const result = repos.categories.remove(id);
    if (!result.ok) {
      throw conflict(
        `La categoría tiene ${result.productCount} productos. Muévalos u oculte la categoría.`,
        [{ productCount: result.productCount }],
      );
    }
    return c.body(null, 204);
  });

  return app;
}
