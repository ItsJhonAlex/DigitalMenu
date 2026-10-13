import type { Database } from "bun:sqlite";
import type { TranslationEntity, TranslationRow } from "../types";

export function createTranslationsRepo(db: Database) {
  const getStmt = db.prepare(
    `SELECT entity, entity_id, lang, name, description, updated_at
     FROM translations WHERE entity = ? AND entity_id = ? AND lang = ?`,
  );
  const listForEntityStmt = db.prepare(
    `SELECT entity, entity_id, lang, name, description, updated_at
     FROM translations WHERE entity = ? AND entity_id = ?`,
  );
  const upsertStmt = db.prepare(
    `INSERT INTO translations (entity, entity_id, lang, name, description)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(entity, entity_id, lang) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  );
  const deleteStmt = db.prepare(
    `DELETE FROM translations WHERE entity = ? AND entity_id = ? AND lang = ?`,
  );
  const listByLangEntityStmt = db.prepare(
    `SELECT entity, entity_id, lang, name, description, updated_at
     FROM translations WHERE lang = ? AND entity = ? ORDER BY entity_id`,
  );
  const totalEntitiesStmt = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM categories) +
      (SELECT COUNT(*) FROM products) +
      (SELECT COUNT(*) FROM offers) AS n
  `);
  const translatedCountStmt = db.prepare(`SELECT COUNT(*) AS n FROM translations WHERE lang = ?`);
  const missingByEntityStmt = db.prepare(`
    SELECT 'category' AS entity, c.id AS entity_id
    FROM categories c
    WHERE NOT EXISTS (
      SELECT 1 FROM translations t
      WHERE t.entity = 'category' AND t.entity_id = c.id AND t.lang = ?
    )
    UNION ALL
    SELECT 'product', p.id FROM products p
    WHERE NOT EXISTS (
      SELECT 1 FROM translations t
      WHERE t.entity = 'product' AND t.entity_id = p.id AND t.lang = ?
    )
    UNION ALL
    SELECT 'offer', o.id FROM offers o
    WHERE NOT EXISTS (
      SELECT 1 FROM translations t
      WHERE t.entity = 'offer' AND t.entity_id = o.id AND t.lang = ?
    )
  `);

  return {
    get(entity: TranslationEntity, entityId: number, lang: string): TranslationRow | null {
      return (getStmt.get(entity, entityId, lang) as TranslationRow | null) ?? null;
    },
    listForEntity(entity: TranslationEntity, entityId: number): TranslationRow[] {
      return listForEntityStmt.all(entity, entityId) as TranslationRow[];
    },
    listByLangEntity(lang: string, entity: TranslationEntity): TranslationRow[] {
      return listByLangEntityStmt.all(lang, entity) as TranslationRow[];
    },
    upsert(input: {
      entity: TranslationEntity;
      entity_id: number;
      lang: string;
      name: string;
      description?: string | null;
    }): void {
      upsertStmt.run(
        input.entity,
        input.entity_id,
        input.lang,
        input.name,
        input.description ?? null,
      );
    },
    remove(entity: TranslationEntity, entityId: number, lang: string): void {
      deleteStmt.run(entity, entityId, lang);
    },
    mapForEntity(
      entity: TranslationEntity,
      entityId: number,
    ): Record<string, { name: string; description: string | null }> {
      const rows = this.listForEntity(entity, entityId);
      const out: Record<string, { name: string; description: string | null }> = {};
      for (const r of rows) {
        out[r.lang] = { name: r.name, description: r.description };
      }
      return out;
    },
    missingLangs(entity: TranslationEntity, entityId: number, langs: string[]): string[] {
      const have = new Set(this.listForEntity(entity, entityId).map((r) => r.lang));
      return langs.filter((l) => !have.has(l));
    },
    status(langs: string[]): Array<{
      lang: string;
      total: number;
      translated: number;
      missing?: { category: number; product: number; offer: number };
    }> {
      const total = (totalEntitiesStmt.get() as { n: number }).n;
      return langs.map((lang) => {
        const translated = (translatedCountStmt.get(lang) as { n: number }).n;
        if (lang === "es") {
          return { lang, total, translated: total };
        }
        const missingRows = missingByEntityStmt.all(lang, lang, lang) as Array<{
          entity: string;
          entity_id: number;
        }>;
        const missing = { category: 0, product: 0, offer: 0 };
        for (const r of missingRows) {
          if (r.entity === "category") missing.category++;
          else if (r.entity === "product") missing.product++;
          else if (r.entity === "offer") missing.offer++;
        }
        return { lang, total, translated, missing };
      });
    },
  };
}

export type TranslationsRepo = ReturnType<typeof createTranslationsRepo>;
