import { type Currency, type Language, api } from "../api";
import { BRAND } from "../brand";
import { dangerZone } from "../components/danger-zone";
import { settingToggle } from "../components/setting-toggle";
import { clear, el } from "../dom";
import { openConfirm } from "../modal";
import { showToast } from "../toast";

function boolSetting(settings: Record<string, unknown>, key: string, fallback = true): boolean {
  const v = settings[key];
  if (v === false || v === "false" || v === 0) return false;
  if (v === true || v === "true" || v === 1) return true;
  return fallback;
}

function strSetting(settings: Record<string, unknown>, key: string, fallback: string): string {
  const v = settings[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

function localizedMap(settings: Record<string, unknown>, key: string): Record<string, string> {
  const v = settings[key];
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  }
  return {};
}

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

export async function renderAjustes(root: HTMLElement): Promise<void> {
  const [settings, langsRes, currenciesRes] = await Promise.all([
    api.get<Record<string, unknown>>("/api/admin/settings"),
    api.get<{ items: Language[] }>("/api/admin/languages"),
    api.get<{ items: Currency[] }>("/api/admin/currencies"),
  ]);

  const activeLangs = langsRes.items.filter((l) => l.active);
  const langs = activeLangs.length > 0 ? activeLangs : langsRes.items;
  const currencies = currenciesRes.items.filter((c) => c.active);
  const welcomeMap = localizedMap(settings, "carta.welcome");
  const footerMap = localizedMap(settings, "carta.footer");

  clear(root);
  const card = el("div", { className: "card stack" });
  root.appendChild(card);

  const tabs = el("div", { className: "tabs", attrs: { role: "tablist" } });
  const panels = el("div", { className: "ajustes-panels stack" });
  card.append(tabs, panels);

  const panelGeneral = el("div", { className: "stack", attrs: { role: "tabpanel" } });
  const panelCarta = el("div", { className: "stack", attrs: { role: "tabpanel", hidden: "true" } });
  const panelSeguridad = el("div", {
    className: "stack",
    attrs: { role: "tabpanel", hidden: "true" },
  });
  panels.append(panelGeneral, panelCarta, panelSeguridad);

  const tabBtns: HTMLButtonElement[] = [];
  const showPanel = (i: number) => {
    for (let j = 0; j < tabBtns.length; j++) {
      tabBtns[j]!.classList.toggle("is-active", j === i);
      (panels.children[j] as HTMLElement).hidden = j !== i;
    }
  };
  for (const [i, label] of ["General", "Carta", "Seguridad"].entries()) {
    const btn = el("button", {
      className: `tab${i === 0 ? " is-active" : ""}`,
      text: label,
      attrs: { type: "button", role: "tab" },
    }) as HTMLButtonElement;
    btn.addEventListener("click", () => showPanel(i));
    tabBtns.push(btn);
    tabs.appendChild(btn);
  }

  // —— General ——
  const name = el("input", {
    className: "input",
    attrs: { value: strSetting(settings, "carta.restaurant_name", BRAND) },
  }) as HTMLInputElement;

  const welcomeInputs = new Map<string, HTMLInputElement>();
  const footerInputs = new Map<string, HTMLInputElement>();
  const i18nBlock = el("div", { className: "stack" });
  for (const lang of langs) {
    const w = el("input", {
      className: "input",
      attrs: {
        value: welcomeMap[lang.code] ?? (lang.code === "es" ? `Bienvenidos a ${BRAND}` : ""),
      },
    }) as HTMLInputElement;
    const f = el("input", {
      className: "input",
      attrs: {
        value: footerMap[lang.code] ?? (lang.code === "es" ? "Precios con impuestos incluidos" : ""),
      },
    }) as HTMLInputElement;
    welcomeInputs.set(lang.code, w);
    footerInputs.set(lang.code, f);
    i18nBlock.append(
      el("h3", {
        className: "ajustes-group__title",
        text: `${lang.nativeName} (${lang.code})`,
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Bienvenida" }), w],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Pie de carta" }), f],
      }),
    );
  }

  const defaultLang = el("select", { className: "select" }) as HTMLSelectElement;
  for (const lang of langs) {
    const opt = document.createElement("option");
    opt.value = lang.code;
    opt.textContent = `${lang.nativeName} (${lang.code})`;
    defaultLang.appendChild(opt);
  }
  defaultLang.value = strSetting(settings, "carta.default_lang", "es");

  const defaultCurrency = el("select", { className: "select" }) as HTMLSelectElement;
  for (const c of currencies.length ? currencies : currenciesRes.items) {
    const opt = document.createElement("option");
    opt.value = c.code;
    opt.textContent = `${c.code} — ${c.name}`;
    defaultCurrency.appendChild(opt);
  }
  defaultCurrency.value = strSetting(
    settings,
    "carta.default_currency",
    currencies.find((c) => c.isBase)?.code ?? "CUP",
  );

  const persistGeneral = debounce(() => {
    void (async () => {
      const welcome: Record<string, string> = {};
      const footer: Record<string, string> = {};
      for (const [code, input] of welcomeInputs) {
        welcome[code] = input.value.trim();
      }
      for (const [code, input] of footerInputs) {
        footer[code] = input.value.trim();
      }
      try {
        await api.put("/api/admin/settings", {
          "carta.restaurant_name": name.value.trim() || BRAND,
          "carta.welcome": welcome,
          "carta.footer": footer,
          "carta.default_lang": defaultLang.value,
          "carta.default_currency": defaultCurrency.value,
        });
        showToast("Ajustes generales guardados", "success");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error al guardar", "error");
      }
    })();
  }, 400);

  for (const input of [name, defaultLang, defaultCurrency, ...welcomeInputs.values(), ...footerInputs.values()]) {
    input.addEventListener("input", persistGeneral);
    input.addEventListener("change", persistGeneral);
  }

  panelGeneral.append(
    el("label", {
      className: "field",
      children: [el("span", { text: "Nombre del restaurante" }), name],
    }),
    i18nBlock,
    el("label", {
      className: "field",
      children: [el("span", { text: "Idioma por defecto de la carta" }), defaultLang],
    }),
    el("label", {
      className: "field",
      children: [el("span", { text: "Moneda por defecto de la carta" }), defaultCurrency],
    }),
    el("p", {
      className: "muted tiny",
      text: "Los textos se guardan solos tras una pausa breve al escribir.",
    }),
  );

  // —— Carta ——
  type FlagKey =
    | "carta.show_rate"
    | "carta.show_images"
    | "carta.show_soldout"
    | "carta.soldout_collapsed"
    | "carta.sections_collapsible"
    | "carta.sections_open_default"
    | "carta.show_section_counts";

  const persistFlag = async (key: FlagKey, value: boolean, ok: string) => {
    await api.put("/api/admin/settings", { [key]: value });
    showToast(ok, "success");
  };

  const soldOutCollapsed = settingToggle({
    label: "Agotados colapsados por defecto",
    checked: boolSetting(settings, "carta.soldout_collapsed", true),
    disabled: !boolSetting(settings, "carta.show_soldout", true),
    onChange: async (v) => {
      try {
        await persistFlag(
          "carta.soldout_collapsed",
          v,
          v ? "Agotados en bloque colapsable" : "Agotados al final de cada sección",
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
        throw err;
      }
    },
  });

  const sectionsOpenDefault = settingToggle({
    label: "Secciones abiertas por defecto",
    checked: boolSetting(settings, "carta.sections_open_default", true),
    disabled: !boolSetting(settings, "carta.sections_collapsible", false),
    onChange: async (v) => {
      try {
        await persistFlag(
          "carta.sections_open_default",
          v,
          v ? "Secciones abiertas por defecto" : "Secciones cerradas por defecto",
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
        throw err;
      }
    },
  });

  const group = (title: string, children: HTMLElement[]) =>
    el("div", {
      className: "ajustes-group stack",
      children: [el("h3", { className: "ajustes-group__title", text: title }), ...children],
    });

  panelCarta.append(
    group("Visibilidad", [
      settingToggle({
        label: "Mostrar fotos en la carta",
        checked: boolSetting(settings, "carta.show_images", true),
        onChange: async (v) => {
          try {
            await persistFlag(
              "carta.show_images",
              v,
              v ? "Fotos activadas en la carta" : "Carta en solo texto",
            );
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Error", "error");
            throw err;
          }
        },
      }).root,
      settingToggle({
        label: "Mostrar tasa del día en la carta",
        checked: boolSetting(settings, "carta.show_rate", true),
        onChange: async (v) => {
          try {
            await persistFlag(
              "carta.show_rate",
              v,
              v ? "Tasa del día visible" : "Tasa del día oculta",
            );
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Error", "error");
            throw err;
          }
        },
      }).root,
      settingToggle({
        label: "Mostrar cantidad de platos y agotados en el título",
        checked: boolSetting(settings, "carta.show_section_counts", true),
        onChange: async (v) => {
          try {
            await persistFlag(
              "carta.show_section_counts",
              v,
              v ? "Conteo de platos visible" : "Conteo de platos oculto",
            );
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Error", "error");
            throw err;
          }
        },
      }).root,
    ]),
    group("Agotados", [
      settingToggle({
        label: "Mostrar agotados en la carta",
        checked: boolSetting(settings, "carta.show_soldout", true),
        onChange: async (v) => {
          try {
            await persistFlag(
              "carta.show_soldout",
              v,
              v ? "Agotados visibles en la carta" : "Agotados ocultos en la carta",
            );
            soldOutCollapsed.setDisabled(!v);
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Error", "error");
            throw err;
          }
        },
      }).root,
      soldOutCollapsed.root,
    ]),
    group("Secciones", [
      settingToggle({
        label: "Secciones colapsables (Entrantes, Platos…)",
        checked: boolSetting(settings, "carta.sections_collapsible", false),
        onChange: async (v) => {
          try {
            await persistFlag(
              "carta.sections_collapsible",
              v,
              v ? "Secciones colapsables en la carta" : "Secciones siempre abiertas",
            );
            sectionsOpenDefault.setDisabled(!v);
          } catch (err) {
            showToast(err instanceof Error ? err.message : "Error", "error");
            throw err;
          }
        },
      }).root,
      sectionsOpenDefault.root,
    ]),
    el("p", {
      className: "muted tiny",
      text: "Los interruptores se guardan al tocarlos.",
    }),
  );

  // —— Seguridad ——
  const pinEnabled = Boolean(settings["admin.pinEnabled"]);
  const pin = el("input", {
    className: "input",
    attrs: {
      type: "password",
      inputmode: "numeric",
      maxlength: "8",
      placeholder: pinEnabled ? "•••• (dejar vacío para no cambiar)" : "Opcional 4–8 dígitos",
    },
  }) as HTMLInputElement;

  const savePin = debounce(() => {
    void (async () => {
      const value = pin.value.trim();
      if (!value) return;
      if (!/^\d{4,8}$/.test(value)) {
        showToast("PIN inválido (4–8 dígitos)", "error");
        return;
      }
      try {
        await api.put("/api/admin/settings", { "admin.pin": value });
        pin.value = "";
        showToast("PIN actualizado", "success");
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Error", "error");
      }
    })();
  }, 400);
  pin.addEventListener("change", savePin);

  const clearPinBtn = el("button", {
    className: "btn btn--danger",
    text: "Desactivar PIN",
    attrs: { type: "button", ...(pinEnabled ? {} : { disabled: "true" }) },
  });
  clearPinBtn.addEventListener("click", async () => {
    const ok = await openConfirm({
      title: "Desactivar PIN",
      message: "¿Quitar el PIN del Admin? Cualquiera en la red local podrá abrir el panel.",
      confirmLabel: "Desactivar",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.put("/api/admin/settings", { "admin.pin": null });
      showToast("PIN desactivado", "success");
      clearPinBtn.setAttribute("disabled", "true");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });

  panelSeguridad.append(
    el("label", {
      className: "field",
      children: [el("span", { text: "PIN del Admin (opcional)" }), pin],
    }),
    el("p", {
      className: "muted tiny",
      text: "Escriba 4–8 dígitos y pulse fuera del campo (o Enter) para guardar.",
    }),
    dangerZone({
      title: "Zona peligrosa",
      hint: "Desactivar el PIN deja el Admin sin contraseña en la red local.",
      children: [clearPinBtn],
    }),
  );
}
