/**
 * Restauración de copias (RF-52): validar, backup de seguridad, volcar datos, migrar.
 *
 * En Windows no se puede sustituir menu.db mientras el proceso lo tiene abierto
 * (EBUSY en -wal / rename). Se copia el contenido vía ATTACH sobre la conexión viva.
 */
import { Database } from "bun:sqlite";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { appSchemaVersion, migrate, readSchemaVersion } from "../db/migrate";
import { ensureBackupsDir } from "./backup";

/** Solo hashes de 16 hex + opcional _t.webp (mismo criterio que /img). */
const BACKUP_IMAGE_RE = /^[a-f0-9]{16}(_t)?\.webp$/i;
/** Tope de bytes descomprimidos al leer un zip de restauración. */
const MAX_UNCOMPRESSED_ZIP = 512 * 1024 * 1024;

export type RestoreErrorCode = "NOT_FOUND" | "INVALID_BACKUP" | "NEWER_SCHEMA" | "BUSY" | "FAILED";

export class RestoreError extends Error {
  constructor(
    message: string,
    readonly code: RestoreErrorCode,
  ) {
    super(message);
    this.name = "RestoreError";
  }
}

export type RestoreSource =
  | { type: "file"; fileName: string }
  | { type: "upload"; fileName: string; bytes: Uint8Array };

export type RestoreResult = {
  ok: true;
  safetyBackup: string;
  schemaVersion: number;
  migrated: number[];
  restoredImages: boolean;
};

