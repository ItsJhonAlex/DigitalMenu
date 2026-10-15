/** Tipos compartidos de la API (request/response). */

export type HealthResponse = {
  app: "DigitalMenu";
  version: string;
  uptime: number;
  ok: true;
  db?: boolean;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type Lang = string;
export type ProductType = "comida" | "bebida" | "articulo";

export type CurrencyDto = {
  code: string;
  symbol: string;
  decimals: number;
  basePerUnit: number;
  rounding: "none" | "up" | "nearest";
  roundStep: number | null;
  symbolPosition: "before" | "after";
  isBase: boolean;
  rateUpdatedAt?: string | null;
  name?: string;
  active?: boolean;
  sortOrder?: number;
};

export type MenuImage = { thumb: string; large: string } | null;

export type MenuProduct = {
  id: number;
  type: ProductType;
  name: string;
  description: string | null;
  priceMinor: number;
  available: boolean;
  image: MenuImage;
  fallback: boolean;
};

export type MenuOffer = {
  id: number;
  name: string;
  description: string | null;
  priceMinor: number;
  regularMinor: number | null;
  showSavings: boolean;
  available: boolean;
  image: MenuImage;
  items: Array<{ productId: number; name: string; quantity: number }>;
  fallback: boolean;
};

export type MenuCategory = {
  id: number;
  name: string;
  description: string | null;
  fallback: boolean;
  products: MenuProduct[];
};

export type MenuResponse = {
  version: number;
  lang: Lang;
  requestedLang: Lang | null;
  languages: Array<{ code: Lang; nativeName: string }>;
  currency: {
    base: string;
    default: string;
    second: string | null;
    showRate: boolean;
    list: CurrencyDto[];
  };
  restaurant: {
    name: string;
    logo: string | null;
    welcome: string | null;
    footer: string | null;
  };
  /** Si false, la carta usa vista solo texto (sin huecos de foto). */
  showImages: boolean;
  /** Si false, no se listan productos agotados en la carta. */
  showSoldOut: boolean;
  /** Si true, agotados van en «Ver agotados (n)»; si false, al final de la sección sin botón. */
  soldOutCollapsed: boolean;
  /** Si true, cada sección de categoría/ofertas es colapsable. */
  sectionsCollapsible: boolean;
  /** Si sectionsCollapsible, secciones abiertas al cargar. */
  sectionsOpenDefault: boolean;
  /** Si true, el título de sección muestra conteo de platos / agotados. */
  showSectionCounts: boolean;
  ui: Record<string, string>;
  offers: MenuOffer[];
  categories: MenuCategory[];
};
