import type { AppContext } from "../../app";
import { requireObject, validationError } from "../../http/validate";
import { createAdminRouter } from "./base";

const ALLOWED = new Set([
  "carta.restaurant_name",
  "carta.logo",
  "carta.welcome",
  "carta.footer",
  "carta.default_lang",
  "carta.default_currency",
  "carta.show_rate",
  "carta.second_currency",
  "carta.soldout_position",
  "wifi.ssid",
  "wifi.password",
  "wifi.security",
  "wifi.hidden",
  "network.carta_ip",
  "network.ip_changed",
  "images.quality",
  "images.max_large",
  "images.max_thumb",
  "admin.pin",
]);

export function settingsAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos } = ctx;

  app.get("/api/admin/settings", (c) => {
    const out: Record<string, unknown> = {};
    for (const row of repos.settings.list()) {
      if (row.key === "admin.pin_hash") continue;
      try {
        out[row.key] = JSON.parse(row.value);
      } catch {
        out[row.key] = row.value;
      }
    }
    out["admin.pinEnabled"] = Boolean(repos.settings.get("admin.pin_hash")?.value);
    return c.json(out);
  });

  app.put("/api/admin/settings", async (c) => {
    const body = requireObject(await c.req.json());
    for (const key of Object.keys(body)) {
      if (!ALLOWED.has(key)) {
        throw validationError(`Clave desconocida: ${key}`, [{ field: key, issue: "unknown" }]);
      }
    }

    if ("admin.pin" in body) {
      const pin = body["admin.pin"];
      if (pin === null) {
        repos.settings.remove("admin.pin_hash");
      } else if (typeof pin === "string" && /^\d{4,8}$/.test(pin)) {
        const hash = await Bun.password.hash(pin, { algorithm: "argon2id" });
        repos.settings.setJson("admin.pin_hash", hash);
      } else {
        throw validationError("PIN inválido (4–8 dígitos o null)", [
          { field: "admin.pin", issue: "format" },
        ]);
      }
    }

    for (const [key, value] of Object.entries(body)) {
      if (key === "admin.pin") continue;
      repos.settings.setJson(key, value);
    }

    return c.json({ ok: true });
  });

  return app;
}
