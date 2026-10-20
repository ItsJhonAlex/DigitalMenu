/**
 * Pantalla de estado en vivo (M4 / RF-55): SSE, RAM, uptime, IP, copias, logs.
 */
import { api } from "../api";
import { clear, el } from "../dom";
import { showToast } from "../toast";
import { renderCopias } from "./copias";

export type DiagnosticsDto = {
  version: string;
  bunVersion: string;
  dataDir: string;
  port: number;
  uptimeSec: number;
  memory: { rssMB: number };
  menuEvents: { clients: number; maxClients: number; lastRevision: number | null };
  network: {
    savedIp: string | null;
    currentIp: string | null;
    ipChanged: boolean;
    cartaUrl: string | null;
    checkedAt: string;
  };
  lastBackup: { file: string; bytes: number; createdAt: string } | null;
  lastAutoAt: string | null;
  dbBytes: number;
  imagesBytes: number;
  schemaVersion: number;
  logTail: string[];
  logAlerts: string[];
  checkedAt: string;
};

const REFRESH_MS = 5_000;

const TAB_LABELS = ["General", "Carta", "Diagnóstico", "Copias"] as const;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

async function copyText(text: string, okMsg: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(okMsg, "success");
  } catch {
    showToast("No se pudo copiar", "error");
  }
}

function kpi(label: string, valueNode: Node, opts?: { warn?: boolean }): HTMLElement {
  return el("div", {
    className: `estado-kpi${opts?.warn ? " estado-kpi--warn" : ""}`,
    children: [
      el("span", { className: "estado-kpi__label", text: label }),
      el("div", { className: "estado-kpi__value", children: [valueNode] }),
    ],
  });
}

function dlRow(label: string, value: Node | string): HTMLElement {
  const valueEl =
    typeof value === "string"
      ? el("span", { className: "estado-dl__value", text: value })
      : el("div", { className: "estado-dl__value", children: [value] });
  return el("div", {
    className: "estado-dl__row",
    children: [el("span", { className: "estado-dl__label", text: label }), valueEl],
  });
}

function section(title: string, hint: string | null, children: HTMLElement[]): HTMLElement {
  const headKids: HTMLElement[] = [el("h2", { className: "card__title", text: title })];
  if (hint) headKids.push(el("p", { className: "muted tiny", text: hint }));
  return el("section", {
    className: "card stack estado-section",
    children: [el("div", { className: "estado-section__head", children: headKids }), ...children],
  });
}

