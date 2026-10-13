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
  const updateStmt = db.prepare(
    `UPDATE offers
     SET price_minor = ?, image = ?, available = ?, visible = ?, show_savings = ?,
         sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const insertItemStmt = db.prepare(
    `INSERT INTO offer_items (offer_id, product_id, quantity, sort_order) VALUES (?, ?, ?, ?)`,
  );
  const clearItemsStmt = db.prepare(`DELETE FROM offer_items WHERE offer_id = ?`);
  const deleteStmt = db.prepare(`DELETE FROM offers WHERE id = ?`);
  const maxSortStmt = db.prepare(`SELECT COALESCE(MAX(sort_order), -10) AS m FROM offers`);
  const setOrderStmt = db.prepare(
    `UPDATE offers
     SET sort_order = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  );
  const idsStmt = db.prepare(`SELECT id FROM offers`);
  const regularStmt = db.prepare(
    `SELECT COALESCE(SUM(p.price_minor * oi.quantity), 0) AS regular
     FROM offer_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.offer_id = ?`,
  );
  const effectiveStmt = db.prepare(
    `SELECT CASE WHEN o.available = 1 AND NOT EXISTS (
        SELECT 1 FROM offer_items oi JOIN products p ON p.id = oi.product_id
        WHERE oi.offer_id = o.id AND (p.available = 0 OR p.visible = 0)
      ) THEN 1 ELSE 0 END AS effective
     FROM offers o WHERE o.id = ?`,
  );

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
    allIds(): number[] {
      return (idsStmt.all() as Array<{ id: number }>).map((r) => r.id);
    },
    nextSortOrder(): number {
      return (maxSortStmt.get() as { m: number }).m + 10;
    },
    regularMinor(offerId: number): number {
      return (regularStmt.get(offerId) as { regular: number }).regular;
    },
    effectiveAvailable(offerId: number): boolean {
      return (effectiveStmt.get(offerId) as { effective: number }).effective === 1;
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
          input.sort_order ?? this.nextSortOrder(),
        );
        const id = Number(r.lastInsertRowid);
        input.items.forEach((it, i) => {
          insertItemStmt.run(id, it.product_id, it.quantity ?? 1, it.sort_order ?? i * 10);
        });
        return id;
      });
      return tx();
    },
    update(
      id: number,
      input: {
        price_minor: number;
        image: string | null;
        available: boolean;
        visible: boolean;
        show_savings: boolean;
        sort_order: number;
      },
    ): boolean {
      return (
        updateStmt.run(
          input.price_minor,
          input.image,
          input.available ? 1 : 0,
          input.visible ? 1 : 0,
          input.show_savings ? 1 : 0,
          input.sort_order,
          id,
        ).changes > 0
      );
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
    reorder(ids: number[]): void {
      const tx = db.transaction((ordered: number[]) => {
        ordered.forEach((id, i) => setOrderStmt.run(i * 10, id));
      });
      tx(ids);
    },
  };
}

export type OffersRepo = ReturnType<typeof createOffersRepo>;
