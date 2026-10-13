import { api } from "../api";
import { BRAND } from "../brand";
import { clear, el } from "../dom";
import { showToast } from "../toast";

export async function renderAjustes(root: HTMLElement): Promise<void> {
  const settings = await api.get<Record<string, unknown>>("/api/admin/settings");
  clear(root);

  const name = el("input", {
    className: "input",
    attrs: {
      value:
        typeof settings["carta.restaurant_name"] === "string"
          ? String(settings["carta.restaurant_name"])
          : BRAND,
    },
  }) as HTMLInputElement;

  const welcomeEs = el("input", {
    className: "input",
    attrs: {
      value:
        typeof settings["carta.welcome"] === "object" &&
        settings["carta.welcome"] &&
        "es" in (settings["carta.welcome"] as object)
          ? String((settings["carta.welcome"] as { es?: string }).es ?? "")
          : `Bienvenidos a ${BRAND}`,
    },
  }) as HTMLInputElement;

  const footerEs = el("input", {
    className: "input",
    attrs: {
      value:
        typeof settings["carta.footer"] === "object" &&
        settings["carta.footer"] &&
        "es" in (settings["carta.footer"] as object)
          ? String((settings["carta.footer"] as { es?: string }).es ?? "")
          : "Precios con impuestos incluidos",
    },
  }) as HTMLInputElement;

  const showRate = el("input", {
    className: "toggle",
    attrs: {
      type: "checkbox",
      ...(settings["carta.show_rate"] !== false ? { checked: "" } : {}),
    },
  }) as HTMLInputElement;

  const pin = el("input", {
    className: "input",
    attrs: {
      type: "password",
      inputmode: "numeric",
      maxlength: "8",
      placeholder: settings["admin.pinEnabled"] ? "•••• (dejar vacío para no cambiar)" : "Opcional 4–8 dígitos",
    },
  }) as HTMLInputElement;
  const clearPin = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;

  const save = el("button", {
    className: "btn btn--primary",
    text: "Guardar ajustes",
    attrs: { type: "button" },
  });
  save.addEventListener("click", async () => {
    try {
      const body: Record<string, unknown> = {
        "carta.restaurant_name": name.value.trim() || BRAND,
        "carta.welcome": { es: welcomeEs.value.trim(), en: "Welcome" },
        "carta.footer": { es: footerEs.value.trim() },
        "carta.show_rate": showRate.checked,
      };
      if (clearPin.checked) body["admin.pin"] = null;
      else if (pin.value.trim()) body["admin.pin"] = pin.value.trim();
      await api.put("/api/admin/settings", body);
      showToast("Ajustes guardados", "success");
      await renderAjustes(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });

  root.appendChild(
    el("div", {
      className: "card stack",
      children: [
        el("h2", { className: "card__title", text: `Datos de ${BRAND}` }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Nombre del restaurante" }), name],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Bienvenida (ES)" }), welcomeEs],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Pie de carta (ES)" }), footerEs],
        }),
        el("label", {
          className: "row",
          children: [showRate, el("span", { text: "Mostrar tasa del día en la carta" })],
        }),
        el("h2", { className: "card__title", text: "Seguridad" }),
        el("label", {
          className: "field",
          children: [el("span", { text: "PIN del Admin (opcional)" }), pin],
        }),
        el("label", {
          className: "row",
          children: [clearPin, el("span", { text: "Desactivar PIN" })],
        }),
        save,
      ],
    }),
  );
}
