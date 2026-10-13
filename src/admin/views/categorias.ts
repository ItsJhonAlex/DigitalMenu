import { api, type Category, type I18nMap } from "../api";
import { clear, el, nameOf } from "../dom";
import { openModal } from "../modal";
import { showToast } from "../toast";

function i18nForm(initial: I18nMap = { es: { name: "" } }): {
  root: HTMLElement;
  getValue: () => I18nMap;
} {
  const langs = ["es", "en"];
  const state: I18nMap = {
    es: { name: initial.es?.name ?? "", description: initial.es?.description ?? "" },
    en: { name: initial.en?.name ?? "", description: initial.en?.description ?? "" },
  };
  let active = "es";
  const root = el("div", { className: "stack" });
  const tabs = el("div", { className: "tabs" });
  const nameInput = el("input", { className: "input", attrs: { maxlength: "80" } }) as HTMLInputElement;
  const descInput = el("textarea", {
    className: "input",
    attrs: { maxlength: "500", rows: "3" },
  }) as HTMLTextAreaElement;

  const syncFields = () => {
    nameInput.value = state[active]?.name ?? "";
    descInput.value = state[active]?.description ?? "";
  };
  const saveFields = () => {
    state[active] = {
      name: nameInput.value,
      description: descInput.value || null,
    };
  };

  for (const lang of langs) {
    const tab = el("button", {
      className: `tab${lang === active ? " is-active" : ""}`,
      text: lang.toUpperCase(),
      attrs: { type: "button" },
    });
    tab.addEventListener("click", () => {
      saveFields();
      active = lang;
      for (const t of tabs.querySelectorAll(".tab")) t.classList.remove("is-active");
      tab.classList.add("is-active");
      syncFields();
    });
    tabs.appendChild(tab);
  }
  nameInput.addEventListener("input", saveFields);
  descInput.addEventListener("input", saveFields);
  syncFields();

  root.append(
    tabs,
    el("label", { className: "field", children: [el("span", { text: "Nombre" }), nameInput] }),
    el("label", {
      className: "field",
      children: [el("span", { text: "Descripción" }), descInput],
    }),
  );

  return {
    root,
    getValue: () => {
      saveFields();
      const out: I18nMap = { es: state.es! };
      if (state.en?.name?.trim()) out.en = state.en;
      return out;
    },
  };
}

export async function renderCategorias(root: HTMLElement): Promise<void> {
  const data = await api.get<{ items: Category[] }>("/api/admin/categories");

  const paint = async () => {
    const fresh = await api.get<{ items: Category[] }>("/api/admin/categories");
    clear(root);
    root.appendChild(await build(fresh.items, paint));
  };

  clear(root);
  root.appendChild(await build(data.items, paint));
}

async function build(items: Category[], refresh: () => Promise<void>): Promise<HTMLElement> {
  const wrap = el("div", { className: "stack" });
  const toolbar = el("div", { className: "row row--between" });
  toolbar.append(
    el("p", { className: "muted", text: `${items.length} categorías` }),
    el("button", {
      className: "btn btn--primary",
      text: "Nueva categoría",
      attrs: { type: "button" },
    }),
  );
  const newBtn = toolbar.querySelector("button")!;
  newBtn.addEventListener("click", () => openCategoryModal(null, refresh));
  wrap.appendChild(toolbar);

  const table = el("table", { className: "data" });
  table.appendChild(
    el("thead", {
      children: [
        el("tr", {
          children: ["Nombre", "EN", "Productos", "Visible", "Acciones"].map((t) =>
            el("th", { text: t }),
          ),
        }),
      ],
    }),
  );
  const tbody = el("tbody");
  for (const cat of items) {
    const visible = el("input", {
      className: "toggle",
      attrs: { type: "checkbox", ...(cat.visible ? { checked: "" } : {}) },
    }) as HTMLInputElement;
    visible.addEventListener("change", async () => {
      try {
        await api.patch(`/api/admin/categories/${cat.id}`, { visible: visible.checked });
        showToast("Guardado", "success");
      } catch (err) {
        visible.checked = !visible.checked;
        showToast(err instanceof Error ? err.message : "Error", "error");
      }
    });

    const edit = el("button", {
      className: "btn btn--ghost btn--sm",
      text: "Editar",
      attrs: { type: "button" },
    });
    edit.addEventListener("click", () => openCategoryModal(cat, refresh));

    const del = el("button", {
      className: "btn btn--danger btn--sm",
      text: "Eliminar",
      attrs: {
        type: "button",
        ...(cat.productCount > 0 ? { disabled: "", title: "Mueva u oculte los productos primero" } : {}),
      },
    });
    del.addEventListener("click", async () => {
      if (!confirm(`¿Eliminar “${nameOf(cat.i18n)}”?`)) return;
      try {
        await api.delete(`/api/admin/categories/${cat.id}`);
        showToast("Eliminada", "success");
        await refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
      }
    });

    tbody.appendChild(
      el("tr", {
        children: [
          el("td", { text: nameOf(cat.i18n) }),
          el("td", { text: cat.i18n.en?.name ? "✔" : "✖" }),
          el("td", { text: String(cat.productCount) }),
          el("td", { children: [visible] }),
          el("td", { children: [el("div", { className: "row", children: [edit, del] })] }),
        ],
      }),
    );
  }
  table.appendChild(tbody);
  wrap.appendChild(el("div", { className: "table-wrap", children: [table] }));
  return wrap;
}

function openCategoryModal(cat: Category | null, refresh: () => Promise<void>): void {
  const form = i18nForm(cat?.i18n);
  const visible = el("input", {
    className: "toggle",
    attrs: { type: "checkbox", ...(cat?.visible !== false ? { checked: "" } : {}) },
  }) as HTMLInputElement;
  const body = el("div", {
    className: "stack",
    children: [
      form.root,
      el("label", {
        className: "row",
        children: [visible, el("span", { text: "Visible en la carta" })],
      }),
    ],
  });

  openModal({
    title: cat ? "Editar categoría" : "Nueva categoría",
    body,
    onSave: async () => {
      try {
        const i18n = form.getValue();
        if (!i18n.es?.name?.trim()) throw new Error("El nombre en español es obligatorio");
        if (cat) {
          await api.put(`/api/admin/categories/${cat.id}`, {
            visible: visible.checked,
            i18n,
            image: cat.image,
          });
        } else {
          await api.post("/api/admin/categories", { visible: visible.checked, i18n });
        }
        showToast("Guardado", "success");
        await refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
        throw err;
      }
    },
  });
}
