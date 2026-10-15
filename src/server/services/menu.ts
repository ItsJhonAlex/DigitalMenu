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

export function createMenuService(opts: { getRepos: () => Repos }) {
  const cache = new Map<string, CacheEntry>();
  const repos = () => opts.getRepos();

  const resolveLang = (
    requested: string | undefined,
  ): { lang: string; requestedLang: string | null } => {
    const active = repos()
      .languages.listActive()
      .map((l) => l.code);
    const defaultLang = repos().settings.getJson<string>("carta.default_lang", "es");
    if (requested && active.includes(requested)) {
      return { lang: requested, requestedLang: requested };
    }
    if (active.includes(defaultLang)) {
      return { lang: defaultLang, requestedLang: requested ?? null };
    }
    return { lang: active[0] ?? "es", requestedLang: requested ?? null };
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
    const primary = repos().translations.get(entity, id, lang);
    if (primary?.name) {
      return { name: primary.name, description: primary.description, fallback: false };
    }
    const es = repos().translations.get(entity, id, "es");
    return {
      name: es?.name ?? "—",
      description: es?.description ?? null,
      fallback: true,
    };
  };

  const localizedSetting = (key: string, lang: string): string | null => {
    const raw = repos().settings.getJson<unknown>(key, null);
    if (raw == null) return null;
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null) {
      const map = raw as Record<string, string>;
      return map[lang] ?? map.es ?? null;
    }
    return null;
  };

  const build = (lang: string, requestedLang: string | null): MenuResponse => {
    const version = repos().settings.getMenuRevision();
    const currencies = repos().currencies.listActive();
    const base = currencies.find((c) => c.is_base === 1) ?? currencies[0];
    const defaultCurrency = repos().settings.getJson<string>(
      "carta.default_currency",
      base?.code ?? "CUP",
    );
    const second = repos().settings.getJson<string | null>("carta.second_currency", null);
    const showRate = repos().settings.getJson<boolean>("carta.show_rate", true);
    const showImages = repos().settings.getJson<boolean>("carta.show_images", true);
    const showSoldOut = repos().settings.getJson<boolean>("carta.show_soldout", true);
    const soldOutCollapsed = repos().settings.getJson<boolean>("carta.soldout_collapsed", true);
    const sectionsCollapsible = repos().settings.getJson<boolean>(
      "carta.sections_collapsible",
      false,
    );
    const sectionsOpenDefault = repos().settings.getJson<boolean>(
      "carta.sections_open_default",
      true,
    );
    const showSectionCounts = repos().settings.getJson<boolean>("carta.show_section_counts", true);

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

    const logoHash = repos().settings.getJson<string | null>("carta.logo", null);
    const restaurant = {
      name: repos().settings.getJson<string>("carta.restaurant_name", "Avanzar In Time"),
      logo: logoHash ? `/img/${logoHash}.webp` : null,
      welcome: localizedSetting("carta.welcome", lang),
      footer: localizedSetting("carta.footer", lang),
    };

    const uiBase = { ...(UI_DEFAULTS.es ?? {}), ...(UI_DEFAULTS[lang] ?? {}) };
    for (const row of repos().uiStrings.listByLang(lang)) {
      uiBase[row.key] = row.value;
    }

    // Categoría desactivada manda: no sale ella ni sus productos (aunque el producto esté activo)
    const visibleCats = repos()
      .categories.list()
      .filter((c) => c.visible === 1);
    const visibleCatIds = new Set(visibleCats.map((c) => c.id));
    // Precio base 0 (o negativo) → no sale en la carta; Admin sí los lista
    const productsInVisibleCats = repos()
      .products.list({ visible: true })
      .filter((p) => {
        if (!visibleCatIds.has(p.category_id) || p.price_minor <= 0) return false;
        if (!showSoldOut && p.available !== 1) return false;
        return true;
      });

    const categoriesOut: MenuCategory[] = [];
    for (const cat of visibleCats) {
      const products: MenuProduct[] = productsInVisibleCats
        .filter((p) => p.category_id === cat.id)
        // Disponibles primero, agotados al final; dentro de cada grupo se mantiene sort_order
        .sort((a, b) => Number(b.available === 1) - Number(a.available === 1))
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
    for (const o of repos().offers.list()) {
      if (o.visible !== 1) continue;
      if (o.price_minor <= 0) continue;
      const rawItems = repos().offers.items(o.id);
      // Misma regla que categorías: producto en cat. oculta (o invisible) → la oferta no sale
      if (rawItems.length === 0) continue;
      const itemsOk = rawItems.every((it) => {
        const p = repos().products.get(it.product_id);
        return p != null && p.visible === 1 && visibleCatIds.has(p.category_id);
      });
      if (!itemsOk) continue;
      const t = pickText("offer", o.id, lang);
      const items = rawItems.map((it) => {
        const pt = pickText("product", it.product_id, lang);
        return { productId: it.product_id, name: pt.name, quantity: it.quantity };
      });
      offersOut.push({
        id: o.id,
        name: t.name,
        description: t.description,
        priceMinor: o.price_minor,
        regularMinor: repos().offers.regularMinor(o.id),
        showSavings: o.show_savings === 1,
        available: repos().offers.effectiveAvailable(o.id),
        image: imageOf(o.image),
        items,
        fallback: t.fallback,
      });
    }

    return {
      version,
      lang,
      requestedLang,
      languages: repos()
        .languages.listActive()
        .map((l) => ({
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
      showSoldOut,
      soldOutCollapsed,
      sectionsCollapsible,
      sectionsOpenDefault,
      showSectionCounts,
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
      // menu.revision sube en cada escritura del admin (y settings.setJson)
      const rev = repos().settings.getMenuRevision();
      const cacheKey = `${lang}:${rev}`;
      const hit = cache.get(cacheKey);
      if (hit) return { body: hit.body, etag: hit.etag };

      const body = build(lang, req);
      const etag = `"m-${rev}-${lang}"`;
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
