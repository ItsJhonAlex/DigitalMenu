import type { MenuProduct, MenuResponse } from "../shared/api-types";
import { pickLanguage } from "../shared/i18n";
import { clear, el, renderCategorySection, renderOfferCard, renderProductDetail } from "./render";

const LS_LANG = "dm.lang";
const LS_CUR = "dm.currency";

let menu: MenuResponse | null = null;
let currencyCode = "CUP";
let activeCat = "offers";
let detailRoot: HTMLElement | null = null;

function findProduct(id: number): MenuProduct | null {
  if (!menu) return null;
  for (const cat of menu.categories) {
    const p = cat.products.find((x) => x.id === id);
    if (p) return p;
  }
  return null;
}

function parseProductIdFromPath(): number | null {
  const m = location.pathname.match(/^\/p\/(\d+)\/?$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

function closeDetail(replace = false): void {
  detailRoot?.remove();
  detailRoot = null;
  if (location.pathname.startsWith("/p/")) {
    const url = `/${location.search}${location.hash}`;
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
  }
}

function openDetail(product: MenuProduct, push = true): void {
  if (!menu) return;
  closeDetail(true);
  detailRoot = renderProductDetail(product, menu, currencyCode, () => closeDetail());
  document.body.appendChild(detailRoot);
  if (push && location.pathname !== `/p/${product.id}`) {
    history.pushState({ productId: product.id }, "", `/p/${product.id}${location.search}`);
  }
}

function syncDetailFromUrl(): void {
  const id = parseProductIdFromPath();
  if (id == null) {
    detailRoot?.remove();
    detailRoot = null;
    return;
  }
  const p = findProduct(id);
  if (p) openDetail(p, false);
  else closeDetail(true);
}

async function fetchMenu(lang: string): Promise<MenuResponse> {
  const res = await fetch(`/api/menu?lang=${encodeURIComponent(lang)}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`No se pudo cargar la carta (${res.status})`);
  return (await res.json()) as MenuResponse;
}

function paintControls(): void {
  if (!menu) return;
  const langSeg = document.getElementById("lang-seg");
  const curSeg = document.getElementById("currency-seg");
  if (langSeg) {
    clear(langSeg);
    for (const l of menu.languages) {
      const btn = el("button", {
        text: l.code.toUpperCase(),
        attrs: { type: "button" },
        className: l.code === menu.lang ? "is-active" : undefined,
      });
      btn.addEventListener("click", () => {
        void switchLang(l.code);
      });
      langSeg.appendChild(btn);
    }
  }
  if (curSeg) {
    clear(curSeg);
    for (const c of menu.currency.list) {
      const btn = el("button", {
        text: c.code,
        attrs: { type: "button" },
        className: c.code === currencyCode ? "is-active" : undefined,
      });
      btn.addEventListener("click", () => {
        currencyCode = c.code;
        localStorage.setItem(LS_CUR, currencyCode);
        paint();
        syncDetailFromUrl();
      });
      curSeg.appendChild(btn);
    }
  }
}

function paintRate(): void {
  const bar = document.getElementById("rate-bar");
  if (!bar || !menu) return;
  if (!menu.currency.showRate) {
    bar.hidden = true;
    return;
  }
  const nonBase = menu.currency.list.filter((c) => !c.isBase);
  if (nonBase.length === 0) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  const label = menu.ui.rateOfDay ?? "Tasa del día";
  const parts = nonBase.map((c) => `1 ${c.code} = ${c.basePerUnit} ${menu!.currency.base}`);
  bar.textContent = `${label}: ${parts.join(" · ")}`;
}

function paintNav(): void {
  const nav = document.getElementById("cat-nav");
  if (!nav || !menu) return;
  clear(nav);
  const items: Array<{ id: string; label: string }> = [];
  if (menu.offers.length) {
    items.push({ id: "offers", label: menu.ui.offers ?? "Ofertas" });
  }
  for (const c of menu.categories) {
    items.push({ id: `cat-${c.id}`, label: c.name });
  }
  if (items.length === 0) return;
  if (!items.some((i) => i.id === activeCat)) activeCat = items[0]!.id;

  for (const item of items) {
    const btn = el("button", {
      text: item.label,
      attrs: { type: "button" },
      className: item.id === activeCat ? "is-active" : undefined,
    });
    btn.addEventListener("click", () => {
      activeCat = item.id;
      paintNav();
      const target = document.getElementById(item.id === "offers" ? "sec-offers" : item.id);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    nav.appendChild(btn);
  }
}

function paintMain(): void {
  const main = document.getElementById("main");
  if (!main || !menu) return;
  clear(main);

  if (menu.offers.length === 0 && menu.categories.length === 0) {
    main.appendChild(el("p", { className: "empty", text: menu.ui.empty ?? "Sin productos" }));
    return;
  }

  if (menu.offers.length) {
    const sec = el("section", {
      className: menu.showImages ? undefined : "section--text",
      attrs: { id: "sec-offers" },
    });
    sec.appendChild(
      el("div", {
        className: "section__head",
        children: [
          el("h2", { text: menu.ui.offers ?? "Ofertas" }),
          el("span", { className: "badge", text: "Hoy" }),
        ],
      }),
    );
    const list = el("div", {
      className: menu.showImages ? "section__items" : "section__items section__items--text",
    });
    for (const o of menu.offers) {
      list.appendChild(renderOfferCard(o, menu, currencyCode));
    }
    sec.appendChild(list);
    main.appendChild(sec);
  }

  for (const cat of menu.categories) {
    main.appendChild(renderCategorySection(cat, menu, currencyCode, (p) => openDetail(p)));
  }
}

function syncStickyOffset(): void {
  const top = document.getElementById("top");
  if (!top) return;
  const h = Math.ceil(top.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--header-h", `${h}px`);
}

function paintChrome(): void {
  if (!menu) return;
  const app = document.getElementById("app");
  const name = document.getElementById("restaurant-name");
  const welcome = document.getElementById("welcome") as HTMLElement | null;
  const footer = document.getElementById("footer");
  if (app) {
    app.classList.toggle("app--text", !menu.showImages);
    app.classList.toggle("app--photos", menu.showImages);
  }
  if (name) name.textContent = menu.restaurant.name;
  if (welcome) {
    const text = menu.restaurant.welcome?.trim() ?? "";
    welcome.textContent = text;
    welcome.hidden = text.length === 0;
  }
  if (footer) {
    clear(footer);
    footer.appendChild(el("strong", { text: menu.restaurant.name }));
    if (menu.restaurant.footer) {
      footer.appendChild(document.createTextNode(` — ${menu.restaurant.footer}`));
    }
  }
  document.title = `${menu.restaurant.name} — Carta`;
}

function paint(): void {
  paintChrome();
  paintControls();
  paintRate();
  paintNav();
  paintMain();
  syncStickyOffset();
  requestAnimationFrame(syncStickyOffset);
}

async function switchLang(code: string): Promise<void> {
  localStorage.setItem(LS_LANG, code);
  await load(code);
}

async function load(langHint?: string): Promise<void> {
  const main = document.getElementById("main");
  try {
    const preferred =
      langHint ?? localStorage.getItem(LS_LANG) ?? pickLanguage(navigator.language, ["es", "en"]);
    menu = await fetchMenu(preferred);
    const savedCur = localStorage.getItem(LS_CUR);
    const codes = menu.currency.list.map((c) => c.code);
    currencyCode =
      (savedCur && codes.includes(savedCur) && savedCur) ||
      (codes.includes(menu.currency.default) ? menu.currency.default : codes[0]!) ||
      "CUP";
    paint();
    syncDetailFromUrl();
  } catch (err) {
    if (main) {
      clear(main);
      main.appendChild(
        el("p", {
          className: "error",
          text: err instanceof Error ? err.message : "Error al cargar",
        }),
      );
    }
  }
}

window.addEventListener("popstate", () => syncDetailFromUrl());
window.addEventListener("resize", () => syncStickyOffset());
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && detailRoot) closeDetail();
});
// Al volver a la pestaña (p. ej. tras cambiar ajustes en Admin), refrescar carta
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void load(menu?.lang);
});

void load();
