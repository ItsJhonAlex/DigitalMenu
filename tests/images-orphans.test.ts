import type { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase, openDatabase } from "../src/server/db";
import { migrate } from "../src/server/db/migrate";
import { createImagesService } from "../src/server/services/images";

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
  const dataDir = join(tmpdir(), `dm-img-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dataDir, "images"), { recursive: true });
  dirs.push(dataDir);
  const db = openDatabase(dataDir);
  dbs.push(db);
  migrate(db, { dataDir });
  const images = createImagesService({ dataDir, getDb: () => db });
  return { dataDir, images };
}

function touchOrphan(dataDir: string, hash: string, ageMs: number) {
  const dir = join(dataDir, "images");
  const large = join(dir, `${hash}.webp`);
  const thumb = join(dir, `${hash}_t.webp`);
  // Cabecera RIFF/WEBP mínima (no hace falta válida para limpieza)
  writeFileSync(large, Buffer.from("RIFF....WEBP"));
  writeFileSync(thumb, Buffer.from("RIFF....WEBP"));
  const when = new Date(Date.now() - ageMs);
  utimesSync(large, when, when);
  utimesSync(thumb, when, when);
}

describe("images orphans (T13)", () => {
  test("no lista ni borra huérfanas de menos de 10 minutos", () => {
    const { dataDir, images } = setup();
    const young = "aaaaaaaaaaaaaaaa";
    const old = "bbbbbbbbbbbbbbbb";
    touchOrphan(dataDir, young, 2 * 60 * 1000);
    touchOrphan(dataDir, old, 15 * 60 * 1000);

    const listed = images.listOrphans();
    expect(listed.items).toEqual([old]);
    expect(listed.items).not.toContain(young);

    const deleted = images.deleteOrphans();
    expect(deleted).toBe(1);
    expect(images.listOrphans().items).toEqual([]);
    // La joven sigue en disco
    expect(images.olderThanGrace(young)).toBe(false);
  });

  test("deleted cuenta hashes, no archivos .webp", () => {
    const { dataDir, images } = setup();
    touchOrphan(dataDir, "cccccccccccccccc", 20 * 60 * 1000);
    touchOrphan(dataDir, "dddddddddddddddd", 20 * 60 * 1000);
    expect(images.deleteOrphans()).toBe(2);
  });
});
