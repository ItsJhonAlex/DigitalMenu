/** Resolución de idioma con fallback a español (ADR-12). */

export type TranslationMap = Record<string, string | null | undefined>;

export const DEFAULT_LANG = "es";

/**
 * Obtiene el texto en `lang`, o en español si falta / está vacío.
 * `fallback` indica si se usó el idioma de respaldo.
 */
export function resolveText(
  byLang: TranslationMap,
  lang: string,
  fallbackLang: string = DEFAULT_LANG,
): { text: string; fallback: boolean } {
  const primary = normalize(byLang[lang]);
  if (primary !== null) {
    return { text: primary, fallback: false };
  }
  const fb = normalize(byLang[fallbackLang]);
  return { text: fb ?? "", fallback: true };
}

function normalize(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length === 0 ? null : t;
}

/** Elige idioma de UI a partir de `navigator.language` y la lista activa. */
export function pickLanguage(preferred: string | undefined, active: readonly string[]): string {
  if (active.length === 0) return DEFAULT_LANG;
  if (preferred) {
    const lower = preferred.toLowerCase();
    const exact = active.find((c) => c.toLowerCase() === lower);
    if (exact) return exact;
    const base = lower.split("-")[0];
    const partial = active.find(
      (c) => c.toLowerCase() === base || c.toLowerCase().startsWith(`${base}-`),
    );
    if (partial) return partial;
  }
  if (active.includes(DEFAULT_LANG)) return DEFAULT_LANG;
  return active[0]!;
}
