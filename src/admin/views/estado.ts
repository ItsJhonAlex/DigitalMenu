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

function metric(label: string, value: string, opts?: { warn?: boolean }): HTMLElement {
  return el("div", {
    className: `estado-metric${opts?.warn ? " estado-metric--warn" : ""}`,
    children: [
      el("span", { className: "estado-metric__label", text: label }),
      el("span", { className: "estado-metric__value", text: value }),
    ],
  });
}

export async function renderEstado(root: HTMLElement): Promise<void> {
  clear(root);
  const wrap = el("div", { className: "stack" });
  root.appendChild(wrap);

  const backupWarn = el("div", {
    className: "banner",
    attrs: { hidden: "true" },
  });
  wrap.appendChild(backupWarn);

  const head = el("div", { className: "row row--between" });
  head.append(
    el("p", {
      className: "muted",
      text: "Se actualiza sola cada 5 s. Los móviles conectados son las cartas abiertas (SSE).",
    }),
  );
  const updated = el("span", { className: "muted tiny", text: "…" });
  head.appendChild(updated);
  wrap.appendChild(head);

  const grid = el("div", { className: "estado-grid" });
  wrap.appendChild(grid);

  const alertsCard = el("section", { className: "card stack" });
  alertsCard.appendChild(el("h2", { className: "card__title", text: "Últimos avisos" }));
  const alertsBody = el("div", { className: "estado-log" });
  alertsCard.appendChild(alertsBody);
  wrap.appendChild(alertsCard);

  const logCard = el("section", { className: "card stack" });
  logCard.append(
    el("div", {
      className: "row row--between",
      children: [
        el("h2", { className: "card__title", text: "Log reciente" }),
        el("button", {
          className: "btn btn--ghost btn--sm",
          text: "Copiar diagnóstico",
          attrs: { type: "button", id: "btn-copy-diag" },
        }),
      ],
    }),
  );
  const logBody = el("pre", { className: "estado-log estado-log--raw" });
  logCard.appendChild(logBody);
  wrap.appendChild(logCard);

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastDto: DiagnosticsDto | null = null;

  const paint = (d: DiagnosticsDto) => {
    lastDto = d;
    clear(grid);
    const ipWarn = d.network.ipChanged;
    const ipText = d.network.ipChanged
      ? `${d.network.savedIp ?? "?"} → ${d.network.currentIp ?? "?"} (cambió)`
      : (d.network.savedIp ?? d.network.currentIp ?? "—");

    grid.append(
      metric("Móviles conectados", `${d.menuEvents.clients} / ${d.menuEvents.maxClients}`),
      metric("Memoria (RSS)", `${d.memory.rssMB} MB`),
      metric("Tiempo encendida", formatUptime(d.uptimeSec)),
      metric("IP", ipText, { warn: ipWarn }),
      metric("Puerto", String(d.port)),
      metric("URL carta", d.network.cartaUrl ?? "—"),
      metric(
        "Última copia",
        d.lastBackup
          ? `${d.lastBackup.file} (${formatBytes(d.lastBackup.bytes)})`
          : d.lastAutoAt
            ? `Auto ${new Date(d.lastAutoAt).toLocaleString()}`
            : "Ninguna",
      ),
      metric("Base de datos", formatBytes(d.dbBytes)),
      metric("Imágenes", formatBytes(d.imagesBytes)),
      metric("Versión", `v${d.version} · esquema ${d.schemaVersion}`),
      metric("Datos", d.dataDir),
      metric(
        "Revisión carta",
        d.menuEvents.lastRevision != null ? String(d.menuEvents.lastRevision) : "—",
      ),
    );

    clear(alertsBody);
    if (d.logAlerts.length === 0) {
      alertsBody.appendChild(
        el("p", { className: "muted", text: "Sin avisos WARN/ERROR recientes." }),
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
            ? "Fallo en una copia de seguridad reciente. Revise el log y la sección Copias."
            : "Aún no hay copias de seguridad. Cree una en la sección Copias abajo.",
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

  const copyBtn = logCard.querySelector("#btn-copy-diag") as HTMLButtonElement;
  copyBtn.addEventListener("click", async () => {
    if (!lastDto) return;
    const text = JSON.stringify(lastDto, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Diagnóstico copiado", "success");
    } catch {
      showToast("No se pudo copiar", "error");
    }
  });

  await tick();
  timer = setInterval(() => void tick(), REFRESH_MS);

  const copiasMount = el("div", { className: "stack" });
  wrap.appendChild(copiasMount);
  void renderCopias(copiasMount);

  // Detener al salir de la vista (si el root se vacía / navega)
  const obs = new MutationObserver(() => {
    if (!root.contains(wrap)) {
      stopped = true;
      if (timer) clearInterval(timer);
      obs.disconnect();
    }
  });
  obs.observe(root, { childList: true });
}
