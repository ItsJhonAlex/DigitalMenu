import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
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
import { buildXlsx, excelSafeText, parseXlsx, toCsv } from "../src/server/services/spreadsheet";

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

describe("spreadsheet formula guard", () => {
  test("excelSafeText antepone ' a = + - @", () => {
    expect(excelSafeText("=1+1")).toBe("'=1+1");
    expect(excelSafeText("+cmd")).toBe("'+cmd");
    expect(excelSafeText("-1")).toBe("'-1");
    expect(excelSafeText("@sum")).toBe("'@sum");
    expect(excelSafeText("Tapas")).toBe("Tapas");
  });

  test("toCsv escapa fórmulas", () => {
    const csv = toCsv([["name"], ["=HYPERLINK(x)"]]);
    expect(csv).toContain("'=HYPERLINK(x)");
  });
});

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

  test("parseXlsx lee sharedStrings (t=s) y respeta columnas saltadas", () => {
    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="products" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
    // índice 0 = id header; 1 = name; 2 = rich "Mo"+"jito"; 3 = "1"
    const shared = `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
  <si><t>id</t></si>
  <si><t>name_es</t></si>
  <si><r><t>Mo</t></r><r><t>jito</t></r></si>
  <si><t>1</t></si>
</sst>`;
    // Fila 1: A1=id, B1=name_es; fila 2: A2=1 (shared), C2=Mojito (salta B vacía)
    const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>3</v></c>
      <c r="C2" t="s"><v>2</v></c>
    </row>
  </sheetData>
</worksheet>`;
    const bytes = zipSync(
      {
        "[Content_Types].xml": strToU8(contentTypes),
        "_rels/.rels": strToU8(rels),
        "xl/workbook.xml": strToU8(workbook),
        "xl/_rels/workbook.xml.rels": strToU8(wbRels),
        "xl/sharedStrings.xml": strToU8(shared),
        "xl/worksheets/sheet1.xml": strToU8(sheet),
      },
      { level: 6 },
    );
    const sheets = parseXlsx(bytes);
    expect(sheets[0]?.name).toBe("products");
    expect(sheets[0]?.rows[0]).toEqual(["id", "name_es"]);
    expect(sheets[0]?.rows[1]?.[0]).toBe("1");
    expect(sheets[0]?.rows[1]?.[1]).toBe(""); // columna B vacía (saltada)
    expect(sheets[0]?.rows[1]?.[2]).toBe("Mojito"); // rich text unido
  });
});

describe("catalog export/import", () => {
  test("export xlsx y preview update por id", () => {
    const { repos, db } = setup();
    const sheets = buildCatalogSheets(repos);
    expect(sheets.map((s) => s.name)).toEqual(["categories", "products", "translations", "ayuda"]);
    const ayuda = sheets.find((s) => s.name === "ayuda")!;
    expect(ayuda.rows.some((r) => r[0] === "alergeno_gluten")).toBe(true);
    expect(ayuda.rows.some((r) => r[0] === "alergeno_frutos_cascara")).toBe(true);
    const prodHeader = sheets.find((s) => s.name === "products")!.rows[0]!;
    expect(prodHeader).toContain("ingredientes_es");
    expect(prodHeader).toContain("ingredientes_en");
    expect(prodHeader).toContain("alergenos");
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
    applyCatalogImport(db, repos, preview.plan);
    expect(repos.translations.get("category", cat.id, "es")?.name).toBe("Renombrada IO");
    expect(es?.name).not.toBe("Renombrada IO");
  });

  test("csv create con id vacío", () => {
    const { repos, db } = setup();
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
    applyCatalogImport(db, repos, preview.plan);
    const found = repos.products
      .list({ categoryId: catId })
      .some((p) => repos.translations.get("product", p.id, "es")?.name === "Nuevo CSV");
    expect(found).toBe(true);
  });

  test("Excel antiguo sin columnas de ingredientes sigue importando", () => {
    const { repos, db } = setup();
    const catId = repos.categories.list()[0]!.id;
    const existing = repos.products.create({
      category_id: catId,
      type: "comida",
      price_minor: 500,
      ingredients_es: "no borrar",
      allergens: JSON.stringify(["gluten"]),
    });
    repos.translations.upsert({
      entity: "product",
      entity_id: existing,
      lang: "es",
      name: "Viejo",
      description: null,
    });
    // Cabeceras antiguas (sin ingredientes_*) + update por id
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
      [
        String(existing),
        String(catId),
        "comida",
        "600",
        "1",
        "1",
        "10",
        "",
        "Viejo renombrado",
        "",
        "",
        "",
      ],
    ]);
    const sheets = parseCatalogFile("products.csv", new TextEncoder().encode(csv));
    const preview = previewCatalogImport(repos, sheets);
    expect(preview.errors).toEqual([]);
    applyCatalogImport(db, repos, preview.plan);
    const row = repos.products.get(existing)!;
    expect(row.price_minor).toBe(600);
    expect(row.ingredients_es).toBe("no borrar");
    expect(row.allergens).toBe(JSON.stringify(["gluten"]));
    expect(repos.translations.get("product", existing, "es")?.name).toBe("Viejo renombrado");
  });

  test("import con ingredientes y alergenos", () => {
    const { repos, db } = setup();
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
        "ingredientes_es",
        "ingredientes_en",
        "alergenos",
      ],
      [
        "",
        String(catId),
        "comida",
        "1800",
        "1",
        "1",
        "0",
        "",
        "Tarta",
        "",
        "Cake",
        "",
        "harina, huevo",
        "flour, egg",
        "gluten, huevo",
      ],
    ]);
    const sheets = parseCatalogFile("products.csv", new TextEncoder().encode(csv));
    const preview = previewCatalogImport(repos, sheets);
    expect(preview.errors).toEqual([]);
    applyCatalogImport(db, repos, preview.plan);
    const p = repos.products
      .list({ categoryId: catId })
      .find((x) => repos.translations.get("product", x.id, "es")?.name === "Tarta");
    expect(p).toBeTruthy();
    expect(p!.ingredients_es).toBe("harina, huevo");
    expect(p!.ingredients_en).toBe("flour, egg");
    expect(JSON.parse(p!.allergens!)).toEqual(["gluten", "huevo"]);
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
    const prevBody = (await prev.json()) as {
      token: string | null;
      summary: { updateCount: number };
    };
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
