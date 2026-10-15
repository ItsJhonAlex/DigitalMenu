import type { MenuProduct, MenuResponse } from "../shared/api-types";
import { pickLanguage } from "../shared/i18n";
import {
  attachSectionBody,
  clear,
  el,
  formatSectionCount,
  renderCategorySection,
  renderOfferCard,
  renderProductDetail,
} from "./render";

const LS_LANG = "dm.lang";
const LS_CUR = "dm.currency";

let menu: MenuResponse | null = null;
let currencyCode = "CUP";
let activeCat = "offers";
let detailRoot: HTMLElement | null = null;
let sectionSpy: IntersectionObserver | null = null;
const spyRatios = new Map<Element, number>();
let spyIgnoreUntil = 0;

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

/** Recarga sin “flash”: conserva categoría activa y scroll. */
async function softReload(): Promise<void> {
  if (!menu) {
    await load();
    return;
  }
  const lang = menu.lang;
  const keepCat = activeCat;
  const scrollY = window.scrollY;
  try {
    const next = await fetchMenu(lang);
    if (next.version === menu.version) return;
    menu = next;
    const codes = menu.currency.list.map((c) => c.code);
    if (!codes.includes(currencyCode)) {
      currencyCode =
        (codes.includes(menu.currency.default) ? menu.currency.default : codes[0]!) || "CUP";
    }
    activeCat = keepCat;
    paint();
    // Restaurar categoría / scroll tras el pintado
    requestAnimationFrame(() => {
      activeCat = keepCat;
      paintNav();
      syncStickyOffset();
      const target = document.getElementById(keepCat === "offers" ? "sec-offers" : keepCat);
      if (target) {
        scrollToSectionEl(target, false);
      } else {
        window.scrollTo(0, scrollY);
      }
      syncDetailFromUrl();
    });
  } catch {
    // Mantener carta actual si falla el refetch
  }
}

/** SSE /api/menu/events — reintento con espera creciente. */
function watchMenuEvents(): void {
  let delayMs = 1_000;
  let knownRev: number | null = null;
  let es: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(connect, delayMs);
    delayMs = Math.min(delayMs * 2, 30_000);
  };

  const connect = () => {
    es?.close();
    es = new EventSource("/api/menu/events");
    es.addEventListener("revision", (ev) => {
      delayMs = 1_000;
      try {
        const data = JSON.parse((ev as MessageEvent).data) as { revision?: number };
        const rev = data.revision;
        if (typeof rev !== "number") return;
        if (knownRev != null && rev !== knownRev) {
          void softReload();
        }
        knownRev = rev;
      } catch {
        // ignore payload raro
      }
    });
    es.onopen = () => {
      delayMs = 1_000;
    };
    es.onerror = () => {
      es?.close();
      es = null;
      schedule();
    };
  };

  connect();
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

function catIdFromSection(section: Element): string {
  return section.id === "sec-offers" ? "offers" : section.id;
}

function setActiveCat(id: string, opts?: { scrollNav?: boolean }): void {
  if (activeCat === id) return;
  activeCat = id;
  const nav = document.getElementById("cat-nav");
  if (!nav) return;
  for (const btn of nav.querySelectorAll<HTMLButtonElement>("button[data-cat-id]")) {
    const on = btn.dataset.catId === id;
    btn.classList.toggle("is-active", on);
    if (on && opts?.scrollNav !== false) {
      btn.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    }
  }
}

function teardownSectionSpy(): void {
  sectionSpy?.disconnect();
  sectionSpy = null;
  spyRatios.clear();
}

function setupSectionSpy(): void {
  teardownSectionSpy();
  const main = document.getElementById("main");
  if (!main) return;
  const sections = [...main.querySelectorAll(":scope > section[id]")];
  if (sections.length === 0) return;

  sectionSpy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        spyRatios.set(e.target, e.isIntersecting ? e.intersectionRatio : 0);
      }
      if (Date.now() < spyIgnoreUntil) return;

      let best: Element | null = null;
      let bestRatio = 0;
      for (const [el, ratio] of spyRatios) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = el;
        }
      }
      if (!best || bestRatio <= 0) return;
      setActiveCat(catIdFromSection(best));
    },
    {
      rootMargin: "-20% 0px -60% 0px",
      threshold: [0, 0.05, 0.1, 0.2, 0.35, 0.5, 0.75, 1],
    },
  );

  for (const sec of sections) {
    spyRatios.set(sec, 0);
    sectionSpy.observe(sec);
  }
}

