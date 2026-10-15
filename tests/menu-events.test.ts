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
import { MENU_EVENTS_MAX_CLIENTS, createMenuEventsHub } from "../src/server/services/menu-events";

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
  const dataDir = mkdtempSync(join(tmpdir(), "dm-sse-"));
  dirs.push(dataDir);
  const db = openDatabase(dataDir);
  dbs.push(db);
  migrate(db, { dataDir });
  const repos = createRepos(db);
  const menuEvents = createMenuEventsHub({ maxClients: 8, heartbeatMs: 60_000 });
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
  const app = createApp({
    runtime,
    log: silentLog,
    startedAt: Date.now(),
    db,
    repos,
    menuEvents,
  });
  return { app, repos, menuEvents };
}

describe("menu-events hub", () => {
  test("publica revisión a suscriptores y respeta tope", () => {
    const hub = createMenuEventsHub({ maxClients: 2, heartbeatMs: 60_000 });
    const received: string[] = [];
    const a = hub.subscribe((c) => received.push(c));
    const b = hub.subscribe((c) => received.push(c));
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(hub.subscribe(() => undefined)).toBeNull();
    expect(hub.clientCount()).toBe(2);

    hub.publishRevision(7);
    expect(received.some((c) => c.includes('"revision":7'))).toBe(true);
    hub.unsubscribe(a!.id);
    expect(hub.clientCount()).toBe(1);
    hub.stop();
  });
});

describe("GET /api/menu/events", () => {
  test("envía event: revision al conectar", async () => {
    const { app, repos } = setup();
    const rev = repos.settings.getMenuRevision();
    const res = await app.request("http://localhost:8080/api/menu/events");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !buf.includes("event: revision")) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(buf).toContain("event: revision");
    expect(buf).toContain(`"revision":${rev}`);
  });

  test("escritura admin publica nueva revisión por SSE", async () => {
    const { app, repos } = setup();
    const res = await app.request("http://localhost:8080/api/menu/events");
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    // Drenar evento inicial
    {
      let buf = "";
      while (!buf.includes("event: revision")) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
      }
    }

    const before = repos.settings.getMenuRevision();
    const write = await app.request("http://localhost:8080/api/admin/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
        Host: "localhost:8080",
      },
      body: JSON.stringify({ "carta.restaurant_name": "SSE Test" }),
    });
    expect(write.status).toBe(200);

    let buf = "";
    const deadline = Date.now() + 2000;
    while (Date.now() < deadline && !buf.includes("event: revision")) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
    await reader.cancel();
    expect(repos.settings.getMenuRevision()).toBeGreaterThan(before);
    expect(buf).toMatch(/event: revision[\s\S]*"revision":\d+/);
  });

  test("constante de tope documentada para medición 30–50 móviles", () => {
    expect(MENU_EVENTS_MAX_CLIENTS).toBeGreaterThanOrEqual(50);
  });
});
