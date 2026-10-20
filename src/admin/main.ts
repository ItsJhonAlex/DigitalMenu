import { type NetworkState, api } from "./api";
import { BRAND } from "./brand";
import { clearDirty, confirmLeave, isDirty, setConfirmLeave, setLeaveHandler } from "./dirty";
import { clear, el } from "./dom";
import { openConfirm } from "./modal";
import { clearShortcutHandlers, installShortcuts, setShortcutHandlers } from "./shortcuts";
import { showToast } from "./toast";
import { renderAjustes } from "./views/ajustes";
import { renderCategorias } from "./views/categorias";
import { renderEstado } from "./views/estado";
import { renderIdiomas } from "./views/idiomas";
import { renderInicio } from "./views/inicio";
import { renderMonedas } from "./views/monedas";
import { renderOfertas } from "./views/ofertas";
import { renderProductos } from "./views/productos";
import { renderRedQr } from "./views/red-qr";

type Route = {
  id: string;
  path: string;
  label: string;
  icon: string;
  title: string;
  sub: string;
  render: (root: HTMLElement) => void | Promise<void>;
};

const routes: Route[] = [
  {
    id: "inicio",
    path: "/",
    label: "Inicio",
    icon: "⌂",
    title: "Inicio",
    sub: "Panel rápido del día",
    render: renderInicio,
  },
  {
    id: "categorias",
    path: "/categorias",
    label: "Categorías",
    icon: "▦",
    title: "Categorías",
    sub: "Orden y visibilidad en la carta",
    render: renderCategorias,
  },
  {
    id: "productos",
    path: "/productos",
    label: "Productos",
    icon: "☰",
    title: "Productos",
    sub: "Precios, fotos y disponibilidad",
    render: renderProductos,
  },
  {
    id: "ofertas",
    path: "/ofertas",
    label: "Ofertas",
    icon: "%",
    title: "Ofertas y combos",
    sub: "Promociones, paquetes y activo en carta",
    render: renderOfertas,
  },
  {
    id: "monedas",
    path: "/monedas",
    label: "Monedas",
    icon: "$",
    title: "Monedas y cambio",
    sub: "Tasa del día y moneda base",
    render: renderMonedas,
  },
  {
    id: "idiomas",
    path: "/idiomas",
    label: "Idiomas",
    icon: "A",
    title: "Idiomas",
    sub: "Traducciones de la carta",
    render: renderIdiomas,
  },
  {
    id: "red",
    path: "/red",
    label: "Red y QR",
    icon: "▣",
    title: "Red y QR",
    sub: "Wi‑Fi, IP y tarjeta imprimible",
    render: renderRedQr,
  },
  {
    id: "estado",
    path: "/estado",
    label: "Estado",
    icon: "◉",
    title: "Estado del sistema",
    sub: "Móviles, memoria, IP, copias y avisos",
    render: renderEstado,
  },
  {
    id: "ajustes",
    path: "/ajustes",
    label: "Ajustes",
    icon: "⚙",
    title: "Ajustes",
    sub: `Datos de ${BRAND}`,
    render: renderAjustes,
  },
];

