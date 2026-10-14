/**
 * Copias de seguridad (RF-50, RF-51): VACUUM INTO, rotación, zip completo.
 */
import type { Database } from "bun:sqlite";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { type Zippable, zipSync } from "fflate";

/** Nombres descargables vía GET /api/admin/backups/:file (07 §4.9). */
export const BACKUP_FILE_RE = /^(menu|full|pre-[a-z0-9-]+)-\d{8}-\d{4}\.(db|zip)$/i;

export type BackupKind = "db" | "full";

export type BackupItem = {
  file: string;
  kind: BackupKind | "pre";
  bytes: number;
  createdAt: string;
};

export type BackupServiceOpts = {
  dataDir: string;
  /** Getter: tras restaurar (RF-52) la BD en vivo puede cambiar. */
  getDb: () => Database;
  keepDaily: number;
  hour: number;
  getLastAutoAt: () => string | null;
  setLastAutoAt: (iso: string) => void;
  log?: (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;
};

/** Marca local AAAAMMDD-HHMM (no UTC). */
export function formatLocalStamp(d = new Date()): { date: string; time: string; stamp: string } {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const date = `${y}${mo}${day}`;
  const time = `${h}${mi}`;
  return { date, time, stamp: `${date}-${time}` };
}

export function dailyBackupFileName(d = new Date()): string {
  return `menu-${formatLocalStamp(d).stamp}.db`;
}

export function fullBackupFileName(d = new Date()): string {
  return `full-${formatLocalStamp(d).stamp}.zip`;
}

/** Coincide con BACKUP_FILE_RE: pre-migracion-NNN-AAAAMMDD-HHMM.db */
export function preMigrationBackupFileName(version: number, d = new Date()): string {
  return `pre-migracion-${String(version).padStart(3, "0")}-${formatLocalStamp(d).stamp}.db`;
}

/** Copia previa a importación CSV/XLSX: pre-import-AAAAMMDD-HHMM.db */
export function preImportBackupFileName(d = new Date()): string {
  return `pre-import-${formatLocalStamp(d).stamp}.db`;
}

/** Copia de seguridad del estado actual antes de restaurar (RF-52). */
export function preRestoreBackupFileName(d = new Date()): string {
  return `pre-restore-${formatLocalStamp(d).stamp}.db`;
}

export function backupsDirOf(dataDir: string): string {
  return join(dataDir, "backups");
}

export function ensureBackupsDir(dataDir: string): string {
  const dir = backupsDirOf(dataDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function sqlPath(absPath: string): string {
  return absPath.replace(/\\/g, "/").replace(/'/g, "''");
}

/** Copia consistente en caliente (SQLite VACUUM INTO). */
export function vacuumInto(db: Database, destAbs: string): void {
  db.exec(`VACUUM INTO '${sqlPath(destAbs)}'`);
}

function classify(file: string): BackupKind | "pre" {
  if (file.startsWith("full")) return "full";
  if (file.startsWith("pre-")) return "pre";
  return "db";
}

function collectFilesRecursive(dir: string, base: string, out: Record<string, Uint8Array>): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) {
      collectFilesRecursive(abs, base, out);
      continue;
    }
    const rel = relative(base, abs).split(sep).join("/");
    out[rel] = new Uint8Array(readFileSync(abs));
  }
}

export function createBackupService(opts: BackupServiceOpts) {
  const log = opts.log ?? (() => undefined);
  const backupsDir = () => ensureBackupsDir(opts.dataDir);

  function list(): BackupItem[] {
    const dir = backupsDir();
    return readdirSync(dir)
      .filter((f) => f.endsWith(".db") || f.endsWith(".zip"))
      .filter((f) => !f.startsWith("."))
      .map((file) => {
        const st = statSync(join(dir, file));
        return {
          file,
          kind: classify(file),
          bytes: st.size,
          createdAt: st.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Rotación de copias diarias menu-*.db (no toca full/pre).
   * Orden por nombre (AAAAMMDD-HHMM), no por mtime: varias copias
   * creadas el mismo segundo compartirían fecha de archivo.
   */
  function rotateDaily(keep = opts.keepDaily): string[] {
    const dir = backupsDir();
    const dailies = readdirSync(dir)
      .filter((f) => /^menu-\d{8}-\d{4}\.db$/i.test(f))
      .sort((a, b) => b.localeCompare(a)); // más reciente primero
    const removed: string[] = [];
    for (const file of dailies.slice(Math.max(0, keep))) {
      try {
        unlinkSync(join(dir, file));
        removed.push(file);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("warn", "No se pudo borrar copia antigua", { file, msg });
      }
    }
    return removed;
  }

  function createDailyDb(now = new Date()): { file: string; bytes: number; path: string } {
    const dir = backupsDir();
    let file = dailyBackupFileName(now);
    let dest = join(dir, file);
    // Evitar colisión en el mismo minuto
    if (existsSync(dest)) {
      const alt = new Date(now.getTime() + 60_000);
      file = dailyBackupFileName(alt);
      dest = join(dir, file);
    }
    vacuumInto(opts.getDb(), dest);
    const bytes = statSync(dest).size;
    opts.setLastAutoAt(new Date().toISOString());
    const removed = rotateDaily();
    log("info", "Copia diaria creada (RF-50)", { file, bytes, removed });
    return { file, bytes, path: dest };
  }

  function hoursSinceLastAuto(now = Date.now()): number | null {
    const last = opts.getLastAutoAt();
    if (!last) return null;
    const t = Date.parse(last);
    if (Number.isNaN(t)) return null;
    return (now - t) / 3_600_000;
  }

  function hasDailyForLocalDate(d = new Date()): boolean {
    const { date } = formatLocalStamp(d);
    const dir = backupsDir();
    return readdirSync(dir).some((f) => new RegExp(`^menu-${date}-\\d{4}\\.db$`, "i").test(f));
  }

  /**
   * Arranque: si no hay última copia o tiene > 24 h → crear.
   * Hora programada: si aún no hay menu-AAAAMMDD-* de hoy → crear.
   */
  function maybeCreateScheduled(
    reason: "startup" | "hour",
    now = new Date(),
  ): {
    file: string;
    bytes: number;
  } | null {
    if (reason === "startup") {
      const hours = hoursSinceLastAuto(now.getTime());
      if (hours !== null && hours < 24) {
        log("info", "Copia diaria omitida (última < 24 h)", { hours: Math.round(hours * 10) / 10 });
        return null;
      }
    } else if (hasDailyForLocalDate(now)) {
      log("info", "Copia diaria omitida (ya existe hoy)", { date: formatLocalStamp(now).date });
      return null;
    }
    return createDailyDb(now);
  }

  function createFullZip(now = new Date()): { file: string; bytes: number; path: string } {
    const dir = backupsDir();
    let file = fullBackupFileName(now);
    let dest = join(dir, file);
    if (existsSync(dest)) {
      const alt = new Date(now.getTime() + 60_000);
      file = fullBackupFileName(alt);
      dest = join(dir, file);
    }

    const tmpDb = join(dir, `.tmp-full-${Date.now()}.db`);
    try {
      vacuumInto(opts.getDb(), tmpDb);
      const raw: Record<string, Uint8Array> = {
        "menu.db": new Uint8Array(readFileSync(tmpDb)),
      };
      const cfg = join(opts.dataDir, "config.json");
      if (existsSync(cfg)) {
        raw["config.json"] = new Uint8Array(readFileSync(cfg));
      }
      const imagesDir = join(opts.dataDir, "images");
      if (existsSync(imagesDir)) {
        collectFilesRecursive(imagesDir, opts.dataDir, raw);
      }
      // WebP ya comprimido → level 0 (store); resto deflate
      const entries: Zippable = {};
      for (const [name, data] of Object.entries(raw)) {
        entries[name] = /\.webp$/i.test(name) ? [data, { level: 0 }] : [data, { level: 6 }];
      }
      const zipped = zipSync(entries);
      writeFileSync(dest, zipped);
    } finally {
      if (existsSync(tmpDb)) {
        try {
          unlinkSync(tmpDb);
        } catch {
          // ignore
        }
      }
    }

    const bytes = statSync(dest).size;
    log("info", "Copia completa exportada (RF-51)", { file, bytes });
    return { file, bytes, path: dest };
  }

  function msUntilNextHour(hour: number, now = new Date()): number {
    const next = new Date(now);
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime() - now.getTime();
  }

  /** Programa la copia de la hora configurada (p. ej. 04:00 local). */
  function startDailyScheduler(): { stop: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      try {
        maybeCreateScheduled("hour");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("error", "Fallo en copia diaria programada", { msg });
      }
      if (stopped) return;
      timer = setTimeout(tick, msUntilNextHour(opts.hour));
      if (typeof timer === "object" && timer && "unref" in timer) {
        (timer as NodeJS.Timeout).unref();
      }
    };

    timer = setTimeout(tick, msUntilNextHour(opts.hour));
    if (typeof timer === "object" && timer && "unref" in timer) {
      (timer as NodeJS.Timeout).unref();
    }
    log("info", "Programador de copias diarias activo", {
      hour: opts.hour,
      keepDaily: opts.keepDaily,
    });

    return {
      stop: () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      },
    };
  }

  return {
    list,
    rotateDaily,
    createDailyDb,
    createFullZip,
    maybeCreateScheduled,
    startDailyScheduler,
    hoursSinceLastAuto,
    hasDailyForLocalDate,
    backupsDir,
  };
}

export type BackupService = ReturnType<typeof createBackupService>;