export type RestoreServiceOpts = {
  dataDir: string;
  getDb: () => Database;
  /** Copia completa (.zip) del estado actual antes de restaurar. */
  createSafetyBackup: () => { file: string };
  /** Opcional: no necesario con restauración por ATTACH. */
  replaceDatabase?: (next: Database) => void;
  log?: (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;
};

let busy = false;

/** True mientras hay una restauración en curso (bloquea otras escrituras admin). */
export function isRestoreBusy(): boolean {
  return busy;
}

function sqlPath(absPath: string): string {
  return absPath.replace(/\\/g, "/").replace(/'/g, "''");
}

/** Abre una copia en solo lectura y comprueba integridad + versión de esquema. */
export function validateBackupDbFile(absPath: string): { schemaVersion: number } {
  if (!existsSync(absPath)) {
    throw new RestoreError("Copia no encontrada", "NOT_FOUND");
  }
  let db: Database | null = null;
  try {
    try {
      db = new Database(absPath, { readonly: true, create: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new RestoreError(`No se pudo abrir la base de datos: ${msg}`, "INVALID_BACKUP");
    }

    const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check: string } | null;
    const check = row?.integrity_check ?? "";
    if (check !== "ok") {
      throw new RestoreError(`PRAGMA integrity_check falló: ${check}`, "INVALID_BACKUP");
    }

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'`)
      .get() as { name: string } | null;
    if (!tables) {
      throw new RestoreError(
        "No es una base de datos válida de Menú Digital (falta schema_migrations)",
        "INVALID_BACKUP",
      );
    }

    const schemaVersion = readSchemaVersion(db);
    if (schemaVersion < 1) {
      throw new RestoreError(
        "No es una base de datos válida de Menú Digital (sin migraciones)",
        "INVALID_BACKUP",
      );
    }

    const appVer = appSchemaVersion();
    if (schemaVersion > appVer) {
      throw new RestoreError(
        `La copia es de un esquema más nuevo (${schemaVersion}) que esta aplicación (${appVer})`,
        "NEWER_SCHEMA",
      );
    }

    return { schemaVersion };
  } catch (err) {
    if (err instanceof RestoreError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new RestoreError(`Base de datos inválida: ${msg}`, "INVALID_BACKUP");
  } finally {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  }
}

type PreparedPayload = {
  dbFile: string;
  images: Record<string, Uint8Array> | null;
  cleanup: () => void;
};

function preparePayload(dataDir: string, source: RestoreSource): PreparedPayload {
  const workDir = join(ensureBackupsDir(dataDir), `.restore-work-${Date.now()}`);
  mkdirSync(workDir, { recursive: true });
  const cleanup = () => {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  try {
    if (source.type === "file") {
      const abs = join(ensureBackupsDir(dataDir), source.fileName);
      if (!existsSync(abs)) {
        throw new RestoreError("Copia no encontrada", "NOT_FOUND");
      }
      if (source.fileName.toLowerCase().endsWith(".zip")) {
        return extractZipToWork(abs, workDir, cleanup);
      }
      if (!source.fileName.toLowerCase().endsWith(".db")) {
        throw new RestoreError("Solo se admiten archivos .db o .zip", "INVALID_BACKUP");
      }
      return { dbFile: abs, images: null, cleanup };
    }

    const lower = source.fileName.toLowerCase();
    if (lower.endsWith(".zip")) {
      const zipPath = join(workDir, "upload.zip");
      writeFileSync(zipPath, source.bytes);
      return extractZipToWork(zipPath, workDir, cleanup);
    }
    if (lower.endsWith(".db")) {
      const dbFile = join(workDir, "upload.db");
      writeFileSync(dbFile, source.bytes);
      return { dbFile, images: null, cleanup };
    }
    throw new RestoreError("Solo se admiten archivos .db o .zip", "INVALID_BACKUP");
  } catch (err) {
    cleanup();
    throw err;
  }
}

function isBackupImageEntry(normPath: string): string | null {
  if (!normPath.startsWith("images/") || normPath.endsWith("/")) return null;
  const rel = normPath.slice("images/".length);
  // Sin subcarpetas ni path traversal; solo nombre de imagen válido
  if (!rel || rel.includes("/") || rel.includes("\\") || rel.includes("..")) return null;
  if (!BACKUP_IMAGE_RE.test(rel)) return null;
  return rel.toLowerCase();
}

function extractZipToWork(zipPath: string, workDir: string, cleanup: () => void): PreparedPayload {
  let plannedBytes = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(readFileSync(zipPath), {
      filter(file) {
        const norm = file.name.replace(/\\/g, "/");
        const keep = /(^|\/)menu\.db$/i.test(norm) || isBackupImageEntry(norm) != null;
        if (!keep) return false;
        const sz = typeof file.originalSize === "number" ? file.originalSize : (file.size ?? 0);
        plannedBytes += sz;
        if (plannedBytes > MAX_UNCOMPRESSED_ZIP) {
          throw new RestoreError(
            `ZIP demasiado grande al descomprimir (máx. ${Math.round(MAX_UNCOMPRESSED_ZIP / (1024 * 1024))} MB)`,
            "INVALID_BACKUP",
          );
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof RestoreError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new RestoreError(`ZIP inválido: ${msg}`, "INVALID_BACKUP");
  }

  const dbKey = Object.keys(entries).find((k) => /(^|\/)menu\.db$/i.test(k.replace(/\\/g, "/")));
  if (!dbKey || !entries[dbKey]) {
    throw new RestoreError("El ZIP no contiene menu.db", "INVALID_BACKUP");
  }

  const dbFile = join(workDir, "menu.db");
  writeFileSync(dbFile, entries[dbKey]!);

  const images: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(entries)) {
    const rel = isBackupImageEntry(name.replace(/\\/g, "/"));
    if (rel) images[rel] = data;
  }

  return {
    dbFile,
    images: Object.keys(images).length > 0 ? images : null,
    cleanup,
  };
}

/**
 * Escribe imágenes en carpeta temporal y hace rename atómico al final
 * (no borra las actuales hasta tener las nuevas listas).
 */
function replaceImagesDir(dataDir: string, images: Record<string, Uint8Array>): void {
  const imagesDir = join(dataDir, "images");
  const incoming = join(dataDir, `.images-incoming-${Date.now()}`);
  const retired = join(dataDir, `.images-retired-${Date.now()}`);
  mkdirSync(incoming, { recursive: true });
  try {
    for (const [rel, data] of Object.entries(images)) {
      writeFileSync(join(incoming, rel), data);
    }
    if (existsSync(imagesDir)) {
      renameSync(imagesDir, retired);
    }
    renameSync(incoming, imagesDir);
  } catch (err) {
    try {
      rmSync(incoming, { recursive: true, force: true });
    } catch {
      // ignore
    }
    // Si falló tras retirar la carpeta viva, intentar devolverla
    if (!existsSync(imagesDir) && existsSync(retired)) {
      try {
        renameSync(retired, imagesDir);
      } catch {
        // ignore
      }
    }
    throw err;
  }
  try {
    rmSync(retired, { recursive: true, force: true });
  } catch {
    // se limpiará en la siguiente restauración
  }
}

function listUserTables(db: Database, schema: string): string[] {
  const rows = db
    .prepare(
      `SELECT name FROM ${schema}.sqlite_master
       WHERE type = 'table'
         AND (name NOT LIKE 'sqlite_%' OR name = 'sqlite_sequence')
       ORDER BY CASE WHEN name = 'sqlite_sequence' THEN 1 ELSE 0 END, name`,
    )
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}

/** Vuelca todas las tablas de `srcSchema` sobre `main` (FK off; triggers suspendidos). */
function copyAttachedIntoMain(live: Database, srcSchema: string): void {
  const srcTables = listUserTables(live, srcSchema);
  const mainTables = listUserTables(live, "main");
  const mainSet = new Set(mainTables);

  // Triggers de protección (idioma es, moneda base, …) bloquean DELETE/INSERT masivo
  const triggers = live
    .prepare(`SELECT name, sql FROM main.sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL`)
    .all() as Array<{ name: string; sql: string }>;

  live.exec("PRAGMA foreign_keys = OFF");
  let triggersDropped = false;
  try {
    for (const t of triggers) {
      live.exec(`DROP TRIGGER IF EXISTS "${t.name.replace(/"/g, '""')}"`);
    }
    triggersDropped = true;
    const run = live.transaction(() => {
      for (const name of mainTables) {
        live.exec(`DELETE FROM main."${name.replace(/"/g, '""')}"`);
      }
      for (const name of srcTables) {
        if (!mainSet.has(name)) continue;
        const q = name.replace(/"/g, '""');
        live.exec(`INSERT INTO main."${q}" SELECT * FROM ${srcSchema}."${q}"`);
      }
    });
    run();
  } finally {
    if (triggersDropped) {
      for (const t of triggers) {
        try {
          live.exec(t.sql);
        } catch {
          // ignore recreaciones parciales
        }
      }
    }
    live.exec("PRAGMA foreign_keys = ON");
  }
}

/**
 * Prepara una copia del backup migrada al esquema actual y la vuelca en la BD viva.
 */
function applyBackupToLive(
  live: Database,
  backupDbFile: string,
  dataDir: string,
  log: RestoreServiceOpts["log"],
): number[] {
  const incoming = join(ensureBackupsDir(dataDir), `.incoming-${Date.now()}.db`);
  copyFileSync(backupDbFile, incoming);

  let migrated: number[] = [];
  const idb = new Database(incoming);
  try {
    idb.exec(`
      PRAGMA journal_mode = DELETE;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 3000;
    `);
    const mig = migrate(idb, {
      dataDir,
      log: (msg) => log?.("info", msg),
    });
    migrated = mig.applied;
    try {
      idb.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // ignore
    }
  } catch (err) {
    try {
      idb.close();
    } catch {
      // ignore
    }
    try {
      unlinkSync(incoming);
    } catch {
      // ignore
    }
    const msg = err instanceof Error ? err.message : String(err);
    throw new RestoreError(`Migración de la copia falló: ${msg}`, "FAILED");
  }
  try {
    idb.close();
  } catch {
    // ignore
  }

  try {
    live.exec(`ATTACH DATABASE '${sqlPath(incoming)}' AS restore_src`);
    try {
      copyAttachedIntoMain(live, "restore_src");
    } finally {
      try {
        live.exec("DETACH DATABASE restore_src");
      } catch {
        // ignore
      }
    }
  } catch (err) {
    try {
      unlinkSync(incoming);
    } catch {
      // ignore
    }
    if (err instanceof RestoreError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new RestoreError(`No se pudo aplicar la copia: ${msg}`, "FAILED");
  }

  try {
    unlinkSync(incoming);
  } catch {
    // ignore
  }

  return migrated;
}

export function createRestoreService(opts: RestoreServiceOpts) {
  const log = opts.log ?? (() => undefined);

  return {
    async restore(source: RestoreSource): Promise<RestoreResult> {
      if (busy) {
        throw new RestoreError("Ya hay una restauración en curso", "BUSY");
      }
      busy = true;
      let payload: PreparedPayload | null = null;
      try {
        payload = preparePayload(opts.dataDir, source);
        const { schemaVersion } = validateBackupDbFile(payload.dbFile);

        // Copia completa (db + imágenes) del estado actual (RF-52)
        let safetyFile: string;
        try {
          safetyFile = opts.createSafetyBackup().file;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new RestoreError(`No se pudo crear la copia de seguridad: ${msg}`, "FAILED");
        }

        const migrated = applyBackupToLive(opts.getDb(), payload.dbFile, opts.dataDir, log);

        let restoredImages = false;
        if (payload.images) {
          try {
            replaceImagesDir(opts.dataDir, payload.images);
            restoredImages = true;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log("warn", "Restauración de imágenes parcial o fallida", { msg });
          }
        }

        log("info", "Restauración completada (RF-52)", {
          safetyBackup: safetyFile,
          schemaVersion,
          migrated,
          restoredImages,
          source: source.type === "file" ? source.fileName : `upload:${source.fileName}`,
        });

        return {
          ok: true,
          safetyBackup: safetyFile,
          schemaVersion,
          migrated,
          restoredImages,
        };
      } finally {
        payload?.cleanup();
        busy = false;
      }
    },
  };
}

export type RestoreService = ReturnType<typeof createRestoreService>;
