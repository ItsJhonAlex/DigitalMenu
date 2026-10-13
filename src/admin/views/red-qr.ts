import { type NetworkState, api } from "../api";
import { BRAND } from "../brand";
import { clear, el } from "../dom";
import { showToast } from "../toast";

type WifiState = {
  ssid: string | null;
  password: string | null;
  security: string;
  hidden: boolean;
};

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

  clear(root);
  const page = el("div", { className: "redqr stack" });

  // —— Red ——
  const netCard = el("section", { className: "card stack" });
  netCard.append(
    el("h2", { className: "card__title", text: "Red local (POS → carta)" }),
    el("p", {
      className: "muted",
      text: net.cartaUrl
        ? `Los clientes abrirán: ${net.cartaUrl}`
        : "No hay IP detectada. Conecte el POS a la LAN del restaurante.",
    }),
  );

  const ipSelect = el("select", { className: "select" }) as HTMLSelectElement;
  if (net.candidates.length === 0) {
    ipSelect.appendChild(el("option", { text: "Sin adaptadores LAN", attrs: { value: "" } }));
    ipSelect.disabled = true;
  } else {
    for (const c of net.candidates) {
      const opt = el("option", {
        text: `${c.address} · ${c.interface}${c.recommended ? " (recomendada)" : ""}`,
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
    text: "Usar esta IP para el QR",
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
  netCard.append(
    el("label", {
      className: "field",
      children: [el("span", { text: "IP del POS en la carta" }), ipSelect],
    }),
    saveIp,
  );
  if (net.ipChanged) {
    netCard.appendChild(
      el("p", {
        className: "chip chip--warn",
        text: `La IP cambió (${net.previousIp} → ${net.currentIp}). Los QR impresos dejan de funcionar hasta reimprimir.`,
      }),
    );
  }
  page.appendChild(netCard);

  // —— Wi‑Fi ——
  const wifiCard = el("section", { className: "card stack" });
  wifiCard.append(
    el("h2", { className: "card__title", text: "Wi‑Fi para clientes" }),
    el("p", {
      className: "muted",
      text: "Si hay red de invitados, configure SSID y clave. Si la red es abierta (sin clave), elija seguridad «nopass». Si no hay Wi‑Fi de clientes, deje el SSID vacío: la tarjeta solo llevará el QR de la carta.",
    }),
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
    text: "Sin QR de Wi‑Fi (solo carta)",
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

  wifiCard.append(
    el("label", {
      className: "field",
      children: [el("span", { text: "Nombre de la red (SSID)" }), ssid],
    }),
    el("label", { className: "field", children: [el("span", { text: "Seguridad" }), security] }),
    passField,
    showPassRow,
    el("div", { className: "row", children: [saveWifi, clearWifi] }),
    el("p", {
      className: "muted tiny",
      text: "¿Sin Wi‑Fi de invitados? Use «Sin QR de Wi‑Fi»: los clientes deben estar ya en la red del local (p. ej. cable/otra red) y solo escanean el QR de la carta.",
    }),
  );
  page.appendChild(wifiCard);

  const hasWifi = Boolean(wifi.ssid && String(wifi.ssid).trim());
  const hasCarta = Boolean(net.cartaUrl);
  const showPassOnCard = el("input", {
    className: "toggle",
    attrs: { type: "checkbox", checked: "" },
  }) as HTMLInputElement;

  // —— Tarjeta ——
  const cardSection = el("section", { className: "card stack" });
  cardSection.append(
    el("h2", { className: "card__title", text: "Tarjeta para imprimir y plastificar" }),
    el("p", {
      className: "muted",
      text: hasWifi
        ? "Vista previa con los 2 QR. Imprima o descargue PNG para llevar a la imprenta / plastificar."
        : "Solo QR de la carta (no hay Wi‑Fi configurado). Puede añadir Wi‑Fi arriba si lo necesita.",
    }),
  );

  if (hasWifi) {
    cardSection.appendChild(
      el("label", {
        className: "row",
        children: [showPassOnCard, el("span", { text: "Mostrar contraseña Wi‑Fi en la tarjeta" })],
      }),
    );
  }

  const sheet = buildPrintSheet({
    restaurant,
    cartaUrl: net.cartaUrl,
    wifi: hasWifi ? wifi : null,
    showPassword: true,
  });
  const previewWrap = el("div", { className: "qr-preview-wrap", children: [sheet] });
  cardSection.appendChild(previewWrap);

  const printBtn = el("button", {
    className: "btn btn--primary",
    text: "Imprimir tarjeta",
    attrs: { type: "button" },
  });
  const pngBtn = el("button", {
    className: "btn",
    text: "Descargar PNG (plastificar)",
    attrs: { type: "button" },
  });
  printBtn.disabled = !hasCarta;
  pngBtn.disabled = !hasCarta;

  const syncSheetPass = () => {
    const passEl = sheet.querySelector("[data-wifi-pass]") as HTMLElement | null;
    if (!passEl || !wifi.password) return;
    passEl.textContent = showPassOnCard.checked ? `Clave: ${wifi.password}` : "Clave: ••••••••";
  };
  const syncPrintRoot = () => {
    let printHost = document.getElementById("qr-print-root");
    if (!printHost) {
      printHost = el("div", { attrs: { id: "qr-print-root" } });
      document.body.appendChild(printHost);
    }
    clear(printHost);
    printHost.appendChild(sheet.cloneNode(true) as HTMLElement);
  };
  syncSheetPass();
  syncPrintRoot();
  if (hasWifi) {
    showPassOnCard.addEventListener("change", () => {
      syncSheetPass();
      syncPrintRoot();
    });
  }

  printBtn.addEventListener("click", () => {
    syncPrintRoot();
    document.body.classList.add("printing-qr");
    window.print();
    window.setTimeout(() => document.body.classList.remove("printing-qr"), 500);
  });

  pngBtn.addEventListener("click", async () => {
    try {
      pngBtn.setAttribute("disabled", "true");
      await downloadCardPng(sheet, restaurant);
      showToast("PNG descargado", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo generar PNG", "error");
    } finally {
      if (hasCarta) pngBtn.removeAttribute("disabled");
    }
  });

  cardSection.appendChild(el("div", { className: "row", children: [printBtn, pngBtn] }));
  page.appendChild(cardSection);
  root.appendChild(page);
}

function buildPrintSheet(opts: {
  restaurant: string;
  cartaUrl: string | null;
  wifi: WifiState | null;
  showPassword: boolean;
}): HTMLElement {
  const sheet = el("div", { className: "qr-sheet" });
  sheet.appendChild(el("div", { className: "qr-sheet__brand", text: opts.restaurant }));
  sheet.appendChild(
    el("p", {
      className: "qr-sheet__tag",
      text: opts.wifi
        ? "Escanea en orden · Scan in order"
        : "Escanea para ver la carta · Scan for the menu",
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
          src: `/api/admin/qr/wifi.svg?size=280&t=${Date.now()}`,
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
          src: `/api/admin/qr/carta.svg?size=280&t=${Date.now()}`,
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
  if (opts.cartaUrl) {
    cartaBox.appendChild(el("span", { className: "qr-sheet__meta", text: opts.cartaUrl }));
  } else {
    cartaBox.appendChild(
      el("span", { className: "qr-sheet__meta", text: "Configure la IP primero" }),
    );
  }
  qrs.appendChild(cartaBox);

  sheet.appendChild(qrs);
  sheet.appendChild(
    el("p", {
      className: "qr-sheet__foot",
      text: "Sin internet · Menú digital local",
    }),
  );
  return sheet;
}

async function downloadCardPng(sheet: HTMLElement, restaurant: string): Promise<void> {
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

  ctx.fillStyle = "#fff8f5";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#b70011";
  ctx.fillRect(0, 0, w, 8);

  ctx.fillStyle = "#1e1b19";
  ctx.font = "bold 36px Segoe UI, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(restaurant, w / 2, 56);

  ctx.fillStyle = "#5c403c";
  ctx.font = "600 14px Segoe UI, system-ui, sans-serif";
  const hasWifi = imgs.length >= 2;
  ctx.fillText(hasWifi ? "1. Wi‑Fi   ·   2. Carta" : "Escanea para abrir la carta", w / 2, 86);

  const metaFrom = (block: Element | undefined): string[] => {
    if (!block) return [];
    return [...block.querySelectorAll(".qr-sheet__meta")]
      .map((n) => n.textContent?.trim() ?? "")
      .filter(Boolean)
      .slice(0, 3);
  };

  const drawQr = (img: HTMLImageElement, x: number, label: string, meta: string[]) => {
    const size = 260;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e6bdb8";
    ctx.lineWidth = 2;
    roundRect(ctx, x - 20, 110, size + 40, 440, 16);
    ctx.fill();
    ctx.stroke();
    ctx.drawImage(img, x, 130, size, size);
    ctx.fillStyle = "#b70011";
    ctx.font = "bold 18px Segoe UI, system-ui, sans-serif";
    ctx.fillText(label, x + size / 2, 415);
    ctx.fillStyle = "#5c403c";
    ctx.font = "13px Segoe UI, system-ui, sans-serif";
    meta.forEach((line, i) => ctx.fillText(line, x + size / 2, 438 + i * 17));
  };

  if (hasWifi) {
    drawQr(imgs[0]!, 100, "1. Wi‑Fi", metaFrom(blocks[0]));
    drawQr(imgs[1]!, 520, "2. Carta", metaFrom(blocks[1]));
  } else if (imgs[0]) {
    drawQr(imgs[0], (w - 260) / 2, "Carta digital", metaFrom(blocks[0]));
  }

  ctx.fillStyle = "#5c403c";
  ctx.font = "12px Segoe UI, system-ui, sans-serif";
  ctx.fillText("Sin internet · Menú digital local", w / 2, h - 24);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("No se pudo crear PNG");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `tarjeta-qr-${slug(restaurant)}.png`;
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
