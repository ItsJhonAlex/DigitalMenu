import type { Currency as MoneyCurrency } from "../../shared/money";
import { formatPrice } from "../../shared/money";
import { type Currency, type I18nMap, type Offer, type Product, api } from "../api";
import { clear, el, nameOf } from "../dom";
import { uploadProductImage } from "../image-compress";
import { openConfirm, openModal } from "../modal";
import { showToast } from "../toast";

type Line = { productId: number; quantity: number };

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

function editIdFromHash(): number | null {
  const m = location.hash.match(/^#\/ofertas\/editar\/(\d+)\/?$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

function goToList(): void {
  location.hash = "#/ofertas";
}

function goToEdit(id: number): void {
  location.hash = `#/ofertas/editar/${id}`;
}

function fmtMinor(minor: number, base: Currency | undefined): string {
  if (!base) return String(minor);
  return formatPrice(minor, toMoney(base), toMoney(base));
}

function savingsPct(regular: number, price: number): number {
  if (regular <= 0) return 0;
  return Math.round(((regular - price) / regular) * 100);
}

export async function renderOfertas(root: HTMLElement): Promise<void> {
  const editId = editIdFromHash();
  clear(root);
  if (editId != null) {
    await renderEditPage(root, editId);
    return;
  }
  root.appendChild(await buildList(root));
}

async function buildList(root: HTMLElement): Promise<HTMLElement> {
  const [offersRes, productsRes, currenciesRes] = await Promise.all([
    api.get<{ items: Offer[] }>("/api/admin/offers"),
    api.get<{ items: Product[] }>("/api/admin/products"),
    api.get<{ items: Currency[] }>("/api/admin/currencies"),
  ]);
  const offers = offersRes.items;
  const products = productsRes.items;
  const base = currenciesRes.items.find((c) => c.isBase) ?? currenciesRes.items[0];
  const productById = new Map(products.map((p) => [p.id, p]));

  const page = el("div", { className: "stack ofertas-page" });

  const newBtn = el("button", {
    className: "btn btn--primary",
    text: "Crear combo / oferta",
    attrs: { type: "button" },
  });
  newBtn.addEventListener("click", () => {
    openCreateModal(products, base, (created) => {
      queueMicrotask(() => goToEdit(created.id));
    });
  });

  page.appendChild(
    el("div", {
      className: "row row--between ofertas-toolbar",
      children: [
        el("p", {
          className: "muted tiny",
          text: "Promociones y paquetes · active o pause al instante",
        }),
        newBtn,
      ],
    }),
  );

  const kpiTotal = el("div", { className: "ofertas-kpi__value", text: "0" });
  const kpiActive = el("div", { className: "ofertas-kpi__value", text: "0" });
  const kpiPaused = el("div", { className: "ofertas-kpi__value", text: "0" });
  const kpiSoldout = el("div", { className: "ofertas-kpi__value", text: "0" });
  const kpiSoldoutCard = el("div", {
    className: "ofertas-kpi",
    children: [el("span", { className: "ofertas-kpi__label", text: "Agotadas" }), kpiSoldout],
  });

  page.appendChild(
    el("div", {
      className: "ofertas-kpis",
      children: [
        el("div", {
          className: "ofertas-kpi",
          children: [el("span", { className: "ofertas-kpi__label", text: "Total" }), kpiTotal],
        }),
        el("div", {
          className: "ofertas-kpi",
          children: [el("span", { className: "ofertas-kpi__label", text: "En carta" }), kpiActive],
        }),
        el("div", {
          className: "ofertas-kpi",
          children: [el("span", { className: "ofertas-kpi__label", text: "Pausadas" }), kpiPaused],
        }),
        kpiSoldoutCard,
      ],
    }),
  );

  type Filter = "all" | "active" | "paused" | "soldout";
  let filter: Filter = "all";
  const q = el("input", {
    className: "input grow",
    attrs: { type: "search", placeholder: "Buscar por nombre o producto…" },
  }) as HTMLInputElement;

  const filterBar = el("div", { className: "filter-tabs" });
  const filterBtns: Array<{ id: Filter; btn: HTMLButtonElement; label: () => string }> = [];
  const makeFilter = (id: Filter, labelFn: () => string) => {
    const btn = el("button", {
      className: `filter-tab${filter === id ? " is-active" : ""}`,
      text: labelFn(),
      attrs: { type: "button" },
    }) as HTMLButtonElement;
    btn.addEventListener("click", () => {
      filter = id;
      for (const f of filterBtns) {
        f.btn.classList.toggle("is-active", f.id === filter);
        f.btn.textContent = f.label();
      }
      paint();
    });
    filterBtns.push({ id, btn, label: labelFn });
    filterBar.appendChild(btn);
  };
  makeFilter("all", () => `Todos (${offers.length})`);
  makeFilter("active", () => `En carta (${offers.filter((o) => o.visible).length})`);
  makeFilter("paused", () => `Pausadas (${offers.filter((o) => !o.visible).length})`);
  makeFilter("soldout", () => `Agotadas (${offers.filter((o) => !o.effectiveAvailable).length})`);

  const list = el("div", { className: "offer-list" });

  const paint = () => {
    const activeN = offers.filter((o) => o.visible).length;
    const pausedN = offers.filter((o) => !o.visible).length;
    const soldN = offers.filter((o) => !o.effectiveAvailable).length;
    kpiTotal.textContent = String(offers.length);
    kpiActive.textContent = String(activeN);
    kpiPaused.textContent = String(pausedN);
    kpiSoldout.textContent = String(soldN);
    kpiSoldoutCard.classList.toggle("ofertas-kpi--warn", soldN > 0);

    for (const f of filterBtns) {
      f.btn.textContent = f.label();
      f.btn.classList.toggle("is-active", f.id === filter);
    }
    clear(list);
    const query = q.value.trim().toLowerCase();
    let items = offers.slice();
    if (filter === "active") items = items.filter((o) => o.visible);
    if (filter === "paused") items = items.filter((o) => !o.visible);
    if (filter === "soldout") items = items.filter((o) => !o.effectiveAvailable);
    if (query) {
      items = items.filter((o) => {
        const name = nameOf(o.i18n).toLowerCase();
        if (name.includes(query)) return true;
        return o.items.some((it) => {
          const p = productById.get(it.productId);
          return p ? nameOf(p.i18n).toLowerCase().includes(query) : false;
        });
      });
    }

    if (items.length === 0) {
      list.appendChild(
        el("div", {
          className: "ofertas-empty",
          text:
            offers.length === 0
              ? "Aún no hay ofertas. Cree un combo para empezar."
              : "Sin resultados con este filtro.",
        }),
      );
      return;
    }

    for (const o of items) {
      list.appendChild(buildOfferCard(o, productById, base, root, paint));
    }
  };

  q.addEventListener("input", paint);
  q.setAttribute("data-search", "");

  const sectionHead = el("div", {
    className: "ofertas-section__head",
    children: [
      el("h2", { className: "card__title", text: "Listado" }),
      el("p", {
        className: "muted tiny",
        text: "Filtre por estado o busque por nombre de oferta o producto incluido.",
      }),
    ],
  });

  page.appendChild(
    el("section", {
      className: "card stack ofertas-section",
      children: [
        sectionHead,
        el("div", { className: "row ofertas__filters", children: [filterBar, q] }),
        list,
      ],
    }),
  );

  paint();
  return page;
}

function buildOfferCard(
  o: Offer,
  productById: Map<number, Product>,
  base: Currency | undefined,
  root: HTMLElement,
  onListChange: () => void,
): HTMLElement {
  const card = el("article", {
    className: `offer-card${o.visible ? "" : " offer-card--paused"}`,
  });

  const media = el("div", { className: "offer-card__media" });
  if (o.image) {
    media.appendChild(
      el("img", {
        attrs: { src: `/img/${o.image}_t.webp`, alt: "", loading: "lazy" },
      }),
    );
  } else {
    media.appendChild(el("span", { className: "offer-card__media-empty", text: "%" }));
  }
  if (o.showSavings && o.savingsMinor > 0) {
    media.appendChild(
      el("span", {
        className: "offer-card__badge",
        text: `−${savingsPct(o.regularMinor, o.priceMinor)}%`,
      }),
    );
  }

  const title = el("div", { className: "offer-card__title-row" });
  title.append(
    el("h3", { className: "offer-card__name", text: nameOf(o.i18n) }),
    el("span", {
      className: `chip ${o.effectiveAvailable ? "chip--ok" : "chip--off"}`,
      text: o.effectiveAvailable ? "Disponible" : "Agotada",
    }),
  );

  const prices = el("div", { className: "offer-card__prices" });
  if (o.regularMinor > o.priceMinor) {
    prices.appendChild(
      el("span", {
        className: "offer-card__regular",
        text: fmtMinor(o.regularMinor, base),
      }),
    );
  }
  prices.appendChild(
    el("span", { className: "offer-card__price", text: fmtMinor(o.priceMinor, base) }),
  );
  if (o.showSavings && o.savingsMinor > 0) {
    prices.appendChild(
      el("span", {
        className: "offer-card__save",
        text: `Ahorro ${fmtMinor(o.savingsMinor, base)}`,
      }),
    );
  }

  const comps = o.items
    .map((it) => {
      const p = productById.get(it.productId);
      const n = p ? nameOf(p.i18n) : `#${it.productId}`;
      return `${it.quantity}× ${n}`;
    })
    .join("  +  ");

  const activeToggle = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  activeToggle.checked = o.visible;
  activeToggle.addEventListener("change", async () => {
    try {
      await api.patch(`/api/admin/offers/${o.id}`, { visible: activeToggle.checked });
      o.visible = activeToggle.checked;
      card.classList.toggle("offer-card--paused", !o.visible);
      showToast(o.visible ? "Activa en la carta" : "Pausada (oculta en la carta)", "success");
      onListChange();
    } catch (err) {
      activeToggle.checked = !activeToggle.checked;
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });

  const edit = el("button", {
    className: "btn btn--ghost btn--sm",
    text: "Modificar",
    attrs: { type: "button" },
  });
  edit.addEventListener("click", () => goToEdit(o.id));

  const del = el("button", {
    className: "btn btn--danger btn--sm",
    text: "Eliminar",
    attrs: { type: "button" },
  });
  del.addEventListener("click", async () => {
    const ok = await openConfirm({
      title: "Eliminar oferta",
      message: `¿Eliminar “${nameOf(o.i18n)}”?`,
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/api/admin/offers/${o.id}`);
      showToast("Eliminada", "success");
      await renderOfertas(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });

  const body = el("div", { className: "offer-card__body" });
  body.append(
    title,
    prices,
    el("div", {
      className: "offer-card__comps",
      children: [
        el("span", { className: "offer-card__comps-label", text: "Componentes" }),
        el("p", { text: comps || "Sin productos" }),
      ],
    }),
    el("div", {
      className: "offer-card__foot",
      children: [
        el("label", {
          className: "row",
          children: [activeToggle, el("span", { text: "Activo en carta" })],
        }),
        el("div", { className: "row", children: [edit, del] }),
      ],
    }),
  );

  card.append(media, body);
  return card;
}

function openCreateModal(
  products: Product[],
  base: Currency | undefined,
  onCreated: (o: Offer) => void,
): void {
  if (products.length === 0) {
    showToast("Cree productos primero", "error");
    return;
  }

  const name = el("input", {
    className: "input",
    attrs: {
      maxlength: "80",
      required: "",
      placeholder: "Ej. Combo almuerzo criollo",
    },
  }) as HTMLInputElement;
  const price = el("input", {
    className: "input",
    attrs: { type: "number", min: "0", step: "1", value: "0", required: "" },
  }) as HTMLInputElement;
  const product = el("select", { className: "select" }) as HTMLSelectElement;
  for (const p of products) {
    product.appendChild(
      el("option", {
        text: `${nameOf(p.i18n)} (${p.priceMinor})`,
        attrs: { value: String(p.id) },
      }),
    );
  }

  openModal({
    title: "Nuevo combo / oferta",
    saveLabel: "Crear y continuar",
    body: el("div", {
      className: "stack",
      children: [
        el("label", {
          className: "field",
          children: [el("span", { text: "Nombre (ES) *" }), name],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: `Precio especial (${base?.code ?? "base"})` }), price],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Primer producto incluido" }), product],
        }),
        el("p", {
          className: "muted",
          text: "Después abrirá la ficha para componentes, foto e idiomas.",
        }),
      ],
    }),
    onSave: async () => {
      const n = name.value.trim();
      if (!n) throw new Error("El nombre es obligatorio");
      const created = await api.post<Offer>("/api/admin/offers", {
        priceMinor: Math.max(0, Math.round(Number(price.value) || 0)),
        showSavings: true,
        available: true,
        visible: true,
        image: null,
        items: [{ productId: Number(product.value), quantity: 1 }],
        i18n: { es: { name: n, description: null } } satisfies I18nMap,
      });
      showToast("Oferta creada — complete la ficha", "success");
      onCreated(created);
    },
  });
}

async function renderEditPage(root: HTMLElement, offerId: number): Promise<void> {
  let offer: Offer;
  let products: Product[];
  let currencies: Currency[];
  try {
    const [o, prods, curs] = await Promise.all([
      api.get<Offer>(`/api/admin/offers/${offerId}`),
      api.get<{ items: Product[] }>("/api/admin/products"),
      api.get<{ items: Currency[] }>("/api/admin/currencies"),
    ]);
    offer = o;
    products = prods.items;
    currencies = curs.items;
  } catch (err) {
    root.appendChild(
      el("div", {
        className: "card stack",
        children: [
          el("p", { text: err instanceof Error ? err.message : "Oferta no encontrada" }),
          el("button", {
            className: "btn",
            text: "Volver a ofertas",
            attrs: { type: "button" },
          }),
        ],
      }),
    );
    root.querySelector("button")?.addEventListener("click", goToList);
    return;
  }

  if (products.length === 0) {
    root.appendChild(
      el("div", {
        className: "card",
        text: "No hay productos. Cree productos antes de editar la oferta.",
      }),
    );
    return;
  }

  const base = currencies.find((c) => c.isBase) ?? currencies[0];
  let imageHash: string | null = offer.image;
  let lang: "es" | "en" = "es";
  const lines: Line[] = offer.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
  }));
  if (lines.length === 0) {
    lines.push({ productId: products[0]!.id, quantity: 1 });
  }

  const nameEs = el("input", {
    className: "input",
    attrs: { maxlength: "80", value: offer.i18n.es?.name ?? "" },
  }) as HTMLInputElement;
  const descEs = el("textarea", {
    className: "input",
    attrs: { maxlength: "500", rows: "3" },
  }) as HTMLTextAreaElement;
  descEs.value = offer.i18n.es?.description ?? "";
  const nameEn = el("input", {
    className: "input",
    attrs: { maxlength: "80", value: offer.i18n.en?.name ?? "" },
  }) as HTMLInputElement;
  const descEn = el("textarea", {
    className: "input",
    attrs: { maxlength: "500", rows: "3" },
  }) as HTMLTextAreaElement;
  descEn.value = offer.i18n.en?.description ?? "";

  const panelEs = el("div", {
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

  const price = el("input", {
    className: "input",
    attrs: {
      type: "number",
      min: "0",
      step: "1",
      value: String(offer.priceMinor),
    },
  }) as HTMLInputElement;

  const showSavings = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  showSavings.checked = offer.showSavings;
  const available = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  available.checked = offer.available !== false;
  const visible = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  visible.checked = offer.visible !== false;

  const summary = el("div", { className: "offer-summary" });
  const warn = el("p", { className: "chip chip--warn", text: "" });
  warn.hidden = true;

  const linesBox = el("div", { className: "stack offer-lines" });

  const calcRegular = () =>
    lines.reduce((sum, line) => {
      const p = products.find((x) => x.id === line.productId);
      return sum + (p?.priceMinor ?? 0) * line.quantity;
    }, 0);

  const paintSummary = () => {
    const regular = calcRegular();
    const special = Math.max(0, Math.round(Number(price.value) || 0));
    const save = Math.max(0, regular - special);
    const pct = savingsPct(regular, special);
    clear(summary);
    summary.append(
      el("div", {
        className: "offer-summary__row",
        children: [
          el("span", { text: "Suma normal" }),
          el("strong", { text: fmtMinor(regular, base) }),
        ],
      }),
      el("div", {
        className: "offer-summary__row",
        children: [
          el("span", { text: "Precio oferta" }),
          el("strong", { text: fmtMinor(special, base) }),
        ],
      }),
      el("div", {
        className: "offer-summary__row offer-summary__row--save",
        children: [
          el("span", { text: "Ahorro" }),
          el("strong", { text: `${fmtMinor(save, base)}${pct ? ` (${pct} %)` : ""}` }),
        ],
      }),
    );

    const missing = lines
      .map((l) => products.find((p) => p.id === l.productId))
      .filter((p): p is Product => p != null && !p.available)
      .map((p) => nameOf(p.i18n));
    if (missing.length) {
      warn.hidden = false;
      warn.textContent = `Esta oferta aparecerá como agotada porque falta: ${missing.join(", ")}`;
    } else {
      warn.hidden = true;
    }
  };

  const paintLines = () => {
    clear(linesBox);
    lines.forEach((line, idx) => {
      const p = products.find((x) => x.id === line.productId);
      const filterInput = el("input", {
        className: "input",
        attrs: {
          type: "search",
          placeholder: "Buscar producto…",
          "data-search": "",
        },
      }) as HTMLInputElement;
      const sel = el("select", { className: "select grow" }) as HTMLSelectElement;

      const fillSelect = () => {
        const query = filterInput.value.trim().toLowerCase();
        clear(sel);
        for (const prod of products) {
          const label = nameOf(prod.i18n);
          if (query && !label.toLowerCase().includes(query) && prod.id !== line.productId) {
            continue;
          }
          const opt = el("option", {
            text: `${label} · ${fmtMinor(prod.priceMinor, base)}`,
            attrs: { value: String(prod.id) },
          });
          if (prod.id === line.productId) opt.selected = true;
          sel.appendChild(opt);
        }
        if (!sel.value && products[0]) {
          line.productId = products[0].id;
          sel.value = String(products[0].id);
        }
      };
      fillSelect();
      filterInput.addEventListener("input", fillSelect);
      sel.addEventListener("change", () => {
        line.productId = Number(sel.value);
        paintSummary();
      });

      const qtyLabel = el("span", {
        className: "qty-stepper__val",
        text: String(line.quantity),
      });
      const minus = el("button", {
        className: "btn btn--ghost btn--sm",
        text: "−",
        attrs: { type: "button", "aria-label": "Menos" },
      });
      const plus = el("button", {
        className: "btn btn--sm",
        text: "+",
        attrs: { type: "button", "aria-label": "Más" },
      });
      minus.addEventListener("click", () => {
        line.quantity = Math.max(1, line.quantity - 1);
        qtyLabel.textContent = String(line.quantity);
        paintSummary();
      });
      plus.addEventListener("click", () => {
        line.quantity = Math.min(99, line.quantity + 1);
        qtyLabel.textContent = String(line.quantity);
        paintSummary();
      });

      const unit = p?.priceMinor ?? 0;
      const sub = unit * line.quantity;
      const subEl = el("span", {
        className: "muted tiny",
        text: `Subtotal ${fmtMinor(sub, base)}`,
      });

      const rm = el("button", {
        className: "btn btn--danger btn--sm",
        text: "Quitar",
        attrs: { type: "button" },
      });
      rm.addEventListener("click", () => {
        if (lines.length <= 1) {
          showToast("Deje al menos un producto", "error");
          return;
        }
        lines.splice(idx, 1);
        paintLines();
        paintSummary();
      });

      linesBox.appendChild(
        el("div", {
          className: "offer-line stack",
          children: [
            filterInput,
            el("div", {
              className: "row",
              children: [
                sel,
                el("div", {
                  className: "qty-stepper",
                  children: [minus, qtyLabel, plus],
                }),
                subEl,
                rm,
              ],
            }),
          ],
        }),
      );
    });
  };

  const addLine = el("button", {
    className: "btn btn--ghost",
    text: "+ Añadir producto",
    attrs: { type: "button" },
  });
  addLine.addEventListener("click", () => {
    const used = new Set(lines.map((l) => l.productId));
    const next = products.find((p) => !used.has(p.id)) ?? products[0]!;
    lines.push({ productId: next.id, quantity: 1 });
    paintLines();
    paintSummary();
  });

  price.addEventListener("input", paintSummary);
  paintLines();
  paintSummary();

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
      showToast("Foto lista", "success");
    } catch (err) {
      photoNote.textContent = "";
      showToast(err instanceof Error ? err.message : "Error al subir", "error");
    } finally {
      pickBtn.removeAttribute("disabled");
    }
  });

  const back = el("button", {
    className: "btn btn--ghost",
    text: "← Volver a ofertas",
    attrs: { type: "button" },
  });
  back.addEventListener("click", goToList);

  const save = el("button", {
    className: "btn btn--primary",
    text: "Guardar combo",
    attrs: { type: "button" },
  });
  save.addEventListener("click", async () => {
    const esName = nameEs.value.trim();
    if (!esName) {
      showToast("El nombre en español es obligatorio", "error");
      return;
    }
    const seen = new Set<number>();
    for (const l of lines) {
      if (seen.has(l.productId)) {
        showToast("Hay productos duplicados en los componentes", "error");
        return;
      }
      seen.add(l.productId);
    }
    save.setAttribute("disabled", "true");
    try {
      const i18n: I18nMap = {
        es: { name: esName, description: descEs.value.trim() || null },
      };
      if (nameEn.value.trim()) {
        i18n.en = { name: nameEn.value.trim(), description: descEn.value.trim() || null };
      }
      await api.put(`/api/admin/offers/${offer.id}`, {
        priceMinor: Math.max(0, Math.round(Number(price.value) || 0)),
        showSavings: showSavings.checked,
        available: available.checked,
        visible: visible.checked,
        image: imageHash,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        i18n,
      });
      showToast("Oferta actualizada", "success");
      goToList();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      save.removeAttribute("disabled");
    }
  });

  const left = el("div", {
    className: "card stack",
    children: [
      el("h2", { className: "card__title", text: "Textos e idioma" }),
      el("div", { className: "tabs", children: [tabEs, tabEn] }),
      panelEs,
      panelEn,
      el("h2", { className: "card__title", text: "Componentes del combo" }),
      linesBox,
      addLine,
      warn,
      summary,
    ],
  });

  const right = el("div", {
    className: "card stack",
    children: [
      el("h2", { className: "card__title", text: "Foto, precio y estado" }),
      el("div", {
        className: "field",
        children: [
          el("span", { text: "Fotografía de la oferta" }),
          preview,
          el("div", { className: "row", children: [pickBtn, clearBtn, fileInput] }),
          photoNote,
        ],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: `Precio especial (${base?.code ?? "base"})` }), price],
      }),
      el("label", {
        className: "row",
        children: [showSavings, el("span", { text: "Mostrar ahorro en la carta" })],
      }),
      el("label", {
        className: "row",
        children: [available, el("span", { text: "Disponible (manual)" })],
      }),
      el("label", {
        className: "row",
        children: [visible, el("span", { text: "Activo en carta (visible)" })],
      }),
      el("p", {
        className: "muted tiny",
        text: "Si un componente está agotado, la oferta se muestra agotada aunque esté disponible aquí.",
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
                    el("strong", { text: nameOf(offer.i18n) }),
                    el("span", {
                      className: "muted",
                      text: `Oferta #${offer.id}`,
                    }),
                  ],
                }),
              ],
            }),
            save,
          ],
        }),
        el("div", { className: "product-edit", children: [left, right] }),
      ],
    }),
  );
}
