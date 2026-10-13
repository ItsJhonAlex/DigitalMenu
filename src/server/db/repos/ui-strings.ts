import type { Database } from "bun:sqlite";

export type UiStringRow = { key: string; lang: string; value: string };

export function createUiStringsRepo(db: Database) {
  const listLangStmt = db.prepare(
    `SELECT key, lang, value FROM ui_strings WHERE lang = ? ORDER BY key`,
  );
  const upsertStmt = db.prepare(
    `INSERT INTO ui_strings (key, lang, value) VALUES (?, ?, ?)
     ON CONFLICT(key, lang) DO UPDATE SET value = excluded.value`,
  );
  const deleteLangStmt = db.prepare(`DELETE FROM ui_strings WHERE lang = ?`);

  return {
    listByLang(lang: string): UiStringRow[] {
      return listLangStmt.all(lang) as UiStringRow[];
    },
    putMany(lang: string, items: Record<string, string>): void {
      const tx = db.transaction(() => {
        for (const [key, value] of Object.entries(items)) {
          upsertStmt.run(key, lang, value);
        }
      });
      tx();
    },
    clearLang(lang: string): void {
      deleteLangStmt.run(lang);
    },
  };
}

export type UiStringsRepo = ReturnType<typeof createUiStringsRepo>;