/** Path sin query (`/productos` desde `/productos?untranslated=en`). */
export function currentPath(): string {
  const raw = location.hash.replace(/^#/, "") || "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.split("?")[0] || "/";
}

export function currentHashQuery(): URLSearchParams {
  const raw = location.hash.replace(/^#/, "") || "/";
  const q = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
  return new URLSearchParams(q);
}

function findRoute(path: string): Route {
  if (path === "/productos" || path.startsWith("/productos/")) {
    return routes.find((r) => r.path === "/productos")!;
  }
  if (path === "/ofertas" || path.startsWith("/ofertas/")) {
    return routes.find((r) => r.path === "/ofertas")!;
  }
  return routes.find((r) => r.path === path) ?? routes[0]!;
}

function buildNav(): void {
  const nav = document.getElementById("nav");
  if (!nav) return;
  clear(nav);
  const path = currentPath();
  for (const r of routes) {
    const active =
      r.path === "/productos"
        ? path === "/productos" || path.startsWith("/productos/")
        : r.path === "/ofertas"
          ? path === "/ofertas" || path.startsWith("/ofertas/")
          : r.path === path;
    const attrs: Record<string, string> = { href: `#${r.path}` };
    if (active) attrs["aria-current"] = "page";
    const a = el("a", {
      className: `nav-link${active ? " is-active" : ""}`,
      attrs,
      children: [
        el("span", { className: "nav-link__icon", text: r.icon }),
        el("span", { text: r.label }),
      ],
    });
    nav.appendChild(a);
  }
}

async function refreshNetworkChrome(): Promise<void> {
  try {
    const net = await api.get<NetworkState>("/api/admin/network");
    const chip = document.getElementById("net-chip");
    const sidebarIp = document.getElementById("sidebar-ip");
    const banner = document.getElementById("banner") as HTMLElement | null;
    const ip = net.savedIp ?? net.candidates.find((c) => c.recommended)?.address ?? "—";
    if (chip) {
      chip.textContent = net.ipChanged ? `IP cambiada · ${net.currentIp ?? ip}` : `IP ${ip}`;
      chip.className = `chip ${net.ipChanged ? "chip--warn" : "chip--ok"}`;
    }
    if (sidebarIp) sidebarIp.textContent = `IP: ${ip}`;
    const carta = document.getElementById("btn-carta") as HTMLAnchorElement | null;
    if (carta && net.cartaUrl) carta.href = net.cartaUrl;

    if (banner) {
      if (net.ipChanged) {
        banner.hidden = false;
        clear(banner);
        const from = net.previousIp ?? net.savedIp ?? "?";
        const to = net.currentIp ?? "?";
        banner.append(
          el("strong", { text: "Cambio de IP. " }),
          document.createTextNode(
            `La IP del equipo cambió de ${from} a ${to}. Los QR impresos ya no funcionan. Configure la reserva de IP en el router o reimprima los QR. `,
          ),
          el("a", {
            className: "banner__action",
            text: "Usar nueva IP y reimprimir QR",
            attrs: { href: "#/red" },
          }),
        );
      } else {
        banner.hidden = true;
      }
    }
  } catch {
    // silencioso en chrome
  }
}

let rendering = false;
let pendingHash: string | null = null;

async function render(): Promise<void> {
  if (rendering) return;
  rendering = true;
  clearShortcutHandlers();
  setLeaveHandler(null);

  const path = currentPath();
  const route = findRoute(path);
  buildNav();
  const title = document.getElementById("page-title");
  const sub = document.getElementById("page-sub");
  const editingProduct = /^\/productos\/editar\/\d+/.test(path);
  const editingOffer = /^\/ofertas\/editar\/\d+/.test(path);
  if (title) {
    title.textContent = editingProduct
      ? "Editar producto"
      : editingOffer
        ? "Editar oferta / combo"
        : route.title;
  }
  if (sub) {
    sub.textContent = editingProduct
      ? "Nombre, foto, precio y disponibilidad en carta"
      : editingOffer
        ? "Componentes, precio especial y estado en carta"
        : route.sub;
  }

  const content = document.getElementById("content");
  if (!content) {
    rendering = false;
    return;
  }
  clear(content);
  content.appendChild(el("p", { className: "muted tiny", text: "Cargando…" }));
  try {
    clear(content);
    clearDirty();
    await route.render(content);
  } catch (err) {
    clear(content);
    content.appendChild(
      el("div", {
        className: "card",
        text: err instanceof Error ? err.message : "Error al cargar la vista",
      }),
    );
    showToast(err instanceof Error ? err.message : "Error", "error");
  } finally {
    rendering = false;
    if (pendingHash !== null) {
      pendingHash = null;
      void render();
    }
  }
}

let lastHash = location.hash;

window.addEventListener("hashchange", () => {
  void (async () => {
    const next = location.hash;
    if (isDirty()) {
      const ok = await confirmLeave();
      if (!ok) {
        history.replaceState(null, "", lastHash || "#/");
        return;
      }
      clearDirty();
    }
    lastHash = next;
    if (rendering) {
      pendingHash = next;
      return;
    }
    await render();
  })();
});

setConfirmLeave(async (msg) =>
  openConfirm({
    title: "Cambios sin guardar",
    message: msg ?? "Hay cambios sin guardar. ¿Salir de todas formas?",
    confirmLabel: "Salir",
    danger: true,
  }),
);

installShortcuts();
setShortcutHandlers({
  escape: () => {
    const modalRoot = document.getElementById("modal-root");
    if (modalRoot?.firstChild) {
      // Escape lo maneja el modal
      return false;
    }
    return false;
  },
});

void (async () => {
  document.title = `${BRAND} — Menú Digital Admin`;
  lastHash = location.hash;
  await refreshNetworkChrome();
  await render();
  window.setInterval(() => {
    void refreshNetworkChrome();
  }, 60_000);
})();
