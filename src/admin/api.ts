/** Cliente fetch tipado del Admin. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let code = "http_error";
  let message = res.statusText;
  let details: unknown;
  try {
    const body = (await res.json()) as {
      error?: { code?: string; message?: string; details?: unknown } | string;
      message?: string;
    };
    if (body.error && typeof body.error === "object") {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details;
    } else if (typeof body.error === "string") {
      code = body.error;
      message = body.message ?? message;
    }
  } catch {
    // ignore
  }
  return new ApiError(res.status, code, message, details);
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(path, { ...init, headers, body });
  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await parseError(res);
  if (res.headers.get("content-type")?.includes("application/json")) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  /** Sin cuerpo → `{}` + Content-Type JSON (evita 415 en POST vacíos, p. ej. reset-availability). */
  post: <T>(path: string, json: unknown = {}) => request<T>(path, { method: "POST", json }),
  put: <T>(path: string, json: unknown = {}) => request<T>(path, { method: "PUT", json }),
  patch: <T>(path: string, json: unknown = {}) => request<T>(path, { method: "PATCH", json }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export type I18nMap = Record<string, { name: string; description?: string | null }>;

export type Category = {
  id: number;
  sortOrder: number;
  visible: boolean;
  image: string | null;
  productCount: number;
  i18n: I18nMap;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: number;
  categoryId: number;
  type: "comida" | "bebida" | "articulo";
  priceMinor: number;
  image: string | null;
  available: boolean;
  visible: boolean;
  sortOrder: number;
  i18n: I18nMap;
  missingLangs: string[];
  inOffers: number[];
};

export type Currency = {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  isBase: boolean;
  basePerUnit: number;
  rounding: string;
  roundStep: number | null;
  symbolPosition: "before" | "after";
  active: boolean;
  sortOrder: number;
  rateUpdatedAt: string | null;
};

export type Offer = {
  id: number;
  priceMinor: number;
  regularMinor: number;
  savingsMinor: number;
  available: boolean;
  effectiveAvailable: boolean;
  visible: boolean;
  showSavings: boolean;
  sortOrder: number;
  image: string | null;
  items: Array<{ productId: number; quantity: number; sortOrder: number }>;
  i18n: I18nMap;
};

export type Language = {
  code: string;
  nativeName: string;
  active: boolean;
  sortOrder: number;
};

export type NetworkState = {
  port: number;
  savedIp: string | null;
  ipChanged: boolean;
  previousIp?: string;
  currentIp?: string;
  candidates: Array<{ interface: string; address: string; mac: string; recommended: boolean }>;
  cartaUrl: string | null;
  checkedAt: string;
};
