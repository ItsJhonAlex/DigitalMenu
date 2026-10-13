import { describe, expect, test } from "bun:test";
import { escapeWifiField, wifiPayload } from "../src/shared/wifi";

describe("wifi", () => {
  test("payload WPA básico", () => {
    expect(
      wifiPayload({
        ssid: "Brasa_Guest",
        password: "secreto",
        security: "WPA",
        hidden: false,
      }),
    ).toBe("WIFI:T:WPA;S:Brasa_Guest;P:secreto;H:false;;");
  });

  test("escapa ; y \\ en SSID", () => {
    expect(escapeWifiField("a;b\\c")).toBe("a\\;b\\\\c");
  });

  test("nopass no incluye P", () => {
    expect(
      wifiPayload({
        ssid: "OpenNet",
        password: "",
        security: "nopass",
        hidden: false,
      }),
    ).toBe("WIFI:T:nopass;S:OpenNet;H:false;;");
  });
});
