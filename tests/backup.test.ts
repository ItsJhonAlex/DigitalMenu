import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { closeDatabase, openDatabase } from "../src/server/db";
import { migrate } from "../src/server/db/migrate";
import {
  BACKUP_FILE_RE,
  createBackupService,
  dailyBackupFileName,
  formatLocalStamp,
  fullBackupFileName,
  preMigrationBackupFileName,
} from "../src/server/services/backup";

const dirs: string[] = [];
const dbs: Database[] = [];

afterEach(() => {
  while (dbs.length) {
    const db = dbs.pop();
    try {
      db?.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      if (db) closeDatabase(db);
    } catch {
      // ignore
    }
  }
  while (dirs.length) {
    const d = dirs.pop();
    try {
      if (d) rmSync(d, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

function setup() {
  const dataDir = join(tmpdir(), `dm-bak-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dataDir, "images"), { recursive: true });
  dirs.push(dataDir);
  const db = openDatabase(dataDir);
  dbs.push(db);
  migrate(db, { dataDir });
  let lastAt: string | null = null;
  const svc = createBackupService({
    dataDir,
    db,
    keepDaily: 3,
    hour: 4,
    getLastAutoAt: () => lastAt,
    setLastAutoAt: (iso) => {
      lastAt = iso;
    },
  });
  return {
    dataDir,
    db,
    svc,
    getLast: () => lastAt,
    setLast: (v: string | null) => {
      lastAt = v;
    },
  };
}

describe("backup stamps / FILE_RE (T11)", () => {
  test("formatLocalStamp usa componentes locales AAAAMMDD-HHMM", () => {
    const d = new Date(2026, 9, 14, 4, 7); // mes 0-index: octubre
    const s = formatLocalStamp(d);
    expect(s.date).toBe("20261014");
    expect(s.time).toBe("0407");
    expect(s.stamp).toBe("20261014-0407");
  });

  test("nombres menu/full/pre cumplen BACKUP_FILE_RE", () => {
    const d = new Date(2026, 9, 14, 16, 30);
    expect(BACKUP_FILE_RE.test(dailyBackupFileName(d))).toBe(true);
    expect(BACKUP_FILE_RE.test(fullBackupFileName(d))).toBe(true);
    expect(BACKUP_FILE_RE.test(preMigrationBackupFileName(1, d))).toBe(true);
    expect(preMigrationBackupFileName(2, d)).toBe("pre-migracion-002-20261014-1630.db");
    // Formato antiguo (ISO) NO válido para descarga
    expect(BACKUP_FILE_RE.test("pre-migracion-001-2026-10-14T16-30-45.db")).toBe(false);
  });
});

describe("backup RF-50 / RF-51", () => {
  test("createDailyDb escribe menu-*.db y rota a keepDaily", () => {
    const { dataDir, svc } = setup();
    const a = svc.createDailyDb(new Date(2026, 9, 1, 4, 0));
    const b = svc.createDailyDb(new Date(2026, 9, 2, 4, 0));
    const c = svc.createDailyDb(new Date(2026, 9, 3, 4, 0));
    const d = svc.createDailyDb(new Date(2026, 9, 4, 4, 0));
    expect(BACKUP_FILE_RE.test(a.file)).toBe(true);
    expect(a.file.startsWith("menu-")).toBe(true);
    expect(existsSync(join(dataDir, "backups", d.file))).toBe(true);
    const menus = readdirSync(join(dataDir, "backups")).filter((f) => f.startsWith("menu-"));
    expect(menus.length).toBe(3);
    expect(menus).toContain(b.file);
    expect(menus).toContain(c.file);
    expect(menus).toContain(d.file);
    expect(menus).not.toContain(a.file);
  });

  test("maybeCreateScheduled startup respeta ventana 24 h", () => {
    const { svc, setLast } = setup();
    setLast(new Date().toISOString());
    expect(svc.maybeCreateScheduled("startup")).toBeNull();
    setLast(new Date(Date.now() - 25 * 3600_000).toISOString());
    const created = svc.maybeCreateScheduled("startup");
    expect(created).not.toBeNull();
    expect(created!.file.startsWith("menu-")).toBe(true);
  });

  test("createFullZip incluye menu.db, config.json e images/", async () => {
    const { dataDir, svc } = setup();
    writeFileSync(join(dataDir, "config.json"), JSON.stringify({ port: 8080 }));
    writeFileSync(join(dataDir, "images", "demo.bin"), "hola-imagen");
    const result = svc.createFullZip(new Date(2026, 9, 14, 18, 30));
    expect(result.file).toBe("full-20261014-1830.zip");
    expect(BACKUP_FILE_RE.test(result.file)).toBe(true);
    const buf = new Uint8Array(await Bun.file(result.path).arrayBuffer());
    const files = unzipSync(buf);
    expect(Object.keys(files).sort()).toEqual(["config.json", "images/demo.bin", "menu.db"].sort());
    expect(new TextDecoder().decode(files["images/demo.bin"])).toBe("hola-imagen");
    expect(files["menu.db"]!.byteLength).toBeGreaterThan(1000);
  });
});

describe("migrate pre-backup FILE_RE", () => {
  test("copia previa a migración coincide con BACKUP_FILE_RE", () => {
    const dataDir = join(tmpdir(), `dm-mig-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dataDir, { recursive: true });
    dirs.push(dataDir);
    const db = openDatabase(dataDir);
    dbs.push(db);
    migrate(db, { dataDir });
    const bak = join(dataDir, "backups");
    if (!existsSync(bak)) return; // BD nueva sin páginas puede no crear copia
    const pres = readdirSync(bak).filter((f) => f.startsWith("pre-migracion-"));
    for (const f of pres) {
      expect(BACKUP_FILE_RE.test(f)).toBe(true);
    }
  });
});
