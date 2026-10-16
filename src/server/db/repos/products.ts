import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { ProductRow, ProductType } from "../types";

export type ProductFilter = {
  categoryId?: number;
  type?: ProductType;
  available?: boolean;
  visible?: boolean;
  q?: string;
  untranslated?: string;
};

const PRODUCT_COLS = `id, category_id, type, price_minor, image, available, visible, sort_order,
            ingredients_es, ingredients_en, allergens, created_at, updated_at`;

export function createProductsRepo(db: Database) {
  const getStmt = db.prepare(`SELECT ${PRODUCT_COLS} FROM products WHERE id = ?`);
  const insertStmt = db.prepare(
    `INSERT INTO products (
       category_id, type, price_minor, image, available, visible, sort_order,
       ingredients_es, ingredients_en, allergens
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStmt = db.prepare(
    `UPDATE products
     SET category_id = ?, type = ?, price_minor = ?, image = ?, available = ?, visible = ?,
         sort_order = ?, ingredients_es = ?, ingredients_en = ?, allergens = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const setAvailableStmt = db.prepare(
    `UPDATE products
     SET available = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const setVisibleStmt = db.prepare(
    `UPDATE products
     SET visible = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const setPriceStmt = db.prepare(
    `UPDATE products
     SET price_minor = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const resetAllAvailableStmt = db.prepare(
    `UPDATE products SET available = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  );
  const deleteStmt = db.prepare(`DELETE FROM products WHERE id = ?`);
  const offerIdsStmt = db.prepare(
    `SELECT offer_id AS id FROM offer_items WHERE product_id = ? ORDER BY offer_id`,
  );
  const maxSortStmt = db.prepare(
    `SELECT COALESCE(MAX(sort_order), -10) AS m FROM products WHERE category_id = ?`,
  );
  const setOrderStmt = db.prepare(
    `UPDATE products
     SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );

  return {
    get(id: number): ProductRow | null {
      return (getStmt.get(id) as ProductRow | null) ?? null;
    },
    offerIds(productId: number): number[] {
      return (offerIdsStmt.all(productId) as Array<{ id: number }>).map((r) => r.id);
    },
    nextSortOrder(categoryId: number): number {
      return (maxSortStmt.get(categoryId) as { m: number }).m + 10;
    },
    list(filter: ProductFilter = {}): ProductRow[] {
      const where: string[] = [];
      const params: SQLQueryBindings[] = [];

      if (filter.categoryId != null) {
        where.push("p.category_id = ?");
        params.push(filter.categoryId);
      }
      if (filter.type) {
        where.push("p.type = ?");
        params.push(filter.type);
      }
      if (filter.available != null) {
        where.push("p.available = ?");
        params.push(filter.available ? 1 : 0);
      }
      if (filter.visible != null) {
        where.push("p.visible = ?");
        params.push(filter.visible ? 1 : 0);
      }
      if (filter.q?.trim()) {
        where.push(`EXISTS (
          SELECT 1 FROM translations t
          WHERE t.entity = 'product' AND t.entity_id = p.id
            AND (t.name LIKE ? OR IFNULL(t.description,'') LIKE ?)
        )`);
        const like = `%${filter.q.trim()}%`;
        params.push(like, like);
      }
      if (filter.untranslated) {
        where.push(`NOT EXISTS (
          SELECT 1 FROM translations t
          WHERE t.entity = 'product' AND t.entity_id = p.id AND t.lang = ?
        )`);
        params.push(filter.untranslated);
      }

      const sql = `
        SELECT p.id, p.category_id, p.type, p.price_minor, p.image, p.available, p.visible,
               p.sort_order, p.ingredients_es, p.ingredients_en, p.allergens,
               p.created_at, p.updated_at
        FROM products p
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY p.category_id, p.sort_order, p.id
      `;
      return db.prepare(sql).all(...params) as ProductRow[];
    },
    create(input: {
      category_id: number;
      type: ProductType;
      price_minor: number;
      image?: string | null;
      available?: boolean;
      visible?: boolean;
      sort_order?: number;
      ingredients_es?: string | null;
      ingredients_en?: string | null;
      allergens?: string | null;
    }): number {
      const r = insertStmt.run(
        input.category_id,
        input.type,
        input.price_minor,
        input.image ?? null,
        input.available === false ? 0 : 1,
        input.visible === false ? 0 : 1,
        input.sort_order ?? this.nextSortOrder(input.category_id),
        input.ingredients_es ?? null,
        input.ingredients_en ?? null,
        input.allergens ?? null,
      );
      return Number(r.lastInsertRowid);
    },
    update(
      id: number,
      input: {
        category_id: number;
        type: ProductType;
        price_minor: number;
        image: string | null;
        available: boolean;
        visible: boolean;
        sort_order: number;
        ingredients_es: string | null;
        ingredients_en: string | null;
        allergens: string | null;
      },
    ): boolean {
      const r = updateStmt.run(
        input.category_id,
        input.type,
        input.price_minor,
        input.image,
        input.available ? 1 : 0,
        input.visible ? 1 : 0,
        input.sort_order,
        input.ingredients_es,
        input.ingredients_en,
        input.allergens,
        id,
      );
      return r.changes > 0;
    },
    setAvailable(id: number, available: boolean): boolean {
      return setAvailableStmt.run(available ? 1 : 0, id).changes > 0;
    },
    setVisible(id: number, visible: boolean): boolean {
      return setVisibleStmt.run(visible ? 1 : 0, id).changes > 0;
    },
    setPrice(id: number, priceMinor: number): boolean {
      return setPriceStmt.run(priceMinor, id).changes > 0;
    },
    resetAllAvailable(): number {
      return resetAllAvailableStmt.run().changes;
    },
    remove(id: number): { ok: true } | { ok: false; offers: number[] } {
      const offers = this.offerIds(id);
      if (offers.length > 0) return { ok: false, offers };
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

export type ProductsRepo = ReturnType<typeof createProductsRepo>;
