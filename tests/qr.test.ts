import { describe, expect, test } from "bun:test";
import { makeQrSvg } from "../src/server/services/qr";
import { wifiPayload } from "../src/shared/wifi";

describe("qr UTF-8", () => {
  test("WIFI con SSID «Cañón ☕» genera SVG válido", () => {
    const payload = wifiPayload({
      ssid: "Cañón ☕",
      password: "clave-ñ",
      security: "WPA",
      hidden: false,
    });
    expect(payload).toContain("Cañón ☕");
    expect(payload).toContain("clave-ñ");
    expect(payload.startsWith("WIFI:")).toBe(true);

    const svg = makeQrSvg(payload, 280);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg.length).toBeGreaterThan(500);
    // Debe haber módulos dibujados (path o rect)
    expect(/<(?:path|rect)\b/i.test(svg)).toBe(true);
  });

  test("payload Unicode no se corrompe al escapar", () => {
    expect(
      wifiPayload({
        ssid: "Cañón ☕",
        password: "a;b",
        security: "WPA",
        hidden: false,
      }),
    ).toBe("WIFI:T:WPA;S:Cañón ☕;P:a\\;b;H:false;;");
  });

  test("fg colorea módulos y logo se embebe", () => {
    const red = makeQrSvg("http://example.local/", 200, { fg: "#b70011" });
    expect(red).toContain('fill="#b70011"');
    const tinyPng =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const withLogo = makeQrSvg("http://example.local/", 200, {
      fg: "#1e1b19",
      logoDataUrl: tinyPng,
    });
    expect(withLogo).toContain("<image ");
    expect(withLogo).toContain(tinyPng);
  });
});
