import { api, type Category, type I18nMap, type Product } from "../api";
import { clear, el, nameOf } from "../dom";
import { openModal } from "../modal";
import { showToast } from "../toast";

function i18nFields(initial: I18nMap = { es: { name: "" } }) {
  const nameEs = el("input", {
    className: "input",
    attrs: { maxlength: "80", value: initial.es?.name ?? "" },
  }) as HTMLInputElement;
  const descEs = el("textarea", {
    className: "input",
    attrs: { maxlength: "500", rows: "3" },
  }) as HTMLTextAreaElement;
  descEs.value = initial.es?.description ?? "";
  const nameEn = el("input", {
    className: "input",
    attrs: { maxlength: "80", value: initial.en?.name ?? "" },
  }) as HTMLInputElement;
  const descEn = el("textarea", {
    className: "input",
    attrs: { maxlength: "500", rows: "2" },
  }) as HTMLTextAreaElement;
  descEn.value = initial.en?.description ?? "";

  const root = el("div", {
    className: "stack",
    children: [
      el("label", {
        className: "field",
        children: [el("span", { text: "Nombre (ES) *" }), nameEs],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Descripción (ES)" }), descEs],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Nombre (EN)" }), nameEn],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Descripción (EN)" }), descEn],
      }),
    ],
  });

  return {
    root,
    getValue: (): I18nMap => {
      const i18n: I18nMap = {
        es: { name: nameEs.value.trim(), description: descEs.value || null },
      };
      if (nameEn.value.trim()) {
        i18n.en = { name: nameEn.value.trim(), description: descEn.value || null };
      }
      return i18n;
    },
  };
}

export async function renderProductos(root: HTMLElement): Promise<void> {
  const refresh = async () => {
    clear(root);
    root.appendChild(await build());
  };
  clear(root);
  root.appendChild(await build());

  async function build(): Promise<HTMLElement> {
    const [products, categories, currencies] = await Promise.all([
      api.get<{ items: Product[] }>("/api/admin/products"),
      api.get<{ items: Category[] }>("/api/admin/categories"),
      api.get<{ items: Array<{ code: string; isBase: boolean }> }>("/api/admin/currencies"),
    ]);
    const baseCode = currencies.items.find((c) => c.isBase)?.code ?? "CUP";
    const catName = new Map(categories.items.map((c) => [c.id, nameOf(c.i18n)]));

    const wrap = el("div", { className: "stack" });
    const q = el("input", {
      className: "input grow",
      attrs: { type: "search", placeholder: "Buscar…" },
    }) as HTMLInputElement;
    const catFilter = el("select", { className: "select" }) as HTMLSelectElement;
    catFilter.appendChild(el("option", { text: "Todas las categorías", attrs: { value: "" } }));
    for (const c of categories.items) {
      catFilter.appendChild(el("option", { text: nameOf(c.i18n), attrs: { value: String(c.id) } }));
    }
    const typeFilter = el("select", { className: "select" }) as HTMLSelectElement;
    for (const [v, t] of [
      ["", "Todos los tipos"],
      ["comida", "Comida"],
      ["bebida", "Bebida"],
      ["articulo", "Artículo"],
    ] as const) {
      typeFilter.appendChild(el("option", { text: t, attrs: { value: v } }));
    }
    const statusFilter = el("select", { className: "select" }) as HTMLSelectElement;
    for (const [v, t] of [
      ["", "Todos"],
      ["available", "Disponibles"],
      ["soldout", "Agotados"],
    ] as const) {
      statusFilter.appendChild(el("option", { text: t, attrs: { value: v } }));
    }

    const newBtn = el("button", {
      className: "btn btn--primary",
      text: "Nuevo producto",
      attrs: { type: "button" },
    });
    newBtn.addEventListener("click", () =>
      openProductModal(null, categories.items, baseCode, refresh),
    );

    wrap.appendChild(
      el("div", {
        className: "row",
        children: [q, catFilter, typeFilter, statusFilter, newBtn],
      }),
    );

    const tableWrap = el("div", { className: "table-wrap" });
    const paintTable = () => {
      clear(tableWrap);
      let items = products.items;
      const query = q.value.trim().toLowerCase();
      if (query) items = items.filter((p) => nameOf(p.i18n).toLowerCase().includes(query));
      if (catFilter.value) items = items.filter((p) => p.categoryId === Number(catFilter.value));
      if (typeFilter.value) items = items.filter((p) => p.type === typeFilter.value);
      if (statusFilter.value === "available") items = items.filter((p) => p.available);
      if (statusFilter.value === "soldout") items = items.filter((p) => !p.available);

      const table = el("table", { className: "data" });
      table.appendChild(
        el("thead", {
          children: [
            el("tr", {
              children: ["Nombre", "Categoría", "Tipo", "Precio", "Disp.", "Acciones"].map((t) =>
                el("th", { text: t }),
              ),
            }),
          ],
        }),
      );
      const tbody = el("tbody");
      for (const p of items) {
        const toggle = el("input", {
          className: "toggle",
          attrs: { type: "checkbox", ...(p.available ? { checked: "" } : {}) },
        }) as HTMLInputElement;
        toggle.addEventListener("change", async () => {
          try {
            await api.patch(`/api/admin/products/${p.id}`, { available: toggle.checked });
            p.available = toggle.checked;
            showToast("Guardado", "success");
          } catch (err) {
            toggle.checked = !toggle.checked;
            showToast(err instanceof Error ? err.message : "Error", "error");
          }
        });
        const edit = el("button", {
          className: "btn btn--ghost btn--sm",
          text: "Editar",
          attrs: { type: "button" },
        });
        edit.addEventListener("click", () =>
          openProductModal(p, categories.items, baseCode, refresh),
        );
        const del = el("button", {
          className: "btn btn--danger btn--sm",
          text: "Eliminar",
          attrs: { type: "button" },
        });
        del.addEventListener("click", async () => {
          if (!confirm(`¿Eliminar “${nameOf(p.i18n)}”?`)) return;
          try {
            await api.delete(`/api/admin/products/${p.id}`);
            showToast("Eliminado", "success");
            await refresh();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Error", "error");
          }
        });
        tbody.appendChild(
          el("tr", {
            children: [
              el("td", { text: nameOf(p.i18n) }),
              el("td", { text: catName.get(p.categoryId) ?? "—" }),
              el("td", { text: p.type }),
              el("td", { text: `${p.priceMinor} ${baseCode}` }),
              el("td", { children: [toggle] }),
              el("td", { children: [el("div", { className: "row", children: [edit, del] })] }),
            ],
          }),
        );
      }
      table.appendChild(tbody);
      tableWrap.appendChild(table);
    };
    q.addEventListener("input", paintTable);
    catFilter.addEventListener("change", paintTable);
    typeFilter.addEventListener("change", paintTable);
    statusFilter.addEventListener("change", paintTable);
    paintTable();
    wrap.appendChild(tableWrap);
    return wrap;
  }
}

