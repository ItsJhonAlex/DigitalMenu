import type { Database, SQLQueryBindings } from "bun:sqlite";
import type { ProductRow, ProductType } from "../types";

export type ProductFilter = {
  categoryId?: number;
  type?: ProductType;
  available?: boolean;
  visible?: boolean;
  q?: string;
};

export function createProductsRepo(db: Database) {
  const getStmt = db.prepare(
    `SELECT id, category_id, type, price_minor, image, available, visible, sort_order,
            created_at, updated_at
     FROM products WHERE id = ?`,
  );
  const insertStmt = db.prepare(
    `INSERT INTO products (category_id, type, price_minor, image, available, visible, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateStmt = db.prepare(
    `UPDATE products
     SET category_id = ?, type = ?, price_minor = ?, image = ?, available = ?, visible = ?,
         sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const setAvailableStmt = db.prepare(
    `UPDATE products
     SET available = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const resetAllAvailableStmt = db.prepare(
    `UPDATE products SET available = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
  );
  const deleteStmt = db.prepare(`DELETE FROM products WHERE id = ?`);
  const offerCountStmt = db.prepare(`SELECT COUNT(*) AS n FROM offer_items WHERE product_id = ?`);
  const setOrderStmt = db.prepare(
    `UPDATE products
     SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );

  return {
    get(id: number): ProductRow | null {
      return (getStmt.get(id) as ProductRow | null) ?? null;
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

      const sql = `
        SELECT p.id, p.category_id, p.type, p.price_minor, p.image, p.available, p.visible,
               p.sort_order, p.created_at, p.updated_at
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
    }): number {
      const r = insertStmt.run(
        input.category_id,
        input.type,
        input.price_minor,
        input.image ?? null,
        input.available === false ? 0 : 1,
        input.visible === false ? 0 : 1,
        input.sort_order ?? 0,
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
        id,
      );
      return r.changes > 0;
    },
    setAvailable(id: number, available: boolean): boolean {
      const r = setAvailableStmt.run(available ? 1 : 0, id);
      return r.changes > 0;
    },
    resetAllAvailable(): number {
      return resetAllAvailableStmt.run().changes;
    },
    /** RF-14: no borrar si está en ofertas. */
    remove(id: number): void {
      const n = (offerCountStmt.get(id) as { n: number }).n;
      if (n > 0) {
        throw new Error("No se puede eliminar: el producto forma parte de una oferta");
      }
      deleteStmt.run(id);
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
