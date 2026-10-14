/**
 * Reordenación por lote: asa arrastrable (ratón + dedo) y botones ↑/↓.
 * Un solo callback con la lista completa de ids (PUT /order).
 */

export type SortableCallbacks = {
  /** ids en el nuevo orden (todas las filas del contenedor). */
  onReorder: (ids: number[]) => void | Promise<void>;
};

function rowId(row: HTMLElement): number {
  return Number(row.dataset.id);
}

function collectIds(container: HTMLElement): number[] {
  return [...container.querySelectorAll<HTMLElement>(":scope > [data-id]")].map(rowId);
}

function moveRow(container: HTMLElement, row: HTMLElement, toIndex: number): void {
  const rows = [...container.querySelectorAll<HTMLElement>(":scope > [data-id]")];
  const from = rows.indexOf(row);
  if (from < 0 || toIndex < 0 || toIndex >= rows.length || from === toIndex) return;
  rows.splice(from, 1);
  rows.splice(toIndex, 0, row);
  for (const r of rows) container.appendChild(r);
}

/**
 * Controles ↑ / ⠿ / ↓ para una fila.
 * El asa usa Pointer Events (touch-action: none) para el POS.
 */
export function sortableControls(opts: {
  onUp: () => void;
  onDown: () => void;
}): { root: HTMLElement; handle: HTMLElement } {
  const up = document.createElement("button");
  up.type = "button";
  up.className = "btn btn--ghost btn--sm sortable-btn";
  up.setAttribute("aria-label", "Subir");
  up.textContent = "↑";
  up.addEventListener("click", (e) => {
    e.stopPropagation();
    opts.onUp();
  });

  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.title = "Arrastrar para reordenar";
  handle.setAttribute("aria-label", "Arrastrar");
  handle.textContent = "⠿";

  const down = document.createElement("button");
  down.type = "button";
  down.className = "btn btn--ghost btn--sm sortable-btn";
  down.setAttribute("aria-label", "Bajar");
  down.textContent = "↓";
  down.addEventListener("click", (e) => {
    e.stopPropagation();
    opts.onDown();
  });

  const root = document.createElement("div");
  root.className = "sortable-controls";
  root.append(up, handle, down);
  return { root, handle };
}

/**
 * Activa drag por pointer (ratón y dedo) sobre asas `.drag-handle`
 * dentro de filas `[data-id]` hijas directas de `container`.
 */
export function enablePointerSort(
  container: HTMLElement,
  callbacks: SortableCallbacks,
): { destroy: () => void } {
  let dragging: HTMLElement | null = null;
  let pointerId: number | null = null;
  let startIds: number[] = [];
  let busy = false;

  const persistIfChanged = async () => {
    if (busy) return;
    const ids = collectIds(container);
    if (ids.length === startIds.length && ids.every((id, i) => id === startIds[i])) return;
    busy = true;
    try {
      await callbacks.onReorder(ids);
      startIds = ids;
    } finally {
      busy = false;
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target?.closest(".drag-handle")) return;
    const row = target.closest<HTMLElement>("[data-id]");
    if (!row || row.parentElement !== container) return;
    e.preventDefault();
    dragging = row;
    pointerId = e.pointerId;
    startIds = collectIds(container);
    row.classList.add("is-dragging");
    container.classList.add("is-sorting");
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointerId) return;
    e.preventDefault();
    const elUnder = document.elementFromPoint(e.clientX, e.clientY);
    const over = elUnder?.closest<HTMLElement>("[data-id]");
    if (!over || over === dragging || over.parentElement !== container) return;
    const rows = [...container.querySelectorAll<HTMLElement>(":scope > [data-id]")];
    const from = rows.indexOf(dragging);
    const to = rows.indexOf(over);
    if (from < 0 || to < 0) return;
    if (from < to) {
      over.after(dragging);
    } else {
      over.before(dragging);
    }
  };

  const onPointerUp = async (e: PointerEvent) => {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging.classList.remove("is-dragging");
    container.classList.remove("is-sorting");
    dragging = null;
    pointerId = null;
    await persistIfChanged();
  };

  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerUp);
  container.addEventListener("pointercancel", onPointerUp);

  return {
    destroy: () => {
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointercancel", onPointerUp);
    },
  };
}

/** Mueve una fila un puesto y persiste. */
export async function nudgeRow(
  container: HTMLElement,
  row: HTMLElement,
  dir: -1 | 1,
  onReorder: (ids: number[]) => void | Promise<void>,
): Promise<void> {
  const rows = [...container.querySelectorAll<HTMLElement>(":scope > [data-id]")];
  const from = rows.indexOf(row);
  if (from < 0) return;
  const to = from + dir;
  if (to < 0 || to >= rows.length) return;
  moveRow(container, row, to);
  await onReorder(collectIds(container));
}
