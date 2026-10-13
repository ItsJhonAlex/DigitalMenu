import { describe, expect, test } from "bun:test";
import { type Currency, convert, formatPrice } from "../src/shared/money";

const cup: Currency = {
  code: "CUP",
  symbol: "CUP",
  decimals: 0,
  isBase: true,
  basePerUnit: 1,
  rounding: "none",
  symbolPosition: "after",
};

const usd: Currency = {
  code: "USD",
  symbol: "$",
  decimals: 2,
  isBase: false,
  basePerUnit: 320,
  rounding: "nearest",
  roundStep: 0.01,
  symbolPosition: "before",
};

describe("money.convert", () => {
  test("base → base", () => {
    expect(convert(1250, cup, cup)).toBe(1250);
  });

  test("CUP → USD con tasa 320", () => {
    // 3200 CUP / 320 = 10 USD
    expect(convert(3200, cup, usd)).toBe(10);
  });

  test("redondeo nearest a 0.01", () => {
    const odd: Currency = { ...usd, basePerUnit: 300 };
    // 1000 / 300 = 3.333... → 3.33
    expect(convert(1000, cup, odd)).toBe(3.33);
  });

  test("redondeo up", () => {
    const up: Currency = { ...usd, rounding: "up", roundStep: 0.5, basePerUnit: 320 };
    // 1000/320 = 3.125 → ceil to 0.5 → 3.5
    expect(convert(1000, cup, up)).toBe(3.5);
  });
});

describe("money.formatPrice", () => {
  test("formatea USD", () => {
    expect(formatPrice(3200, cup, usd, "en-US")).toBe("$10.00");
  });
});
