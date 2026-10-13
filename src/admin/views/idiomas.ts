import { api, type Language } from "../api";
import { clear, el } from "../dom";
import { openModal } from "../modal";
import { showToast } from "../toast";

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
      api.get<{
        items: Array<{
          lang: string;
          total: number;
          translated: number;
          missing?: { category: number; product: number; offer: number };
        }>;
      }>("/api/admin/translations/status"),
    ]);

    const wrap = el("div", { className: "stack" });
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

    wrap.appendChild(
      el("div", {
        className: "row row--between",
        children: [
          el("p", { className: "muted", text: "Progreso de traducciones" }),
          add,
        ],
      }),
    );

    const table = el("table", { className: "data" });
    table.appendChild(
      el("thead", {
        children: [
          el("tr", {
            children: ["Código", "Nombre", "Activo", "Traducido", "Acciones"].map((t) =>
              el("th", { text: t }),
            ),
          }),
        ],
      }),
    );
    const tbody = el("tbody");
    for (const lang of langs.items) {
      const st = status.items.find((s) => s.lang === lang.code);
      const toggle = el("input", {
        className: "toggle",
        attrs: { type: "checkbox", ...(lang.active ? { checked: "" } : {}) },
      }) as HTMLInputElement;
      if (lang.code === "es") toggle.disabled = true;
      toggle.addEventListener("change", async () => {
        try {
          await api.patch(`/api/admin/languages/${lang.code}`, { active: toggle.checked });
          showToast("Guardado", "success");
        } catch (err) {
          toggle.checked = !toggle.checked;
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });
      const del = el("button", {
        className: "btn btn--danger btn--sm",
        text: "Eliminar",
        attrs: { type: "button", ...(lang.code === "es" ? { disabled: "" } : {}) },
      });
      del.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar idioma ${lang.code}?`)) return;
        try {
          await api.delete(`/api/admin/languages/${lang.code}`);
          showToast("Eliminado", "success");
          await refresh();
        } catch (err) {
          showToast(err instanceof Error ? err.message : "Error", "error");
        }
      });
      tbody.appendChild(
        el("tr", {
          children: [
            el("td", { text: lang.code }),
            el("td", { text: lang.nativeName }),
            el("td", { children: [toggle] }),
            el("td", {
              text: st ? `${st.translated}/${st.total}` : "—",
            }),
            el("td", { children: [del] }),
          ],
        }),
      );
    }
    table.appendChild(tbody);
    wrap.appendChild(el("div", { className: "table-wrap", children: [table] }));
    wrap.appendChild(
      el("p", {
        className: "muted tiny",
        text: "La traducción masiva detalle por detalle se ampliará; use Editar en cada producto/categoría por ahora.",
      }),
    );
    return wrap;
  }
}
