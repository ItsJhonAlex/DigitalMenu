import { type WifiSecurity, wifiPayload } from "../../../shared/wifi";
import type { AppContext } from "../../app";
import { conflict } from "../../http/errors";
import { requireObject, requireString, validationError } from "../../http/validate";
import { listLanCandidates } from "../../services/network";
import { makeQrSvg } from "../../services/qr";
import { createAdminRouter } from "./base";

export function networkAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos, runtime } = ctx;

  app.get("/api/admin/network", (c) => {
    const candidates = listLanCandidates();
    const savedIp = repos.settings.getJson<string | null>("network.carta_ip", null);
    const recommended =
      candidates.find((x) => x.recommended)?.address ?? candidates[0]?.address ?? null;
    const currentIp =
      savedIp && candidates.some((c) => c.address === savedIp) ? savedIp : recommended;
    const ipChanged = Boolean(savedIp && currentIp && savedIp !== currentIp);
    const port = runtime.config.port;
    return c.json({
      port,
      savedIp,
      ipChanged,
      ...(ipChanged ? { previousIp: savedIp, currentIp } : {}),
      candidates,
      cartaUrl: currentIp ? `http://${currentIp}:${port}/` : null,
      checkedAt: new Date().toISOString(),
    });
  });

  app.put("/api/admin/network", async (c) => {
    const body = requireObject(await c.req.json());
    const cartaIp = requireString(body.cartaIp, "cartaIp");
    repos.settings.setJson("network.carta_ip", cartaIp);
    repos.settings.setJson("network.ip_changed", false);
    return c.json({ ok: true, cartaIp });
  });

  app.get("/api/admin/wifi", (c) => {
    return c.json({
      ssid: repos.settings.getJson<string | null>("wifi.ssid", null),
      password: repos.settings.getJson<string | null>("wifi.password", null),
      security: repos.settings.getJson<string>("wifi.security", "WPA"),
      hidden: repos.settings.getJson<boolean>("wifi.hidden", false),
    });
  });

  app.put("/api/admin/wifi", async (c) => {
    const body = requireObject(await c.req.json());
    const ssid = requireString(body.ssid, "ssid", 1, 32);
    const security = requireString(body.security ?? "WPA", "security") as WifiSecurity;
    if (!["WPA", "WEP", "nopass"].includes(security)) {
      throw validationError("security inválida");
    }
    const password = typeof body.password === "string" ? body.password : "";
    if (security !== "nopass" && (password.length < 8 || password.length > 63)) {
      throw validationError("password WPA debe tener 8–63 caracteres", [
        { field: "password", issue: "range" },
      ]);
    }
    const hidden = body.hidden === true;
    repos.settings.setJson("wifi.ssid", ssid);
    repos.settings.setJson("wifi.password", security === "nopass" ? "" : password);
    repos.settings.setJson("wifi.security", security);
    repos.settings.setJson("wifi.hidden", hidden);
    return c.json({ ok: true });
  });

  app.get("/api/admin/qr/wifi.svg", (c) => {
    const ssid = repos.settings.getJson<string | null>("wifi.ssid", null);
    if (!ssid) throw conflict("Configure el wifi primero");
    const security = repos.settings.getJson<WifiSecurity>("wifi.security", "WPA");
    const password = repos.settings.getJson<string>("wifi.password", "");
    const hidden = repos.settings.getJson<boolean>("wifi.hidden", false);
    const size = Number(c.req.query("size") ?? 300);
    const svg = makeQrSvg(wifiPayload({ ssid, password, security, hidden }), size);
    return c.body(svg, 200, { "Content-Type": "image/svg+xml; charset=utf-8" });
  });

  app.get("/api/admin/qr/carta.svg", (c) => {
    const savedIp = repos.settings.getJson<string | null>("network.carta_ip", null);
    const candidates = listLanCandidates();
    const ip =
      savedIp ?? candidates.find((x) => x.recommended)?.address ?? candidates[0]?.address ?? null;
    if (!ip) throw conflict("No hay IP de carta configurada");
    const url = `http://${ip}:${runtime.config.port}/`;
    const size = Number(c.req.query("size") ?? 300);
    const svg = makeQrSvg(url, size);
    return c.body(svg, 200, { "Content-Type": "image/svg+xml; charset=utf-8" });
  });

  return app;
}
