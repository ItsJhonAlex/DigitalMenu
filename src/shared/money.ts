/** Conversión y formato de precios (ADR-11). Usado por servidor, Admin y Carta. */

export type RoundingMode = "none" | "up" | "nearest";

export type Currency = {
  code: string;
  symbol: string;
  decimals: number;
  isBase: boolean;
  /** Cuántas unidades de la moneda base vale 1 unidad de esta moneda. */
  basePerUnit: number;
  rounding: RoundingMode;
  roundStep?: number | null;
  symbolPosition: "before" | "after";
};

export function round(value: number, mode: RoundingMode, step: number): number {
  if (!(step > 0)) {
    return Math.round(value * 1e12) / 1e12;
  }
  const units = value / step;
  switch (mode) {
    case "up":
      return Math.ceil(units - Number.EPSILON) * step;
    case "nearest":
      return Math.round(units) * step;
    default:
      return (
        Math.round(value * 10 ** Math.max(0, decimalsFromStep(step))) /
        10 ** Math.max(0, decimalsFromStep(step))
      );
  }
}

function decimalsFromStep(step: number): number {
  const s = step.toString();
  const i = s.indexOf(".");
  return i === -1 ? 0 : s.length - i - 1;
}

/**
 * Convierte un precio en unidades menores de la moneda base a unidades
 * de la moneda objetivo (ya redondeadas según su regla).
 */
export function convert(baseMinor: number, base: Currency, target: Currency): number {
  const baseValue = baseMinor / 10 ** base.decimals;
  const raw = target.isBase ? baseValue : baseValue / target.basePerUnit;
  const step = target.roundStep ?? 10 ** -target.decimals;
  if (target.rounding === "none") {
    const factor = 10 ** target.decimals;
    return Math.round(raw * factor) / factor;
  }
  return round(raw, target.rounding, step);
}

export function formatAmount(amount: number, currency: Currency, locale = "es-ES"): string {
  const formatted = amount.toLocaleString(locale, {
    minimumFractionDigits: currency.decimals,
    maximumFractionDigits: currency.decimals,
  });
  if (currency.symbolPosition === "before") {
    return `${currency.symbol}${formatted}`;
  }
  return `${formatted} ${currency.symbol}`.trim();
}

export function formatPrice(
  baseMinor: number,
  base: Currency,
  target: Currency,
  locale = "es-ES",
): string {
  return formatAmount(convert(baseMinor, base, target), target, locale);
}
