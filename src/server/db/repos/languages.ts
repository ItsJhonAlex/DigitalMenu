import type { Database } from "bun:sqlite";
import type { LanguageRow } from "../types";

export function createLanguagesRepo(db: Database) {
  const listStmt = db.prepare(
    `SELECT code, native_name, active, sort_order FROM languages ORDER BY sort_order, code`,
  );
  const activeStmt = db.prepare(
    `SELECT code, native_name, active, sort_order FROM languages WHERE active = 1 ORDER BY sort_order, code`,
  );
  const getStmt = db.prepare(
    `SELECT code, native_name, active, sort_order FROM languages WHERE code = ?`,
  );

  return {
    list(): LanguageRow[] {
      return listStmt.all() as LanguageRow[];
    },
    listActive(): LanguageRow[] {
      return activeStmt.all() as LanguageRow[];
    },
    get(code: string): LanguageRow | null {
      return (getStmt.get(code) as LanguageRow | null) ?? null;
    },
  };
}

export type LanguagesRepo = ReturnType<typeof createLanguagesRepo>;
