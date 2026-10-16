/** 14 alérgenos de la UE (Anexo II) — códigos estables para API, DB e import. */

export const ALLERGEN_CODES = [
  "gluten",
  "crustaceos",
  "huevo",
  "pescado",
  "cacahuete",
  "soja",
  "lacteos",
  "frutos_cascara",
  "apio",
  "mostaza",
  "sesamo",
  "sulfitos",
  "altramuces",
  "moluscos",
] as const;

export type AllergenCode = (typeof ALLERGEN_CODES)[number];

const CODE_SET = new Set<string>(ALLERGEN_CODES);

export function isAllergenCode(value: string): value is AllergenCode {
  return CODE_SET.has(value);
}

/** Etiquetas ES/EN para Admin (chips) y defaults de carta. */
export const ALLERGEN_LABELS: Record<AllergenCode, { es: string; en: string }> = {
  gluten: { es: "Gluten", en: "Gluten" },
  crustaceos: { es: "Crustáceos", en: "Crustaceans" },
  huevo: { es: "Huevo", en: "Eggs" },
  pescado: { es: "Pescado", en: "Fish" },
  cacahuete: { es: "Cacahuete", en: "Peanuts" },
  soja: { es: "Soja", en: "Soybeans" },
  lacteos: { es: "Lácteos", en: "Milk" },
  frutos_cascara: { es: "Frutos de cáscara", en: "Tree nuts" },
  apio: { es: "Apio", en: "Celery" },
  mostaza: { es: "Mostaza", en: "Mustard" },
  sesamo: { es: "Sésamo", en: "Sesame" },
  sulfitos: { es: "Sulfitos", en: "Sulphites" },
  altramuces: { es: "Altramuces", en: "Lupin" },
  moluscos: { es: "Moluscos", en: "Molluscs" },
};

/** Clave de UI carta: `allergen.gluten`, etc. */
export function allergenUiKey(code: AllergenCode): string {
  return `allergen.${code}`;
}

export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

/** Parsea JSON de DB o array ya tipado; inválidos se descartan. */
export function parseAllergensJson(raw: string | null | undefined): AllergenCode[] {
  if (raw == null || raw.trim() === "") return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: AllergenCode[] = [];
    for (const item of data) {
      if (typeof item === "string" && isAllergenCode(item) && !out.includes(item)) {
        out.push(item);
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeAllergens(codes: readonly AllergenCode[]): string | null {
  if (codes.length === 0) return null;
  return JSON.stringify([...codes]);
}

/**
 * Valida lista desde API/import.
 * Acepta array de strings o texto "gluten, lacteos".
 * Devuelve códigos únicos en orden de ALLERGEN_CODES, o error.
 */
export function normalizeAllergensInput(
  raw: unknown,
): { ok: true; codes: AllergenCode[] } | { ok: false; invalid: string[] } {
  if (raw == null) return { ok: true, codes: [] };
  let list: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return { ok: true, codes: [] };
    // JSON array string
    if (trimmed.startsWith("[")) {
      try {
        return normalizeAllergensInput(JSON.parse(trimmed));
      } catch {
        return { ok: false, invalid: [trimmed] };
      }
    }
    list = trimmed
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (!Array.isArray(list)) {
    return { ok: false, invalid: [String(raw)] };
  }
  const invalid: string[] = [];
  const seen = new Set<AllergenCode>();
  for (const item of list) {
    if (typeof item !== "string" || item.trim() === "") continue;
    const code = item.trim().toLowerCase();
    if (!isAllergenCode(code)) {
      invalid.push(item.trim());
      continue;
    }
    seen.add(code);
  }
  if (invalid.length > 0) return { ok: false, invalid };
  const codes = ALLERGEN_CODES.filter((c) => seen.has(c));
  return { ok: true, codes };
}
