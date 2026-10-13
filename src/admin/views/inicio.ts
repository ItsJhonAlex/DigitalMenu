import { api, type Currency, type Product } from "../api";
import { clear, el, formatRateUpdated, nameOf } from "../dom";
import { showToast } from "../toast";
import { BRAND } from "../brand";

export async function renderInicio(root: HTMLElement): Promise<void> {
  const [currencies, products, settings, diag, net] = await Promise.all([
    api.get<{ items: Currency[] }>("/api/admin/currencies"),
    api.get<{ items: Product[] }>("/api/admin/products"),
    api.get<Record<string, unknown>>("/api/admin/settings"),
    api.get<{
      uptimeSec: number;
      memory: { rssMB: number };
      version: string;
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

  const grid = el("div", { className: "grid grid--2" });

  // Tasas
  const ratesCard = el("section", { className: "card stack" });
  ratesCard.appendChild(el("h2", { className: "card__title", text: "Tasa del día" }));
  if (others.length === 0) {
    ratesCard.appendChild(el("p", { className: "muted", text: "No hay monedas secundarias activas." }));
  }
  for (const cur of others) {
    const row = el("div", { className: "row" });
    const input = el("input", {
      className: "input",
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
    row.append(
      el("div", {
        className: "grow",
        children: [
          el("div", {
            text: `1 ${cur.code} = ${base?.code ?? "BASE"}`,
          }),
          el("p", {
            className: "muted tiny",
            text: `Actualizada: ${formatRateUpdated(cur.rateUpdatedAt)}`,
          }),
        ],
      }),
      input,
      save,
    );
    ratesCard.appendChild(row);
  }
  grid.appendChild(ratesCard);

  // Estado
  const statusCard = el("section", { className: "card stack" });
  statusCard.appendChild(el("h2", { className: "card__title", text: "Estado del sistema" }));
  statusCard.append(
    el("p", { text: restaurant }),
    el("p", {
      className: "muted tiny",
      text: `Carta: ${net.cartaUrl ?? "—"} · Puerto ${net.port}`,
    }),
    el("p", {
      className: "muted tiny",
      text: `v${diag.version} · RAM ${diag.memory.rssMB} MB · uptime ${Math.floor(diag.uptimeSec / 60)} min`,
    }),
    el("div", {
      className: "row",
      children: [
        el("a", {
          className: "btn btn--primary btn--sm",
          text: "Red y QR",
          attrs: { href: "#/red" },
        }),
        el("a", {
          className: "btn btn--ghost btn--sm",
          text: "Nuevo producto",
          attrs: { href: "#/productos" },
        }),
      ],
    }),
  );
  grid.appendChild(statusCard);

  // Disponibilidad
  const availCard = el("section", { className: "card stack" });
  availCard.style.gridColumn = "1 / -1";
  availCard.appendChild(el("h2", { className: "card__title", text: "Disponibilidad rápida" }));

  const toolbar = el("div", { className: "row" });
  const search = el("input", {
    className: "input grow",
    attrs: { type: "search", placeholder: "Buscar producto…" },
  }) as HTMLInputElement;
  const onlySold = el("label", {
    className: "row",
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
    try {
      await api.post("/api/admin/products/reset-availability");
      showToast("Todos disponibles", "success");
      await renderInicio(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });
  toolbar.append(search, onlySold, resetBtn);
  availCard.appendChild(toolbar);

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
                  text: `${p.priceMinor} ${base?.code ?? ""} · ${p.type}`,
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

  clear(root);
  root.appendChild(grid);
}
