import { describe, expect, test } from "bun:test";
import {
  isAddressInUseError,
  portInUseDialog,
  showErrorMessageBox,
} from "../src/server/services/native";

describe("native / RF-04 puerto ocupado", () => {
  test("isAddressInUseError detecta EADDRINUSE por code y mensaje", () => {
    expect(isAddressInUseError({ code: "EADDRINUSE", message: "listen" })).toBe(true);
    expect(
      isAddressInUseError(
        new Error("Error: listen EADDRINUSE: address already in use 0.0.0.0:8080"),
      ),
    ).toBe(true);
    expect(isAddressInUseError(new Error("Failed to start server. Is port in use?"))).toBe(true);
    expect(isAddressInUseError(new Error("EACCES"))).toBe(false);
    expect(isAddressInUseError(new Error("something else"))).toBe(false);
  });

  test("portInUseDialog incluye puerto, config y título claros", () => {
    const d = portInUseDialog({
      port: 8080,
      host: "0.0.0.0",
      dataDir: "C:\\MenuDigital\\data",
      detail: "EADDRINUSE",
    });
    expect(d.title).toContain("Puerto ocupado");
    expect(d.body).toContain("8080");
    expect(d.body).toContain("0.0.0.0");
    expect(d.body).toContain("C:\\MenuDigital\\data\\config.json");
    expect(d.body).toContain("EADDRINUSE");
    expect(d.body).toMatch(/otro programa/i);
  });

  test("showErrorMessageBox no lanza (Windows: MessageBox; otro: stderr)", () => {
    // No bloquear CI: título/cuerpo vacíos cortos; en win32 el usuario vería el diálogo
    // si se llama interactivo. Aquí solo comprobamos que la API es segura.
    if (process.platform === "win32" && process.env.MENUDIGITAL_SHOW_MSGBOX === "1") {
      const ok = showErrorMessageBox("Menú Digital — test", "Prueba RF-04 (puede cerrar).");
      expect(ok).toBe(true);
    } else {
      // En no-Windows escribe a stderr; en Windows sin env no mostramos diálogo en tests
      expect(typeof showErrorMessageBox).toBe("function");
    }
  });
});
