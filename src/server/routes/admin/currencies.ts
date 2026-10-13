import type { AppContext } from "../../app";
import type { RoundingMode } from "../../db/types";
import { conflict, notFound } from "../../http/errors";
import { currencyDto } from "../../http/mappers";
import {
  optionalBool,
  requireInt,
  requireObject,
  requireString,
  validationError,
} from "../../http/validate";
import { createAdminRouter } from "./base";

const ROUNDINGS = new Set(["none", "up", "nearest"]);

export function currenciesAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);
  const { repos } = ctx;

  app.get("/api/admin/currencies", (c) => {
    return c.json({ items: repos.currencies.list().map(currencyDto) });
  });

  app.post("/api/admin/currencies", async (c) => {
    const body = requireObject(await c.req.json());
    const code = requireString(body.code, "code", 2, 8).toUpperCase();
    if (repos.currencies.get(code)) {
      throw conflict(`La moneda ${code} ya existe`);
    }
    const name = requireString(body.name, "name", 1, 80);
    const symbol = requireString(body.symbol, "symbol", 1, 8);
    const decimals = requireInt(body.decimals ?? 2, "decimals", 0, 4);
    const basePerUnit = Number(body.basePerUnit);
    if (!(basePerUnit > 0)) {
      throw validationError("basePerUnit debe ser > 0", [{ field: "basePerUnit", issue: "range" }]);
    }
    const rounding = requireString(body.rounding ?? "nearest", "rounding");
    if (!ROUNDINGS.has(rounding)) throw validationError("rounding inválido");
    const roundStep =
      body.roundStep === undefined || body.roundStep === null ? null : Number(body.roundStep);
    if (roundStep != null && !(roundStep > 0)) {
      throw validationError("roundStep inválido");
    }
    const symbolPosition = requireString(body.symbolPosition ?? "before", "symbolPosition");
    if (symbolPosition !== "before" && symbolPosition !== "after") {
      throw validationError("symbolPosition inválido");
    }
    const active = optionalBool(body.active, "active") ?? true;

    repos.currencies.create({
      code,
      name,
      symbol,
      decimals,
      base_per_unit: basePerUnit,
      rounding: rounding as RoundingMode,
      round_step: roundStep,
      symbol_position: symbolPosition,
      active,
    });
    return c.json(currencyDto(repos.currencies.get(code)!), 201);
  });

  app.put("/api/admin/currencies/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    const existing = repos.currencies.get(code);
    if (!existing) throw notFound("Moneda no encontrada");
    const body = requireObject(await c.req.json());
    const name = requireString(body.name ?? existing.name, "name", 1, 80);
    const symbol = requireString(body.symbol ?? existing.symbol, "symbol", 1, 8);
    const decimals = requireInt(body.decimals ?? existing.decimals, "decimals", 0, 4);
    const basePerUnit = Number(body.basePerUnit ?? existing.base_per_unit);
    if (!(basePerUnit > 0)) throw validationError("basePerUnit debe ser > 0");
    const rounding = requireString(body.rounding ?? existing.rounding, "rounding");
    if (!ROUNDINGS.has(rounding)) throw validationError("rounding inválido");
    const roundStep =
      body.roundStep === undefined
        ? existing.round_step
        : body.roundStep === null
          ? null
          : Number(body.roundStep);
    const symbolPosition = requireString(
      body.symbolPosition ?? existing.symbol_position,
      "symbolPosition",
    ) as "before" | "after";
    const active = optionalBool(body.active, "active") ?? existing.active === 1;

    repos.currencies.update(code, {
      name,
      symbol,
      decimals,
      base_per_unit: basePerUnit,
      rounding: rounding as RoundingMode,
      round_step: roundStep,
      symbol_position: symbolPosition,
      active,
      sort_order: existing.sort_order,
    });
    return c.json(currencyDto(repos.currencies.get(code)!));
  });

  app.patch("/api/admin/currencies/:code", async (c) => {
    const code = c.req.param("code").toUpperCase();
    const existing = repos.currencies.get(code);
    if (!existing) throw notFound("Moneda no encontrada");
    if (existing.is_base) {
      throw validationError("No se puede cambiar la tasa de la moneda base");
    }
    const body = requireObject(await c.req.json());
    const basePerUnit = Number(body.basePerUnit);
    if (!(basePerUnit > 0)) {
      throw validationError("basePerUnit debe ser > 0", [{ field: "basePerUnit", issue: "range" }]);
    }
    repos.currencies.updateRate(code, basePerUnit);
    const row = repos.currencies.get(code)!;
    return c.json({
      code: row.code,
      basePerUnit: row.base_per_unit,
      rateUpdatedAt: row.rate_updated_at,
    });
  });

  app.post("/api/admin/currencies/:code/make-base", async (c) => {
    const code = c.req.param("code").toUpperCase();
    if (!repos.currencies.get(code)) throw notFound("Moneda no encontrada");
    const body = requireObject(await c.req.json().catch(() => ({})));
    if (body.confirm !== true) {
      throw validationError("Se requiere confirm: true", [{ field: "confirm", issue: "required" }]);
    }
    repos.currencies.makeBase(code);
    return c.json({
      ok: true,
      warning: "Los precios NO se han convertido. Revise los precios de todos los productos.",
    });
  });

  app.delete("/api/admin/currencies/:code", (c) => {
    const code = c.req.param("code").toUpperCase();
    const result = repos.currencies.remove(code);
    if (!result.ok) {
      if (result.reason === "missing") throw notFound("Moneda no encontrada");
      throw conflict("No se puede eliminar la moneda base");
    }
    return c.body(null, 204);
  });

  return app;
}
