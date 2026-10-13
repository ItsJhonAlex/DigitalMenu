import type { Database } from "bun:sqlite";
import type { SettingRow } from "../types";

export function createSettingsRepo(db: Database) {
  const getStmt = db.prepare(`SELECT key, value, updated_at FROM settings WHERE key = ?`);
  const listStmt = db.prepare(`SELECT key, value, updated_at FROM settings ORDER BY key`);
  const listPrefixStmt = db.prepare(
    `SELECT key, value, updated_at FROM settings WHERE key LIKE ? ORDER BY key`,
  );
  const upsertStmt = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  );
  const deleteStmt = db.prepare(`DELETE FROM settings WHERE key = ?`);

  return {
    get(key: string): SettingRow | null {
      return (getStmt.get(key) as SettingRow | null) ?? null;
    },
    getJson<T>(key: string, fallback: T): T {
      const row = this.get(key);
      if (!row) return fallback;
      try {
        return JSON.parse(row.value) as T;
      } catch {
        return fallback;
      }
    },
    list(): SettingRow[] {
      return listStmt.all() as SettingRow[];
    },
    listByPrefix(prefix: string): SettingRow[] {
      return listPrefixStmt.all(`${prefix}%`) as SettingRow[];
    },
    listPublicCarta(): SettingRow[] {
      return this.listByPrefix("carta.");
    },
    setJson(key: string, value: unknown): void {
      upsertStmt.run(key, JSON.stringify(value));
    },
    remove(key: string): boolean {
      return deleteStmt.run(key).changes > 0;
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
