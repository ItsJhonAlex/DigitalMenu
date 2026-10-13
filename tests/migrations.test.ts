import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "../src/server/db";
import { appliedVersions, migrate } from "../src/server/db/migrate";
import { createRepos } from "../src/server/db/repos";

const dirs: string[] = [];
const openDbs: Database[] = [];

afterEach(() => {
  while (openDbs.length) {
    const db = openDbs.pop();
    if (!db) continue;
    try {
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // ignore
    }
    try {
      closeDatabase(db);
    } catch {
      // ignore
    }
  }
  while (dirs.length) {
    const d = dirs.pop();
    if (!d) continue;
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // Windows a veces mantiene el lock un instante; no falla el test
    }
  }
});

function tempDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "digitalmenu-"));
  dirs.push(dir);
  return dir;
}

function openTempDb(dataDir: string): Database {
  const db = openDatabase(dataDir);
  openDbs.push(db);
  return db;
}

describe("migrate", () => {
  test("crea esquema + seed desde cero", () => {
    const dataDir = tempDataDir();
    const db = openTempDb(dataDir);
    const result = migrate(db, { dataDir });
    expect(result.applied).toEqual([1, 2]);
    expect(appliedVersions(db)).toEqual([1, 2]);

    const repos = createRepos(db);
    expect(repos.languages.list().map((l) => l.code)).toEqual(["es", "en"]);
    expect(repos.currencies.getBase()?.code).toBe("CUP");
    expect(repos.currencies.listActive()).toHaveLength(2);
    expect(repos.categories.list()).toHaveLength(6);
    expect(repos.settings.getJson("carta.default_currency", "")).toBe("CUP");
    expect(repos.translations.get("category", 1, "es")?.name).toBe("Entrantes");
    expect(repos.translations.get("category", 1, "en")?.name).toBe("Starters");
  });

  test("es idempotente en el segundo arranque", () => {
    const dataDir = tempDataDir();
    const db1 = openTempDb(dataDir);
    migrate(db1, { dataDir });
    try {
      db1.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // ignore
    }
    closeDatabase(db1);
    openDbs.pop();

    const db2 = openTempDb(dataDir);
    const second = migrate(db2, { dataDir });
    expect(second.applied).toEqual([]);
    expect(second.already).toEqual([1, 2]);
    expect(createRepos(db2).categories.list()).toHaveLength(6);
  });

  test("protege idioma es y moneda base", () => {
    const dataDir = tempDataDir();
    const db = openTempDb(dataDir);
    migrate(db, { dataDir });

    expect(() => db.exec(`DELETE FROM languages WHERE code = 'es'`)).toThrow();
    expect(() => db.exec(`UPDATE languages SET active = 0 WHERE code = 'es'`)).toThrow();
    expect(() => db.exec(`UPDATE currencies SET base_per_unit = 2 WHERE code = 'CUP'`)).toThrow();
  });

  test("productos y tasas vía repos", () => {
    const dataDir = tempDataDir();
    const db = openTempDb(dataDir);
    migrate(db, { dataDir });
    const repos = createRepos(db);

    const id = repos.products.create({
      category_id: 1,
      type: "comida",
      price_minor: 850,
    });
    repos.translations.upsert({
      entity: "product",
      entity_id: id,
      lang: "es",
      name: "Tostones",
      description: "Con mojo",
    });

    expect(repos.products.get(id)?.price_minor).toBe(850);
    expect(repos.products.list({ categoryId: 1 })).toHaveLength(1);
    expect(repos.currencies.updateRate("USD", 420)).toBe(true);
    expect(repos.currencies.list().find((c) => c.code === "USD")?.base_per_unit).toBe(420);
  });
});
