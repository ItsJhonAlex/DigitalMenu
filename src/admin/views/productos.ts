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

  const wrap = el("div", { className: "stack" });
  const q = el("input", {
    className: "input grow",
    attrs: { type: "search", placeholder: "Buscar por nombre…", "data-search": "" },
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
  const untranslatedFilter = el("select", { className: "select" }) as HTMLSelectElement;
  untranslatedFilter.appendChild(el("option", { text: "Traducción: todas", attrs: { value: "" } }));
  untranslatedFilter.appendChild(
    el("option", { text: "Sin traducir (falta algún idioma)", attrs: { value: "any" } }),
  );
  const initialUntranslated = hashQuery().get("untranslated");
  if (initialUntranslated === "any" || initialUntranslated === "1") {
    untranslatedFilter.value = "any";
  } else if (initialUntranslated) {
    untranslatedFilter.appendChild(
      el("option", {
        text: `Sin traducir (${initialUntranslated})`,
        attrs: { value: initialUntranslated },
      }),
    );
    untranslatedFilter.value = initialUntranslated;
  }

  const newBtn = el("button", {
    className: "btn btn--primary",
    text: "+ Nuevo producto",
    attrs: { type: "button", "data-nuevo-producto": "" },
  });
  newBtn.addEventListener("click", () =>
    openCreateModal(categories.items, baseCode, (created) => {
      queueMicrotask(() => goToEdit(created.id));
    }),
  );

  wrap.appendChild(
    el("div", {
      className: "row productos-filters",
      children: [q, catFilter, typeFilter, statusFilter, untranslatedFilter, newBtn],
    }),
  );

  const hint = el("p", { className: "muted tiny" });
  wrap.appendChild(hint);

  const tableWrap = el("div", { className: "table-wrap" });
  let sortCleanup: { destroy: () => void } | null = null;

  const paintTable = () => {
    sortCleanup?.destroy();
    sortCleanup = null;
    clear(tableWrap);
    let items = products.items;
    const query = q.value.trim().toLowerCase();
    if (query) items = items.filter((p) => nameOf(p.i18n).toLowerCase().includes(query));
    if (catFilter.value) items = items.filter((p) => p.categoryId === Number(catFilter.value));
    if (typeFilter.value) items = items.filter((p) => p.type === typeFilter.value);
    if (statusFilter.value === "available") items = items.filter((p) => p.available);
    if (statusFilter.value === "soldout") items = items.filter((p) => !p.available);
    if (untranslatedFilter.value === "any") {
      items = items.filter((p) => (p.missingLangs?.length ?? 0) > 0);
    } else if (untranslatedFilter.value) {
      const lang = untranslatedFilter.value;
      items = items.filter((p) => p.missingLangs?.includes(lang));
    }

    // RF-17: reordenar solo con una categoría y sin otros filtros (lista completa)
    const canReorder =
      Boolean(catFilter.value) &&
      !query &&
      !typeFilter.value &&
      !statusFilter.value &&
      !untranslatedFilter.value;
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
  typeFilter.addEventListener("change", paintTable);
  statusFilter.addEventListener("change", paintTable);
  untranslatedFilter.addEventListener("change", paintTable);
  paintTable();
  wrap.appendChild(tableWrap);
  return wrap;
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

  const extrasFold = el("details", {
    className: "fold product-edit__extras",
    children: [
      el("summary", { text: "Ingredientes y alérgenos (opcional)" }),
      el("div", {
        className: "stack",
        children: [
          el("p", {
            className: "muted",
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
  });

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
    className: "btn btn--ghost",
    text: "← Volver a productos",
    attrs: { href: "#/productos" },
  });

  const save = el("button", {
    className: "btn btn--primary",
    text: "Guardar cambios",
    attrs: { type: "button" },
  });

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

  const left = el("div", {
    className: "card stack",
    children: [
      el("h2", { className: "card__title", text: "Textos e idioma" }),
      el("div", { className: "tabs", children: [tabEs, tabEn] }),
      panelEs,
      panelEn,
      el("div", {
        className: "field",
        children: [el("span", { text: "Tipo de ítem" }), typeRow],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Categoría" }), cat],
      }),
    ],
  });

  const right = el("div", {
    className: "card stack",
    children: [
      el("h2", { className: "card__title", text: "Foto y precio" }),
      el("div", {
        className: "field",
        children: [
          el("span", { text: "Fotografía del producto" }),
          preview,
          el("div", { className: "row", children: [pickBtn, clearBtn, fileInput] }),
          photoNote,
        ],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: `Precio base (${base?.code ?? "CUP"})` }), price, conv],
      }),
      el("label", {
        className: "row",
        children: [available, el("span", { text: "Disponible en la carta" })],
      }),
      el("label", {
        className: "row",
        children: [visible, el("span", { text: "Visible en la carta" })],
      }),
    ],
  });

  root.appendChild(
    el("div", {
      className: "stack",
      children: [
        el("div", {
          className: "page-toolbar",
          children: [
            el("div", {
              className: "page-toolbar__left",
              children: [
                back,
                el("div", {
                  className: "page-toolbar__meta",
                  children: [
                    el("strong", { text: nameOf(product.i18n) }),
                    el("span", {
                      className: "muted",
                      text: `ID #${product.id} · ${typeLabel(product.type)}`,
                    }),
                  ],
                }),
              ],
            }),
            save,
          ],
        }),
        el("div", {
          className: "product-edit",
          children: [left, right, extrasFold],
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
      node.addEventListener("input", touchDirty);
      node.addEventListener("change", touchDirty);
    }
    for (const btn of typeButtons) {
      btn.addEventListener("click", touchDirty);
    }
  });
}
