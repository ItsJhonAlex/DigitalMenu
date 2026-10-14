import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { createApp } from "../src/server/app";
import type { RuntimeOptions } from "../src/server/config";
import { closeDatabase, openDatabase } from "../src/server/db";
import { appSchemaVersion, migrate } from "../src/server/db/migrate";
import { createRepos } from "../src/server/db/repos";
import type { Logger } from "../src/server/logger";
import {
  BACKUP_FILE_RE,
  createBackupService,
  preRestoreBackupFileName,
  vacuumInto,
} from "../src/server/services/backup";
import {
  RestoreError,
  createRestoreService,
  validateBackupDbFile,
} from "../src/server/services/restore";

const dirs: string[] = [];
const dbs: Database[] = [];

const silentLog: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  close: () => undefined,
};

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

function setupLive() {
  const dataDir = join(tmpdir(), `dm-restore-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dataDir, "images"), { recursive: true });
  dirs.push(dataDir);
  const db = openDatabase(dataDir);
  dbs.push(db);
  migrate(db, { dataDir });
  const repos = createRepos(db);
  repos.settings.setJson("carta.restaurant_name", "Actual");
  const ctx = { runtime: fakeRuntime(dataDir), log: silentLog, startedAt: Date.now(), db, repos };
  return { dataDir, ctx };
}

function fakeRuntime(dataDir: string): RuntimeOptions {
  return {
    dataDir,
    configPath: join(dataDir, "config.json"),
    version: "0.0.0-test",
    dev: true,
    openAdmin: false,
    config: {
      port: 8080,
      host: "127.0.0.1",
      logLevel: "error",
      edgePath: null,
      backup: { keepDaily: 14, hour: 4 },
    },
  };
}

describe("validateBackupDbFile (RF-52)", () => {
  test("acepta BD migrada válida", () => {
    const { dataDir, ctx } = setupLive();
    const bak = join(dataDir, "backups");
    mkdirSync(bak, { recursive: true });
    const dest = join(bak, "menu-20261014-0400.db");
    vacuumInto(ctx.db, dest);
    const v = validateBackupDbFile(dest);
    expect(v.schemaVersion).toBe(appSchemaVersion());
  });

  test("rechaza esquema más nuevo que la app", () => {
    const { dataDir, ctx } = setupLive();
    const bak = join(dataDir, "backups");
    mkdirSync(bak, { recursive: true });
    const dest = join(bak, "menu-20261014-0400.db");
    vacuumInto(ctx.db, dest);
    const future = new Database(dest);
    try {
      future
        .prepare(`INSERT INTO schema_migrations (version, name) VALUES (?, ?)`)
        .run(9999, "future");
    } finally {
      future.close();
    }
    try {
      validateBackupDbFile(dest);
      expect.unreachable("debía lanzar NEWER_SCHEMA");
    } catch (err) {
      expect(err).toBeInstanceOf(RestoreError);
      expect((err as RestoreError).code).toBe("NEWER_SCHEMA");
    }
  });

  test("rechaza archivo que no es SQLite", () => {
    const dir = join(tmpdir(), `dm-bad-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    dirs.push(dir);
    const f = join(dir, "no.db");
    writeFileSync(f, "not a database");
    expect(() => validateBackupDbFile(f)).toThrow(RestoreError);
  });
});

