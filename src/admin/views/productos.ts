import { ALLERGEN_CODES, ALLERGEN_LABELS, type AllergenCode } from "../../shared/allergens";
import type { Currency as MoneyCurrency } from "../../shared/money";
import { formatPrice } from "../../shared/money";
import { type Category, type Currency, type I18nMap, type Product, api } from "../api";
import { clearDirty, confirmUnsaved, isDirty, markDirty } from "../dirty";
import { clear, el, nameOf } from "../dom";
import { uploadProductImage } from "../image-compress";
import { openConfirm, openModal } from "../modal";
import { setShortcutHandlers } from "../shortcuts";
import { enablePointerSort, nudgeRow, sortableControls } from "../sortable";
import { showToast } from "../toast";

function toMoney(c: Currency): MoneyCurrency {
  return {
    code: c.code,
    symbol: c.symbol,
    decimals: c.decimals,
    isBase: c.isBase,
    basePerUnit: c.basePerUnit,
    rounding: (c.rounding as MoneyCurrency["rounding"]) || "none",
    roundStep: c.roundStep,
    symbolPosition: c.symbolPosition === "before" ? "before" : "after",
  };
}

function typeLabel(t: string): string {
  if (t === "bebida") return "Bebida";
  if (t === "articulo") return "Artículo";
  return "Comida";
}

