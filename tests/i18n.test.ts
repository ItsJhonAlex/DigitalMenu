import { describe, expect, test } from "bun:test";
import { pickLanguage, resolveText } from "../src/shared/i18n";

describe("resolveText", () => {
  test("usa el idioma pedido", () => {
    const r = resolveText({ es: "Hola", en: "Hello" }, "en");
    expect(r).toEqual({ text: "Hello", fallback: false });
  });

  test("fallback a español", () => {
    const r = resolveText({ es: "Hola", en: "" }, "en");
    expect(r).toEqual({ text: "Hola", fallback: true });
  });

  test("vacío si no hay nada", () => {
    const r = resolveText({}, "en");
    expect(r).toEqual({ text: "", fallback: true });
  });
});

describe("pickLanguage", () => {
  test("coincide exacto", () => {
    expect(pickLanguage("en", ["es", "en"])).toBe("en");
  });

  test("coincide por prefijo", () => {
    expect(pickLanguage("en-US", ["es", "en"])).toBe("en");
  });

  test("default es", () => {
    expect(pickLanguage("fr", ["es", "en"])).toBe("es");
  });
});
