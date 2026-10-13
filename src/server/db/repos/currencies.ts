import type { Database } from "bun:sqlite";
import type { CurrencyRow } from "../types";

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

  return {
    list(): CurrencyRow[] {
      return listStmt.all() as CurrencyRow[];
    },
    listActive(): CurrencyRow[] {
      return activeStmt.all() as CurrencyRow[];
    },
    getBase(): CurrencyRow | null {
      return (baseStmt.get() as CurrencyRow | null) ?? null;
    },
    /** Actualiza la tasa del día (RF-27). */
    updateRate(code: string, basePerUnit: number): boolean {
      if (!(basePerUnit > 0)) throw new Error("base_per_unit debe ser > 0");
      const r = updateRateStmt.run(basePerUnit, code);
      return r.changes > 0;
    },
  };
}

export type CurrenciesRepo = ReturnType<typeof createCurrenciesRepo>;
