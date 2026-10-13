import type { Database } from "bun:sqlite";
import type { OfferItemRow, OfferRow } from "../types";

export function createOffersRepo(db: Database) {
  const listStmt = db.prepare(
    `SELECT id, price_minor, image, available, visible, show_savings, sort_order,
            created_at, updated_at
     FROM offers ORDER BY sort_order, id`,
  );
  const getStmt = db.prepare(
    `SELECT id, price_minor, image, available, visible, show_savings, sort_order,
            created_at, updated_at
     FROM offers WHERE id = ?`,
  );
  const itemsStmt = db.prepare(
    `SELECT offer_id, product_id, quantity, sort_order
     FROM offer_items WHERE offer_id = ? ORDER BY sort_order, product_id`,
  );
  const insertStmt = db.prepare(
    `INSERT INTO offers (price_minor, image, available, visible, show_savings, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertItemStmt = db.prepare(
    `INSERT INTO offer_items (offer_id, product_id, quantity, sort_order) VALUES (?, ?, ?, ?)`,
  );
  const clearItemsStmt = db.prepare(`DELETE FROM offer_items WHERE offer_id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM offers WHERE id = ?`);

  return {
    list(): OfferRow[] {
      return listStmt.all() as OfferRow[];
    },
    get(id: number): OfferRow | null {
      return (getStmt.get(id) as OfferRow | null) ?? null;
    },
    items(offerId: number): OfferItemRow[] {
      return itemsStmt.all(offerId) as OfferItemRow[];
    },
    create(input: {
      price_minor: number;
      image?: string | null;
      available?: boolean;
      visible?: boolean;
      show_savings?: boolean;
      sort_order?: number;
      items: Array<{ product_id: number; quantity?: number; sort_order?: number }>;
    }): number {
      const tx = db.transaction(() => {
        const r = insertStmt.run(
          input.price_minor,
          input.image ?? null,
          input.available === false ? 0 : 1,
          input.visible === false ? 0 : 1,
          input.show_savings ? 1 : 0,
          input.sort_order ?? 0,
        );
        const id = Number(r.lastInsertRowid);
        input.items.forEach((it, i) => {
          insertItemStmt.run(id, it.product_id, it.quantity ?? 1, it.sort_order ?? i * 10);
        });
        return id;
      });
      return tx();
    },
    setItems(
      offerId: number,
      items: Array<{ product_id: number; quantity?: number; sort_order?: number }>,
    ): void {
      const tx = db.transaction(() => {
        clearItemsStmt.run(offerId);
        items.forEach((it, i) => {
          insertItemStmt.run(offerId, it.product_id, it.quantity ?? 1, it.sort_order ?? i * 10);
        });
      });
      tx();
    },
    remove(id: number): void {
      deleteStmt.run(id);
    },
  };
}

export type OffersRepo = ReturnType<typeof createOffersRepo>;
