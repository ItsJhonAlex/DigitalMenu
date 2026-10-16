import {
  type AllergenCode,
  emptyToNull,
  normalizeAllergensInput,
  serializeAllergens,
} from "../../shared/allergens";
import type { Repos } from "../db/repos";
import { validationError } from "./errors";

export { validationError };

export type I18nText = { name: string; description?: string | null };
export type I18nMap = Record<string, I18nText>;

export function requireObject(body: unknown, label = "body"): Record<string, unknown> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw validationError(`${label} debe ser un objeto`);
  }
  return body as Record<string, unknown>;
}

export function optionalBool(v: unknown, field: string): boolean | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "boolean")
    throw validationError(`${field} debe ser boolean`, [{ field, issue: "type" }]);
  return v;
}

export function requireBool(v: unknown, field: string): boolean {
  const b = optionalBool(v, field);
  if (b === undefined)
    throw validationError(`${field} es obligatorio`, [{ field, issue: "required" }]);
  return b;
}

export function optionalInt(v: unknown, field: string): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw validationError(`${field} debe ser entero`, [{ field, issue: "type" }]);
  }
  return v;
}

export function requireInt(v: unknown, field: string, min?: number, max?: number): number {
  const n = optionalInt(v, field);
  if (n === undefined)
    throw validationError(`${field} es obligatorio`, [{ field, issue: "required" }]);
  if (min != null && n < min)
    throw validationError(`${field} fuera de rango`, [{ field, issue: "range" }]);
  if (max != null && n > max)
    throw validationError(`${field} fuera de rango`, [{ field, issue: "range" }]);
  return n;
}

export function optionalString(v: unknown, field: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string")
    throw validationError(`${field} debe ser string`, [{ field, issue: "type" }]);
  return v;
}

export function requireString(v: unknown, field: string, minLen = 1, maxLen?: number): string {
  const s = optionalString(v, field);
  if (s === undefined)
    throw validationError(`${field} es obligatorio`, [{ field, issue: "required" }]);
  const t = s.trim();
  if (t.length < minLen)
    throw validationError(`${field} demasiado corto`, [{ field, issue: "min" }]);
  if (maxLen != null && t.length > maxLen) {
    throw validationError(`${field} demasiado largo`, [{ field, issue: "max" }]);
  }
  return t;
}

export function optionalNullableString(v: unknown, field: string): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string")
    throw validationError(`${field} debe ser string o null`, [{ field, issue: "type" }]);
  return v;
}

export function parseIdParam(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0)
    throw validationError("id inválido", [{ field: "id", issue: "type" }]);
  return id;
}

const IMAGE_HASH = /^[0-9a-f]{16}$/;

export function parseImageHash(v: unknown, field = "image"): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string" || !IMAGE_HASH.test(v)) {
    throw validationError(`${field} debe ser hash de 16 hex o null`, [{ field, issue: "format" }]);
  }
  return v;
}

export function parseI18n(raw: unknown, repos: Repos, opts: { requireEs?: boolean } = {}): I18nMap {
  const requireEs = opts.requireEs !== false;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw validationError("i18n debe ser un objeto", [{ field: "i18n", issue: "type" }]);
  }
  const map = raw as Record<string, unknown>;
  const known = new Set(repos.languages.list().map((l) => l.code));
  const out: I18nMap = {};

  for (const [lang, val] of Object.entries(map)) {
    if (!known.has(lang)) {
      throw validationError(`Idioma desconocido: ${lang}`, [
        { field: `i18n.${lang}`, issue: "unknown_lang" },
      ]);
    }
    if (val === null || typeof val !== "object" || Array.isArray(val)) {
      throw validationError(`i18n.${lang} inválido`, [{ field: `i18n.${lang}`, issue: "type" }]);
    }
    const o = val as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (name.length < 1 || name.length > 80) {
      throw validationError(`El nombre en ${lang} es inválido`, [
        { field: `i18n.${lang}.name`, issue: name.length < 1 ? "required" : "max" },
      ]);
    }
    let description: string | null = null;
    if (o.description !== undefined && o.description !== null) {
      if (typeof o.description !== "string") {
        throw validationError(`i18n.${lang}.description inválida`, [
          { field: `i18n.${lang}.description`, issue: "type" },
        ]);
      }
      if (o.description.length > 500) {
        throw validationError(`Descripción demasiado larga (${lang})`, [
          { field: `i18n.${lang}.description`, issue: "max" },
        ]);
      }
      description = o.description;
    }
    out[lang] = { name, description };
  }

  if (requireEs && !out.es?.name) {
    throw validationError("El nombre en español es obligatorio", [
      { field: "i18n.es.name", issue: "required" },
    ]);
  }
  return out;
}

export function saveI18n(
  repos: Repos,
  entity: "category" | "product" | "offer",
  entityId: number,
  i18n: I18nMap,
): void {
  for (const [lang, text] of Object.entries(i18n)) {
    repos.translations.upsert({
      entity,
      entity_id: entityId,
      lang,
      name: text.name,
      description: text.description ?? null,
    });
  }
}

export function loadI18n(
  repos: Repos,
  entity: "category" | "product" | "offer",
  entityId: number,
): I18nMap {
  const rows = repos.translations.listForEntity(entity, entityId);
  const out: I18nMap = {};
  for (const r of rows) {
    out[r.lang] = { name: r.name, description: r.description };
  }
  return out;
}

/** Texto libre de ingredientes: string vacío / null → null; undefined → omitir. */
export function parseOptionalIngredients(
  v: unknown,
  field: string,
  maxLen = 2000,
): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") {
    throw validationError(`${field} debe ser string o null`, [{ field, issue: "type" }]);
  }
  const t = emptyToNull(v);
  if (t != null && t.length > maxLen) {
    throw validationError(`${field} demasiado largo`, [{ field, issue: "max" }]);
  }
  return t;
}

/**
 * Alérgenos UE: array de códigos, string CSV, o null.
 * undefined → omitir; vacío → null (JSON null en DB).
 */
export function parseOptionalAllergens(v: unknown, field = "allergens"): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const parsed = normalizeAllergensInput(v);
  if (!parsed.ok) {
    throw validationError(`Alérgeno inválido: ${parsed.invalid.join(", ")}`, [
      { field, issue: "enum" },
    ]);
  }
  return serializeAllergens(parsed.codes as AllergenCode[]);
}
