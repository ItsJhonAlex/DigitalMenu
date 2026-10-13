import { Database } from "bun:sqlite";
import { join } from "node:path";

export type { Database };

export function dbPath(dataDir: string): string {
  return join(dataDir, "menu.db");
}

/** Abre menu.db con PRAGMAs de docs/06. */
export function openDatabase(dataDir: string): Database {
  const path = dbPath(dataDir);
  const db = new Database(path, { create: true });
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 3000;
    PRAGMA cache_size = -4000;
    PRAGMA temp_store = MEMORY;
  `);
  return db;
}

export function closeDatabase(db: Database): void {
  db.close();
}