export async function renderEstado(root: HTMLElement): Promise<void> {
  clear(root);
  const wrap = el("div", { className: "stack estado-page" });
  root.appendChild(wrap);

  const backupWarn = el("div", {
    className: "banner banner--compact",
    attrs: { hidden: "true" },
  });
  wrap.appendChild(backupWarn);

  const updated = el("span", { className: "muted tiny", text: "…" });
  const copyDiagBtn = el("button", {
    className: "btn btn--ghost btn--sm",
    text: "Copiar diagnóstico",
    attrs: { type: "button" },
  });

  const tabs = el("div", { className: "tabs", attrs: { role: "tablist" } });
  const panels = el("div", { className: "estado-tab-panels stack" });

  wrap.append(
    el("div", {
      className: "row row--between estado-toolbar",
      children: [
        tabs,
        el("div", {
          className: "row estado-toolbar__meta",
          children: [updated, copyDiagBtn],
        }),
      ],
    }),
    panels,
  );

  const panelGeneral = el("div", {
    className: "stack estado-panel",
    attrs: { role: "tabpanel" },
  });
  const panelCarta = el("div", {
    className: "stack estado-panel",
    attrs: { role: "tabpanel", hidden: "true" },
  });
  const panelDiag = el("div", {
    className: "stack estado-panel",
    attrs: { role: "tabpanel", hidden: "true" },
  });
  const panelCopias = el("div", {
    className: "stack estado-panel",
    attrs: { role: "tabpanel", hidden: "true" },
  });
  panels.append(panelGeneral, panelCarta, panelDiag, panelCopias);

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

  const kpis = el("div", { className: "estado-kpis" });
  const storageBody = el("div", { className: "estado-dl" });
  panelGeneral.append(
    kpis,
    section("Almacenamiento y app", "Tamaño de datos, versión y ruta de trabajo.", [storageBody]),
  );

  const cartaNetBody = el("div", { className: "estado-dl" });
  panelCarta.append(
    section("Carta y red", "URL pública, puerto y revisión SSE de la carta.", [cartaNetBody]),
  );

  const alertsBody = el("div", { className: "estado-alerts" });
  const logBody = el("pre", { className: "estado-log estado-log--raw" });
  const logFold = el("details", {
    className: "fold estado-log-fold",
    children: [
      el("summary", { text: "Log reciente" }),
      el("div", { className: "estado-log-fold__body", children: [logBody] }),
    ],
  });
  panelDiag.append(
    section("Avisos", "WARN y ERROR recientes del servidor.", [alertsBody]),
    section("Registro", "Últimas líneas del log de la aplicación.", [logFold]),
  );

  const copiasMount = el("div", { className: "stack" });
  panelCopias.appendChild(copiasMount);

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastDto: DiagnosticsDto | null = null;

  const paint = (d: DiagnosticsDto) => {
    lastDto = d;
    const ipWarn = d.network.ipChanged;
    const ipLabel = d.network.savedIp ?? d.network.currentIp ?? "—";
    const ipNode = el("span", {
      className: `chip ${ipWarn ? "chip--warn" : "chip--ok"}`,
      text: ipWarn ? `${d.network.savedIp ?? "?"} → ${d.network.currentIp ?? "?"}` : ipLabel,
    });

    clear(kpis);
    kpis.append(
      kpi(
        "Móviles conectados",
        document.createTextNode(`${d.menuEvents.clients} / ${d.menuEvents.maxClients}`),
      ),
      kpi("Memoria (RSS)", document.createTextNode(`${d.memory.rssMB} MB`)),
      kpi("Tiempo encendida", document.createTextNode(formatUptime(d.uptimeSec))),
      kpi("IP", ipNode, { warn: ipWarn }),
    );

    clear(cartaNetBody);
    const urlText = d.network.cartaUrl ?? "—";
    const urlRow = el("div", { className: "row estado-url-row" });
    urlRow.appendChild(el("code", { className: "estado-mono", text: urlText }));
    if (d.network.cartaUrl) {
      const copyUrl = el("button", {
        className: "btn btn--ghost btn--sm",
        text: "Copiar",
        attrs: { type: "button" },
      });
      copyUrl.addEventListener("click", () => void copyText(d.network.cartaUrl!, "URL copiada"));
      urlRow.appendChild(copyUrl);
    }
    cartaNetBody.append(
      dlRow("URL carta", urlRow),
      dlRow("Puerto", String(d.port)),
      dlRow(
        "Revisión carta",
        d.menuEvents.lastRevision != null ? String(d.menuEvents.lastRevision) : "—",
      ),
      dlRow(
        "Red comprobada",
        d.network.checkedAt ? new Date(d.network.checkedAt).toLocaleString() : "—",
      ),
    );

    clear(storageBody);
    const backupText = d.lastBackup
      ? `${d.lastBackup.file} (${formatBytes(d.lastBackup.bytes)})`
      : d.lastAutoAt
        ? `Auto ${new Date(d.lastAutoAt).toLocaleString()}`
        : "Ninguna";
    storageBody.append(
      dlRow("Última copia", backupText),
      dlRow("Base de datos", formatBytes(d.dbBytes)),
      dlRow("Imágenes", formatBytes(d.imagesBytes)),
      dlRow("Versión", `v${d.version} · esquema ${d.schemaVersion}`),
      dlRow("Datos", el("code", { className: "estado-mono", text: d.dataDir })),
    );

    clear(alertsBody);
    if (d.logAlerts.length === 0) {
      alertsBody.appendChild(
        el("p", { className: "muted tiny", text: "Sin avisos WARN/ERROR recientes." }),
      );
    } else {
      for (const line of d.logAlerts.slice().reverse()) {
        const isErr = /\[ERROR\]/i.test(line);
        alertsBody.appendChild(
          el("div", {
            className: `estado-alert${isErr ? " estado-alert--error" : ""}`,
            text: line,
          }),
        );
      }
    }

    logBody.textContent = d.logTail.slice(-80).join("\n") || "(vacío)";
    updated.textContent = `Actualizado ${new Date(d.checkedAt).toLocaleTimeString()}`;

    const backupFail = d.logAlerts.some(
      (line) => /backup|copia/i.test(line) && /\[ERROR\]|\[WARN\]/i.test(line),
    );
    const noBackup = !d.lastBackup && !d.lastAutoAt;
    if (backupFail || noBackup) {
      backupWarn.hidden = false;
      clear(backupWarn);
      backupWarn.appendChild(
        el("strong", {
          text: backupFail
            ? "Fallo en una copia de seguridad reciente. Revise el log y la pestaña Copias."
            : "Aún no hay copias de seguridad. Cree una en la pestaña Copias.",
        }),
      );
    } else {
      backupWarn.hidden = true;
    }
  };

  const tick = async () => {
    if (stopped) return;
    try {
      const d = await api.get<DiagnosticsDto>("/api/admin/diagnostics");
      paint(d);
    } catch (err) {
      updated.textContent = err instanceof Error ? err.message : "Error al cargar";
    }
  };

  copyDiagBtn.addEventListener("click", () => {
    if (!lastDto) return;
    void copyText(JSON.stringify(lastDto, null, 2), "Diagnóstico copiado");
  });

  await tick();
  timer = setInterval(() => void tick(), REFRESH_MS);

  void renderCopias(copiasMount);

  const obs = new MutationObserver(() => {
    if (!root.contains(wrap)) {
      stopped = true;
      if (timer) clearInterval(timer);
      obs.disconnect();
    }
  });
  obs.observe(root, { childList: true });
}
