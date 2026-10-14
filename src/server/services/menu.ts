import type { Database } from "bun:sqlite";
import enUi from "../../carta/i18n/en.json";
import esUi from "../../carta/i18n/es.json";
import type {
  CurrencyDto,
  MenuCategory,
  MenuImage,
  MenuOffer,
  MenuProduct,
  MenuResponse,
  ProductType,
} from "../../shared/api-types";
import type { Repos } from "../db/repos";

const UI_DEFAULTS: Record<string, Record<string, string>> = {
  es: esUi as Record<string, string>,
  en: enUi as Record<string, string>,
};

type CacheEntry = { etag: string; body: MenuResponse; builtAt: number };

export function createMenuService(opts: { db: Database; repos: Repos }) {
  const cache = new Map<string, CacheEntry>();

  const resolveLang = (
    requested: string | undefined,
  ): { lang: string; requestedLang: string | null } => {
    const active = opts.repos.languages.listActive().map((l) => l.code);
    const defaultLang = opts.repos.settings.getJson<string>("carta.default_lang", "es");
    if (requested && active.includes(requested)) {
      return { lang: requested, requestedLang: requested };
    }
    if (active.includes(defaultLang)) {
      return { lang: defaultLang, requestedLang: requested ?? null };
    }
    return { lang: active[0] ?? "es", requestedLang: requested ?? null };
  };

  const contentVersion = (): number => {
    const row = opts.db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM products) * 100000 +
          (SELECT COUNT(*) FROM categories) * 1000 +
          (SELECT COUNT(*) FROM offers) * 100 +
          (SELECT COUNT(*) FROM translations) +
          (SELECT COALESCE(SUM(available), 0) FROM products) +
          (SELECT COALESCE(SUM(CAST(base_per_unit * 100 AS INTEGER)), 0) FROM currencies)
         AS v`,
      )
      .get() as { v: number };
    return Math.floor(row.v);
  };

  /** Incluye valores de carta.* (no solo updated_at: dos writes en el mismo ms no bastan). */
  const cartaSettingsRev = (): string => {
    const rows = opts.db
      .prepare(
        `SELECT key, value FROM settings WHERE key LIKE 'carta.%' ORDER BY key`,
      )
      .all() as Array<{ key: string; value: string }>;
    if (rows.length === 0) return "0";
    let h = 0;
    for (const r of rows) {
      const s = `${r.key}=${r.value}`;
      for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return `s${(h >>> 0).toString(36)}`;
  };

  const imageOf = (hash: string | null): MenuImage => {
    if (!hash) return null;
    return { thumb: `/img/${hash}_t.webp`, large: `/img/${hash}.webp` };
  };

  const pickText = (
    entity: "category" | "product" | "offer",
    id: number,
    lang: string,
  ): { name: string; description: string | null; fallback: boolean } => {
    const primary = opts.repos.translations.get(entity, id, lang);
    if (primary?.name) {
      return { name: primary.name, description: primary.description, fallback: false };
    }
    const es = opts.repos.translations.get(entity, id, "es");
    return {
      name: es?.name ?? "—",
      description: es?.description ?? null,
      fallback: true,
    };
  };

  const localizedSetting = (key: string, lang: string): string | null => {
    const raw = opts.repos.settings.getJson<unknown>(key, null);
    if (raw == null) return null;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null) {
      const map = raw as Record<string, string>;
      return map[lang] ?? map.es ?? null;
    }
    return null;
  };

  const build = (lang: string, requestedLang: string | null): MenuResponse => {
    const version = contentVersion();
    const currencies = opts.repos.currencies.listActive();
    const base = currencies.find((c) => c.is_base === 1) ?? currencies[0];
    const defaultCurrency = opts.repos.settings.getJson<string>(
      "carta.default_currency",
      base?.code ?? "CUP",
    );
    const second = opts.repos.settings.getJson<string | null>("carta.second_currency", null);
    const showRate = opts.repos.settings.getJson<boolean>("carta.show_rate", true);
    const showImages = opts.repos.settings.getJson<boolean>("carta.show_images", true);

    const list: CurrencyDto[] = currencies.map((c) => ({
      code: c.code,
      symbol: c.symbol,
      decimals: c.decimals,
      basePerUnit: c.base_per_unit,
      rounding: c.rounding,
      roundStep: c.round_step,
      symbolPosition: c.symbol_position,
      isBase: c.is_base === 1,
      rateUpdatedAt: c.rate_updated_at,
    }));

    const logoHash = opts.repos.settings.getJson<string | null>("carta.logo", null);
    const restaurant = {
      name: opts.repos.settings.getJson<string>("carta.restaurant_name", "Avanzar In Time"),
      logo: logoHash ? `/img/${logoHash}.webp` : null,
      welcome: localizedSetting("carta.welcome", lang),
      footer: localizedSetting("carta.footer", lang),
    };

    const uiBase = { ...(UI_DEFAULTS.es ?? {}), ...(UI_DEFAULTS[lang] ?? {}) };
    for (const row of opts.repos.uiStrings.listByLang(lang)) {
      uiBase[row.key] = row.value;
    }

    // Products by category
    const allProducts = opts.repos.products.list({ visible: true });
    const categoriesOut: MenuCategory[] = [];
    for (const cat of opts.repos.categories.list()) {
      if (cat.visible !== 1) continue;
      const products: MenuProduct[] = allProducts
        .filter((p) => p.category_id === cat.id)
        .map((p) => {
          const t = pickText("product", p.id, lang);
          return {
            id: p.id,
            type: p.type as ProductType,
            name: t.name,
            description: t.description,
            priceMinor: p.price_minor,
            available: p.available === 1,
            image: imageOf(p.image),
            fallback: t.fallback,
          };
        });
      if (products.length === 0) continue;
      const ct = pickText("category", cat.id, lang);
      categoriesOut.push({
        id: cat.id,
        name: ct.name,
        description: ct.description,
        fallback: ct.fallback,
        products,
      });
    }

    const offersOut: MenuOffer[] = [];
    for (const o of opts.repos.offers.list()) {
      if (o.visible !== 1) continue;
      const t = pickText("offer", o.id, lang);
      const items = opts.repos.offers.items(o.id).map((it) => {
        const pt = pickText("product", it.product_id, lang);
        return { productId: it.product_id, name: pt.name, quantity: it.quantity };
      });
      offersOut.push({
        id: o.id,
        name: t.name,
        description: t.description,
        priceMinor: o.price_minor,
        regularMinor: opts.repos.offers.regularMinor(o.id),
        showSavings: o.show_savings === 1,
        available: opts.repos.offers.effectiveAvailable(o.id),
        image: imageOf(o.image),
        items,
        fallback: t.fallback,
      });
    }

    return {
      version,
      lang,
      requestedLang,
      languages: opts.repos.languages.listActive().map((l) => ({
        code: l.code,
        nativeName: l.native_name,
      })),
      currency: {
        base: base?.code ?? "CUP",
        default: defaultCurrency,
        second,
        showRate,
        list,
      },
      restaurant,
      showImages,
      ui: uiBase,
      offers: offersOut,
      categories: categoriesOut,
    };
  };

  return {
    invalidate(): void {
      cache.clear();
    },
    get(requestedLang: string | undefined): { body: MenuResponse; etag: string } {
      const { lang, requestedLang: req } = resolveLang(requestedLang);
      const version = contentVersion();
      const settingsRev = cartaSettingsRev();
      const cacheKey = `${lang}:${version}:${settingsRev}`;
      const hit = cache.get(cacheKey);
      if (hit) return { body: hit.body, etag: hit.etag };

      const body = build(lang, req);
      // settingsRev en ETag: evita 304 del navegador tras cambiar tasa/fotos
      const etag = `"m-${body.version}-${lang}-${settingsRev}"`;
      cache.set(cacheKey, { body, etag, builtAt: Date.now() });
      if (cache.size > 12) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
      return { body, etag };
    },
  };
}

export type MenuService = ReturnType<typeof createMenuService>;
