import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { payloadTooLarge, unsupportedMedia, validationError } from "../http/errors";

const MAX_BYTES = 2 * 1024 * 1024;
const HASH_RE = /^[a-f0-9]{16}$/;

function isWebp(buf: Uint8Array): boolean {
  return (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  );
}

function hash16(buf: Uint8Array): string {
  return createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

export function createImagesService(opts: { dataDir: string; db: Database }) {
  const imagesDir = join(opts.dataDir, "images");
  if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });

  return {
    async saveUpload(large: File, thumb: File) {
      if (large.size > MAX_BYTES || thumb.size > MAX_BYTES) {
        throw payloadTooLarge("Imagen > 2 MB");
      }
      const largeBuf = new Uint8Array(await large.arrayBuffer());
      const thumbBuf = new Uint8Array(await thumb.arrayBuffer());
      if (!isWebp(largeBuf) || !isWebp(thumbBuf)) {
        throw unsupportedMedia("Solo se acepta WebP");
      }
      const image = hash16(largeBuf);
      const largePath = join(imagesDir, `${image}.webp`);
      const thumbPath = join(imagesDir, `${image}_t.webp`);
      const deduplicated = existsSync(largePath) && existsSync(thumbPath);

      if (!deduplicated) {
        const tmpL = `${largePath}.tmp`;
        const tmpT = `${thumbPath}.tmp`;
        writeFileSync(tmpL, largeBuf);
        writeFileSync(tmpT, thumbBuf);
        renameSync(tmpL, largePath);
        renameSync(tmpT, thumbPath);
      }

      return {
        image,
        large: `/img/${image}.webp`,
        thumb: `/img/${image}_t.webp`,
        bytes: { large: largeBuf.byteLength, thumb: thumbBuf.byteLength },
        deduplicated,
      };
    },

    referencedHashes(): Set<string> {
      const set = new Set<string>();
      const rows = opts.db
        .prepare(
          `SELECT image AS h FROM categories WHERE image IS NOT NULL
           UNION SELECT image FROM products WHERE image IS NOT NULL
           UNION SELECT image FROM offers WHERE image IS NOT NULL`,
        )
        .all() as Array<{ h: string }>;
      for (const r of rows) {
        if (HASH_RE.test(r.h)) set.add(r.h);
      }
      const logo = opts.db.prepare(`SELECT value FROM settings WHERE key = 'carta.logo'`).get() as {
        value: string;
      } | null;
      if (logo) {
        try {
          const v = JSON.parse(logo.value);
          if (typeof v === "string" && HASH_RE.test(v)) set.add(v);
        } catch {
          // ignore
        }
      }
      return set;
    },

    listOrphans(): { items: string[]; bytes: number } {
      const used = this.referencedHashes();
      const files = readdirSync(imagesDir).filter((f) => f.endsWith(".webp"));
      const hashes = new Set<string>();
      let bytes = 0;
      for (const f of files) {
        const m = /^([a-f0-9]{16})(_t)?\.webp$/.exec(f);
        if (!m?.[1]) continue;
        const hash = m[1];
        if (used.has(hash)) continue;
        if (!hashes.has(hash)) {
          hashes.add(hash);
        }
        bytes += statSync(join(imagesDir, f)).size;
      }
      return { items: [...hashes], bytes };
    },

    deleteOrphans(): number {
      const { items } = this.listOrphans();
      let deleted = 0;
      for (const hash of items) {
        for (const name of [`${hash}.webp`, `${hash}_t.webp`]) {
          const p = join(imagesDir, name);
          if (existsSync(p)) {
            unlinkSync(p);
            deleted++;
          }
        }
      }
      return items.length;
    },

    assertHashExists(hash: string | null | undefined) {
      if (hash == null) return;
      if (!HASH_RE.test(hash)) throw validationError("image hash inválido");
      if (!existsSync(join(imagesDir, `${hash}.webp`))) {
        throw validationError("La imagen no existe en disco", [
          { field: "image", issue: "not_found" },
        ]);
      }
    },
  };
}

export type ImagesService = ReturnType<typeof createImagesService>;
