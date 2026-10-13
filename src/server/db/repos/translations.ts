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

  return {
    get(entity: TranslationEntity, entityId: number, lang: string): TranslationRow | null {
      return (getStmt.get(entity, entityId, lang) as TranslationRow | null) ?? null;
    },
    listForEntity(entity: TranslationEntity, entityId: number): TranslationRow[] {
      return listForEntityStmt.all(entity, entityId) as TranslationRow[];
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
    /** Mapa lang → name/description para un elemento. */
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
  };
}

export type TranslationsRepo = ReturnType<typeof createTranslationsRepo>;
