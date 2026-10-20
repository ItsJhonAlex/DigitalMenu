import { type NetworkState, api } from "../api";
import { BRAND } from "../brand";
import { settingToggle } from "../components/setting-toggle";
import { clear, el } from "../dom";
import { showToast } from "../toast";

type WifiState = {
  ssid: string | null;
  password: string | null;
  security: string;
  hidden: boolean;
};

type QrLayout = "auto" | "carta" | "both";
type QrStyle = "warm" | "light" | "contrast";

type QrCardOpts = {
  title: string;
  subtitleEs: string;
  subtitleEn: string;
  footer: string;
  showUrl: boolean;
  showWifiPassword: boolean;
  layout: QrLayout;
  accent: string;
  style: QrStyle;
  fg: string;
  showLogo: boolean;
  bust: number;
};

function qrImgSrc(kind: "wifi" | "carta", opts: Pick<QrCardOpts, "fg" | "showLogo" | "bust">): string {
  const q = new URLSearchParams({
    size: "280",
    t: String(opts.bust),
    fg: opts.fg,
    logo: opts.showLogo ? "1" : "0",
  });
  return `/api/admin/qr/${kind}.svg?${q.toString()}`;
}

const TAB_LABELS = ["Red", "Tarjeta QR"] as const;
const DEFAULT_ACCENT = "#b70011";
const DEFAULT_FG = "#1e1b19";

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function strSetting(settings: Record<string, unknown>, key: string, fallback: string): string {
  const v = settings[key];
  return typeof v === "string" && v.trim() ? v : fallback;
}

function boolSetting(settings: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = settings[key];
  if (v === false || v === "false" || v === 0) return false;
  if (v === true || v === "true" || v === 1) return true;
  return fallback;
}

function section(title: string, hint: string | null, children: HTMLElement[]): HTMLElement {
  const headKids: HTMLElement[] = [el("h2", { className: "card__title", text: title })];
  if (hint) headKids.push(el("p", { className: "muted tiny", text: hint }));
  return el("section", {
    className: "card stack redqr-section",
    children: [el("div", { className: "redqr-section__head", children: headKids }), ...children],
  });
}

function resolveIncludeWifi(layout: QrLayout, hasWifi: boolean): boolean {
  if (layout === "carta") return false;
  if (layout === "both") return true;
  return hasWifi;
}

function defaultSubtitles(includeWifi: boolean): { es: string; en: string } {
  return includeWifi
    ? { es: "Escanea en orden", en: "Scan in order" }
    : { es: "Escanea para ver la carta", en: "Scan for the menu" };
}