function openProductModal(
  product: Product | null,
  categories: Category[],
  baseCode: string,
  refresh: () => Promise<void>,
): void {
  if (categories.length === 0) {
    showToast("Cree una categoría primero", "error");
    return;
  }
  const cat = el("select", { className: "select" }) as HTMLSelectElement;
  for (const c of categories) {
    const opt = el("option", {
      text: nameOf(c.i18n),
      attrs: { value: String(c.id) },
    });
    if (product?.categoryId === c.id) opt.selected = true;
    cat.appendChild(opt);
  }
  const type = el("select", { className: "select" }) as HTMLSelectElement;
  for (const t of ["comida", "bebida", "articulo"] as const) {
    const opt = el("option", { text: t, attrs: { value: t } });
    if ((product?.type ?? "comida") === t) opt.selected = true;
    type.appendChild(opt);
  }
  const price = el("input", {
    className: "input",
    attrs: {
      type: "number",
      min: "0",
      step: "1",
      value: String(product?.priceMinor ?? 0),
    },
  }) as HTMLInputElement;
  const available = el("input", {
    className: "toggle",
    attrs: { type: "checkbox", ...(product?.available !== false ? { checked: "" } : {}) },
  }) as HTMLInputElement;
  const visible = el("input", {
    className: "toggle",
    attrs: { type: "checkbox", ...(product?.visible !== false ? { checked: "" } : {}) },
  }) as HTMLInputElement;
  const i18n = i18nFields(product?.i18n);

  const body = el("div", {
    className: "stack",
    children: [
      el("div", {
        className: "row",
        children: [
          el("label", { className: "field grow", children: [el("span", { text: "Categoría" }), cat] }),
          el("label", { className: "field grow", children: [el("span", { text: "Tipo" }), type] }),
        ],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: `Precio base (${baseCode})` }), price],
      }),
      i18n.root,
      el("label", {
        className: "row",
        children: [available, el("span", { text: "Disponible" })],
      }),
      el("label", {
        className: "row",
        children: [visible, el("span", { text: "Visible en la carta" })],
      }),
    ],
  });

  openModal({
    title: product ? "Editar producto" : "Nuevo producto",
    wide: true,
    body,
    onSave: async () => {
      try {
        const payload = {
          categoryId: Number(cat.value),
          type: type.value,
          priceMinor: Number(price.value),
          available: available.checked,
          visible: visible.checked,
          i18n: i18n.getValue(),
          image: product?.image ?? null,
        };
        if (!payload.i18n.es?.name) throw new Error("El nombre en español es obligatorio");
        if (product) await api.put(`/api/admin/products/${product.id}`, payload);
        else await api.post("/api/admin/products", payload);
        showToast("Guardado", "success");
        await refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
        throw err;
      }
    },
  });
}