function cssLengthToPx(value: string): number {
  const v = value.trim();
  if (!v) return 0;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  if (v.endsWith("rem")) {
    const rootFs = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return n * rootFs;
  }
  return n;
}

function stickyChromeHeight(): number {
  const headerH = document.getElementById("top")?.getBoundingClientRect().height ?? 0;
  const catsH = document.getElementById("cat-nav")?.getBoundingClientRect().height ?? 0;
  const catsGap = cssLengthToPx(
    getComputedStyle(document.documentElement).getPropertyValue("--cats-gap"),
  );
  return Math.ceil(headerH + catsGap + catsH + 4);
}

function scrollToSectionEl(target: HTMLElement, smooth = true): void {
  const fold = target.querySelector(":scope > details.section-fold") as HTMLDetailsElement | null;
  if (fold && !fold.open) fold.open = true;
  const y = target.getBoundingClientRect().top + window.scrollY - stickyChromeHeight();
  window.scrollTo({ top: Math.max(0, y), behavior: smooth ? "smooth" : "auto" });
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
      attrs: { type: "button", "data-cat-id": item.id },
      className: item.id === activeCat ? "is-active" : undefined,
    });
    btn.addEventListener("click", () => {
      spyIgnoreUntil = Date.now() + 900;
      setActiveCat(item.id, { scrollNav: false });
      const target = document.getElementById(item.id === "offers" ? "sec-offers" : item.id);
      if (target) scrollToSectionEl(target);
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
    const offerAvail = menu.offers.filter((o) => o.available).length;
    const offerSold = menu.showSoldOut ? menu.offers.filter((o) => !o.available).length : 0;
    const list = el("div", {
      className: menu.showImages ? "section__items" : "section__items section__items--text",
    });
    for (const o of menu.offers) {
      list.appendChild(renderOfferCard(o, menu, currencyCode));
    }
    attachSectionBody(sec, {
      title: menu.ui.offers ?? "Ofertas",
      countLabel: menu.showSectionCounts
        ? formatSectionCount(offerAvail, offerSold, menu.ui)
        : null,
      collapsible: menu.sectionsCollapsible,
      openDefault: menu.sectionsOpenDefault,
      body: list,
    });
    // Badge «Hoy» junto al conteo cuando hay ofertas
    const head = sec.querySelector(".section__head");
    head?.appendChild(el("span", { className: "badge", text: "Hoy" }));
    main.appendChild(sec);
  }

  for (const cat of menu.categories) {
    main.appendChild(renderCategorySection(cat, menu, currencyCode, (p) => openDetail(p)));
  }
}

function syncStickyOffset(): void {
  const top = document.getElementById("top");
  const cats = document.getElementById("cat-nav");
  if (top) {
    const h = Math.ceil(top.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--header-h", `${h}px`);
  }
  if (cats) {
    const ch = Math.ceil(cats.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--cats-h", `${ch}px`);
  }
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
  const logo = document.getElementById("brand-logo") as HTMLImageElement | null;
  if (logo) logo.alt = menu.restaurant.name || "Avanzar In Time";
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
  setupSectionSpy();
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
    const hint = langHint ?? localStorage.getItem(LS_LANG) ?? undefined;
    // Primera carga con hint o navigator; luego alineamos a idiomas activos del menú
    menu = await fetchMenu(hint ?? navigator.language);
    const activeCodes = menu.languages.map((l) => l.code);
    const preferred = pickLanguage(hint ?? navigator.language, activeCodes);
    if (preferred !== menu.lang) {
      menu = await fetchMenu(preferred);
    }
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
// Al volver a la pestaña: refetch suave (SSE cubre el caso normal)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void softReload();
});

void load().then(() => watchMenuEvents());