export async function renderRedQr(root: HTMLElement): Promise<void> {
  const [net, wifi, settings] = await Promise.all([
    api.get<NetworkState>("/api/admin/network"),
    api.get<WifiState>("/api/admin/wifi"),
    api.get<Record<string, unknown>>("/api/admin/settings"),
  ]);

  const restaurant =
    typeof settings["carta.restaurant_name"] === "string"
      ? String(settings["carta.restaurant_name"])
      : BRAND;
  const hasWifiCfg = Boolean(wifi.ssid && String(wifi.ssid).trim());
  const logoHash =
    typeof settings["carta.logo"] === "string" && settings["carta.logo"]
      ? String(settings["carta.logo"])
      : null;

  const layoutRaw = strSetting(settings, "qr.layout", "auto");
  const layout: QrLayout =
    layoutRaw === "carta" || layoutRaw === "both" || layoutRaw === "auto" ? layoutRaw : "auto";
  const styleRaw = strSetting(settings, "qr.style", "warm");
  const style: QrStyle =
    styleRaw === "light" || styleRaw === "contrast" || styleRaw === "warm" ? styleRaw : "warm";
  const includeWifiDefault = resolveIncludeWifi(layout, hasWifiCfg);
  const subDefaults = defaultSubtitles(includeWifiDefault);

  const cardOpts: QrCardOpts = {
    title: strSetting(settings, "qr.title", restaurant),
    subtitleEs: strSetting(settings, "qr.subtitle_es", subDefaults.es),
    subtitleEn: strSetting(settings, "qr.subtitle_en", subDefaults.en),
    footer: strSetting(settings, "qr.footer", "Sin internet · Menú digital local"),
    showUrl: boolSetting(settings, "qr.show_url", true),
    showWifiPassword: boolSetting(settings, "qr.show_wifi_password", true),
    layout,
    accent: strSetting(settings, "qr.accent", DEFAULT_ACCENT),
    style,
    fg: strSetting(settings, "qr.fg", DEFAULT_FG),
    showLogo: boolSetting(settings, "qr.show_logo", false),
    bust: Date.now(),
  };

  clear(root);
  const page = el("div", { className: "stack redqr-page" });
  root.appendChild(page);

  const tabs = el("div", { className: "tabs", attrs: { role: "tablist" } });
  const panels = el("div", { className: "redqr-tab-panels stack" });
  page.append(
    el("div", { className: "row row--between redqr-toolbar", children: [tabs] }),
    panels,
  );

  const panelRed = el("div", {
    className: "stack redqr-panel",
    attrs: { role: "tabpanel" },
  });
  const panelTarjeta = el("div", {
    className: "stack redqr-panel",
    attrs: { role: "tabpanel", hidden: "true" },
  });
  panels.append(panelRed, panelTarjeta);

  const tabBtns: HTMLButtonElement[] = [];
  const showPanel = (i: number) => {
    for (let j = 0; j < tabBtns.length; j++) {
      const active = j === i;
      tabBtns[j]!.classList.toggle("is-active", active);
      tabBtns[j]!.setAttribute("aria-selected", active ? "true" : "false");
      (panels.children[j] as HTMLElement).hidden = !active;
    }
  };
  for (const [i, label] of TAB_LABELS.entries()) {
    const btn = el("button", {
      className: `tab${i === 0 ? " is-active" : ""}`,
      text: label,
      attrs: {
        type: "button",
        role: "tab",
        "aria-selected": i === 0 ? "true" : "false",
      },
    }) as HTMLButtonElement;
    btn.addEventListener("click", () => showPanel(i));
    tabBtns.push(btn);
    tabs.appendChild(btn);
  }

  // —— Pestaña Red: Red + Wi‑Fi ——
  const setup = el("div", { className: "redqr-setup" });
  panelRed.appendChild(setup);

  const ipSelect = el("select", { className: "select" }) as HTMLSelectElement;
  if (net.candidates.length === 0) {
    ipSelect.appendChild(el("option", { text: "Sin adaptadores LAN", attrs: { value: "" } }));
    ipSelect.disabled = true;
  } else {
    for (const c of net.candidates) {
      const macOk = Boolean(c.mac && !/^[0:\-.]+$/i.test(c.mac));
      const mac = macOk ? ` · ${c.mac}` : "";
      const opt = el("option", {
        text: `${c.address} · ${c.interface}${mac}${c.recommended ? " · recomendada" : ""}`,
        attrs: { value: c.address },
      });
      if ((net.savedIp ?? net.candidates.find((x) => x.recommended)?.address) === c.address) {
        opt.selected = true;
      }
      ipSelect.appendChild(opt);
    }
  }
  const saveIp = el("button", {
    className: "btn btn--primary",
    text: "Usar esta IP",
    attrs: { type: "button" },
  });
  saveIp.disabled = net.candidates.length === 0;
  saveIp.addEventListener("click", async () => {
    try {
      await api.put("/api/admin/network", { cartaIp: ipSelect.value });
      showToast("IP guardada — reimprima la tarjeta si ya tenía QR", "success");
      await renderRedQr(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });

  const urlRow = el("div", { className: "redqr-url" });
  urlRow.appendChild(el("span", { className: "redqr-url__label", text: "URL carta" }));
  if (net.cartaUrl) {
    urlRow.appendChild(el("code", { className: "redqr-mono", text: net.cartaUrl }));
  } else {
    urlRow.appendChild(
      el("span", {
        className: "muted tiny",
        text: "Sin IP — conecte el POS a la LAN del restaurante.",
      }),
    );
  }

  setup.appendChild(
    section("Red local", "IP del equipo que irá en el QR de la carta.", [
      urlRow,
      el("label", {
        className: "field",
        children: [el("span", { text: "IP del POS" }), ipSelect],
      }),
      el("div", { className: "row redqr-actions", children: [saveIp] }),
    ]),
  );

  const ssid = el("input", {
    className: "input",
    attrs: { value: wifi.ssid ?? "", maxlength: "32", placeholder: "Ej. Avanzar-Clientes" },
  }) as HTMLInputElement;
  const password = el("input", {
    className: "input",
    attrs: {
      type: "password",
      value: wifi.password ?? "",
      maxlength: "63",
      placeholder: "Mínimo 8 caracteres",
    },
  }) as HTMLInputElement;
  const showPass = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  showPass.addEventListener("change", () => {
    password.type = showPass.checked ? "text" : "password";
  });

  const security = el("select", { className: "select" }) as HTMLSelectElement;
  for (const [v, label] of [
    ["WPA", "WPA / WPA2 / WPA3 (con contraseña)"],
    ["nopass", "Sin contraseña (red abierta)"],
    ["WEP", "WEP (legado, no recomendado)"],
  ] as const) {
    const opt = el("option", { text: label, attrs: { value: v } });
    if ((wifi.security || "WPA") === v) opt.selected = true;
    security.appendChild(opt);
  }

  const passField = el("label", {
    className: "field",
    children: [el("span", { text: "Contraseña" }), password],
  });
  const showPassRow = el("label", {
    className: "row",
    children: [showPass, el("span", { text: "Mostrar contraseña" })],
  });

  const syncPassVisibility = () => {
    const open = security.value === "nopass";
    passField.hidden = open;
    showPassRow.hidden = open;
  };
  security.addEventListener("change", syncPassVisibility);
  syncPassVisibility();

  const saveWifi = el("button", {
    className: "btn btn--primary",
    text: "Guardar Wi‑Fi",
    attrs: { type: "button" },
  });
  saveWifi.addEventListener("click", async () => {
    try {
      const sid = ssid.value.trim();
      if (!sid) {
        showToast("Escriba el SSID, o pulse «Sin QR de Wi‑Fi» si no hay red de invitados", "error");
        return;
      }
      await api.put("/api/admin/wifi", {
        ssid: sid,
        password: security.value === "nopass" ? "" : password.value,
        security: security.value,
        hidden: false,
      });
      showToast("Wi‑Fi guardado", "success");
      await renderRedQr(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });

  const clearWifi = el("button", {
    className: "btn btn--ghost",
    text: "Sin QR de Wi‑Fi",
    attrs: { type: "button" },
  });
  clearWifi.addEventListener("click", async () => {
    try {
      await api.put("/api/admin/wifi", { ssid: "", password: "", security: "nopass" });
      showToast("Tarjeta sin QR Wi‑Fi — solo carta", "success");
      await renderRedQr(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });

  setup.appendChild(
    section("Wi‑Fi para clientes", "Si no hay red de invitados, use «Sin QR de Wi‑Fi».", [
      el("label", {
        className: "field",
        children: [el("span", { text: "Nombre de la red (SSID)" }), ssid],
      }),
      el("label", {
        className: "field",
        children: [el("span", { text: "Seguridad" }), security],
      }),
      passField,
      showPassRow,
      el("div", { className: "row redqr-actions", children: [saveWifi, clearWifi] }),
    ]),
  );

  // —— Pestaña Tarjeta QR ——
  const hasCarta = Boolean(net.cartaUrl);
  const previewHost = el("div", { className: "qr-preview-wrap qr-preview-wrap--hero" });
  const layoutWarn = el("p", {
    className: "muted tiny redqr-layout-warn",
    attrs: { hidden: "true" },
  });

  const titleInput = el("input", {
    className: "input",
    attrs: { value: cardOpts.title, maxlength: "80" },
  }) as HTMLInputElement;
  const subEsInput = el("input", {
    className: "input",
    attrs: { value: cardOpts.subtitleEs, maxlength: "80" },
  }) as HTMLInputElement;
  const subEnInput = el("input", {
    className: "input",
    attrs: { value: cardOpts.subtitleEn, maxlength: "80" },
  }) as HTMLInputElement;
  const footerInput = el("input", {
    className: "input",
    attrs: { value: cardOpts.footer, maxlength: "100" },
  }) as HTMLInputElement;

  const layoutSelect = el("select", { className: "select" }) as HTMLSelectElement;
  for (const [v, label] of [
    ["auto", "Automático (Wi‑Fi si está configurado)"],
    ["carta", "Solo carta"],
    ["both", "Wi‑Fi + carta"],
  ] as const) {
    const opt = el("option", { text: label, attrs: { value: v } });
    if (cardOpts.layout === v) opt.selected = true;
    layoutSelect.appendChild(opt);
  }

  const styleSelect = el("select", { className: "select" }) as HTMLSelectElement;
  for (const [v, label] of [
    ["warm", "Cálido"],
    ["light", "Claro"],
    ["contrast", "Contraste"],
  ] as const) {
    const opt = el("option", { text: label, attrs: { value: v } });
    if (cardOpts.style === v) opt.selected = true;
    styleSelect.appendChild(opt);
  }

  const accentInput = el("input", {
    className: "input redqr-color",
    attrs: { type: "color", value: cardOpts.accent },
  }) as HTMLInputElement;
  const fgInput = el("input", {
    className: "input redqr-color",
    attrs: { type: "color", value: cardOpts.fg },
  }) as HTMLInputElement;

  const printBtn = el("button", {
    className: "btn btn--primary",
    text: "Imprimir tarjeta",
    attrs: { type: "button" },
  });
  const pngBtn = el("button", {
    className: "btn",
    text: "Descargar PNG",
    attrs: { type: "button" },
  });
  printBtn.disabled = !hasCarta;
  pngBtn.disabled = !hasCarta;

  let currentSheet: HTMLElement | null = null;

  const syncPrintRoot = () => {
    if (!currentSheet) return;
    let printHost = document.getElementById("qr-print-root");
    if (!printHost) {
      printHost = el("div", { attrs: { id: "qr-print-root" } });
      document.body.appendChild(printHost);
    }
    clear(printHost);
    printHost.appendChild(currentSheet.cloneNode(true) as HTMLElement);
  };

  const rebuildPreview = () => {
    const includeWifi = resolveIncludeWifi(cardOpts.layout, hasWifiCfg);
    const needWifiMissing = cardOpts.layout === "both" && !hasWifiCfg;
    layoutWarn.hidden = !needWifiMissing;
    if (needWifiMissing) {
      layoutWarn.textContent =
        "Layout «Wi‑Fi + carta» requiere SSID en la pestaña Red. Se muestra solo la carta.";
    }

    const wifiForSheet = includeWifi && hasWifiCfg ? wifi : null;
    clear(previewHost);
    currentSheet = buildPrintSheet({
      title: cardOpts.title || restaurant,
      subtitleEs: cardOpts.subtitleEs,
      subtitleEn: cardOpts.subtitleEn,
      footer: cardOpts.footer,
      cartaUrl: net.cartaUrl,
      wifi: wifiForSheet,
      showUrl: cardOpts.showUrl,
      showPassword: cardOpts.showWifiPassword,
      accent: cardOpts.accent,
      style: cardOpts.style,
      fg: cardOpts.fg,
      showLogo: cardOpts.showLogo,
      bust: cardOpts.bust,
    });
    previewHost.appendChild(currentSheet);
    syncPrintRoot();
  };

  const persistCard = debounce(() => {
    void (async () => {
      try {
        await api.put("/api/admin/settings", {
          "qr.title": cardOpts.title.trim(),
          "qr.subtitle_es": cardOpts.subtitleEs.trim(),
          "qr.subtitle_en": cardOpts.subtitleEn.trim(),
          "qr.footer": cardOpts.footer.trim(),
          "qr.show_url": cardOpts.showUrl,
          "qr.show_wifi_password": cardOpts.showWifiPassword,
          "qr.layout": cardOpts.layout,
          "qr.accent": cardOpts.accent,
          "qr.style": cardOpts.style,
          "qr.fg": cardOpts.fg,
          "qr.show_logo": cardOpts.showLogo,
        });
      } catch (err) {
        showToast(err instanceof Error ? err.message : "No se pudo guardar", "error");
      }
    })();
  }, 450);

  const onCardChange = (opts?: { bustQr?: boolean }) => {
    if (opts?.bustQr) cardOpts.bust = Date.now();
    rebuildPreview();
    persistCard();
  };

  titleInput.addEventListener("input", () => {
    cardOpts.title = titleInput.value;
    onCardChange();
  });
  subEsInput.addEventListener("input", () => {
    cardOpts.subtitleEs = subEsInput.value;
    onCardChange();
  });
  subEnInput.addEventListener("input", () => {
    cardOpts.subtitleEn = subEnInput.value;
    onCardChange();
  });
  footerInput.addEventListener("input", () => {
    cardOpts.footer = footerInput.value;
    onCardChange();
  });
  layoutSelect.addEventListener("change", () => {
    cardOpts.layout = layoutSelect.value as QrLayout;
    onCardChange();
  });
  styleSelect.addEventListener("change", () => {
    cardOpts.style = styleSelect.value as QrStyle;
    onCardChange();
  });
  accentInput.addEventListener("input", () => {
    cardOpts.accent = accentInput.value;
    onCardChange();
  });
  fgInput.addEventListener("input", () => {
    cardOpts.fg = fgInput.value;
    onCardChange({ bustQr: true });
  });

  const showUrlToggle = settingToggle({
    label: "Mostrar URL de la carta",
    checked: cardOpts.showUrl,
    onChange: (v) => {
      cardOpts.showUrl = v;
      onCardChange();
    },
  });
  const showPassToggle = settingToggle({
    label: "Mostrar contraseña Wi‑Fi",
    checked: cardOpts.showWifiPassword,
    onChange: (v) => {
      cardOpts.showWifiPassword = v;
      onCardChange();
    },
  });
  const logoToggle = settingToggle({
    label: "Logo en el centro del QR",
    checked: cardOpts.showLogo && Boolean(logoHash),
    disabled: !logoHash,
    onChange: (v) => {
      cardOpts.showLogo = v;
      onCardChange({ bustQr: true });
    },
  });

  const customize = section("Personalizar", "Los cambios se guardan solos.", [
    el("h3", { className: "ajustes-group__title", text: "Textos" }),
    el("label", {
      className: "field",
      children: [el("span", { text: "Título" }), titleInput],
    }),
    el("label", {
      className: "field",
      children: [el("span", { text: "Subtítulo (ES)" }), subEsInput],
    }),
    el("label", {
      className: "field",
      children: [el("span", { text: "Subtítulo (EN)" }), subEnInput],
    }),
    el("label", {
      className: "field",
      children: [el("span", { text: "Pie" }), footerInput],
    }),
    el("h3", { className: "ajustes-group__title", text: "Opciones" }),
    el("label", {
      className: "field",
      children: [el("span", { text: "Contenido de la tarjeta" }), layoutSelect],
    }),
    layoutWarn,
    showUrlToggle.root,
    showPassToggle.root,
    el("h3", { className: "ajustes-group__title", text: "Visual" }),
    el("label", {
      className: "field",
      children: [el("span", { text: "Estilo de tarjeta" }), styleSelect],
    }),
    el("div", {
      className: "redqr-colors",
      children: [
        el("label", {
          className: "field",
          children: [el("span", { text: "Color de acento" }), accentInput],
        }),
        el("label", {
          className: "field",
          children: [el("span", { text: "Color del QR" }), fgInput],
        }),
      ],
    }),
    logoToggle.root,
    logoHash
      ? el("p", {
          className: "muted tiny",
          text: "Usa el logo de la carta (mismo que en la bienvenida).",
        })
      : el("p", {
          className: "muted tiny",
          text: "No hay logo de carta cargado; active esta opción cuando exista.",
        }),
  ]);

  const previewCard = el("section", {
    className: "card stack redqr-section redqr-tarjeta",
    children: [
      el("div", {
        className: "redqr-tarjeta__head",
        children: [
          el("div", {
            className: "redqr-section__head",
            children: [
              el("h2", { className: "card__title", text: "Vista previa" }),
              el("p", {
                className: "muted tiny",
                text: "Imprima o descargue PNG para plastificar.",
              }),
            ],
          }),
          el("div", {
            className: "row redqr-tarjeta__toolbar",
            children: [
              el("div", { className: "row redqr-actions", children: [printBtn, pngBtn] }),
            ],
          }),
        ],
      }),
      previewHost,
    ],
  });

  panelTarjeta.append(
    el("div", { className: "redqr-tarjeta-grid", children: [customize, previewCard] }),
  );

  printBtn.addEventListener("click", () => {
    syncPrintRoot();
    document.body.classList.add("printing-qr");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-qr"), 500);
  });

  pngBtn.addEventListener("click", async () => {
    if (!currentSheet) return;
    try {
      pngBtn.setAttribute("disabled", "true");
      await downloadCardPng(currentSheet, {
        title: cardOpts.title || restaurant,
        subtitle: `${cardOpts.subtitleEs}${cardOpts.subtitleEn ? ` · ${cardOpts.subtitleEn}` : ""}`,
        footer: cardOpts.footer,
        accent: cardOpts.accent,
        style: cardOpts.style,
      });
      showToast("PNG descargado", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo generar PNG", "error");
    } finally {
      if (hasCarta) pngBtn.removeAttribute("disabled");
    }
  });

  rebuildPreview();
}

function buildPrintSheet(opts: {
  title: string;
  subtitleEs: string;
  subtitleEn: string;
  footer: string;
  cartaUrl: string | null;
  wifi: WifiState | null;
  showUrl: boolean;
  showPassword: boolean;
  accent: string;
  style: QrStyle;
  fg: string;
  showLogo: boolean;
  bust: number;
}): HTMLElement {
  const sheet = el("div", {
    className: `qr-sheet qr-sheet--${opts.style}`,
  });
  sheet.style.setProperty("--qr-accent", opts.accent);
  const qrOpts = { fg: opts.fg, showLogo: opts.showLogo, bust: opts.bust };

  sheet.appendChild(el("div", { className: "qr-sheet__brand", text: opts.title }));
  const tagParts = [opts.subtitleEs, opts.subtitleEn].filter((s) => s.trim());
  sheet.appendChild(
    el("p", {
      className: "qr-sheet__tag",
      text: tagParts.join(" · ") || " ",
    }),
  );

  const qrs = el("div", {
    className: opts.wifi ? "qr-sheet__qrs" : "qr-sheet__qrs qr-sheet__qrs--solo",
  });

  if (opts.wifi?.ssid) {
    const wifiBox = el("div", { className: "qr-sheet__block" });
    wifiBox.append(
      el("img", {
        className: "qr-sheet__img",
        attrs: {
          alt: "QR Wi‑Fi",
          src: qrImgSrc("wifi", qrOpts),
          width: "280",
          height: "280",
        },
      }),
      el("strong", { text: "1. Wi‑Fi" }),
      el("span", { text: "Conéctate a la red" }),
      el("span", { className: "qr-sheet__en", text: "Join the Wi‑Fi" }),
      el("span", { className: "qr-sheet__meta", text: `Red: ${opts.wifi.ssid}` }),
    );
    const passLine = el("span", {
      className: "qr-sheet__meta",
      attrs: { "data-wifi-pass": "1" },
      text:
        opts.wifi.security === "nopass"
          ? "Sin contraseña"
          : opts.showPassword && opts.wifi.password
            ? `Clave: ${opts.wifi.password}`
            : "Clave: ••••••••",
    });
    wifiBox.appendChild(passLine);
    qrs.appendChild(wifiBox);
  }

  const cartaBox = el("div", { className: "qr-sheet__block" });
  if (opts.cartaUrl) {
    cartaBox.appendChild(
      el("img", {
        className: "qr-sheet__img",
        attrs: {
          alt: "QR Carta",
          src: qrImgSrc("carta", qrOpts),
          width: "280",
          height: "280",
        },
      }),
    );
  }
  cartaBox.append(
    el("strong", { text: opts.wifi ? "2. Carta" : "Carta digital" }),
    el("span", { text: "Abre el menú" }),
    el("span", { className: "qr-sheet__en", text: "Open the menu" }),
  );
  if (opts.showUrl) {
    if (opts.cartaUrl) {
      cartaBox.appendChild(el("span", { className: "qr-sheet__meta", text: opts.cartaUrl }));
    } else {
      cartaBox.appendChild(
        el("span", { className: "qr-sheet__meta", text: "Configure la IP primero" }),
      );
    }
  }
  qrs.appendChild(cartaBox);

  sheet.appendChild(qrs);
  if (opts.footer.trim()) {
    sheet.appendChild(el("p", { className: "qr-sheet__foot", text: opts.footer }));
  }
  return sheet;
}

const STYLE_BG: Record<QrStyle, string> = {
  warm: "#fff8f5",
  light: "#ffffff",
  contrast: "#1e1b19",
};

async function downloadCardPng(
  sheet: HTMLElement,
  meta: { title: string; subtitle: string; footer: string; accent: string; style: QrStyle },
): Promise<void> {
  const blocks = [...sheet.querySelectorAll(".qr-sheet__block")];
  const imgs = blocks
    .map((b) => b.querySelector("img"))
    .filter((i): i is HTMLImageElement => Boolean(i?.getAttribute("src")));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve, reject) => {
          if (img.complete && img.naturalWidth) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("No se pudo cargar un QR"));
        }),
    ),
  );

  const scale = 2;
  const w = 900;
  const h = 640;
  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.scale(scale, scale);

  const bg = STYLE_BG[meta.style];
  const dark = meta.style === "contrast";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = meta.accent;
  ctx.fillRect(0, 0, w, 8);

  ctx.fillStyle = dark ? "#ffffff" : meta.accent;
  ctx.font = "bold 36px Segoe UI, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(meta.title, w / 2, 56);

  ctx.fillStyle = dark ? "#d4c3bf" : "#5c403c";
  ctx.font = "600 14px Segoe UI, system-ui, sans-serif";
  ctx.fillText(meta.subtitle || (imgs.length >= 2 ? "1. Wi‑Fi   ·   2. Carta" : ""), w / 2, 86);

  const metaFrom = (block: Element | undefined): string[] => {
    if (!block) return [];
    return [...block.querySelectorAll(".qr-sheet__meta")]
      .map((n) => n.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 3);
  };

  const drawQr = (img: HTMLImageElement, x: number, label: string, lines: string[]) => {
    const size = 260;
    ctx.fillStyle = dark ? "#2a2422" : "#ffffff";
    ctx.strokeStyle = dark ? "#4a3f3c" : "#e6bdb8";
    ctx.lineWidth = 2;
    roundRect(ctx, x - 20, 110, size + 40, 440, 16);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(img, x, 130, size, size);
    ctx.fillStyle = meta.accent;
    ctx.font = "bold 18px Segoe UI, system-ui, sans-serif";
    ctx.fillText(label, x + size / 2, 415);
    ctx.fillStyle = dark ? "#d4c3bf" : "#5c403c";
    ctx.font = "13px Segoe UI, system-ui, sans-serif";
    lines.forEach((line, i) => ctx.fillText(line, x + size / 2, 438 + i * 17));
  };

  const hasWifi = imgs.length >= 2;
  if (hasWifi) {
    drawQr(imgs[0]!, 100, "1. Wi‑Fi", metaFrom(blocks[0]));
    drawQr(imgs[1]!, 520, "2. Carta", metaFrom(blocks[1]));
  } else if (imgs[0]) {
    drawQr(imgs[0], (w - 260) / 2, "Carta digital", metaFrom(blocks[0]));
  }

  ctx.fillStyle = dark ? "#d4c3bf" : "#5c403c";
  ctx.font = "12px Segoe UI, system-ui, sans-serif";
  ctx.fillText(meta.footer || "Sin internet · Menú digital local", w / 2, h - 24);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("No se pudo crear PNG");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tarjeta-qr-${slug(meta.title)}.png`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "carta"
  );
}
