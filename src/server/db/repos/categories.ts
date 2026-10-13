import type { Database } from "bun:sqlite";
import type { CategoryRow } from "../types";

export function createCategoriesRepo(db: Database) {
  const listStmt = db.prepare(
    `SELECT id, sort_order, visible, image, created_at, updated_at
     FROM categories ORDER BY sort_order, id`,
  );
  const getStmt = db.prepare(
    `SELECT id, sort_order, visible, image, created_at, updated_at
     FROM categories WHERE id = ?`,
  );
  const insertStmt = db.prepare(
    `INSERT INTO categories (sort_order, visible, image) VALUES (?, ?, ?)`,
  );
  const updateStmt = db.prepare(
    `UPDATE categories
     SET sort_order = ?, visible = ?, image = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const patchVisibleStmt = db.prepare(
    `UPDATE categories
     SET visible = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const deleteStmt = db.prepare(`DELETE FROM categories WHERE id = ?`);
  const productCountStmt = db.prepare(`SELECT COUNT(*) AS n FROM products WHERE category_id = ?`);
  const maxSortStmt = db.prepare(`SELECT COALESCE(MAX(sort_order), -10) AS m FROM categories`);
  const setOrderStmt = db.prepare(
    `UPDATE categories
     SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const idsStmt = db.prepare(`SELECT id FROM categories`);

  return {
    list(): CategoryRow[] {
      return listStmt.all() as CategoryRow[];
    },
    get(id: number): CategoryRow | null {
      return (getStmt.get(id) as CategoryRow | null) ?? null;
    },
    productCount(id: number): number {
      return (productCountStmt.get(id) as { n: number }).n;
    },
    allIds(): number[] {
      return (idsStmt.all() as Array<{ id: number }>).map((r) => r.id);
    },
    nextSortOrder(): number {
      return (maxSortStmt.get() as { m: number }).m + 10;
    },
    create(input: { sort_order?: number; visible?: boolean; image?: string | null }): number {
      const r = insertStmt.run(
        input.sort_order ?? this.nextSortOrder(),
        input.visible === false ? 0 : 1,
        input.image ?? null,
      );
      return Number(r.lastInsertRowid);
    },
    update(
      id: number,
      input: { sort_order: number; visible: boolean; image: string | null },
    ): boolean {
      const r = updateStmt.run(input.sort_order, input.visible ? 1 : 0, input.image, id);
      return r.changes > 0;
    },
    setVisible(id: number, visible: boolean): boolean {
      return patchVisibleStmt.run(visible ? 1 : 0, id).changes > 0;
    },
    remove(id: number): { ok: true } | { ok: false; productCount: number } {
      const n = this.productCount(id);
      if (n > 0) return { ok: false, productCount: n };
      deleteStmt.run(id);
      return { ok: true };
    },
    reorder(ids: number[]): void {
      const tx = db.transaction((ordered: number[]) => {
        ordered.forEach((id, i) => setOrderStmt.run(i * 10, id));
      });
      tx(ids);
    },
  };
}

export type CategoriesRepo = ReturnType<typeof createCategoriesRepo>;
