import { type I18nMap, api } from "../api";
import { el } from "../dom";

export type LangInfo = { code: string; nativeName: string };

async function loadActiveLangs(): Promise<LangInfo[]> {
  const data = await api.get<{
    items: Array<{ code: string; nativeName: string; active: boolean }>;
  }>("/api/admin/languages");
  const active = data.items.filter((l) => l.active);
  if (active.length === 0) {
    return [{ code: "es", nativeName: "Español" }];
  }
  return active.map((l) => ({ code: l.code, nativeName: l.nativeName }));
}

export type I18nTabsResult = {
  root: HTMLElement;
  getValue: () => I18nMap;
  onChange?: (cb: () => void) => void;
};

/**
 * Tabs de traducción por idiomas activos.
 * `es` siempre se incluye en getValue; otros idiomas solo si tienen nombre.
 */
export async function i18nTabs(
  initial: I18nMap = { es: { name: "" } },
  opts?: { withDescription?: boolean },
): Promise<I18nTabsResult> {
  const withDescription = opts?.withDescription !== false;
  const langs = await loadActiveLangs();
  const codes = langs.map((l) => l.code);
  if (!codes.includes("es")) {
    langs.unshift({ code: "es", nativeName: "Español" });
    codes.unshift("es");
  }

  const state: I18nMap = {};
  for (const code of codes) {
    state[code] = {
      name: initial[code]?.name ?? "",
      description: initial[code]?.description ?? "",
    };
  }

  let active = codes.includes("es") ? "es" : codes[0]!;
  let changeCb: (() => void) | null = null;

  const root = el("div", { className: "stack" });
  const tabs = el("div", { className: "tabs" });
  const nameInput = el("input", {
    className: "input",
    attrs: { maxlength: "80" },
  }) as HTMLInputElement;
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
    changeCb?.();
  };

  for (const lang of langs) {
    const tab = el("button", {
      className: `tab${lang.code === active ? " is-active" : ""}`,
      text: lang.code.toUpperCase(),
      attrs: { type: "button", title: lang.nativeName },
    });
    tab.addEventListener("click", () => {
      saveFields();
      active = lang.code;
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
  );
  if (withDescription) {
    root.append(
      el("label", {
        className: "field",
        children: [el("span", { text: "Descripción" }), descInput],
      }),
    );
  }

  return {
    root,
    getValue: () => {
      saveFields();
      const out: I18nMap = { es: state.es ?? { name: "" } };
      for (const code of codes) {
        if (code === "es") continue;
        const row = state[code];
        if (row?.name?.trim()) out[code] = row;
      }
      return out;
    },
    onChange: (cb) => {
      changeCb = cb;
    },
  };
}

export { loadActiveLangs };
