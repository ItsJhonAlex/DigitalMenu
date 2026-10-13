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
  const dataDir = mkdtempSync(join(tmpdir(), "dm-api-"));
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

describe("API admin", () => {
  test("CRUD categoría y producto", async () => {
    const { app } = setup();

    const createCat = await app.request("http://localhost:8080/api/admin/categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({
        visible: true,
        i18n: { es: { name: "Tapas" }, en: { name: "Tapas" } },
      }),
    });
    expect(createCat.status).toBe(201);
    const cat = (await createCat.json()) as { id: number };
    expect(cat.id).toBeGreaterThan(0);

    const createProd = await app.request("http://localhost:8080/api/admin/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({
        categoryId: cat.id,
        type: "comida",
        priceMinor: 900,
        i18n: { es: { name: "Croqueta", description: "Casera" } },
      }),
    });
    expect(createProd.status).toBe(201);
    const prod = (await createProd.json()) as { id: number; priceMinor: number };
    expect(prod.priceMinor).toBe(900);

    const patch = await app.request(`http://localhost:8080/api/admin/products/${prod.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({ available: false }),
    });
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as { available: boolean };
    expect(patched.available).toBe(false);
  });

  test("tasa de moneda y conflicto al borrar categoría con productos", async () => {
    const { app, repos } = setup();
    const catId = repos.categories.list()[0]!.id;
    const pid = repos.products.create({ category_id: catId, type: "comida", price_minor: 100 });
    repos.translations.upsert({
      entity: "product",
      entity_id: pid,
      lang: "es",
      name: "X",
    });

    const del = await app.request(`http://localhost:8080/api/admin/categories/${catId}`, {
      method: "DELETE",
      headers: { Origin: "http://localhost:8080", Host: "localhost:8080" },
    });
    expect(del.status).toBe(409);

    const rate = await app.request("http://localhost:8080/api/admin/currencies/USD", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({ basePerUnit: 415 }),
    });
    expect(rate.status).toBe(200);
    const body = (await rate.json()) as { basePerUnit: number };
    expect(body.basePerUnit).toBe(415);
  });

  test("diagnostics y settings", async () => {
    const { app } = setup();
    const diag = await app.request("http://localhost:8080/api/admin/diagnostics", {
      headers: { Host: "localhost:8080" },
    });
    expect(diag.status).toBe(200);
    const d = (await diag.json()) as { schemaVersion: number; version: string };
    expect(d.schemaVersion).toBe(2);

    const put = await app.request("http://localhost:8080/api/admin/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({ "carta.restaurant_name": "La Brasa" }),
    });
    expect(put.status).toBe(200);

    const get = await app.request("http://localhost:8080/api/admin/settings", {
      headers: { Host: "localhost:8080" },
    });
    const settings = (await get.json()) as Record<string, unknown>;
    expect(settings["carta.restaurant_name"]).toBe("La Brasa");
  });
});
