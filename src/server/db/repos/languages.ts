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
  const insertStmt = db.prepare(
    `INSERT INTO languages (code, native_name, active, sort_order) VALUES (?, ?, ?, ?)`,
  );
  const setActiveStmt = db.prepare(`UPDATE languages SET active = ? WHERE code = ?`);
  const deleteStmt = db.prepare(`DELETE FROM languages WHERE code = ?`);
  const maxSortStmt = db.prepare(`SELECT COALESCE(MAX(sort_order), -10) AS m FROM languages`);

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
    nextSortOrder(): number {
      return (maxSortStmt.get() as { m: number }).m + 10;
    },
    create(input: {
      code: string;
      native_name: string;
      active?: boolean;
      sort_order?: number;
    }): void {
      insertStmt.run(
        input.code,
        input.native_name,
        input.active === false ? 0 : 1,
        input.sort_order ?? this.nextSortOrder(),
      );
    },
    setActive(code: string, active: boolean): boolean {
      return setActiveStmt.run(active ? 1 : 0, code).changes > 0;
    },
    remove(code: string): void {
      deleteStmt.run(code);
    },
  };
}

export type LanguagesRepo = ReturnType<typeof createLanguagesRepo>;
