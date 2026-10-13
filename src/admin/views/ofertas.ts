import { api, type Offer, type Product } from "../api";
import { clear, el, nameOf } from "../dom";
import { openModal } from "../modal";
import { showToast } from "../toast";

export async function renderOfertas(root: HTMLElement): Promise<void> {
  const refresh = async () => {
    clear(root);
    root.appendChild(await build());
  };
  clear(root);
  root.appendChild(await build());

  async function build(): Promise<HTMLElement> {
    const [offers, products] = await Promise.all([
      api.get<{ items: Offer[] }>("/api/admin/offers"),
      api.get<{ items: Product[] }>("/api/admin/products"),
    ]);
    const wrap = el("div", { className: "stack" });
    const newBtn = el("button", {
      className: "btn btn--primary",
      text: "Nueva oferta",
      attrs: { type: "button" },
    });
    newBtn.addEventListener("click", () => openOfferModal(null, products.items, refresh));
    wrap.appendChild(el("div", { className: "row row--between", children: [
      el("p", { className: "muted", text: `${offers.items.length} ofertas` }),
      newBtn,
    ] }));

    if (offers.items.length === 0) {
      wrap.appendChild(el("div", { className: "card empty", text: "Aún no hay ofertas." }));
      return wrap;
    }

    const table = el("table", { className: "data" });
    table.appendChild(
      el("thead", {
        children: [
          el("tr", {
            children: ["Nombre", "Precio", "Ahorro", "Efectiva", "Acciones"].map((t) =>
              el("th", { text: t }),
            ),
          }),
        ],
      }),
    );
    const tbody = el("tbody");
    for (const o of offers.items) {
      const edit = el("button", {
        className: "btn btn--ghost btn--sm",
        text: "Editar",
        attrs: { type: "button" },
      });
      edit.addEventListener("click", () => openOfferModal(o, products.items, refresh));
      const del = el("button", {
        className: "btn btn--danger btn--sm",
        text: "Eliminar",
        attrs: { type: "button" },
      });
      del.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar “${nameOf(o.i18n)}”?`)) return;
        try {
          await api.delete(`/api/admin/offers/${o.id}`);
          showToast("Eliminada", "success");
          await refresh();
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });
      tbody.appendChild(
        el("tr", {
          children: [
            el("td", { text: nameOf(o.i18n) }),
            el("td", { text: String(o.priceMinor) }),
            el("td", { text: o.showSavings ? String(o.savingsMinor) : "—" }),
            el("td", {
              children: [
                el("span", {
                  className: `chip ${o.effectiveAvailable ? "chip--ok" : "chip--off"}`,
                  text: o.effectiveAvailable ? "Disponible" : "Agotada",
                }),
              ],
            }),
            el("td", { children: [el("div", { className: "row", children: [edit, del] })] }),
          ],
        }),
      );
    }
    table.appendChild(tbody);
    wrap.appendChild(el("div", { className: "table-wrap", children: [table] }));
    return wrap;
  }
}

function openOfferModal(
  offer: Offer | null,
  products: Product[],
  refresh: () => Promise<void>,
): void {
  if (products.length === 0) {
    showToast("Cree productos primero", "error");
    return;
  }
  const nameEs = el("input", {
    className: "input",
    attrs: { value: offer?.i18n.es?.name ?? "", maxlength: "80" },
  }) as HTMLInputElement;
  const descEs = el("textarea", { className: "input", attrs: { rows: "2" } }) as HTMLTextAreaElement;
  descEs.value = offer?.i18n.es?.description ?? "";
  const nameEn = el("input", {
    className: "input",
    attrs: { value: offer?.i18n.en?.name ?? "", maxlength: "80" },
  }) as HTMLInputElement;
  const price = el("input", {
    className: "input",
    attrs: { type: "number", min: "0", value: String(offer?.priceMinor ?? 0) },
  }) as HTMLInputElement;
  const showSavings = el("input", {
    className: "toggle",
    attrs: { type: "checkbox", ...(offer?.showSavings ? { checked: "" } : {}) },
  }) as HTMLInputElement;
  const available = el("input", {
    className: "toggle",
    attrs: { type: "checkbox", ...(offer?.available !== false ? { checked: "" } : {}) },
  }) as HTMLInputElement;
  const visible = el("input", {
    className: "toggle",
    attrs: { type: "checkbox", ...(offer?.visible !== false ? { checked: "" } : {}) },
  }) as HTMLInputElement;

  type Line = { productId: number; quantity: number };
  const lines: Line[] = offer?.items.map((i) => ({
    productId: i.productId,
    quantity: i.quantity,
  })) ?? [{ productId: products[0]!.id, quantity: 1 }];

  const linesBox = el("div", { className: "stack" });
  const paintLines = () => {
    clear(linesBox);
    lines.forEach((line, idx) => {
      const sel = el("select", { className: "select grow" }) as HTMLSelectElement;
      for (const p of products) {
        const opt = el("option", {
          text: `${nameOf(p.i18n)} (${p.priceMinor})`,
          attrs: { value: String(p.id) },
        });
        if (p.id === line.productId) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", () => {
        line.productId = Number(sel.value);
      });
      const qty = el("input", {
        className: "input",
        attrs: { type: "number", min: "1", max: "99", value: String(line.quantity), style: "width:5rem" },
      }) as HTMLInputElement;
      qty.addEventListener("change", () => {
        line.quantity = Number(qty.value) || 1;
      });
      const rm = el("button", {
        className: "btn btn--danger btn--sm",
        text: "✕",
        attrs: { type: "button" },
      });
      rm.addEventListener("click", () => {
        if (lines.length <= 1) return;
        lines.splice(idx, 1);
        paintLines();
      });
      linesBox.appendChild(el("div", { className: "row", children: [sel, qty, rm] }));
    });
  };
  paintLines();
  const addLine = el("button", {
    className: "btn btn--ghost btn--sm",
    text: "+ Producto",
    attrs: { type: "button" },
  });
  addLine.addEventListener("click", () => {
    lines.push({ productId: products[0]!.id, quantity: 1 });
    paintLines();
  });

  const body = el("div", {
    className: "stack",
    children: [
      el("label", { className: "field", children: [el("span", { text: "Nombre ES *" }), nameEs] }),
      el("label", { className: "field", children: [el("span", { text: "Descripción ES" }), descEs] }),
      el("label", { className: "field", children: [el("span", { text: "Nombre EN" }), nameEn] }),
      el("label", { className: "field", children: [el("span", { text: "Precio especial" }), price] }),
      el("h3", { className: "card__title", text: "Componentes" }),
      linesBox,
      addLine,
      el("label", { className: "row", children: [showSavings, el("span", { text: "Mostrar ahorro" })] }),
      el("label", { className: "row", children: [available, el("span", { text: "Disponible" })] }),
      el("label", { className: "row", children: [visible, el("span", { text: "Visible" })] }),
    ],
  });

  openModal({
    title: offer ? "Editar oferta" : "Nueva oferta",
    wide: true,
    body,
    onSave: async () => {
      try {
        if (!nameEs.value.trim()) throw new Error("Nombre ES obligatorio");
        const i18n: Record<string, { name: string; description?: string | null }> = {
          es: { name: nameEs.value.trim(), description: descEs.value || null },
        };
        if (nameEn.value.trim()) i18n.en = { name: nameEn.value.trim() };
        const payload = {
          priceMinor: Number(price.value),
          showSavings: showSavings.checked,
          available: available.checked,
          visible: visible.checked,
          items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
          i18n,
          image: offer?.image ?? null,
        };
        if (offer) await api.put(`/api/admin/offers/${offer.id}`, payload);
        else await api.post("/api/admin/offers", payload);
        showToast("Guardado", "success");
        await refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
        throw err;
      }
    },
  });
}
