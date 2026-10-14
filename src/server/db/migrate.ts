import type { Database } from "bun:sqlite";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ensureBackupsDir, preMigrationBackupFileName, vacuumInto } from "../services/backup";
import initSql from "./migrations/001_init.sql" with { type: "text" };
import seedSql from "./migrations/002_seed.sql" with { type: "text" };

export type Migration = {
  version: number;
  name: string;
  sql: string;
};

export const MIGRATIONS: Migration[] = [
  { version: 1, name: "001_init", sql: initSql },
  { version: 2, name: "002_seed", sql: seedSql },
];

export type MigrateResult = {
  applied: number[];
  already: number[];
};

/**
 * Aplica migraciones pendientes en orden.
 * Antes de la primera pendiente hace copia VACUUM INTO (o copyFile si aún no hay esquema).
 */
export function migrate(
  db: Database,
  opts: { dataDir: string; log?: (msg: string) => void },
): MigrateResult {
  const log = opts.log ?? (() => undefined);
  ensureMigrationsTable(db);

  const appliedSet = new Set(listApplied(db));
  const pending = MIGRATIONS.filter((m) => !appliedSet.has(m.version));
  const already = MIGRATIONS.filter((m) => appliedSet.has(m.version)).map((m) => m.version);

  if (pending.length === 0) {
    return { applied: [], already };
  }

  backupBeforeMigrate(db, opts.dataDir, pending[0]!.version, log);

  const applied: number[] = [];
  for (const m of pending) {
    log(`Aplicando migración ${m.version} (${m.name})`);
    const run = db.transaction(() => {
      db.exec(m.sql);
      db.prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`).run(
        m.version,
        m.name,
      );
    });
    try {
      run();
      applied.push(m.version);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Migración ${m.version} (${m.name}) falló: ${msg}`, { cause: err });
    }
  }

  return { applied, already };
}

function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}

function listApplied(db: Database): number[] {
  const rows = db.prepare(`SELECT version FROM schema_migrations ORDER BY version`).all() as Array<{
    version: number;
  }>;
  return rows.map((r) => r.version);
}

function backupBeforeMigrate(
  db: Database,
  dataDir: string,
  nextVersion: number,
  log: (msg: string) => void,
): void {
  const backupsDir = ensureBackupsDir(dataDir);
  // T11: FILE_RE + hora local → pre-migracion-NNN-AAAAMMDD-HHMM.db
  const file = preMigrationBackupFileName(nextVersion);
  const dest = join(backupsDir, file);

  try {
    vacuumInto(db, dest);
    log(`Copia previa a migración: ${file}`);
  } catch {
    // BD vacía / sin páginas: fallback a copiar el archivo si existe
    const source = join(dataDir, "menu.db");
    if (existsSync(source)) {
      copyFileSync(source, dest);
      log(`Copia previa (copyFile): ${file}`);
    } else {
      log("Sin copia previa (BD nueva)");
    }
  }
}

/** Solo para tests: lista versiones aplicadas. */
export function appliedVersions(db: Database): number[] {
  ensureMigrationsTable(db);
  return listApplied(db);
}
