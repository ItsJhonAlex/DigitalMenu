import { type Category, api } from "../api";
import { i18nTabs } from "../components/i18n-tabs";
import { clear, el, nameOf } from "../dom";
import { openConfirm, openModal } from "../modal";
import { enablePointerSort, nudgeRow, sortableControls } from "../sortable";
import { showToast } from "../toast";

export async function renderCategorias(root: HTMLElement): Promise<void> {
  const data = await api.get<{ items: Category[] }>("/api/admin/categories");

  const paint = async () => {
    const fresh = await api.get<{ items: Category[] }>("/api/admin/categories");
    clear(root);
    root.appendChild(await build(fresh.items, paint));
  };

  clear(root);
  root.appendChild(await build(data.items, paint));
}

async function build(items: Category[], refresh: () => Promise<void>): Promise<HTMLElement> {
  const page = el("div", { className: "stack categorias-page" });
  const newBtn = el("button", {
    className: "btn btn--primary",
    text: "Nueva categoría",
    attrs: { type: "button" },
  });
  newBtn.addEventListener("click", () => void openCategoryModal(null, refresh));

  page.appendChild(
    el("div", {
      className: "row row--between categorias-toolbar",
      children: [
        el("p", {
          className: "muted tiny",
          text: "Orden y visibilidad de secciones en la carta",
        }),
        newBtn,
      ],
    }),
  );

  const kpiTotal = el("div", { className: "categorias-kpi__value", text: "0" });
  const kpiVisible = el("div", { className: "categorias-kpi__value", text: "0" });
  const kpiHidden = el("div", { className: "categorias-kpi__value", text: "0" });
  const kpiIncomplete = el("div", { className: "categorias-kpi__value", text: "0" });
  const kpiEmpty = el("div", { className: "categorias-kpi__value", text: "0" });
  const kpiHiddenCard = el("div", {
    className: "categorias-kpi",
    children: [el("span", { className: "categorias-kpi__label", text: "Ocultas" }), kpiHidden],
  });
  const kpiIncompleteCard = el("div", {
    className: "categorias-kpi",
    attrs: { title: "Sin descripción (ES) o falta nombre en inglés" },
    children: [
      el("span", { className: "categorias-kpi__label", text: "Incompletas" }),
      kpiIncomplete,
    ],
  });
  const kpiEmptyCard = el("div", {
    className: "categorias-kpi",
    children: [el("span", { className: "categorias-kpi__label", text: "Vacías" }), kpiEmpty],
  });

  const isIncomplete = (c: Category) => {
    const missingDesc = !c.i18n.es?.description?.trim();
    const missingEn = !c.i18n.en?.name?.trim();
    return missingDesc || missingEn;
  };

  const paintKpis = (list: Category[]) => {
    const hiddenN = list.filter((c) => !c.visible).length;
    const incompleteN = list.filter(isIncomplete).length;
    const emptyN = list.filter((c) => c.productCount === 0).length;
    kpiTotal.textContent = String(list.length);
    kpiVisible.textContent = String(list.filter((c) => c.visible).length);
    kpiHidden.textContent = String(hiddenN);
    kpiIncomplete.textContent = String(incompleteN);
    kpiEmpty.textContent = String(emptyN);
    kpiHiddenCard.classList.toggle("categorias-kpi--warn", hiddenN > 0);
    kpiIncompleteCard.classList.toggle("categorias-kpi--warn", incompleteN > 0);
    kpiEmptyCard.classList.toggle("categorias-kpi--warn", emptyN > 0);
  };
  paintKpis(items);

  page.appendChild(
    el("div", {
      className: "categorias-kpis",
      children: [
        el("div", {
          className: "categorias-kpi",
          children: [el("span", { className: "categorias-kpi__label", text: "Total" }), kpiTotal],
        }),
        el("div", {
          className: "categorias-kpi",
          children: [
            el("span", { className: "categorias-kpi__label", text: "Visibles" }),
            kpiVisible,
          ],
        }),
        kpiHiddenCard,
        kpiIncompleteCard,
        kpiEmptyCard,
      ],
    }),
  );

  if (items.length === 0) {
    page.appendChild(
      el("div", {
        className: "card stack empty-state",
        children: [
          el("p", { text: "Aún no hay categorías. Cree la primera para organizar la carta." }),
          el("button", {
            className: "btn btn--primary",
            text: "Crear primera categoría",
            attrs: { type: "button" },
          }),
        ],
      }),
    );
    const firstBtn = page.querySelector(".empty-state button") as HTMLButtonElement;
    firstBtn.addEventListener("click", () => void openCategoryModal(null, refresh));
    return page;
  }

  const hint = el("p", {
    className: "muted tiny categorias-hint",
    text: "Arrastre ⠿ con el dedo o use ↑/↓ para ordenar. El orden se guarda al soltar.",
  });

  const table = el("table", { className: "data" });
  table.appendChild(
    el("thead", {
      children: [
        el("tr", {
          children: ["", "Nombre", "EN", "Productos", "Visible", "Acciones"].map((t) =>
            el("th", { text: t }),
          ),
        }),
      ],
    }),
  );
  const tbody = el("tbody");

  const saveOrder = async (ids: number[]) => {
    try {
      await api.put("/api/admin/categories/order", { ids });
      showToast("Orden guardado", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error al ordenar", "error");
      await refresh();
    }
  };

  for (const cat of items) {
    const visible = el("input", {
      className: "toggle",
      attrs: { type: "checkbox", ...(cat.visible ? { checked: "" } : {}) },
    }) as HTMLInputElement;
    visible.addEventListener("change", async () => {
      try {
        await api.patch(`/api/admin/categories/${cat.id}`, { visible: visible.checked });
        cat.visible = visible.checked;
        paintKpis(items);
        showToast("Guardado", "success");
      } catch (err) {
        visible.checked = !visible.checked;
        showToast(err instanceof Error ? err.message : "Error", "error");
      }
    });

    const edit = el("button", {
      className: "btn btn--ghost btn--sm",
      text: "Editar",
      attrs: { type: "button" },
    });
    edit.addEventListener("click", () => void openCategoryModal(cat, refresh));

    const del = el("button", {
      className: "btn btn--danger btn--sm",
      text: "Eliminar",
      attrs: {
        type: "button",
        ...(cat.productCount > 0
          ? { disabled: "", title: "Mueva u oculte los productos primero" }
          : {}),
      },
    });
    del.addEventListener("click", async () => {
      const ok = await openConfirm({
        title: "Eliminar categoría",
        message: `¿Eliminar “${nameOf(cat.i18n)}”?`,
        confirmLabel: "Eliminar",
        danger: true,
      });
      if (!ok) return;
      try {
        await api.delete(`/api/admin/categories/${cat.id}`);
        showToast("Eliminada", "success");
        await refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
      }
    });

    const tr = el("tr", {
      attrs: { "data-id": String(cat.id) },
      children: [
        el("td", { className: "sortable-cell" }),
        el("td", { text: nameOf(cat.i18n) }),
        el("td", { text: cat.i18n.en?.name ? "✔" : "✖" }),
        el("td", { text: String(cat.productCount) }),
        el("td", { children: [visible] }),
        el("td", { children: [el("div", { className: "row", children: [edit, del] })] }),
      ],
    });
    const controls = sortableControls({
      onUp: () => void nudgeRow(tbody, tr, -1, saveOrder),
      onDown: () => void nudgeRow(tbody, tr, 1, saveOrder),
    });
    tr.querySelector(".sortable-cell")!.appendChild(controls.root);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  enablePointerSort(tbody, { onReorder: saveOrder });

  page.appendChild(
    el("section", {
      className: "card stack categorias-section",
      children: [
        el("div", {
          className: "categorias-section__head",
          children: [
            el("h2", { className: "card__title", text: "Listado" }),
            el("p", {
              className: "muted tiny",
              text: "Reordene, edite o oculte categorías de la carta.",
            }),
          ],
        }),
        hint,
        el("div", { className: "table-wrap", children: [table] }),
      ],
    }),
  );

  return page;
}

async function openCategoryModal(
  cat: Category | null,
  refresh: () => Promise<void>,
): Promise<void> {
  const form = await i18nTabs(cat?.i18n);
  const visible = el("input", {
    className: "toggle",
    attrs: { type: "checkbox", ...(cat?.visible !== false ? { checked: "" } : {}) },
  }) as HTMLInputElement;
  const body = el("div", {
    className: "stack",
    children: [
      form.root,
      el("label", {
        className: "row",
        children: [visible, el("span", { text: "Visible en la carta" })],
      }),
    ],
  });

  openModal({
    title: cat ? "Editar categoría" : "Nueva categoría",
    body,
    onSave: async () => {
      try {
        const i18n = form.getValue();
        if (!i18n.es?.name?.trim()) throw new Error("El nombre en español es obligatorio");
        if (cat) {
          await api.put(`/api/admin/categories/${cat.id}`, {
            visible: visible.checked,
            i18n,
            image: cat.image,
          });
        } else {
          await api.post("/api/admin/categories", { visible: visible.checked, i18n });
        }
        showToast("Guardado", "success");
        await refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
        throw err;
      }
    },
  });
}
