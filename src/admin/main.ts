import { api, type NetworkState } from "./api";
import { BRAND } from "./brand";
import { clear, el } from "./dom";
import { showToast } from "./toast";
import { renderAjustes } from "./views/ajustes";
import { renderCategorias } from "./views/categorias";
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
    sub: "Tareas del día en Avanzar In Time",
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
    sub: "Precios especiales y componentes",
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
    id: "ajustes",
    path: "/ajustes",
    label: "Ajustes",
    icon: "⚙",
    title: "Ajustes",
    sub: `Datos de ${BRAND}`,
    render: renderAjustes,
  },
];

function currentPath(): string {
  const raw = location.hash.replace(/^#/, "") || "/";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function findRoute(path: string): Route {
  return routes.find((r) => r.path === path) ?? routes[0]!;
}

function buildNav(): void {
  const nav = document.getElementById("nav");
  if (!nav) return;
  clear(nav);
  const path = currentPath();
  for (const r of routes) {
    const a = el("a", {
      className: `nav-link${r.path === path ? " is-active" : ""}`,
      attrs: { href: `#${r.path}` },
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
        banner.append(
          el("strong", { text: "La IP del POS cambió. " }),
          document.createTextNode("Reimprima los QR o confirme la IP en Red y QR."),
        );
      } else {
        banner.hidden = true;
      }
    }
  } catch {
    // silencioso en chrome
  }
}

async function render(): Promise<void> {
  const route = findRoute(currentPath());
  buildNav();
  const title = document.getElementById("page-title");
  const sub = document.getElementById("page-sub");
  if (title) title.textContent = route.title;
  if (sub) sub.textContent = route.sub;

  const content = document.getElementById("content");
  if (!content) return;
  clear(content);
  content.appendChild(el("p", { className: "muted tiny", text: "Cargando…" }));
  try {
    clear(content);
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
  }
}

window.addEventListener("hashchange", () => {
  void render();
});

void (async () => {
  document.title = `${BRAND} — Menú Digital Admin`;
  await refreshNetworkChrome();
  await render();
  window.setInterval(() => {
    void refreshNetworkChrome();
  }, 60_000);
})();
