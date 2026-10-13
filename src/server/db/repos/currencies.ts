import type { Database } from "bun:sqlite";
import type { CurrencyRow, RoundingMode } from "../types";

export function createCurrenciesRepo(db: Database) {
  const listStmt = db.prepare(
    `SELECT code, name, symbol, decimals, is_base, base_per_unit, rounding, round_step,
            symbol_position, active, sort_order, rate_updated_at
     FROM currencies ORDER BY sort_order, code`,
  );
  const activeStmt = db.prepare(
    `SELECT code, name, symbol, decimals, is_base, base_per_unit, rounding, round_step,
            symbol_position, active, sort_order, rate_updated_at
     FROM currencies WHERE active = 1 ORDER BY sort_order, code`,
  );
  const getStmt = db.prepare(
    `SELECT code, name, symbol, decimals, is_base, base_per_unit, rounding, round_step,
            symbol_position, active, sort_order, rate_updated_at
     FROM currencies WHERE code = ?`,
  );
  const baseStmt = db.prepare(
    `SELECT code, name, symbol, decimals, is_base, base_per_unit, rounding, round_step,
            symbol_position, active, sort_order, rate_updated_at
     FROM currencies WHERE is_base = 1`,
  );
  const updateRateStmt = db.prepare(
    `UPDATE currencies
     SET base_per_unit = ?, rate_updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE code = ? AND is_base = 0`,
  );
  const insertStmt = db.prepare(
    `INSERT INTO currencies (
      code, name, symbol, decimals, is_base, base_per_unit, rounding, round_step,
      symbol_position, active, sort_order, rate_updated_at
    ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
  );
  const updateStmt = db.prepare(
    `UPDATE currencies SET
      name = ?, symbol = ?, decimals = ?, base_per_unit = ?, rounding = ?, round_step = ?,
      symbol_position = ?, active = ?, sort_order = ?,
      rate_updated_at = CASE WHEN is_base = 0 THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE rate_updated_at END
     WHERE code = ?`,
  );
  const deleteStmt = db.prepare(`DELETE FROM currencies WHERE code = ?`);
  const maxSortStmt = db.prepare(`SELECT COALESCE(MAX(sort_order), -10) AS m FROM currencies`);
  const clearBaseStmt = db.prepare(`UPDATE currencies SET is_base = 0 WHERE is_base = 1`);
  const setBaseStmt = db.prepare(
    `UPDATE currencies SET is_base = 1, base_per_unit = 1, active = 1 WHERE code = ?`,
  );
  const scaleRatesStmt = db.prepare(
    `UPDATE currencies SET base_per_unit = base_per_unit / ? WHERE is_base = 0`,
  );

  return {
    list(): CurrencyRow[] {
      return listStmt.all() as CurrencyRow[];
    },
    listActive(): CurrencyRow[] {
      return activeStmt.all() as CurrencyRow[];
    },
    get(code: string): CurrencyRow | null {
      return (getStmt.get(code) as CurrencyRow | null) ?? null;
    },
    getBase(): CurrencyRow | null {
      return (baseStmt.get() as CurrencyRow | null) ?? null;
    },
    nextSortOrder(): number {
      return (maxSortStmt.get() as { m: number }).m + 10;
    },
    updateRate(code: string, basePerUnit: number): boolean {
      if (!(basePerUnit > 0)) throw new Error("base_per_unit debe ser > 0");
      return updateRateStmt.run(basePerUnit, code).changes > 0;
    },
    create(input: {
      code: string;
      name: string;
      symbol: string;
      decimals: number;
      base_per_unit: number;
      rounding: RoundingMode;
      round_step: number | null;
      symbol_position: "before" | "after";
      active: boolean;
      sort_order?: number;
    }): void {
      insertStmt.run(
        input.code,
        input.name,
        input.symbol,
        input.decimals,
        input.base_per_unit,
        input.rounding,
        input.round_step,
        input.symbol_position,
        input.active ? 1 : 0,
        input.sort_order ?? this.nextSortOrder(),
      );
    },
    update(
      code: string,
      input: {
        name: string;
        symbol: string;
        decimals: number;
        base_per_unit: number;
        rounding: RoundingMode;
        round_step: number | null;
        symbol_position: "before" | "after";
        active: boolean;
        sort_order: number;
      },
    ): boolean {
      const row = this.get(code);
      if (!row) return false;
      const rate = row.is_base ? 1 : input.base_per_unit;
      const active = row.is_base ? 1 : input.active ? 1 : 0;
      return (
        updateStmt.run(
          input.name,
          input.symbol,
          input.decimals,
          rate,
          input.rounding,
          input.round_step,
          input.symbol_position,
          active,
          input.sort_order,
          code,
        ).changes > 0
      );
    },
    remove(code: string): { ok: true } | { ok: false; reason: "base" | "missing" } {
      const row = this.get(code);
      if (!row) return { ok: false, reason: "missing" };
      if (row.is_base) return { ok: false, reason: "base" };
      deleteStmt.run(code);
      return { ok: true };
    },
    /** Cambia la moneda base; recalcula tasas relativas (RF-26). */
    makeBase(code: string): void {
      const target = this.get(code);
      if (!target) throw new Error("Moneda no encontrada");
      const oldBase = this.getBase();
      if (!oldBase) throw new Error("No hay moneda base");
      if (oldBase.code === code) return;

      const divisor = target.base_per_unit;
      const tx = db.transaction(() => {
        scaleRatesStmt.run(divisor);
        clearBaseStmt.run();
        setBaseStmt.run(code);
      });
      tx();
    },
  };
}

export type CurrenciesRepo = ReturnType<typeof createCurrenciesRepo>;
