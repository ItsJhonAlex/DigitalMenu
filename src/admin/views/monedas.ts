import type { Currency as MoneyCurrency } from "../../shared/money";
import { formatPrice } from "../../shared/money";
import { type Currency, api } from "../api";
import { clear, el, formatRateUpdated } from "../dom";
import { openConfirm, openModal } from "../modal";
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

export async function renderMonedas(root: HTMLElement): Promise<void> {
  const refresh = async () => {
    clear(root);
    root.appendChild(await build());
  };
  clear(root);
  root.appendChild(await build());

  async function build(): Promise<HTMLElement> {
    const { items } = await api.get<{ items: Currency[] }>("/api/admin/currencies");
    const base = items.find((c) => c.isBase) ?? items[0];
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
        const ok = await openConfirm({
          title: "Cambiar moneda base",
          message: `¿Cambiar moneda base a ${c.code}? Los precios NO se convierten.`,
          confirmLabel: "Cambiar base",
          danger: true,
        });
        if (!ok) return;
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

      const editFmt = el("button", {
        className: "btn btn--ghost btn--sm",
        text: "Formato",
        attrs: { type: "button" },
      });
      editFmt.addEventListener("click", () => openFormatModal(c, base, refresh));

      const activeToggle = el("input", {
        className: "toggle",
        attrs: { type: "checkbox", ...(c.isBase ? { disabled: "" } : {}) },
      }) as HTMLInputElement;
      activeToggle.checked = c.active;
      activeToggle.addEventListener("change", async () => {
        try {
          await api.put(`/api/admin/currencies/${c.code}`, {
            name: c.name,
            symbol: c.symbol,
            decimals: c.decimals,
            basePerUnit: c.basePerUnit,
            rounding: c.rounding,
            roundStep: c.roundStep,
            symbolPosition: c.symbolPosition,
            active: activeToggle.checked,
          });
          c.active = activeToggle.checked;
          showToast(activeToggle.checked ? `${c.code} activa` : `${c.code} desactivada`, "success");
        } catch (err) {
          activeToggle.checked = !activeToggle.checked;
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });

      const del = el("button", {
        className: "btn btn--danger btn--sm",
        text: "Eliminar",
        attrs: { type: "button", ...(c.isBase ? { disabled: "" } : {}) },
      });
      del.addEventListener("click", async () => {
        const ok = await openConfirm({
          title: "Eliminar moneda",
          message: `¿Eliminar ${c.code}?`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
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
            el("td", { children: [activeToggle] }),
            el("td", {
              children: [
                el("div", { className: "row", children: [editRate, editFmt, makeBase, del] }),
              ],
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

function openFormatModal(
  c: Currency,
  base: Currency | undefined,
  refresh: () => Promise<void>,
): void {
  const symbol = el("input", {
    className: "input",
    attrs: { maxlength: "8", value: c.symbol },
  }) as HTMLInputElement;
  const decimals = el("input", {
    className: "input",
    attrs: { type: "number", min: "0", max: "4", step: "1", value: String(c.decimals) },
  }) as HTMLInputElement;
  const rounding = el("select", { className: "select" }) as HTMLSelectElement;
  for (const [v, t] of [
    ["none", "Sin redondeo"],
    ["nearest", "Al más cercano"],
    ["up", "Hacia arriba"],
  ] as const) {
    const opt = el("option", { text: t, attrs: { value: v } });
    if (c.rounding === v) opt.selected = true;
    rounding.appendChild(opt);
  }
  const roundStep = el("input", {
    className: "input",
    attrs: {
      type: "number",
      step: "any",
      min: "0",
      value: c.roundStep != null ? String(c.roundStep) : "0.01",
    },
  }) as HTMLInputElement;
  const preview = el("p", { className: "muted" });

  const paintPreview = () => {
    if (!base) {
      preview.textContent = "";
      return;
    }
    const draft: Currency = {
      ...c,
      symbol: symbol.value.trim() || c.symbol,
      decimals: Math.max(0, Math.min(4, Math.round(Number(decimals.value) || 0))),
      rounding: rounding.value,
      roundStep: Number(roundStep.value) || null,
    };
    const sample = 1250;
    try {
      preview.textContent = `Ejemplo ${sample} ${base.code} → ${formatPrice(
        sample,
        toMoney(base),
        toMoney(draft),
      )}`;
    } catch {
      preview.textContent = "Vista previa no disponible";
    }
  };
  for (const n of [symbol, decimals, rounding, roundStep]) {
    n.addEventListener("input", paintPreview);
    n.addEventListener("change", paintPreview);
  }
  paintPreview();

  openModal({
    title: `Formato ${c.code}`,
    body: el("div", {
      className: "stack",
      children: [
        el("label", { className: "field", children: [el("span", { text: "Símbolo" }), symbol] }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Decimales (0–4)" }), decimals],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Redondeo" }), rounding],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Paso de redondeo" }), roundStep],
        }),
        preview,
      ],
    }),
    onSave: async () => {
      try {
        await api.put(`/api/admin/currencies/${c.code}`, {
          name: c.name,
          symbol: symbol.value.trim() || c.code,
          decimals: Math.max(0, Math.min(4, Math.round(Number(decimals.value) || 0))),
          basePerUnit: c.basePerUnit,
          rounding: rounding.value,
          roundStep: Number(roundStep.value) || null,
          symbolPosition: c.symbolPosition,
          active: c.active,
        });
        showToast("Formato guardado", "success");
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
