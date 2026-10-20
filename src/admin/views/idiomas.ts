import { type Language, api } from "../api";
import { clear, el } from "../dom";
import { openConfirm, openModal } from "../modal";
import { showToast } from "../toast";

type LangStatus = {
  lang: string;
  total: number;
  translated: number;
  missing?: { category: number; product: number; offer: number };
};

function section(title: string, hint: string | null, children: HTMLElement[]): HTMLElement {
  const headKids: HTMLElement[] = [el("h2", { className: "card__title", text: title })];
  if (hint) headKids.push(el("p", { className: "muted tiny", text: hint }));
  return el("section", {
    className: "card stack idiomas-section",
    children: [el("div", { className: "idiomas-section__head", children: headKids }), ...children],
  });
}

function progressBar(translated: number, total: number): HTMLElement {
  const pct = total > 0 ? Math.round((translated / total) * 100) : 100;
  const fill = el("div", {
    className: `idiomas-progress__fill${pct >= 100 ? " is-done" : pct < 50 ? " is-low" : ""}`,
  });
  fill.style.width = `${pct}%`;
  return el("div", {
    className: "idiomas-progress",
    attrs: {
      role: "progressbar",
      "aria-valuenow": String(pct),
      "aria-valuemin": "0",
      "aria-valuemax": "100",
    },
    children: [
      el("div", { className: "idiomas-progress__track", children: [fill] }),
      el("span", {
        className: "idiomas-progress__label",
        text: `${translated}/${total} · ${pct}%`,
      }),
    ],
  });
}

