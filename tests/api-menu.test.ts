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
import type { MenuResponse } from "../src/shared/api-types";

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
  const dataDir = mkdtempSync(join(tmpdir(), "dm-menu-"));
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

const host = { Host: "localhost:8080" };

describe("API /api/menu", () => {
  test("devuelve carta con seed y ETag/304", async () => {
    const { app, repos } = setup();
    const catId = repos.categories.list()[0]!.id;
    const pid = repos.products.create({
      category_id: catId,
      type: "comida",
      price_minor: 2500,
      available: true,
      visible: true,
    });
    repos.translations.upsert({
      entity: "product",
      entity_id: pid,
      lang: "es",
      name: "Tostones",
      description: "Con mojo",
    });

    const res = await app.request("http://localhost:8080/api/menu?lang=es", {
      headers: host,
    });
    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).toBeTruthy();
    expect(res.headers.get("Content-Language")).toBe("es");

    const body = (await res.json()) as MenuResponse;
    expect(body.lang).toBe("es");
    expect(body.restaurant.name).toBe("Avanzar In Time");
    expect(body.currency.list.length).toBeGreaterThan(0);
    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.ui.offers).toBe("Ofertas");
    const product = body.categories.flatMap((c) => c.products).find((p) => p.id === pid);
    expect(product?.name).toBe("Tostones");
    expect(product?.priceMinor).toBe(2500);

    const cached = await app.request("http://localhost:8080/api/menu?lang=es", {
      headers: { ...host, "If-None-Match": etag! },
    });
    expect(cached.status).toBe(304);
  });

  test("fallback de idioma desconocido al default", async () => {
    const { app } = setup();
    const res = await app.request("http://localhost:8080/api/menu?lang=xx", {
      headers: host,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as MenuResponse;
    expect(body.lang).toBe("es");
    expect(body.requestedLang).toBe("xx");
  });

  test("sirve index de carta y assets en --dev", async () => {
    const { app } = setup();
    const html = await app.request("http://localhost:8080/", { headers: host });
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain("/carta/main.ts");

    const css = await app.request("http://localhost:8080/carta/styles.css", { headers: host });
    expect(css.status).toBe(200);
    expect(css.headers.get("Content-Type")).toContain("text/css");

    const js = await app.request("http://localhost:8080/carta/main.ts", { headers: host });
    expect(js.status).toBe(200);
    expect(js.headers.get("Content-Type")).toContain("javascript");

    const money = await app.request("http://localhost:8080/shared/money.ts", { headers: host });
    expect(money.status).toBe(200);
    expect(money.headers.get("Content-Type")).toContain("javascript");
  });

  test("respeta carta.show_images y show_rate (sin 304 obsoleto)", async () => {
    const { app, repos } = setup();
    const withDefault = await app.request("http://localhost:8080/api/menu", { headers: host });
    const first = (await withDefault.json()) as MenuResponse;
    expect(first.showImages).toBe(true);
    expect(first.currency.showRate).toBe(true);
    const etag1 = withDefault.headers.get("ETag");

    repos.settings.setJson("carta.show_images", false);
    const offImg = await app.request("http://localhost:8080/api/menu", {
      headers: { ...host, "If-None-Match": etag1! },
    });
    expect(offImg.status).toBe(200);
    expect(((await offImg.json()) as MenuResponse).showImages).toBe(false);
    const etag2 = offImg.headers.get("ETag");
    expect(etag2).not.toBe(etag1);

    repos.settings.setJson("carta.show_rate", false);
    const offRate = await app.request("http://localhost:8080/api/menu", {
      headers: { ...host, "If-None-Match": etag2! },
    });
    expect(offRate.status).toBe(200);
    const body = (await offRate.json()) as MenuResponse;
    expect(body.currency.showRate).toBe(false);
    expect(body.showImages).toBe(false);
  });

  test("oculta productos no visibles", async () => {
    const { app, repos } = setup();
    const cats = repos.categories.list();
    const catId = cats[0]!.id;
    const id = repos.products.create({
      category_id: catId,
      type: "comida",
      price_minor: 1000,
      visible: false,
      available: true,
    });
    repos.translations.upsert({
      entity: "product",
      entity_id: id,
      lang: "es",
      name: "Oculto",
      description: null,
    });

    const res = await app.request("http://localhost:8080/api/menu?lang=es", { headers: host });
    const body = (await res.json()) as MenuResponse;
    const allIds = body.categories.flatMap((c) => c.products.map((p) => p.id));
    expect(allIds).not.toContain(id);
  });

  test("categoría desactivada oculta la categoría y sus productos activos", async () => {
    const { app, repos } = setup();
    const cat = repos.categories.list()[0]!;
    const pid = repos.products.create({
      category_id: cat.id,
      type: "comida",
      price_minor: 2000,
      available: true,
      visible: true,
    });
    repos.translations.upsert({
      entity: "product",
      entity_id: pid,
      lang: "es",
      name: "Producto activo en cat oculta",
      description: null,
    });
    repos.settings.bumpMenuRevision();

    const before = await app.request("http://localhost:8080/api/menu?lang=es", { headers: host });
    expect(before.status).toBe(200);
    const bodyBefore = (await before.json()) as MenuResponse;
    const etagBefore = before.headers.get("ETag");
    expect(bodyBefore.categories.some((c) => c.id === cat.id)).toBe(true);
    expect(bodyBefore.categories.flatMap((c) => c.products).some((p) => p.id === pid)).toBe(true);

    const hide = await app.request(`http://localhost:8080/api/admin/categories/${cat.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({ visible: false }),
    });
    expect(hide.status).toBe(200);

    const after = await app.request("http://localhost:8080/api/menu?lang=es", {
      headers: { ...host, "If-None-Match": etagBefore! },
    });
    expect(after.status).toBe(200);
    const bodyAfter = (await after.json()) as MenuResponse;
    expect(after.headers.get("ETag")).not.toBe(etagBefore);
    expect(bodyAfter.categories.some((c) => c.id === cat.id)).toBe(false);
    expect(bodyAfter.categories.flatMap((c) => c.products).some((p) => p.id === pid)).toBe(false);
  });

  test("mover producto de categoría se refleja enseguida en la carta", async () => {
    const { app, repos } = setup();
    const cats = repos.categories.list();
    expect(cats.length).toBeGreaterThanOrEqual(2);
    const catA = cats[0]!;
    const catB = cats[1]!;

    const pid = repos.products.create({
      category_id: catA.id,
      type: "comida",
      price_minor: 1500,
      available: true,
      visible: true,
    });
    repos.translations.upsert({
      entity: "product",
      entity_id: pid,
      lang: "es",
      name: "Plato móvil",
      description: null,
    });
    // Alinear rev tras escrituras directas al repo (el admin HTTP es quien bumpea)
    repos.settings.bumpMenuRevision();

    const before = await app.request("http://localhost:8080/api/menu?lang=es", { headers: host });
    expect(before.status).toBe(200);
    const bodyBefore = (await before.json()) as MenuResponse;
    const etagBefore = before.headers.get("ETag");
    expect(etagBefore).toBeTruthy();

    const inA = bodyBefore.categories
      .find((c) => c.id === catA.id)
      ?.products.some((p) => p.id === pid);
    const inB = bodyBefore.categories
      .find((c) => c.id === catB.id)
      ?.products.some((p) => p.id === pid);
    expect(inA).toBe(true);
    expect(inB).toBeFalsy();
    const revBefore = bodyBefore.version;

    const move = await app.request(`http://localhost:8080/api/admin/products/${pid}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({
        categoryId: catB.id,
        type: "comida",
        priceMinor: 1500,
        available: true,
        visible: true,
        i18n: { es: { name: "Plato móvil" } },
      }),
    });
    expect(move.status).toBe(200);

    const after = await app.request("http://localhost:8080/api/menu?lang=es", {
      headers: { ...host, "If-None-Match": etagBefore! },
    });
    expect(after.status).toBe(200);
    const bodyAfter = (await after.json()) as MenuResponse;
    expect(bodyAfter.version).toBeGreaterThan(revBefore);
    expect(after.headers.get("ETag")).not.toBe(etagBefore);

    const stillInA = bodyAfter.categories
      .find((c) => c.id === catA.id)
      ?.products.some((p) => p.id === pid);
    const nowInB = bodyAfter.categories
      .find((c) => c.id === catB.id)
      ?.products.some((p) => p.id === pid);
    expect(stillInA).toBeFalsy();
    expect(nowInB).toBe(true);
  });
});
