import { api, type NetworkState } from "../api";
import { clear, el } from "../dom";
import { showToast } from "../toast";

export async function renderRedQr(root: HTMLElement): Promise<void> {
  const [net, wifi] = await Promise.all([
    api.get<NetworkState>("/api/admin/network"),
    api.get<{
      ssid: string | null;
      password: string | null;
      security: string;
      hidden: boolean;
    }>("/api/admin/wifi"),
  ]);

  clear(root);
  const wrap = el("div", { className: "grid grid--2" });

  const netCard = el("section", { className: "card stack" });
  netCard.appendChild(el("h2", { className: "card__title", text: "Red local" }));
  netCard.appendChild(
    el("p", {
      className: "muted tiny",
      text: net.cartaUrl ? `URL carta: ${net.cartaUrl}` : "Sin IP detectada",
    }),
  );

  const ipSelect = el("select", { className: "select" }) as HTMLSelectElement;
  for (const c of net.candidates) {
    const opt = el("option", {
      text: `${c.address} (${c.interface})${c.recommended ? " · recomendada" : ""}`,
      attrs: { value: c.address },
    });
    if ((net.savedIp ?? net.candidates.find((x) => x.recommended)?.address) === c.address) {
      opt.selected = true;
    }
    ipSelect.appendChild(opt);
  }
  const saveIp = el("button", {
    className: "btn btn--primary",
    text: "Usar esta IP",
    attrs: { type: "button" },
  });
  saveIp.addEventListener("click", async () => {
    try {
      await api.put("/api/admin/network", { cartaIp: ipSelect.value });
      showToast("IP guardada", "success");
      await renderRedQr(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });
  netCard.append(
    el("label", { className: "field", children: [el("span", { text: "IP de la carta" }), ipSelect] }),
    saveIp,
  );
  if (net.ipChanged) {
    netCard.appendChild(
      el("p", {
        className: "chip chip--warn",
        text: `Cambió de ${net.previousIp} a ${net.currentIp}`,
      }),
    );
  }
  wrap.appendChild(netCard);

  const wifiCard = el("section", { className: "card stack" });
  wifiCard.appendChild(el("h2", { className: "card__title", text: "Wi‑Fi del restaurante" }));
  const ssid = el("input", {
    className: "input",
    attrs: { value: wifi.ssid ?? "", maxlength: "32" },
  }) as HTMLInputElement;
  const password = el("input", {
    className: "input",
    attrs: { type: "password", value: wifi.password ?? "", maxlength: "63" },
  }) as HTMLInputElement;
  const security = el("select", { className: "select" }) as HTMLSelectElement;
  for (const s of ["WPA", "WEP", "nopass"]) {
    const opt = el("option", { text: s, attrs: { value: s } });
    if ((wifi.security || "WPA") === s) opt.selected = true;
    security.appendChild(opt);
  }
  const saveWifi = el("button", {
    className: "btn btn--primary",
    text: "Guardar Wi‑Fi",
    attrs: { type: "button" },
  });
  saveWifi.addEventListener("click", async () => {
    try {
      await api.put("/api/admin/wifi", {
        ssid: ssid.value.trim(),
        password: password.value,
        security: security.value,
        hidden: false,
      });
      showToast("Wi‑Fi guardado", "success");
      await renderRedQr(root);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Error", "error");
    }
  });
  wifiCard.append(
    el("label", { className: "field", children: [el("span", { text: "SSID" }), ssid] }),
    el("label", { className: "field", children: [el("span", { text: "Contraseña" }), password] }),
    el("label", { className: "field", children: [el("span", { text: "Seguridad" }), security] }),
    saveWifi,
  );
  wrap.appendChild(wifiCard);

  const qrCard = el("section", { className: "card stack" });
  qrCard.style.gridColumn = "1 / -1";
  qrCard.appendChild(el("h2", { className: "card__title", text: "Códigos QR" }));
  const row = el("div", { className: "row" });
  const wifiImg = el("img", {
    attrs: { alt: "QR Wi‑Fi", src: "/api/admin/qr/wifi.svg?size=220", width: "220", height: "220" },
  });
  const cartaImg = el("img", {
    attrs: { alt: "QR Carta", src: "/api/admin/qr/carta.svg?size=220", width: "220", height: "220" },
  });
  wifiImg.addEventListener("error", () => {
    wifiImg.replaceWith(el("p", { className: "muted", text: "Configure el Wi‑Fi para ver el QR." }));
  });
  row.append(
    el("div", {
      className: "stack",
      children: [el("strong", { text: "Unirse al Wi‑Fi" }), wifiImg],
    }),
    el("div", {
      className: "stack",
      children: [el("strong", { text: "Abrir la carta" }), cartaImg],
    }),
  );
  qrCard.appendChild(row);
  qrCard.appendChild(
    el("p", {
      className: "muted tiny",
      text: "Imprima ambos QR en una tarjeta para los clientes de Avanzar In Time.",
    }),
  );
  wrap.appendChild(qrCard);

  root.appendChild(wrap);
}