export async function renderIdiomas(root: HTMLElement): Promise<void> {
  const refresh = async () => {
    clear(root);
    root.appendChild(await build());
  };
  clear(root);
  root.appendChild(await build());

  async function build(): Promise<HTMLElement> {
    const [langs, status] = await Promise.all([
      api.get<{ items: Language[] }>("/api/admin/languages"),
      api.get<{ items: LangStatus[] }>("/api/admin/translations/status"),
    ]);

    const page = el("div", { className: "stack idiomas-page" });

    const add = el("button", {
      className: "btn btn--primary",
      text: "Añadir idioma",
      attrs: { type: "button" },
    });
    add.addEventListener("click", () => {
      const code = el("input", {
        className: "input",
        attrs: { maxlength: "10", placeholder: "fr" },
      }) as HTMLInputElement;
      const native = el("input", {
        className: "input",
        attrs: { placeholder: "Français" },
      }) as HTMLInputElement;
      openModal({
        title: "Nuevo idioma",
        body: el("div", {
          className: "stack",
          children: [
            el("label", { className: "field", children: [el("span", { text: "Código" }), code] }),
            el("label", {
              className: "field",
              children: [el("span", { text: "Nombre nativo" }), native],
            }),
          ],
        }),
        onSave: async () => {
          try {
            await api.post("/api/admin/languages", {
              code: code.value.trim().toLowerCase(),
              nativeName: native.value.trim(),
              active: true,
            });
            showToast("Idioma añadido", "success");
            await refresh();
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Error", "error");
            throw err;
          }
        },
      });
    });

    page.appendChild(
      el("div", {
        className: "row row--between idiomas-toolbar",
        children: [
          el("p", {
            className: "muted tiny",
            text: "Active idiomas y complete las traducciones de la carta",
          }),
          add,
        ],
      }),
    );

    const activeCount = langs.items.filter((l) => l.active).length;
    const nonBase = status.items.filter((s) => s.lang !== "es");
    const incomplete = nonBase.filter((s) => s.total > 0 && s.translated < s.total).length;

    page.appendChild(
      el("div", {
        className: "idiomas-kpis",
        children: [
          el("div", {
            className: "idiomas-kpi",
            children: [
              el("span", { className: "idiomas-kpi__label", text: "Idiomas" }),
              el("div", {
                className: "idiomas-kpi__value",
                text: `${langs.items.length}`,
              }),
            ],
          }),
          el("div", {
            className: "idiomas-kpi",
            children: [
              el("span", { className: "idiomas-kpi__label", text: "Activos" }),
              el("div", { className: "idiomas-kpi__value", text: String(activeCount) }),
            ],
          }),
          el("div", {
            className: `idiomas-kpi${incomplete > 0 ? " idiomas-kpi--warn" : ""}`,
            children: [
              el("span", { className: "idiomas-kpi__label", text: "Con faltantes" }),
              el("div", { className: "idiomas-kpi__value", text: String(incomplete) }),
            ],
          }),
        ],
      }),
    );

    const list = el("div", { className: "stack idiomas-list" });
    for (const lang of langs.items) {
      const st = status.items.find((s) => s.lang === lang.code);
      const isBase = lang.code === "es";
      const missing = st?.missing;

      const toggle = el("input", {
        className: "toggle",
        attrs: { type: "checkbox", ...(lang.active ? { checked: "" } : {}) },
      }) as HTMLInputElement;
      if (isBase) toggle.disabled = true;
      toggle.addEventListener("change", async () => {
        try {
          await api.patch(`/api/admin/languages/${lang.code}`, { active: toggle.checked });
          showToast("Guardado", "success");
          await refresh();
        } catch (err) {
          toggle.checked = !toggle.checked;
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });

      const viewMissing = el("button", {
        className: "btn btn--ghost btn--sm",
        text: "Ver faltantes",
        attrs: {
          type: "button",
          ...(isBase || !missing || missing.product === 0 ? { disabled: "" } : {}),
        },
      });
      viewMissing.addEventListener("click", () => {
        location.hash = `#/productos?untranslated=${encodeURIComponent(lang.code)}`;
      });

      const del = el("button", {
        className: "btn btn--danger btn--sm",
        text: "Eliminar",
        attrs: { type: "button", ...(isBase ? { disabled: "" } : {}) },
      });
      del.addEventListener("click", async () => {
        const ok = await openConfirm({
          title: "Eliminar idioma",
          message: `¿Eliminar idioma ${lang.code}?`,
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        try {
          await api.delete(`/api/admin/languages/${lang.code}`);
          showToast("Eliminado", "success");
          await refresh();
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });

      const meta: HTMLElement[] = [];
      if (isBase) {
        meta.push(el("span", { className: "chip chip--ok", text: "Base" }));
      }
      if (!lang.active) {
        meta.push(el("span", { className: "chip chip--off", text: "Inactivo" }));
      }
      if (missing && !isBase) {
        const totalMissing = missing.category + missing.product + missing.offer;
        if (totalMissing > 0) {
          meta.push(
            el("span", {
              className: "chip chip--warn",
              text: `Cat ${missing.category} · Prod ${missing.product} · Ofertas ${missing.offer}`,
            }),
          );
        } else {
          meta.push(el("span", { className: "chip chip--ok", text: "Completo" }));
        }
      }

      list.appendChild(
        el("article", {
          className: `idiomas-card${lang.active ? "" : " is-off"}`,
          children: [
            el("div", {
              className: "row row--between idiomas-card__top",
              children: [
                el("div", {
                  className: "idiomas-card__identity",
                  children: [
                    el("strong", { className: "idiomas-card__code", text: lang.code }),
                    el("span", { className: "idiomas-card__name", text: lang.nativeName }),
                    ...(meta.length
                      ? [el("div", { className: "row idiomas-card__meta", children: meta })]
                      : []),
                  ],
                }),
                el("label", {
                  className: "row idiomas-card__active",
                  children: [toggle, el("span", { text: "Activo" })],
                }),
              ],
            }),
            isBase
              ? el("p", {
                  className: "muted tiny",
                  text: "Idioma base de la carta. No se puede desactivar ni eliminar.",
                })
              : st
                ? progressBar(st.translated, st.total)
                : el("p", { className: "muted tiny", text: "Sin datos de progreso" }),
            el("div", {
              className: "row idiomas-card__actions",
              children: [viewMissing, del],
            }),
          ],
        }),
      );
    }

    page.appendChild(
      section(
        "Idiomas de la carta",
        "«Ver faltantes» abre Productos filtrados por ese idioma. Complete también categorías y ofertas desde sus fichas.",
        [list],
      ),
    );

    return page;
  }
}
