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
    getMenuRevision(): number {
      const n = this.getJson<number>("menu.revision", 0);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    },
    /** Sube la revisión de la carta (invalida caché/ETag de /api/menu). */
    bumpMenuRevision(): number {
      const next = this.getMenuRevision() + 1;
      upsertStmt.run("menu.revision", JSON.stringify(next));
      return next;
    },
    setJson(key: string, value: unknown): void {
      upsertStmt.run(key, JSON.stringify(value));
      // Cualquier setting (salvo la propia rev) invalida la carta en caliente
      if (key !== "menu.revision") this.bumpMenuRevision();
    },
    remove(key: string): boolean {
      const changed = deleteStmt.run(key).changes > 0;
      if (changed && key !== "menu.revision") this.bumpMenuRevision();
      return changed;
    },
  };
}

export type SettingsRepo = ReturnType<typeof createSettingsRepo>;
