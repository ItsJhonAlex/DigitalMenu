import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/server/app";
import type { RuntimeOptions } from "../src/server/config";
import { closeDatabase, openDatabase } from "../src/server/db";
import { migrate } from "../src/server/db/migrate";
import { createRepos } from "../src/server/db/repos";
import type { Logger } from "../src/server/logger";
import {
  applyCatalogImport,
  buildCatalogSheets,
  exportCatalog,
  parseCatalogFile,
  previewCatalogImport,
} from "../src/server/services/catalog-io";
import { buildXlsx, parseXlsx, toCsv } from "../src/server/services/spreadsheet";

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
  const dataDir = mkdtempSync(join(tmpdir(), "dm-io-"));
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
  return { app, repos, db, dataDir };
}

describe("spreadsheet xlsx roundtrip", () => {
  test("buildXlsx / parseXlsx conserva celdas", () => {
    const bytes = buildXlsx([
      {
        name: "products",
        rows: [
          ["id", "name_es"],
          ["1", "Mojito"],
        ],
      },
    ]);
    const sheets = parseXlsx(bytes);
    expect(sheets[0]?.name).toBe("products");
    expect(sheets[0]?.rows[1]?.[1]).toBe("Mojito");
  });
});

describe("catalog export/import", () => {
  test("export xlsx y preview update por id", () => {
    const { repos } = setup();
    const sheets = buildCatalogSheets(repos);
    expect(sheets.map((s) => s.name)).toEqual(["categories", "products", "translations"]);
    const cat = repos.categories.list()[0]!;
    const es = repos.translations.get("category", cat.id, "es");
    const exportBytes = exportCatalog(repos, "xlsx").bytes;
    const parsed = parseCatalogFile("carta.xlsx", exportBytes);
    // Cambiar nombre en hoja categories
    const catSheet = parsed.find((s) => s.name === "categories")!;
    const header = catSheet.rows[0]!;
    const nameIdx = header.indexOf("name_es");
    const idIdx = header.indexOf("id");
    const row = catSheet.rows.find((r) => r[idIdx] === String(cat.id));
    expect(row).toBeTruthy();
    row![nameIdx] = "Renombrada IO";
    const preview = previewCatalogImport(repos, parsed);
    expect(preview.errors).toEqual([]);
    expect(preview.updates.some((u) => u.id === cat.id && u.label === "Renombrada IO")).toBe(true);
    applyCatalogImport(repos, preview.plan);
    expect(repos.translations.get("category", cat.id, "es")?.name).toBe("Renombrada IO");
    expect(es?.name).not.toBe("Renombrada IO");
  });

  test("csv create con id vacío", () => {
    const { repos } = setup();
    const catId = repos.categories.list()[0]!.id;
    const csv = toCsv([
      [
        "id",
        "category_id",
        "type",
        "price_minor",
        "available",
        "visible",
        "sort_order",
        "image",
        "name_es",
        "description_es",
        "name_en",
        "description_en",
      ],
      ["", String(catId), "bebida", "1500", "1", "1", "99", "", "Nuevo CSV", "", "", ""],
    ]);
    const sheets = parseCatalogFile("products.csv", new TextEncoder().encode(csv));
    const preview = previewCatalogImport(repos, sheets);
    expect(preview.errors).toEqual([]);
    expect(preview.creates.some((c) => c.label === "Nuevo CSV")).toBe(true);
    applyCatalogImport(repos, preview.plan);
    const found = repos.products
      .list({ categoryId: catId })
      .some((p) => repos.translations.get("product", p.id, "es")?.name === "Nuevo CSV");
    expect(found).toBe(true);
  });

  test("API export + preview + apply con backup", async () => {
    const { app, dataDir, repos } = setup();
    const exp = await app.request("http://localhost:8080/api/admin/catalog/export?format=xlsx", {
      headers: { Host: "localhost:8080" },
    });
    expect(exp.status).toBe(200);
    const bytes = new Uint8Array(await exp.arrayBuffer());

    const fd = new FormData();
    fd.append("file", new File([bytes], "carta.xlsx"));
    const prev = await app.request("http://localhost:8080/api/admin/catalog/import/preview", {
      method: "POST",
      headers: { Origin: "http://localhost:8080", Host: "localhost:8080" },
      body: fd,
    });
    expect(prev.status).toBe(200);
    const prevBody = (await prev.json()) as { token: string | null; summary: { updateCount: number } };
    // Solo updates (mismo contenido) o vacío de creates
    expect(prevBody.token).toBeTruthy();

    const apply = await app.request("http://localhost:8080/api/admin/catalog/import/apply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({ confirm: true, token: prevBody.token }),
    });
    expect(apply.status).toBe(200);
    const applied = (await apply.json()) as { safetyBackup: string };
    expect(applied.safetyBackup).toMatch(/^pre-import-\d{8}-\d{4}\.db$/);
    const bak = join(dataDir, "backups");
    expect(existsSync(bak)).toBe(true);
    expect(readdirSync(bak).some((f) => f.startsWith("pre-import-"))).toBe(true);
    expect(repos.categories.list().length).toBeGreaterThan(0);
  });
});
