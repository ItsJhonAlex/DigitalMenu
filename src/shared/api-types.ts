/** Tipos compartidos de la API (request/response). Se irán ampliando con docs/07. */

export type HealthResponse = {
  app: "DigitalMenu";
  version: string;
  uptime: number;
  ok: true;
  db?: boolean;
};

export type ApiError = {
  error: string;
  message: string;
  details?: unknown;
};

export type CurrencyDto = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isBase: boolean;
  basePerUnit: number;
  rounding: "none" | "up" | "nearest";
  roundStep: number | null;
  symbolPosition: "before" | "after";
};
