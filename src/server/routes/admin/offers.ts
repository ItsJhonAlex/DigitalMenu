import type { AppContext } from "../../app";
import { notFound } from "../../http/errors";
import {
  loadI18n,
  optionalBool,
  parseI18n,
  parseIdParam,
  parseImageHash,
  requireInt,
  requireObject,
  saveI18n,
  validationError,
} from "../../http/validate";
import { createAdminRouter } from "./base";

function offerDto(ctx: AppContext, id: number) {
  const row = ctx.repos.offers.get(id);
  if (!row) return null;
  const items = ctx.repos.offers.items(id);
  const regularMinor = ctx.repos.offers.regularMinor(id);
  return {
    id: row.id,
    priceMinor: row.price_minor,
    regularMinor,
    savingsMinor: Math.max(0, regularMinor - row.price_minor),
    available: row.available === 1,
    effectiveAvailable: ctx.repos.offers.effectiveAvailable(id),
    visible: row.visible === 1,
    showSavings: row.show_savings === 1,
    sortOrder: row.sort_order,
    image: row.image,
    items: items.map((it) => ({
      productId: it.product_id,
      quantity: it.quantity,
      sortOrder: it.sort_order,
    })),
    i18n: loadI18n(ctx.repos, "offer", id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseItems(raw: unknown, repos: AppContext["repos"]) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw validationError("items obligatorio", [{ field: "items", issue: "required" }]);
  }
  const seen = new Set<number>();
  const items: Array<{ product_id: number; quantity: number }> = [];
  for (const [i, it] of raw.entries()) {
    if (it === null || typeof it !== "object") {
      throw validationError(`items[${i}] inválido`);
    }
    const o = it as Record<string, unknown>;
    const productId = requireInt(o.productId, `items[${i}].productId`, 1);
    if (seen.has(productId)) {
      throw validationError("productId duplicado", [{ field: "items", issue: "duplicate" }]);
    }
    seen.add(productId);
    if (!repos.products.get(productId)) {
      throw validationError(`Producto ${productId} no existe`, [
        { field: `items[${i}].productId`, issue: "not_found" },
      ]);
    }
    const quantity =
      o.quantity === undefined ? 1 : requireInt(o.quantity, `items[${i}].quantity`, 1, 99);
    items.push({ product_id: productId, quantity });
  }
  return items;
}

export function offersAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos } = ctx;

  app.put("/api/admin/offers/order", async (c) => {
    const body = requireObject(await c.req.json());
    const ids = body.ids;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "number")) {
      throw validationError("ids inválidos");
    }
    const all = repos.offers.allIds().sort((a, b) => a - b);
    const sorted = [...(ids as number[])].sort((a, b) => a - b);
    if (all.length !== sorted.length || all.some((id, i) => id !== sorted[i])) {
      throw validationError("ids debe contener todas las ofertas");
    }
    repos.offers.reorder(ids as number[]);
    return c.json({ ok: true });
  });

  app.get("/api/admin/offers", (c) => {
    const items = repos.offers.list().map((row) => offerDto(ctx, row.id)!);
    return c.json({ items });
  });

  app.get("/api/admin/offers/:id", (c) => {
    const id = parseIdParam(c.req.param("id"));
    const dto = offerDto(ctx, id);
    if (!dto) throw notFound("Oferta no encontrada");
    return c.json(dto);
  });

  app.post("/api/admin/offers", async (c) => {
    const body = requireObject(await c.req.json());
    const priceMinor = requireInt(body.priceMinor, "priceMinor", 0, 1_000_000_000);
    const image = parseImageHash(body.image) ?? null;
    const available = optionalBool(body.available, "available") ?? true;
    const visible = optionalBool(body.visible, "visible") ?? true;
    const showSavings = optionalBool(body.showSavings, "showSavings") ?? false;
    const items = parseItems(body.items, repos);
    const i18n = parseI18n(body.i18n, repos);

    const id = repos.offers.create({
      price_minor: priceMinor,
      image,
      available,
      visible,
      show_savings: showSavings,
      items,
    });
    saveI18n(repos, "offer", id, i18n);
    return c.json(offerDto(ctx, id), 201);
  });

  app.put("/api/admin/offers/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const existing = repos.offers.get(id);
    if (!existing) throw notFound("Oferta no encontrada");
    const body = requireObject(await c.req.json());
    const priceMinor = requireInt(
      body.priceMinor ?? existing.price_minor,
      "priceMinor",
      0,
      1_000_000_000,
    );
    const image = body.image !== undefined ? (parseImageHash(body.image) ?? null) : existing.image;
    const available = optionalBool(body.available, "available") ?? existing.available === 1;
    const visible = optionalBool(body.visible, "visible") ?? existing.visible === 1;
    const showSavings =
      optionalBool(body.showSavings, "showSavings") ?? existing.show_savings === 1;
    const items = body.items !== undefined ? parseItems(body.items, repos) : repos.offers.items(id);
    const i18n =
      body.i18n !== undefined ? parseI18n(body.i18n, repos) : loadI18n(repos, "offer", id);

    repos.offers.update(id, {
      price_minor: priceMinor,
      image,
      available,
      visible,
      show_savings: showSavings,
      sort_order: existing.sort_order,
    });
    if (body.items !== undefined) {
      repos.offers.setItems(
        id,
        items.map((it) => ({
          product_id:
            "product_id" in it ? it.product_id : (it as { product_id: number }).product_id,
          quantity: "quantity" in it ? it.quantity : 1,
        })),
      );
    }
    saveI18n(repos, "offer", id, i18n);
    return c.json(offerDto(ctx, id));
  });

  app.patch("/api/admin/offers/:id", async (c) => {
    const id = parseIdParam(c.req.param("id"));
    const existing = repos.offers.get(id);
    if (!existing) throw notFound("Oferta no encontrada");
    const body = requireObject(await c.req.json());
    repos.offers.update(id, {
      price_minor: existing.price_minor,
      image: existing.image,
      available: optionalBool(body.available, "available") ?? existing.available === 1,
      visible: optionalBool(body.visible, "visible") ?? existing.visible === 1,
      show_savings: optionalBool(body.showSavings, "showSavings") ?? existing.show_savings === 1,
      sort_order: existing.sort_order,
    });
    const row = repos.offers.get(id)!;
    return c.json({
      id: row.id,
      available: row.available === 1,
      effectiveAvailable: repos.offers.effectiveAvailable(id),
      visible: row.visible === 1,
      updatedAt: row.updated_at,
    });
  });

  app.delete("/api/admin/offers/:id", (c) => {
    const id = parseIdParam(c.req.param("id"));
    if (!repos.offers.get(id)) throw notFound("Oferta no encontrada");
    repos.offers.remove(id);
    return c.body(null, 204);
  });

  return app;
}
