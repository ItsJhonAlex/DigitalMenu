import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server/app";
import type { RuntimeOptions } from "../src/server/config";
import { closeDatabase, openDatabase } from "../src/server/db";
import { migrate } from "../src/server/db/migrate";
import { createRepos } from "../src/server/db/repos";
import type { Logger } from "../src/server/logger";

const dirs: string[] = [];
const dbs: Database[] = [];

const silentLog: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  flush: () => undefined,
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

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "dm-ord-"));
  dirs.push(dataDir);
  const db = openDatabase(dataDir);
  dbs.push(db);
  migrate(db, { dataDir });
  const repos = createRepos(db);
  const runtime: RuntimeOptions = {
    dataDir,
    configPath: join(dataDir, "config.json"),
    config: {
      port: 8080,
      host: "127.0.0.1",
      edgePath: null,
      logLevel: "error",
      backup: { keepDaily: 14, hour: 4 },
    },
    dev: true,
    openAdmin: false,
    version: "0.1.0-test",
  };
  const app = createApp({ runtime, log: silentLog, startedAt: Date.now(), db, repos });
  return { app, repos };
}

const writeHeaders = {
  "Content-Type": "application/json",
  Origin: "http://localhost:8080",
  Host: "localhost:8080",
};

describe("orden por lote (M5 / RF-11 / RF-17)", () => {
  test("PUT /api/admin/categories/order reordena y sube revision", async () => {
    const { app, repos } = setup();
    const before = repos.settings.getMenuRevision();
    const ids = repos.categories.list().map((c) => c.id);
    expect(ids.length).toBeGreaterThan(2);
    const reversed = [...ids].reverse();

    const res = await app.request("http://localhost:8080/api/admin/categories/order", {
      method: "PUT",
      headers: writeHeaders,
      body: JSON.stringify({ ids: reversed }),
    });
    expect(res.status).toBe(200);
    expect(repos.categories.list().map((c) => c.id)).toEqual(reversed);
    expect(repos.settings.getMenuRevision()).toBeGreaterThan(before);
  });

  test("PUT products/order reordena dentro de la categoría", async () => {
    const { app, repos } = setup();
    const catId = repos.categories.list()[0]!.id;
    const a = repos.products.create({
      category_id: catId,
      type: "comida",
      price_minor: 100,
      sort_order: 0,
    });
    const b = repos.products.create({
      category_id: catId,
      type: "comida",
      price_minor: 200,
      sort_order: 10,
    });
    const c = repos.products.create({
      category_id: catId,
      type: "comida",
      price_minor: 300,
      sort_order: 20,
    });
    const before = repos.settings.getMenuRevision();

    const res = await app.request(
      `http://localhost:8080/api/admin/categories/${catId}/products/order`,
      {
        method: "PUT",
        headers: writeHeaders,
        body: JSON.stringify({ ids: [c, a, b] }),
      },
    );
    expect(res.status).toBe(200);
    const ordered = repos.products.list({ categoryId: catId }).map((p) => p.id);
    expect(ordered).toEqual([c, a, b]);
    expect(repos.settings.getMenuRevision()).toBeGreaterThan(before);
  });

  test("order incompleto → 400", async () => {
    const { app, repos } = setup();
    const ids = repos.categories.list().map((c) => c.id);
    const res = await app.request("http://localhost:8080/api/admin/categories/order", {
      method: "PUT",
      headers: writeHeaders,
      body: JSON.stringify({ ids: ids.slice(0, 1) }),
    });
    expect(res.status).toBe(400);
  });
});
