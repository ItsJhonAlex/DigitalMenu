import { type Currency, api } from "../api";
import { clear, el, formatRateUpdated } from "../dom";
import { openModal } from "../modal";
import { showToast } from "../toast";

export async function renderMonedas(root: HTMLElement): Promise<void> {
  const refresh = async () => {
    clear(root);
    root.appendChild(await build());
  };
  clear(root);
  root.appendChild(await build());

  async function build(): Promise<HTMLElement> {
    const { items } = await api.get<{ items: Currency[] }>("/api/admin/currencies");
    const wrap = el("div", { className: "stack" });
    const add = el("button", {
      className: "btn btn--primary",
      text: "Añadir moneda",
      attrs: { type: "button" },
    });
    add.addEventListener("click", () => openCurrencyModal(null, refresh));
    wrap.appendChild(
      el("div", {
        className: "row row--between",
        children: [el("p", { className: "muted", text: "Moneda base y tasas del día" }), add],
      }),
    );

    const table = el("table", { className: "data" });
    table.appendChild(
      el("thead", {
        children: [
          el("tr", {
            children: ["Base", "Código", "Nombre", "Tasa", "Activa", "Acciones"].map((t) =>
              el("th", { text: t }),
            ),
          }),
        ],
      }),
    );
    const tbody = el("tbody");
    for (const c of items) {
      const makeBase = el("button", {
        className: "btn btn--ghost btn--sm",
        text: "Hacer base",
        attrs: { type: "button", ...(c.isBase ? { disabled: "" } : {}) },
      });
      makeBase.addEventListener("click", async () => {
        if (!confirm(`¿Cambiar moneda base a ${c.code}? Los precios NO se convierten.`)) return;
        try {
          await api.post(`/api/admin/currencies/${c.code}/make-base`, { confirm: true });
          showToast("Moneda base actualizada", "success");
          await refresh();
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });

      const editRate = el("button", {
        className: "btn btn--ghost btn--sm",
        text: c.isBase ? "—" : "Tasa",
        attrs: { type: "button", ...(c.isBase ? { disabled: "" } : {}) },
      });
      if (!c.isBase) {
        editRate.addEventListener("click", () => openRateModal(c, refresh));
      }

      const del = el("button", {
        className: "btn btn--danger btn--sm",
        text: "Eliminar",
        attrs: { type: "button", ...(c.isBase ? { disabled: "" } : {}) },
      });
      del.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar ${c.code}?`)) return;
        try {
          await api.delete(`/api/admin/currencies/${c.code}`);
          showToast("Eliminada", "success");
          await refresh();
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });

      tbody.appendChild(
        el("tr", {
          children: [
            el("td", { text: c.isBase ? "●" : "" }),
            el("td", { text: c.code }),
            el("td", { text: c.name }),
            el("td", {
              text: c.isBase ? "—" : `${c.basePerUnit} · ${formatRateUpdated(c.rateUpdatedAt)}`,
            }),
            el("td", { text: c.active ? "Sí" : "No" }),
            el("td", {
              children: [el("div", { className: "row", children: [editRate, makeBase, del] })],
            }),
          ],
        }),
      );
    }
    table.appendChild(tbody);
    wrap.appendChild(el("div", { className: "table-wrap", children: [table] }));
    return wrap;
  }
}

function openRateModal(c: Currency, refresh: () => Promise<void>): void {
  const input = el("input", {
    className: "input",
    attrs: { type: "number", step: "any", min: "0.0001", value: String(c.basePerUnit) },
  }) as HTMLInputElement;
  openModal({
    title: `Tasa ${c.code}`,
    body: el("label", {
      className: "field",
      children: [el("span", { text: `1 ${c.code} = ¿cuántas unidades de la base?` }), input],
    }),
    onSave: async () => {
      try {
        await api.patch(`/api/admin/currencies/${c.code}`, { basePerUnit: Number(input.value) });
        showToast("Tasa guardada", "success");
        await refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
        throw err;
      }
    },
  });
}

function openCurrencyModal(_c: Currency | null, refresh: () => Promise<void>): void {
  const code = el("input", { className: "input", attrs: { maxlength: "8" } }) as HTMLInputElement;
  const name = el("input", { className: "input" }) as HTMLInputElement;
  const symbol = el("input", { className: "input", attrs: { maxlength: "8" } }) as HTMLInputElement;
  const rate = el("input", {
    className: "input",
    attrs: { type: "number", step: "any", min: "0.0001", value: "1" },
  }) as HTMLInputElement;
  openModal({
    title: "Nueva moneda",
    body: el("div", {
      className: "stack",
      children: [
        el("label", { className: "field", children: [el("span", { text: "Código" }), code] }),
        el("label", { className: "field", children: [el("span", { text: "Nombre" }), name] }),
        el("label", { className: "field", children: [el("span", { text: "Símbolo" }), symbol] }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Tasa (base por unidad)" }), rate],
        }),
      ],
    }),
    onSave: async () => {
      try {
        await api.post("/api/admin/currencies", {
          code: code.value.trim().toUpperCase(),
          name: name.value.trim(),
          symbol: symbol.value.trim() || code.value.trim().toUpperCase(),
          decimals: 2,
          basePerUnit: Number(rate.value),
          rounding: "nearest",
          roundStep: 0.01,
          symbolPosition: "before",
          active: true,
        });
        showToast("Moneda creada", "success");
        await refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
        throw err;
      }
    },
  });
}