describe("restore service (RF-52)", () => {
  test("preRestoreBackupFileName cumple BACKUP_FILE_RE", () => {
    const name = preRestoreBackupFileName(new Date(2026, 9, 14, 17, 15));
    expect(name).toBe("pre-restore-20261014-1715.db");
    expect(BACKUP_FILE_RE.test(name)).toBe(true);
  });

  test("restaura .db y crea pre-restore; datos cambian", async () => {
    const { dataDir, ctx } = setupLive();
    const bak = join(dataDir, "backups");
    mkdirSync(bak, { recursive: true });

    // Snapshot A (nombre actual = Actual)
    const snapA = join(bak, "menu-20261001-0400.db");
    vacuumInto(ctx.db, snapA);

    // Mutar estado vivo
    ctx.repos.settings.setJson("carta.restaurant_name", "Cambiado");
    expect(ctx.repos.settings.getJson("carta.restaurant_name", "")).toBe("Cambiado");

    const restore = createRestoreService({
      dataDir,
      getDb: () => ctx.db,
      log: () => undefined,
    });

    const result = await restore.restore({ type: "file", fileName: "menu-20261001-0400.db" });
    expect(result.ok).toBe(true);
    expect(BACKUP_FILE_RE.test(result.safetyBackup)).toBe(true);
    expect(result.safetyBackup.startsWith("pre-restore-")).toBe(true);
    expect(existsSync(join(bak, result.safetyBackup))).toBe(true);
    expect(ctx.repos.settings.getJson("carta.restaurant_name", "")).toBe("Actual");
  });

  test("restaura zip con imágenes", async () => {
    const { dataDir, ctx } = setupLive();
    const bak = join(dataDir, "backups");
    mkdirSync(bak, { recursive: true });

    const tmpDb = join(bak, `.tmp-${Date.now()}.db`);
    vacuumInto(ctx.db, tmpDb);
    const imgBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
    const zipped = zipSync({
      "menu.db": new Uint8Array(readFileSync(tmpDb)),
      "images/abcd1234abcd1234.webp": imgBytes,
      "images/abcd1234abcd1234_t.webp": imgBytes,
    });
    const zipName = "full-20261014-1200.zip";
    writeFileSync(join(bak, zipName), zipped);
    rmSync(tmpDb, { force: true });

    writeFileSync(join(dataDir, "images", "old.webp"), "old");

    const restore = createRestoreService({
      dataDir,
      getDb: () => ctx.db,
    });

    const result = await restore.restore({ type: "file", fileName: zipName });
    expect(result.ok).toBe(true);
    expect(result.restoredImages).toBe(true);
    expect(existsSync(join(dataDir, "images", "abcd1234abcd1234.webp"))).toBe(true);
    expect(existsSync(join(dataDir, "images", "old.webp"))).toBe(false);
  });
});

describe("POST /api/admin/backups/restore", () => {
  test("JSON restore + confirm obligatorio", async () => {
    const { dataDir, ctx } = setupLive();
    const app = createApp(ctx);

    const bakSvc = createBackupService({
      dataDir,
      getDb: () => ctx.db,
      keepDaily: 3,
      hour: 4,
      getLastAutoAt: () => null,
      setLastAutoAt: () => undefined,
    });
    const created = bakSvc.createDailyDb(new Date(2026, 9, 10, 4, 0));
    ctx.repos.settings.setJson("carta.restaurant_name", "AntesRestore");

    const hdrs = {
      "Content-Type": "application/json",
      Origin: "http://localhost:8080",
      Host: "localhost:8080",
    };
    const noConfirm = await app.request("http://localhost:8080/api/admin/backups/restore", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ file: created.file }),
    });
    expect(noConfirm.status).toBe(400);

    const res = await app.request("http://localhost:8080/api/admin/backups/restore", {
      method: "POST",
      headers: hdrs,
      body: JSON.stringify({ file: created.file, confirm: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; safetyBackup: string };
    expect(body.ok).toBe(true);
    expect(body.safetyBackup.startsWith("pre-restore-")).toBe(true);
    expect(ctx.repos.settings.getJson("carta.restaurant_name", "")).toBe("Actual");
  });

  test("multipart upload .db restaura", async () => {
    const { dataDir, ctx } = setupLive();
    const app = createApp(ctx);
    const bak = join(dataDir, "backups");
    mkdirSync(bak, { recursive: true });
    const snap = join(bak, "upload-src.db");
    vacuumInto(ctx.db, snap);
    ctx.repos.settings.setJson("carta.restaurant_name", "Otro");

    const fd = new FormData();
    fd.append("confirm", "true");
    fd.append("file", new File([readFileSync(snap)], "copia.db"));

    const res = await app.request("http://localhost:8080/api/admin/backups/restore", {
      method: "POST",
      headers: {
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: fd,
    });
    expect(res.status).toBe(200);
    expect(ctx.repos.settings.getJson("carta.restaurant_name", "")).toBe("Actual");
  });
});
