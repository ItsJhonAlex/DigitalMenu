import type { AppContext } from "../../app";
import type { ProductType } from "../../db/types";
import { conflict, notFound } from "../../http/errors";
import { productDto } from "../../http/mappers";
import {
  loadI18n,
  optionalBool,
  parseI18n,
  parseIdParam,
  parseImageHash,
  parseOptionalAllergens,
  parseOptionalIngredients,
  requireInt,
  requireObject,
  requireString,
  saveI18n,
  validationError,
} from "../../http/validate";
import { createAdminRouter } from "./base";

const TYPES = new Set(["comida", "bebida", "articulo"]);

export function productsAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos } = ctx;

  app.post("/api/admin/products/reset-availability", (c) => {
    const n = repos.products.resetAllAvailable();
    return c.json({ ok: true, updated: n });
  });

  app.put("/api/admin/categories/:id/products/order", async (c) => {
    const categoryId = parseIdParam(c.req.param("id"));
    if (!repos.categories.get(categoryId)) throw notFound("Categoría no encontrada");
    const body = requireObject(await c.req.json());
    const ids = body.ids;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "number")) {
      throw validationError("ids inválidos", [{ field: "ids", issue: "type" }]);
    }
    const inCat = repos.products.list({ categoryId }).map((p) => p.id);
    const sortedA = [...inCat].sort((a, b) => a - b);
    const sortedB = [...(ids as number[])].sort((a, b) => a - b);
    if (sortedA.length !== sortedB.length || sortedA.some((id, i) => id !== sortedB[i])) {
      throw validationError("ids debe contener todos los productos de la categoría", [
        { field: "ids", issue: "mismatch" },
      ]);
    }
    repos.products.reorder(ids as number[]);
    return c.json({ ok: true });
  });

  app.get("/api/admin/products", (c) => {
    const q = c.req.query();
    const categoryId = q.categoryId ? Number(q.categoryId) : undefined;
    const type = q.type as ProductType | undefined;
    if (type && !TYPES.has(type)) throw validationError("type inválido");
    let available: boolean | undefined;
    if (q.status === "available") available = true;
    else if (q.status === "soldout") available = false;
    const langs = repos.languages.list().map((l) => l.code);

    const items = repos.products
      .list({
        categoryId: Number.isFinite(categoryId) ? categoryId : undefined,
        type,
        available,
        q: q.q,
        untranslated: q.untranslated,
      })
      .map((row) =>
        productDto(row, loadI18n(repos, "product", row.id), {
          missingLangs: repos.translations.missingLangs("product", row.id, langs),
          inOffers: repos.products.offerIds(row.id),
        }),
      );

    return c.json({ items, total: items.length });
  });

  app.get("/api/admin/products/:id", (c) => {
    const id = parseIdParam(c.req.param("id"));
    const row = repos.products.get(id);
    if (!row) throw notFound("Producto no encontrado");
    const langs = repos.languages.list().map((l) => l.code);
    return c.json(
      productDto(row, loadI18n(repos, "product", id), {
        missingLangs: repos.translations.missingLangs("product", id, langs),
        inOffers: repos.products.offerIds(id),
      }),
    );
  });

  app.post("/api/admin/products", async (c) => {
    const body = requireObject(await c.req.json());
    const categoryId = requireInt(body.categoryId, "categoryId", 1);
    if (!repos.categories.get(categoryId)) {
      throw validationError("categoryId no existe", [{ field: "categoryId", issue: "not_found" }]);
    }
    const type = requireString(body.type, "type");
    if (!TYPES.has(type))
      throw validationError("type inválido", [{ field: "type", issue: "enum" }]);
    const priceMinor = requireInt(body.priceMinor, "priceMinor", 0, 1_000_000_000);
    const image = parseImageHash(body.image) ?? null;
    const available = optionalBool(body.available, "available") ?? true;
    const visible = optionalBool(body.visible, "visible") ?? true;
    const i18n = parseI18n(body.i18n, repos);
    const ingredientsEs = parseOptionalIngredients(body.ingredientsEs, "ingredientsEs") ?? null;
    const ingredientsEn = parseOptionalIngredients(body.ingredientsEn, "ingredientsEn") ?? null;
    const allergens = parseOptionalAllergens(body.allergens) ?? null;

    const id = repos.products.create({
      category_id: categoryId,
      type: type as ProductType,
      price_minor: priceMinor,
      image,
      available,
      visible,
      ingredients_es: ingredientsEs,
      ingredients_en: ingredientsEn,
      allergens,
    });
    saveI18n(repos, "product", id, i18n);
    const row = repos.products.get(id)!;
    return c.json(productDto(row, loadI18n(repos, "product", id)), 201);
  });

  app.put("/api/admin/products/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const existing = repos.products.get(id);
    if (!existing) throw notFound("Producto no encontrado");
    const body = requireObject(await c.req.json());
    const categoryId = requireInt(body.categoryId ?? existing.category_id, "categoryId", 1);
    if (!repos.categories.get(categoryId)) {
      throw validationError("categoryId no existe", [{ field: "categoryId", issue: "not_found" }]);
    }
    const type = requireString(body.type ?? existing.type, "type");
    if (!TYPES.has(type)) throw validationError("type inválido");
    const priceMinor = requireInt(
      body.priceMinor ?? existing.price_minor,
      "priceMinor",
      0,
      1_000_000_000,
    );
    const image = body.image !== undefined ? (parseImageHash(body.image) ?? null) : existing.image;
    const available = optionalBool(body.available, "available") ?? existing.available === 1;
    const visible = optionalBool(body.visible, "visible") ?? existing.visible === 1;
    const i18n =
      body.i18n !== undefined ? parseI18n(body.i18n, repos) : loadI18n(repos, "product", id);
    const ingredientsEsParsed = parseOptionalIngredients(body.ingredientsEs, "ingredientsEs");
    const ingredientsEnParsed = parseOptionalIngredients(body.ingredientsEn, "ingredientsEn");
    const allergensParsed = parseOptionalAllergens(body.allergens);
    const ingredientsEs =
      ingredientsEsParsed !== undefined ? ingredientsEsParsed : existing.ingredients_es;
    const ingredientsEn =
      ingredientsEnParsed !== undefined ? ingredientsEnParsed : existing.ingredients_en;
    const allergens = allergensParsed !== undefined ? allergensParsed : existing.allergens;

    repos.products.update(id, {
      category_id: categoryId,
      type: type as ProductType,
      price_minor: priceMinor,
      image,
      available,
      visible,
      sort_order: existing.sort_order,
      ingredients_es: ingredientsEs,
      ingredients_en: ingredientsEn,
      allergens,
    });
    saveI18n(repos, "product", id, i18n);
    const row = repos.products.get(id)!;
    return c.json(productDto(row, loadI18n(repos, "product", id)));
  });

  app.patch("/api/admin/products/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (!repos.products.get(id)) throw notFound("Producto no encontrado");
    const body = requireObject(await c.req.json());
    if (body.available !== undefined) {
      repos.products.setAvailable(id, optionalBool(body.available, "available")!);
    }
    if (body.visible !== undefined) {
      repos.products.setVisible(id, optionalBool(body.visible, "visible")!);
    }
    if (body.priceMinor !== undefined) {
      repos.products.setPrice(id, requireInt(body.priceMinor, "priceMinor", 0, 1_000_000_000));
    }
    const row = repos.products.get(id)!;
    return c.json({
      id: row.id,
      available: row.available === 1,
      visible: row.visible === 1,
      priceMinor: row.price_minor,
      updatedAt: row.updated_at,
    });
  });

  app.delete("/api/admin/products/:id", (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (!repos.products.get(id)) throw notFound("Producto no encontrado");
    const result = repos.products.remove(id);
    if (!result.ok) {
      throw conflict("El producto forma parte de una oferta", [{ offers: result.offers }]);
    }
    return c.body(null, 204);
  });

  return app;
}
