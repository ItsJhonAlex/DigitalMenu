import type { CurrencyRow } from "../db/types";
import type { I18nMap } from "./validate";

export function currencyDto(row: CurrencyRow) {
  return {
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    decimals: row.decimals,
    isBase: row.is_base === 1,
    basePerUnit: row.base_per_unit,
    rounding: row.rounding,
    roundStep: row.round_step,
    symbolPosition: row.symbol_position,
    active: row.active === 1,
    sortOrder: row.sort_order,
    rateUpdatedAt: row.rate_updated_at,
  };
}

export function categoryDto(
  row: {
    id: number;
    sort_order: number;
    visible: number;
    image: string | null;
    created_at: string;
    updated_at: string;
  },
  i18n: I18nMap,
  productCount: number,
) {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    visible: row.visible === 1,
    image: row.image,
    productCount,
    i18n,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function productDto(
  row: {
    id: number;
    category_id: number;
    type: string;
    price_minor: number;
    image: string | null;
    available: number;
    visible: number;
    sort_order: number;
    created_at: string;
    updated_at: string;
  },
  i18n: I18nMap,
  extra?: { missingLangs?: string[]; inOffers?: number[] },
) {
  return {
    id: row.id,
    categoryId: row.category_id,
    type: row.type,
    priceMinor: row.price_minor,
    image: row.image,
    available: row.available === 1,
    visible: row.visible === 1,
    sortOrder: row.sort_order,
    i18n,
    missingLangs: extra?.missingLangs ?? [],
    inOffers: extra?.inOffers ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
