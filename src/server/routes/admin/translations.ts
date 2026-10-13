import type { AppContext } from "../../app";
import type { TranslationEntity } from "../../db/types";
import { notFound } from "../../http/errors";
import { requireObject, requireString, validationError } from "../../http/validate";
import { createAdminRouter } from "./base";

const ENTITIES = new Set(["category", "product", "offer"]);

export function translationsAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos } = ctx;

  app.get("/api/admin/translations/status", (c) => {
    const langs = repos.languages.list().map((l) => l.code);
    return c.json({ items: repos.translations.status(langs) });
  });

  app.get("/api/admin/translations", (c) => {
    const lang = c.req.query("lang");
    const entity = c.req.query("entity") as TranslationEntity | undefined;
    if (!lang) throw validationError("lang obligatorio", [{ field: "lang", issue: "required" }]);
    if (!repos.languages.get(lang)) throw notFound("Idioma no encontrado");
    if (!entity || !ENTITIES.has(entity)) {
      throw validationError("entity inválido", [{ field: "entity", issue: "enum" }]);
    }

    // Lista todas las entidades con ES + traducción del idioma pedido
    const ids =
      entity === "category"
        ? repos.categories.list().map((r) => r.id)
        : entity === "product"
          ? repos.products.list().map((r) => r.id)
          : repos.offers.list().map((r) => r.id);

    const items = ids.map((entityId) => {
      const es = repos.translations.get(entity, entityId, "es");
      const t = repos.translations.get(entity, entityId, lang);
      return {
        entity,
        entityId,
        source: es ? { name: es.name, description: es.description } : null,
        translation: t ? { name: t.name, description: t.description } : null,
      };
    });

    return c.json({ lang, entity, items });
  });

  app.put("/api/admin/translations", async (c) => {
    const body = requireObject(await c.req.json());
    const lang = requireString(body.lang, "lang", 2, 10);
    if (!repos.languages.get(lang)) throw notFound("Idioma no encontrado");
    if (!Array.isArray(body.items)) {
      throw validationError("items inválido", [{ field: "items", issue: "type" }]);
    }

    for (const [i, raw] of body.items.entries()) {
      if (raw === null || typeof raw !== "object") {
        throw validationError(`items[${i}] inválido`);
      }
      const it = raw as Record<string, unknown>;
      const entity = requireString(it.entity, `items[${i}].entity`);
      if (!ENTITIES.has(entity)) throw validationError(`entity inválido en items[${i}]`);
      const entityId = Number(it.entityId);
      if (!Number.isInteger(entityId) || entityId <= 0) {
        throw validationError(`entityId inválido en items[${i}]`);
      }
      const name = typeof it.name === "string" ? it.name.trim() : "";
      if (lang === "es" && name.length === 0) {
        throw validationError("No se puede vaciar el nombre en español", [
          { field: `items[${i}].name`, issue: "required" },
        ]);
      }
      if (name.length === 0) {
        repos.translations.remove(entity as TranslationEntity, entityId, lang);
        continue;
      }
      if (name.length > 80) throw validationError(`Nombre demasiado largo en items[${i}]`);
      let description: string | null = null;
      if (it.description !== undefined && it.description !== null) {
        if (typeof it.description !== "string" || it.description.length > 500) {
          throw validationError(`description inválida en items[${i}]`);
        }
        description = it.description;
      }
      repos.translations.upsert({
        entity: entity as TranslationEntity,
        entity_id: entityId,
        lang,
        name,
        description,
      });
    }

    return c.json({ ok: true });
  });

  app.get("/api/admin/ui-strings", (c) => {
    const lang = c.req.query("lang");
    if (!lang) throw validationError("lang obligatorio");
    if (!repos.languages.get(lang)) throw notFound("Idioma no encontrado");
    const rows = repos.uiStrings.listByLang(lang);
    const values: Record<string, string> = {};
    for (const r of rows) values[r.key] = r.value;
    return c.json({ lang, values });
  });

  app.put("/api/admin/ui-strings", async (c) => {
    const lang = c.req.query("lang");
    if (!lang) throw validationError("lang obligatorio");
    if (!repos.languages.get(lang)) throw notFound("Idioma no encontrado");
    const body = requireObject(await c.req.json());
    const values = body.values;
    if (values === null || typeof values !== "object" || Array.isArray(values)) {
      throw validationError("values debe ser un objeto");
    }
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
      if (typeof value !== "string" || value.length > 200) {
        throw validationError(`Valor inválido para ${key}`);
      }
      map[key] = value;
    }
    repos.uiStrings.putMany(lang, map);
    return c.json({ ok: true });
  });

  return app;
}