function hashPath(): string {
  return (location.hash.replace(/^#/, "") || "/").split("?")[0] || "/";
}

function hashQuery(): URLSearchParams {
  const raw = location.hash.replace(/^#/, "") || "";
  const q = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  return new URLSearchParams(q);
}

function editIdFromHash(): number | null {
  const m = hashPath().match(/^\/productos\/editar\/(\d+)\/?$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

function goToList(): void {
  location.hash = "#/productos";
}

function goToEdit(id: number): void {
  location.hash = `#/productos/editar/${id}`;
}

export async function renderProductos(root: HTMLElement): Promise<void> {
  const editId = editIdFromHash();
  clear(root);
  if (editId != null) {
    await renderEditPage(root, editId);
    return;
  }
  const list = await buildList(root);
  root.appendChild(list);
  const q = hashQuery();
  if (q.get("nuevo") === "1") {
    const btn = list.querySelector<HTMLButtonElement>("[data-nuevo-producto]");
    btn?.click();
    history.replaceState(null, "", "#/productos");
  }
}

async function buildList(root: HTMLElement): Promise<HTMLElement> {
  const [products, categories, currencies] = await Promise.all([
    api.get<{ items: Product[] }>("/api/admin/products"),
    api.get<{ items: Category[] }>("/api/admin/categories"),
    api.get<{ items: Currency[] }>("/api/admin/currencies"),
  ]);
  const base = currencies.items.find((c) => c.isBase) ?? currencies.items[0];
  const baseCode = base?.code ?? "CUP";
  const catName = new Map(categories.items.map((c) => [c.id, nameOf(c.i18n)]));

  const page = el("div", { className: "stack productos-page" });
  const q = el("input", {
    className: "input productos-filters__search",
    attrs: {
      type: "text",
      placeholder: "Buscar…",
      "data-search": "",
      "aria-label": "Buscar productos",
      autocomplete: "off",
      spellcheck: "false",
      enterkeyhint: "search",
    },
  }) as HTMLInputElement;
  const catFilter = el("select", {
    className: "select productos-filters__cat",
    attrs: { "aria-label": "Categoría" },
  }) as HTMLSelectElement;
  catFilter.appendChild(el("option", { text: "Categoría", attrs: { value: "" } }));
  for (const c of categories.items) {
    catFilter.appendChild(el("option", { text: nameOf(c.i18n), attrs: { value: String(c.id) } }));
  }

  let typeFilter = "";
  let statusFilter = "";
  /** Solo desde Idiomas → “Ver faltantes” (`#/productos?untranslated=`). */
  let untranslatedFilter = hashQuery().get("untranslated") || "";
  if (untranslatedFilter === "1") untranslatedFilter = "any";

  const tabsBar = el("div", {
    className: "filter-tabs productos-filters__tabs",
    attrs: { role: "toolbar", "aria-label": "Filtros de tipo y disponibilidad" },
  });

  let paintTable: () => void = () => {};

  const makeTab = (
    group: string,
    value: string,
    label: string,
    get: () => string,
    set: (v: string) => void,
  ) => {
    const btn = el("button", {
      className: `filter-tab${get() === value ? " is-active" : ""}`,
      text: label,
      attrs: { type: "button", "data-group": group, "data-value": value },
    }) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      set(value);
      for (const b of tabsBar.querySelectorAll(`.filter-tab[data-group="${group}"]`)) {
        b.classList.toggle("is-active", (b as HTMLElement).dataset.value === value);
      }
      paintTable();
    });
    tabsBar.appendChild(btn);
  };

  for (const [v, t] of [
    ["", "Todos"],
    ["comida", "Comida"],
    ["bebida", "Bebida"],
    ["articulo", "Artículo"],
  ] as const) {
    makeTab("type", v, t, () => typeFilter, (v) => {
      typeFilter = v;
    });
  }
  tabsBar.appendChild(el("span", { className: "productos-filters__sep", attrs: { "aria-hidden": "true" } }));
  for (const [v, t] of [
    ["", "Todas"],
    ["available", "Disp."],
    ["soldout", "Agotados"],
  ] as const) {
    makeTab("status", v, t, () => statusFilter, (v) => {
      statusFilter = v;
    });
  }

  const untranslatedChip = el("div", { className: "productos-filters__chip" });
  if (!untranslatedFilter) untranslatedChip.hidden = true;
  const untranslatedChipLabel = el("span", {
    text:
      untranslatedFilter === "any"
        ? "Sin traducir"
        : untranslatedFilter
          ? `Sin traducir (${untranslatedFilter})`
          : "",
  });
  const clearUntranslated = el("button", {
    className: "productos-filters__chip-clear",
    text: "×",
    attrs: { type: "button", "aria-label": "Quitar filtro de traducción" },
  });
  clearUntranslated.addEventListener("click", () => {
    untranslatedFilter = "";
    untranslatedChip.hidden = true;
    history.replaceState(null, "", "#/productos");
    paintTable();
  });
  untranslatedChip.append(untranslatedChipLabel, clearUntranslated);

  const newBtn = el("button", {
    className: "btn btn--primary",
    text: "Nuevo producto",
    attrs: { type: "button", "data-nuevo-producto": "" },
  });
  newBtn.addEventListener("click", () =>
    openCreateModal(categories.items, baseCode, (created) => {
      queueMicrotask(() => goToEdit(created.id));
    }),
  );

  page.appendChild(
    el("div", {
      className: "row row--between productos-toolbar",
      children: [
        el("p", {
          className: "muted tiny",
          text: "Precios, fotos, disponibilidad y orden en la carta",
        }),
        newBtn,
      ],
    }),
  );

  const isIncomplete = (p: Product) => {
    const missingDesc = !(p.i18n.es?.description?.trim());
    const missingTr = (p.missingLangs?.length ?? 0) > 0;
    return missingDesc || missingTr;
  };

  const kpiTotal = el("div", { className: "productos-kpi__value", text: "0" });
  const kpiAvail = el("div", { className: "productos-kpi__value", text: "0" });
  const kpiNoPrice = el("div", { className: "productos-kpi__value", text: "0" });
  const kpiIncomplete = el("div", { className: "productos-kpi__value", text: "0" });
  const kpiSold = el("div", { className: "productos-kpi__value", text: "0" });
  const kpiHidden = el("div", { className: "productos-kpi__value", text: "0" });
  const kpiNoPriceCard = el("div", {
    className: "productos-kpi",
    children: [
      el("span", { className: "productos-kpi__label", text: "No disponibles" }),
      kpiNoPrice,
    ],
  });
  const kpiIncompleteCard = el("div", {
    className: "productos-kpi",
    attrs: { title: "Sin descripción (ES) o falta algún idioma" },
    children: [
      el("span", { className: "productos-kpi__label", text: "Incompletos" }),
      kpiIncomplete,
    ],
  });
  const kpiSoldCard = el("div", {
    className: "productos-kpi",
    children: [el("span", { className: "productos-kpi__label", text: "Agotados" }), kpiSold],
  });
  const kpiHiddenCard = el("div", {
    className: "productos-kpi",
    children: [el("span", { className: "productos-kpi__label", text: "Ocultos" }), kpiHidden],
  });
  page.appendChild(
    el("div", {
      className: "productos-kpis",
      children: [
        el("div", {
          className: "productos-kpi",
          children: [el("span", { className: "productos-kpi__label", text: "Total" }), kpiTotal],
        }),
        el("div", {
          className: "productos-kpi",
          children: [
            el("span", { className: "productos-kpi__label", text: "Disponibles" }),
            kpiAvail,
          ],
        }),
        kpiNoPriceCard,
        kpiIncompleteCard,
        kpiSoldCard,
        kpiHiddenCard,
      ],
    }),
  );

  const hint = el("p", { className: "muted tiny productos-hint" });
  const tableWrap = el("div", { className: "table-wrap" });
  let sortCleanup: { destroy: () => void } | null = null;

  paintTable = () => {
    const all = products.items;
    const soldN = all.filter((p) => !p.available).length;
    const noPriceN = all.filter((p) => p.priceMinor === 0).length;
    const incompleteN = all.filter(isIncomplete).length;
    const hiddenN = all.filter((p) => p.visible === false).length;
    kpiTotal.textContent = String(all.length);
    kpiAvail.textContent = String(all.filter((p) => p.available).length);
    kpiNoPrice.textContent = String(noPriceN);
    kpiIncomplete.textContent = String(incompleteN);
    kpiSold.textContent = String(soldN);
    kpiHidden.textContent = String(hiddenN);
    kpiNoPriceCard.classList.toggle("productos-kpi--warn", noPriceN > 0);
    kpiIncompleteCard.classList.toggle("productos-kpi--warn", incompleteN > 0);
    kpiSoldCard.classList.toggle("productos-kpi--warn", soldN > 0);
    kpiHiddenCard.classList.toggle("productos-kpi--warn", hiddenN > 0);

    sortCleanup?.destroy();
    sortCleanup = null;
    clear(tableWrap);
    let items = products.items;
    const query = q.value.trim().toLowerCase();
    if (query) items = items.filter((p) => nameOf(p.i18n).toLowerCase().includes(query));
    if (catFilter.value) items = items.filter((p) => p.categoryId === Number(catFilter.value));
    if (typeFilter) items = items.filter((p) => p.type === typeFilter);
    if (statusFilter === "available") items = items.filter((p) => p.available);
    if (statusFilter === "soldout") items = items.filter((p) => !p.available);
    if (untranslatedFilter === "any") {
      items = items.filter((p) => (p.missingLangs?.length ?? 0) > 0);
    } else if (untranslatedFilter) {
      items = items.filter((p) => p.missingLangs?.includes(untranslatedFilter));
    }

    // RF-17: reordenar solo con una categoría y sin otros filtros (lista completa)
    const canReorder =
      Boolean(catFilter.value) && !query && !typeFilter && !statusFilter && !untranslatedFilter;
    hint.textContent = canReorder
      ? "Arrastre ⠿ con el dedo o use ↑/↓. El orden se guarda al soltar (actualiza la carta)."
      : "Para reordenar, elija una sola categoría y quite búsqueda/tipo/estado.";

    const table = el("table", { className: "data" });
    table.appendChild(
      el("thead", {
        children: [
          el("tr", {
            children: [
              ...(canReorder ? [""] : []),
              "",
              "Nombre",
              "Categoría",
              "Tipo",
              "Precio",
              "Disp.",
              "Visible",
              "Acciones",
            ].map((t) => el("th", { text: t })),
          }),
        ],
      }),
    );
    const tbody = el("tbody");

    const categoryId = Number(catFilter.value);
    const saveOrder = async (ids: number[]) => {
      try {
        await api.put(`/api/admin/categories/${categoryId}/products/order`, { ids });
        // Mantener orden local para no saltar al repintar
        const rank = new Map(ids.map((id, i) => [id, i]));
        products.items.sort((a, b) => {
          const ra = rank.get(a.id);
          const rb = rank.get(b.id);
          if (ra != null && rb != null) return ra - rb;
          if (a.categoryId !== b.categoryId) return a.categoryId - b.categoryId;
          return a.sortOrder - b.sortOrder;
        });
        for (const p of products.items) {
          const r = rank.get(p.id);
          if (r != null) p.sortOrder = r * 10;
        }
        showToast("Orden guardado", "success");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error al ordenar", "error");
        await renderProductos(root);
      }
    };

    for (const p of items) {
      const thumb = el("div", { className: "prod-thumb" });
      if (p.image) {
        thumb.appendChild(
          el("img", {
            attrs: { src: `/img/${p.image}_t.webp`, alt: "", loading: "lazy" },
          }),
        );
      } else {
        thumb.appendChild(el("span", { className: "prod-thumb__empty", text: "—" }));
      }

      const toggle = el("input", {
        className: "toggle",
        attrs: { type: "checkbox" },
      }) as HTMLInputElement;
      toggle.checked = p.available;
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
      const visibleToggle = el("input", {
        className: "toggle",
        attrs: { type: "checkbox" },
      }) as HTMLInputElement;
      visibleToggle.checked = p.visible !== false;
      visibleToggle.addEventListener("change", async () => {
        try {
          await api.patch(`/api/admin/products/${p.id}`, { visible: visibleToggle.checked });
          p.visible = visibleToggle.checked;
          showToast(visibleToggle.checked ? "Visible" : "Oculto", "success");
        } catch (err) {
          visibleToggle.checked = !visibleToggle.checked;
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });
      const edit = el("button", {
        className: "btn btn--ghost btn--sm",
        text: "Editar",
        attrs: { type: "button" },
      });
      edit.addEventListener("click", () => goToEdit(p.id));
      const del = el("button", {
        className: "btn btn--danger btn--sm",
        text: "Eliminar",
        attrs: { type: "button" },
      });
      del.addEventListener("click", async () => {
        const ok = await openConfirm({
          title: "Eliminar producto",
          message: `¿Eliminar “${nameOf(p.i18n)}”?`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        try {
          await api.delete(`/api/admin/products/${p.id}`);
          showToast("Eliminado", "success");
          await renderProductos(root);
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });

      const priceLabel = base
        ? formatPrice(p.priceMinor, toMoney(base), toMoney(base))
        : `${p.priceMinor} ${baseCode}`;

      const cells: HTMLElement[] = [];
      if (canReorder) {
        cells.push(el("td", { className: "sortable-cell" }));
      }
      cells.push(
        el("td", { children: [thumb] }),
        el("td", { text: nameOf(p.i18n) }),
        el("td", { text: catName.get(p.categoryId) ?? "—" }),
        el("td", { text: typeLabel(p.type) }),
        el("td", { text: priceLabel }),
        el("td", { children: [toggle] }),
        el("td", { children: [visibleToggle] }),
        el("td", { children: [el("div", { className: "row", children: [edit, del] })] }),
      );

      const tr = el("tr", {
        attrs: canReorder ? { "data-id": String(p.id) } : {},
        children: cells,
      });
      if (canReorder) {
        const controls = sortableControls({
          onUp: () => void nudgeRow(tbody, tr, -1, saveOrder),
          onDown: () => void nudgeRow(tbody, tr, 1, saveOrder),
        });
        tr.querySelector(".sortable-cell")!.appendChild(controls.root);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    if (canReorder) {
      sortCleanup = enablePointerSort(tbody, { onReorder: saveOrder });
    }
    tableWrap.appendChild(table);
  };
  q.addEventListener("input", paintTable);
  catFilter.addEventListener("change", paintTable);

  page.appendChild(
    el("section", {
      className: "card stack productos-section",
      children: [
        el("div", {
          className: "productos-section__head",
          children: [
            el("h2", { className: "card__title", text: "Listado" }),
            el("p", {
              className: "muted tiny",
              text: "Filtre por categoría, tipo o disponibilidad.",
            }),
          ],
        }),
        el("div", {
          className: "productos-filters",
          children: [
            el("div", {
              className: "productos-filters__row",
              children: [q, catFilter],
            }),
            untranslatedChip,
            tabsBar,
          ],
        }),
        hint,
        tableWrap,
      ],
    }),
  );

  paintTable();
  return page;
}

function openCreateModal(
  categories: Category[],
  baseCode: string,
  onCreated: (p: Product) => void,
): void {
  if (categories.length === 0) {
    showToast("Cree una categoría primero", "error");
    return;
  }

  const name = el("input", {
    className: "input",
    attrs: {
      maxlength: "80",
      required: "",
      placeholder: "Ej. Bife de Chorizo Angus 400g",
    },
  }) as HTMLInputElement;

  const type = el("select", { className: "select" }) as HTMLSelectElement;
  for (const [v, t] of [
    ["comida", "Comida"],
    ["bebida", "Bebida"],
    ["articulo", "Artículo"],
  ] as const) {
    type.appendChild(el("option", { text: t, attrs: { value: v } }));
  }

  const price = el("input", {
    className: "input",
    attrs: { type: "number", min: "0", step: "1", value: "0", required: "" },
  }) as HTMLInputElement;

  const cat = el("select", { className: "select" }) as HTMLSelectElement;
  for (const c of categories) {
    cat.appendChild(el("option", { text: nameOf(c.i18n), attrs: { value: String(c.id) } }));
  }

  const desc = el("textarea", {
    className: "input",
    attrs: {
      rows: "2",
      maxlength: "500",
      placeholder: "Breve reseña para la carta…",
    },
  }) as HTMLTextAreaElement;

  openModal({
    title: "Nuevo producto",
    saveLabel: "Guardar producto",
    body: el("div", {
      className: "stack",
      children: [
        el("label", {
          className: "field",
          children: [el("span", { text: "Nombre del plato / producto *" }), name],
        }),
        el("div", {
          className: "row",
          children: [
            el("label", {
              className: "field grow",
              children: [el("span", { text: "Tipo" }), type],
            }),
            el("label", {
              className: "field grow",
              children: [el("span", { text: `Precio base (${baseCode})` }), price],
            }),
          ],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Categoría" }), cat],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Descripción corta" }), desc],
        }),
        el("p", {
          className: "muted",
          text: "Después se abrirá la ficha para foto e inglés.",
        }),
      ],
    }),
    onSave: async () => {
      const n = name.value.trim();
      if (!n) throw new Error("El nombre es obligatorio");
      const created = await api.post<Product>("/api/admin/products", {
        categoryId: Number(cat.value),
        type: type.value,
        priceMinor: Math.max(0, Math.round(Number(price.value) || 0)),
        available: true,
        visible: true,
        image: null,
        i18n: {
          es: { name: n, description: desc.value.trim() || null },
        } satisfies I18nMap,
      });
      showToast("Producto creado — complete la ficha", "success");
      onCreated(created);
    },
  });
}

async function renderEditPage(root: HTMLElement, productId: number): Promise<void> {
  let product: Product;
  let categories: Category[];
  let currencies: Currency[];
  try {
    const [p, cats, curs] = await Promise.all([
      api.get<Product>(`/api/admin/products/${productId}`),
      api.get<{ items: Category[] }>("/api/admin/categories"),
      api.get<{ items: Currency[] }>("/api/admin/currencies"),
    ]);
    product = p;
    categories = cats.items;
    currencies = curs.items;
  } catch (err) {
    root.appendChild(
      el("div", {
        className: "card stack",
        children: [
          el("p", {
            text: err instanceof Error ? err.message : "Producto no encontrado",
          }),
          el("button", {
            className: "btn",
            text: "Volver a productos",
            attrs: { type: "button" },
          }),
        ],
      }),
    );
    root.querySelector("button")?.addEventListener("click", goToList);
    return;
  }

  const base = currencies.find((c) => c.isBase) ?? currencies[0];
  const baseMoney = base ? toMoney(base) : null;
  let imageHash: string | null = product.image;
  let lang: "es" | "en" = "es";

  const nameEs = el("input", {
    className: "input",
    attrs: { maxlength: "80", value: product.i18n.es?.name ?? "" },
  }) as HTMLInputElement;
  const descEs = el("textarea", {
    className: "input",
    attrs: { maxlength: "500", rows: "4" },
  }) as HTMLTextAreaElement;
  descEs.value = product.i18n.es?.description ?? "";

  const nameEn = el("input", {
    className: "input",
    attrs: { maxlength: "80", value: product.i18n.en?.name ?? "" },
  }) as HTMLInputElement;
  const descEn = el("textarea", {
    className: "input",
    attrs: { maxlength: "500", rows: "4" },
  }) as HTMLTextAreaElement;
  descEn.value = product.i18n.en?.description ?? "";

  const panelEs = el("div", {
    className: "stack",
    children: [
      el("label", {
        className: "field",
        children: [el("span", { text: "Nombre en carta (ES) *" }), nameEs],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Descripción (ES)" }), descEs],
      }),
    ],
  });
  const panelEn = el("div", {
    className: "stack",
    children: [
      el("label", {
        className: "field",
        children: [el("span", { text: "Name (English)" }), nameEn],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Description (English)" }), descEn],
      }),
    ],
  });
  panelEs.classList.add("lang-panel");
  panelEn.classList.add("lang-panel");
  panelEn.hidden = true;
  panelEn.classList.add("is-hidden");

  const tabEs = el("button", {
    className: "tab is-active",
    text: "Español",
    attrs: { type: "button", role: "tab", "aria-selected": "true" },
  });
  const tabEn = el("button", {
    className: "tab",
    text: "English",
    attrs: { type: "button", role: "tab", "aria-selected": "false" },
  });
  const switchLang = (next: "es" | "en") => {
    lang = next;
    const showEs = next === "es";
    tabEs.classList.toggle("is-active", showEs);
    tabEn.classList.toggle("is-active", !showEs);
    tabEs.setAttribute("aria-selected", showEs ? "true" : "false");
    tabEn.setAttribute("aria-selected", showEs ? "false" : "true");
    panelEs.hidden = !showEs;
    panelEn.hidden = showEs;
    panelEs.classList.toggle("is-hidden", !showEs);
    panelEn.classList.toggle("is-hidden", showEs);
  };
  tabEs.addEventListener("click", (e) => {
    e.preventDefault();
    switchLang("es");
  });
  tabEn.addEventListener("click", (e) => {
    e.preventDefault();
    switchLang("en");
  });

  let selectedType = product.type;
  const typeRow = el("div", { className: "type-picks" });
  const typeButtons: HTMLButtonElement[] = [];
  for (const [v, label] of [
    ["comida", "Comida"],
    ["bebida", "Bebida"],
    ["articulo", "Artículo"],
  ] as const) {
    const btn = el("button", {
      className: `type-pick${selectedType === v ? " is-active" : ""}`,
      text: label,
      attrs: { type: "button" },
    }) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      selectedType = v;
      for (const b of typeButtons) b.classList.toggle("is-active", b === btn);
    });
    typeButtons.push(btn);
    typeRow.appendChild(btn);
  }

  const cat = el("select", { className: "select" }) as HTMLSelectElement;
  for (const c of categories) {
    const opt = el("option", {
      text: nameOf(c.i18n),
      attrs: { value: String(c.id) },
    });
    if (product.categoryId === c.id) opt.selected = true;
    cat.appendChild(opt);
  }

  const price = el("input", {
    className: "input",
    attrs: {
      type: "number",
      min: "0",
      step: "1",
      value: String(product.priceMinor),
    },
  }) as HTMLInputElement;
  const conv = el("div", { className: "price-conv muted" });
  const paintConv = () => {
    if (!baseMoney) {
      conv.textContent = "";
      return;
    }
    const minor = Math.max(0, Math.round(Number(price.value) || 0));
    const others = currencies.filter((c) => !c.isBase && c.active !== false);
    if (others.length === 0) {
      conv.textContent = "Sin otras monedas activas";
      return;
    }
    conv.textContent = others
      .map((c) => `≈ ${formatPrice(minor, baseMoney, toMoney(c))}`)
      .join(" · ");
  };
  price.addEventListener("input", paintConv);
  paintConv();

  const available = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  available.checked = product.available;
  const visible = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  visible.checked = product.visible !== false;

  const ingredientsEs = el("textarea", {
    className: "input",
    attrs: {
      maxlength: "2000",
      rows: "2",
      placeholder: "Ej. tomate, mozzarella, albahaca",
    },
  }) as HTMLTextAreaElement;
  ingredientsEs.value = product.ingredientsEs ?? "";
  const ingredientsEn = el("textarea", {
    className: "input",
    attrs: {
      maxlength: "2000",
      rows: "2",
      placeholder: "E.g. tomato, mozzarella, basil",
    },
  }) as HTMLTextAreaElement;
  ingredientsEn.value = product.ingredientsEn ?? "";

  const selectedAllergens = new Set<AllergenCode>(
    (product.allergens ?? []).filter((c): c is AllergenCode =>
      (ALLERGEN_CODES as readonly string[]).includes(c),
    ),
  );
  const allergenChips = el("div", { className: "allergen-chips" });
  const allergenInputs: HTMLInputElement[] = [];
  for (const code of ALLERGEN_CODES) {
    const input = el("input", {
      attrs: { type: "checkbox", value: code },
    }) as HTMLInputElement;
    input.checked = selectedAllergens.has(code);
    const chip = el("label", {
      className: `allergen-chip${input.checked ? " is-on" : ""}`,
      children: [input, document.createTextNode(ALLERGEN_LABELS[code].es)],
    });
    input.addEventListener("change", () => {
      chip.classList.toggle("is-on", input.checked);
      markDirty();
    });
    allergenInputs.push(input);
    allergenChips.appendChild(chip);
  }

  const hasExtrasData = Boolean(
    product.ingredientsEs ||
      product.ingredientsEn ||
      (product.allergens?.length ?? 0) > 0,
  );
  const extrasFold = el("details", {
    className: "fold product-edit__extras",
    children: [
      el("summary", { text: "Mostrar / editar ingredientes y alérgenos" }),
      el("div", {
        className: "stack",
        children: [
          el("p", {
            className: "muted tiny",
            text: "Para botellas o tragos puede dejarlo vacío. Separar ingredientes con comas.",
          }),
          el("label", {
            className: "field",
            children: [el("span", { text: "Ingredientes (ES)" }), ingredientsEs],
          }),
          el("label", {
            className: "field",
            children: [el("span", { text: "Ingredients (EN)" }), ingredientsEn],
          }),
          el("div", {
            className: "field",
            children: [el("span", { text: "Alérgenos (UE)" }), allergenChips],
          }),
        ],
      }),
    ],
  }) as HTMLDetailsElement;
  extrasFold.open = hasExtrasData;

  const preview = el("div", { className: "photo-preview" });
  const photoNote = el("p", { className: "muted", text: "" });
  const paintPreview = () => {
    clear(preview);
    if (imageHash) {
      preview.appendChild(
        el("img", {
          attrs: { src: `/img/${imageHash}.webp?t=${Date.now()}`, alt: "Vista previa" },
        }),
      );
    } else {
      preview.appendChild(el("span", { className: "photo-preview__empty", text: "Sin foto" }));
    }
  };
  paintPreview();

  const fileInput = el("input", {
    attrs: { type: "file", accept: "image/*", hidden: "" },
  }) as HTMLInputElement;
  const pickBtn = el("button", {
    className: "btn",
    text: "Elegir / cambiar foto",
    attrs: { type: "button" },
  });
  const clearBtn = el("button", {
    className: "btn btn--ghost",
    text: "Quitar foto",
    attrs: { type: "button" },
  });
  pickBtn.addEventListener("click", () => fileInput.click());
  clearBtn.addEventListener("click", () => {
    imageHash = null;
    photoNote.textContent = "Foto quitada (guarde para aplicar)";
    paintPreview();
    markDirty();
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    pickBtn.setAttribute("disabled", "true");
    photoNote.textContent = "Comprimiendo…";
    try {
      const up = await uploadProductImage(file);
      imageHash = up.image;
      photoNote.textContent = up.note;
      paintPreview();
      markDirty();
      showToast("Foto lista", "success");
    } catch (err) {
      photoNote.textContent = "";
      showToast(err instanceof Error ? err.message : "Error al subir", "error");
    } finally {
      pickBtn.removeAttribute("disabled");
    }
  });

  const back = el("a", {
    className: "btn btn--ghost btn--sm",
    text: "← Productos",
    attrs: { href: "#/productos" },
  });

  const save = el("button", {
    className: "btn btn--primary",
    text: "Guardar cambios",
    attrs: { type: "button" },
  });

  const metaName = el("strong", { text: nameOf(product.i18n) });
  const metaSub = el("span", {
    className: "muted tiny",
    text: `ID #${product.id} · ${typeLabel(selectedType)}`,
  });

  const chipAvail = el("span", { className: "chip" });
  const chipVisible = el("span", { className: "chip" });
  const chipPrice = el("span", { className: "chip" });
  const chipComplete = el("span", { className: "chip" });

  const isFormIncomplete = (): boolean => {
    const missingDesc = !descEs.value.trim();
    const langsMissing = (product.missingLangs ?? []).filter((l) => {
      if (l === "en") return !nameEn.value.trim();
      return true;
    });
    const clearedEn = Boolean(product.i18n.en?.name?.trim()) && !nameEn.value.trim();
    return missingDesc || langsMissing.length > 0 || clearedEn;
  };

  const paintStatus = () => {
    const avail = available.checked;
    chipAvail.textContent = avail ? "Disponible" : "Agotado";
    chipAvail.className = `chip ${avail ? "chip--ok" : "chip--off"}`;

    const vis = visible.checked;
    chipVisible.textContent = vis ? "Visible" : "Oculto";
    chipVisible.className = `chip ${vis ? "chip--ok" : "chip--warn"}`;

    const minor = Math.max(0, Math.round(Number(price.value) || 0));
    const hasPrice = minor > 0;
    chipPrice.textContent = hasPrice ? "Con precio" : "Sin precio";
    chipPrice.className = `chip ${hasPrice ? "chip--ok" : "chip--warn"}`;

    const incomplete = isFormIncomplete();
    chipComplete.textContent = incomplete ? "Incompleto" : "Completo";
    chipComplete.className = `chip ${incomplete ? "chip--warn" : "chip--ok"}`;

    metaName.textContent = nameEs.value.trim() || nameOf(product.i18n);
    metaSub.textContent = `ID #${product.id} · ${typeLabel(selectedType)}`;
  };
  paintStatus();

  const saveProduct = async (): Promise<boolean> => {
    const esName = nameEs.value.trim();
    if (!esName) {
      showToast("El nombre en español es obligatorio", "error");
      return false;
    }
    save.setAttribute("disabled", "true");
    try {
      const i18n: I18nMap = {
        es: { name: esName, description: descEs.value.trim() || null },
      };
      if (nameEn.value.trim()) {
        i18n.en = { name: nameEn.value.trim(), description: descEn.value.trim() || null };
      }
      const allergens = allergenInputs.filter((i) => i.checked).map((i) => i.value);
      await api.put(`/api/admin/products/${product.id}`, {
        categoryId: Number(cat.value),
        type: selectedType,
        priceMinor: Math.max(0, Math.round(Number(price.value) || 0)),
        available: available.checked,
        visible: visible.checked,
        image: imageHash,
        ingredientsEs: ingredientsEs.value.trim() || null,
        ingredientsEn: ingredientsEn.value.trim() || null,
        allergens,
        i18n,
      });
      clearDirty();
      showToast("Producto actualizado", "success");
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
      return false;
    } finally {
      save.removeAttribute("disabled");
    }
  };

  const leaveToList = async (): Promise<void> => {
    if (!(await confirmUnsaved())) return;
    clearDirty();
    goToList();
  };

  // Sin cambios: deja que el <a href> navegue. Con cambios: confirma y luego navega.
  back.addEventListener("click", (ev) => {
    if (!isDirty()) {
      clearDirty();
      return;
    }
    ev.preventDefault();
    void leaveToList();
  });
  save.addEventListener("click", async () => {
    if (await saveProduct()) goToList();
  });

  setShortcutHandlers({
    save: async () => {
      if (await saveProduct()) goToList();
    },
    escape: () => {
      const modalRoot = document.getElementById("modal-root");
      if (modalRoot?.firstChild) return false;
      void leaveToList();
      return true;
    },
  });

  const identity = el("div", {
    className: "card stack product-edit__card",
    children: [
      el("h2", { className: "card__title", text: "Identidad" }),
      el("p", {
        className: "muted tiny",
        text: "Tipo, categoría y textos por idioma.",
      }),
      el("div", {
        className: "field",
        children: [el("span", { text: "Tipo de ítem" }), typeRow],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Categoría" }), cat],
      }),
      el("div", { className: "tabs", children: [tabEs, tabEn] }),
      panelEs,
      panelEn,
    ],
  });

  const carta = el("div", {
    className: "card stack product-edit__card",
    children: [
      el("h2", { className: "card__title", text: "Carta" }),
      el("p", {
        className: "muted tiny",
        text: "Foto, precio y visibilidad en la carta pública.",
      }),
      el("div", {
        className: "field",
        children: [
          el("span", { text: "Fotografía" }),
          preview,
          el("div", { className: "row", children: [pickBtn, clearBtn, fileInput] }),
          photoNote,
        ],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: `Precio base (${base?.code ?? "CUP"})` }), price, conv],
      }),
      el("div", {
        className: "stack product-edit__toggles",
        children: [
          el("label", {
            className: "row product-edit__toggle",
            children: [available, el("span", { text: "Disponible en la carta" })],
          }),
          el("label", {
            className: "row product-edit__toggle",
            children: [visible, el("span", { text: "Visible en la carta" })],
          }),
        ],
      }),
    ],
  });

  const extras = el("div", {
    className: "card stack product-edit__card product-edit__extras-card",
    children: [
      el("h2", { className: "card__title", text: "Ingredientes y alérgenos" }),
      el("p", {
        className: "muted tiny",
        text: "Opcional. Útil para comidas; puede omitirse en botellas o artículos.",
      }),
      extrasFold,
    ],
  });

  root.appendChild(
    el("div", {
      className: "stack product-edit-page",
      children: [
        el("div", {
          className: "page-toolbar product-edit-page__toolbar",
          children: [
            el("div", {
              className: "page-toolbar__left",
              children: [
                back,
                el("div", {
                  className: "page-toolbar__meta",
                  children: [metaName, metaSub],
                }),
              ],
            }),
            save,
          ],
        }),
        el("div", {
          className: "product-edit__status",
          children: [chipAvail, chipVisible, chipPrice, chipComplete],
          attrs: { "aria-label": "Estado del producto" },
        }),
        el("div", {
          className: "product-edit",
          children: [identity, carta, extras],
        }),
      ],
    }),
  );

  // Tras montar en el DOM: algunos navegadores disparan `change` al conectar
  // selects/toggles y marcaban dirty en falso → el volver pedía confirm y fallaba.
  clearDirty();
  const touchDirty = () => markDirty();
  queueMicrotask(() => {
    clearDirty();
    for (const node of [
      nameEs,
      descEs,
      nameEn,
      descEn,
      price,
      cat,
      available,
      visible,
      ingredientsEs,
      ingredientsEn,
    ]) {
      node.addEventListener("input", () => {
        touchDirty();
        paintStatus();
      });
      node.addEventListener("change", () => {
        touchDirty();
        paintStatus();
      });
    }
    for (const btn of typeButtons) {
      btn.addEventListener("click", () => {
        touchDirty();
        paintStatus();
      });
    }
  });
}
