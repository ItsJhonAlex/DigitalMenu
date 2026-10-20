import type { Currency as MoneyCurrency } from "../../shared/money";
import { formatPrice } from "../../shared/money";
import { type Currency, type Product, api } from "../api";
import { BRAND } from "../brand";
import { clear, el, formatRateUpdated, nameOf } from "../dom";
import { openConfirm } from "../modal";
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

export async function renderInicio(root: HTMLElement): Promise<void> {
  const [currencies, products, settings, diag, net] = await Promise.all([
    api.get<{ items: Currency[] }>("/api/admin/currencies"),
    api.get<{ items: Product[] }>("/api/admin/products"),
    api.get<Record<string, unknown>>("/api/admin/settings"),
    api.get<{
      uptimeSec: number;
      memory: { rssMB: number };
      version: string;
      menuEvents?: { clients: number };
    }>("/api/admin/diagnostics"),
    api.get<{
      cartaUrl: string | null;
      savedIp: string | null;
      port: number;
    }>("/api/admin/network"),
  ]);

  const restaurant =
    typeof settings["carta.restaurant_name"] === "string"
      ? settings["carta.restaurant_name"]
      : BRAND;
  const base = currencies.items.find((c) => c.isBase);
  const others = currencies.items.filter((c) => c.active && !c.isBase);

  const page = el("div", { className: "stack inicio-page" });

  page.appendChild(
    el("div", {
      className: "row row--between inicio-toolbar",
      children: [
        el("p", {
          className: "muted tiny",
          text: "Tasas, estado y disponibilidad rápida del día",
        }),
        el("div", {
          className: "row inicio-toolbar__actions",
          children: [
            el("a", {
              className: "btn btn--ghost btn--sm",
              text: "Nuevo producto",
              attrs: { href: "#/productos?nuevo=1" },
            }),
            el("a", {
              className: "btn btn--primary btn--sm",
              text: "Ver carta",
              attrs: {
                href: net.cartaUrl ?? "/",
                target: "_blank",
                rel: "noopener",
              },
            }),
          ],
        }),
      ],
    }),
  );

  const all = products.items;
  const kpiTotalVal = el("div", { className: "inicio-kpi__value", text: "0" });
  const kpiAvailVal = el("div", { className: "inicio-kpi__value", text: "0" });
  const kpiSoldVal = el("div", { className: "inicio-kpi__value", text: "0" });
  const kpiSoldCard = el("div", {
    className: "inicio-kpi",
    children: [el("span", { className: "inicio-kpi__label", text: "Agotados" }), kpiSoldVal],
  });

  const paintKpis = () => {
    const soldN = all.filter((p) => !p.available).length;
    kpiTotalVal.textContent = String(all.length);
    kpiAvailVal.textContent = String(all.filter((p) => p.available).length);
    kpiSoldVal.textContent = String(soldN);
    kpiSoldCard.classList.toggle("inicio-kpi--warn", soldN > 0);
  };
  paintKpis();

  page.appendChild(
    el("div", {
      className: "inicio-kpis",
      children: [
        el("div", {
          className: "inicio-kpi",
          children: [
            el("span", { className: "inicio-kpi__label", text: "Productos" }),
            kpiTotalVal,
          ],
        }),
        el("div", {
          className: "inicio-kpi",
          children: [
            el("span", { className: "inicio-kpi__label", text: "Disponibles" }),
            kpiAvailVal,
          ],
        }),
        kpiSoldCard,
      ],
    }),
  );

  const grid = el("div", { className: "grid grid--2 inicio-grid" });

  // Tasas
  const ratesCard = el("section", { className: "card stack inicio-card" });
  ratesCard.append(
    el("div", {
      className: "inicio-card__head",
      children: [
        el("h2", { className: "card__title", text: "Tasa del día" }),
        el("p", {
          className: "muted tiny",
          text: "Cambio de monedas secundarias a la base.",
        }),
      ],
    }),
  );
  if (base) {
    ratesCard.appendChild(
      el("div", {
        className: "inicio-rate-base",
        children: [
          el("span", { className: "chip chip--ok", text: `Base ${base.code}` }),
          el("span", {
            className: "muted tiny",
            text: base.name || base.symbol || base.code,
          }),
        ],
      }),
    );
  }
  if (others.length === 0) {
    ratesCard.appendChild(
      el("p", { className: "muted", text: "No hay monedas secundarias activas." }),
    );
  }
  const ratesList = el("div", { className: "stack inicio-rates" });
  for (const cur of others) {
    const input = el("input", {
      className: "input inicio-rate-input",
      attrs: {
        type: "number",
        step: "any",
        min: "0.0001",
        value: String(cur.basePerUnit),
        "aria-label": `Tasa ${cur.code}`,
      },
    }) as HTMLInputElement;
    const save = el("button", {
      className: "btn btn--primary btn--sm",
      text: "Guardar",
      attrs: { type: "button" },
    });
    save.addEventListener("click", async () => {
      try {
        await api.patch(`/api/admin/currencies/${cur.code}`, {
          basePerUnit: Number(input.value),
        });
        showToast(`Tasa ${cur.code} actualizada`, "success");
        await renderInicio(root);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
      }
    });
    ratesList.appendChild(
      el("div", {
        className: "inicio-rate",
        children: [
          el("div", {
            className: "inicio-rate__top",
            children: [
              el("div", {
                className: "inicio-rate__identity",
                children: [
                  el("strong", { className: "inicio-rate__code", text: cur.code }),
                  el("span", {
                    className: "inicio-rate__eq muted tiny",
                    text: `1 ${cur.code} → ${base?.code ?? "BASE"}`,
                  }),
                ],
              }),
              el("span", {
                className: "muted tiny",
                text: formatRateUpdated(cur.rateUpdatedAt),
              }),
            ],
          }),
          el("div", {
            className: "inicio-rate__edit",
            children: [
              el("div", {
                className: "inicio-rate__field",
                children: [
                  input,
                  el("span", {
                    className: "inicio-rate__unit muted tiny",
                    text: base?.code ?? "",
                  }),
                ],
              }),
              save,
            ],
          }),
        ],
      }),
    );
  }
  if (others.length > 0) ratesCard.appendChild(ratesList);
  grid.appendChild(ratesCard);

  // Estado (resumen; detalle en vivo → #/estado)
  const sseClients = diag.menuEvents?.clients;
  const uptimeMin = Math.floor(diag.uptimeSec / 60);
  const statusRow = (label: string, value: string | HTMLElement) =>
    el("div", {
      className: "inicio-status__row",
      children: [
        el("span", { className: "inicio-status__label", text: label }),
        typeof value === "string"
          ? el("span", { className: "inicio-status__value", text: value })
          : el("div", { className: "inicio-status__value", children: [value] }),
      ],
    });

  const statusCard = el("section", { className: "card stack inicio-card" });
  statusCard.append(
    el("div", {
      className: "inicio-card__head",
      children: [
        el("h2", { className: "card__title", text: "Estado del sistema" }),
        el("p", {
          className: "muted tiny",
          text: "Resumen rápido del servicio y la carta.",
        }),
      ],
    }),
    el("div", {
      className: "inicio-status__hero",
      children: [
        el("strong", { className: "inicio-status__name", text: restaurant }),
        el("span", {
          className: "chip chip--ok",
          text: sseClients != null && sseClients > 0 ? `${sseClients} móvil(es)` : "En marcha",
        }),
      ],
    }),
    el("div", {
      className: "inicio-status__dl",
      children: [
        statusRow(
          "Carta",
          el("a", {
            className: "inicio-status__link",
            text: net.cartaUrl ?? "—",
            attrs: {
              href: net.cartaUrl ?? "/",
              target: "_blank",
              rel: "noopener",
            },
          }),
        ),
        statusRow("Puerto", String(net.port)),
        statusRow("Versión", `v${diag.version}`),
        statusRow("Memoria", `${diag.memory.rssMB} MB`),
        statusRow("Encendida", `${uptimeMin} min`),
      ],
    }),
    el("div", {
      className: "row inicio-status__actions",
      children: [
        el("a", {
          className: "btn btn--primary btn--sm",
          text: "Estado en vivo",
          attrs: { href: "#/estado" },
        }),
        el("a", {
          className: "btn btn--ghost btn--sm",
          text: "Imprimir QR",
          attrs: { href: "#/red" },
        }),
      ],
    }),
  );
  grid.appendChild(statusCard);

  // Disponibilidad
  const availCard = el("section", {
    className: "card stack inicio-card inicio-card--wide",
  });
  availCard.append(
    el("h2", { className: "card__title", text: "Disponibilidad rápida" }),
    el("p", {
      className: "muted tiny",
      text: "Marque agotados sin salir del inicio. Los cambios se reflejan en la carta.",
    }),
  );

  const search = el("input", {
    className: "input inicio-avail__search",
    attrs: {
      type: "text",
      placeholder: "Buscar…",
      "data-search": "",
      "aria-label": "Buscar producto",
      autocomplete: "off",
      spellcheck: "false",
    },
  }) as HTMLInputElement;
  const onlySold = el("label", {
    className: "row inicio-avail__check",
    children: [
      el("input", { attrs: { type: "checkbox" } }),
      el("span", { className: "tiny", text: "Solo agotados" }),
    ],
  });
  const onlySoldInput = onlySold.querySelector("input") as HTMLInputElement;
  const resetBtn = el("button", {
    className: "btn btn--ghost btn--sm",
    text: "Marcar todo disponible",
    attrs: { type: "button" },
  });
  resetBtn.addEventListener("click", async () => {
    const ok = await openConfirm({
      title: "Marcar todo disponible",
      message: "¿Poner todos los productos como disponibles?",
      confirmLabel: "Marcar todo",
    });
    if (!ok) return;
    try {
      await api.post("/api/admin/products/reset-availability");
      showToast("Todos disponibles", "success");
      await renderInicio(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });
  availCard.appendChild(
    el("div", {
      className: "inicio-avail__filters",
      children: [search, onlySold, resetBtn],
    }),
  );

  const list = el("div", { className: "list-compact" });
  const paint = () => {
    clear(list);
    const q = search.value.trim().toLowerCase();
    const filtered = products.items.filter((p) => {
      if (onlySoldInput.checked && p.available) return false;
      if (!q) return true;
      return nameOf(p.i18n).toLowerCase().includes(q);
    });
    if (filtered.length === 0) {
      list.appendChild(el("div", { className: "empty", text: "Sin productos" }));
      return;
    }
    for (const p of filtered) {
      const toggle = el("input", {
        className: "toggle",
        attrs: { type: "checkbox", ...(p.available ? { checked: "" } : {}) },
      }) as HTMLInputElement;
      toggle.addEventListener("change", async () => {
        try {
          await api.patch(`/api/admin/products/${p.id}`, { available: toggle.checked });
          p.available = toggle.checked;
          paintKpis();
          showToast(toggle.checked ? "Disponible" : "Agotado", "success");
        } catch (err) {
          toggle.checked = !toggle.checked;
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });
      list.appendChild(
        el("div", {
          className: "list-compact__item",
          children: [
            el("div", {
              children: [
                el("strong", { text: nameOf(p.i18n) }),
                el("div", {
                  className: "muted tiny",
                  text: `${
                    base
                      ? formatPrice(p.priceMinor, toMoney(base), toMoney(base))
                      : String(p.priceMinor)
                  } · ${p.type}`,
                }),
              ],
            }),
            toggle,
          ],
        }),
      );
    }
  };
  search.addEventListener("input", paint);
  onlySoldInput.addEventListener("change", paint);
  paint();
  availCard.appendChild(list);
  grid.appendChild(availCard);

  page.appendChild(grid);
  clear(root);
  root.appendChild(page);
}
