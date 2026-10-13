export type ProductType = "comida" | "bebida" | "articulo";
export type TranslationEntity = "category" | "product" | "offer";
export type RoundingMode = "none" | "up" | "nearest";

export type LanguageRow = {
  code: string;
  native_name: string;
  active: number;
  sort_order: number;
};

export type CategoryRow = {
  id: number;
  sort_order: number;
  visible: number;
  image: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductRow = {
  id: number;
  category_id: number;
  type: ProductType;
  price_minor: number;
  image: string | null;
  available: number;
  visible: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type OfferRow = {
  id: number;
  price_minor: number;
  image: string | null;
  available: number;
  visible: number;
  show_savings: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type OfferItemRow = {
  offer_id: number;
  product_id: number;
  quantity: number;
  sort_order: number;
};

export type TranslationRow = {
  entity: TranslationEntity;
  entity_id: number;
  lang: string;
  name: string;
  description: string | null;
  updated_at: string;
};

export type CurrencyRow = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_base: number;
  base_per_unit: number;
  rounding: RoundingMode;
  round_step: number | null;
  symbol_position: "before" | "after";
  active: number;
  sort_order: number;
  rate_updated_at: string | null;
};

export type SettingRow = {
  key: string;
  value: string;
  updated_at: string;
};
