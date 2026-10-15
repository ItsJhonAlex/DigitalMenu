import type { MenuCategory, MenuOffer, MenuProduct, MenuResponse } from "../shared/api-types";
import type { Currency } from "../shared/money";
import { formatPrice } from "../shared/money";

export function clear(node: ParentNode): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: {
    className?: string;
    text?: string;
    attrs?: Record<string, string>;
    children?: Array<Node | null | undefined>;
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text != null) node.textContent = opts.text;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  }
  if (opts.children) {
    for (const c of opts.children) if (c) node.appendChild(c);
  }
  return node;
}

function toMoney(c: MenuResponse["currency"]["list"][number]): Currency {
  return {
    code: c.code,
    symbol: c.symbol,
    decimals: c.decimals,
    isBase: c.isBase,
    basePerUnit: c.basePerUnit,
    rounding: c.rounding,
    roundStep: c.roundStep,
    symbolPosition: c.symbolPosition,
  };
}

export function formatMenuPrice(
  priceMinor: number,
  menu: MenuResponse,
  currencyCode: string,
): { primary: string; dual: string | null } {
  const baseDto = menu.currency.list.find((c) => c.isBase) ?? menu.currency.list[0];
  const targetDto = menu.currency.list.find((c) => c.code === currencyCode) ?? baseDto;
  if (!baseDto || !targetDto) return { primary: String(priceMinor), dual: null };
  const base = toMoney(baseDto);
  const target = toMoney(targetDto);
  const primary = formatPrice(priceMinor, base, target);
  const secondCode = menu.currency.second;
  if (!secondCode || secondCode === currencyCode || !menu.currency.showRate) {
    return { primary, dual: null };
  }
  const secondDto = menu.currency.list.find((c) => c.code === secondCode);
  if (!secondDto) return { primary, dual: null };
  const dual = `(${formatPrice(priceMinor, base, toMoney(secondDto))})`;
  return { primary, dual };
}

function bindOpen(
  card: HTMLElement,
  product: MenuProduct,
  onOpen?: (p: MenuProduct) => void,
): void {
  if (!onOpen) return;
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.addEventListener("click", () => onOpen(product));
  card.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      onOpen(product);
    }
  });
}

function priceBlock(
  prices: { primary: string; dual: string | null },
  extras?: Array<Node | null | undefined>,
): HTMLElement {
  const priceRow = el("div", { className: "card__price" });
  if (extras) {
    for (const n of extras) if (n) priceRow.appendChild(n);
  }
  priceRow.appendChild(el("span", { className: "price", text: prices.primary }));
  if (prices.dual) {
    priceRow.appendChild(el("span", { className: "price--dual", text: prices.dual }));
  }
  return priceRow;
}

/** Línea de menú sin foto: nombre ····· precio + descripción. */
function renderTextLine(opts: {
  name: string;
  description: string | null;
  prices: { primary: string; dual: string | null };
  available: boolean;
  soldOut: string;
  meta?: string | null;
  className?: string;
}): HTMLElement {
  const line = el("article", {
    className: `menu-line${opts.available ? "" : " is-sold"}${opts.className ? ` ${opts.className}` : ""}`,
  });

  const row = el("div", { className: "menu-line__row" });
  const titleWrap = el("div", { className: "menu-line__title" });
  titleWrap.appendChild(el("h3", { text: opts.name }));
  if (!opts.available) {
    titleWrap.appendChild(el("span", { className: "badge badge--sold", text: opts.soldOut }));
  }
  const dots = el("span", {
    className: "menu-line__dots",
    attrs: { "aria-hidden": "true" },
  });
  const right = el("div", { className: "menu-line__price" });
  right.appendChild(el("span", { className: "price", text: opts.prices.primary }));
  if (opts.prices.dual) {
    right.appendChild(el("span", { className: "price--dual", text: opts.prices.dual }));
  }
  row.append(titleWrap, dots, right);
  line.appendChild(row);

  if (opts.description) {
    line.appendChild(el("p", { className: "menu-line__desc", text: opts.description }));
  }
  if (opts.meta) {
    line.appendChild(el("p", { className: "menu-line__meta", text: opts.meta }));
  }
  return line;
}

/** full = platos; drink = bebidas/cócteles (foto horizontal amplia); compact = artículos */
export type PhotoLayout = "full" | "drink" | "compact";

function renderPhotoCard(
  p: MenuProduct,
  menu: MenuResponse,
  currency: string,
  layout: PhotoLayout,
  onOpen?: (product: MenuProduct) => void,
): HTMLElement {
  const prices = formatMenuPrice(p.priceMinor, menu, currency);
  const soldOut = menu.ui.soldOut ?? "Agotado";
  const img = p.image?.large ?? p.image?.thumb;

  if (layout === "compact") {
    const card = el("article", {
      className: `row-card${p.available ? "" : " is-sold"}`,
    });
    if (img) {
      const mediaEl = el("div", { className: "row-card__media" });
      mediaEl.appendChild(
        el("img", { attrs: { src: p.image!.thumb ?? img, alt: p.name, loading: "lazy" } }),
      );
      card.appendChild(mediaEl);
    }
    const body = el("div", { className: "row-card__body" });
    body.appendChild(el("h3", { text: p.name }));
    if (p.description) body.appendChild(el("p", { text: p.description }));
    body.appendChild(
      priceBlock(prices, !p.available ? [el("span", { className: "badge badge--sold", text: soldOut })] : []),
    );
    card.appendChild(body);
    bindOpen(card, p, onOpen);
    return card;
  }

  if (layout === "drink") {
    const card = el("article", {
      className: `drink-card${p.available ? "" : " is-sold"}`,
    });
    if (img) {
      const mediaEl = el("div", { className: "drink-card__media" });
      mediaEl.appendChild(el("img", { attrs: { src: img, alt: p.name, loading: "lazy" } }));
      if (!p.available) {
        mediaEl.appendChild(
          el("div", {
            className: "card__sold",
            children: [el("span", { text: soldOut })],
          }),
        );
      }
      card.appendChild(mediaEl);
    }
    const body = el("div", { className: "drink-card__body" });
    body.appendChild(el("h3", { text: p.name }));
    if (p.description) body.appendChild(el("p", { text: p.description }));
    if (!p.available && !img) {
      body.appendChild(el("span", { className: "badge badge--sold", text: soldOut }));
    }
    body.appendChild(priceBlock(prices));
    card.appendChild(body);
    bindOpen(card, p, onOpen);
    return card;
  }

  const card = el("article", { className: `card${p.available ? "" : " is-sold"}` });
  if (img) {
    const mediaEl = el("div", { className: "card__media" });
    mediaEl.appendChild(el("img", { attrs: { src: img, alt: p.name, loading: "lazy" } }));
    if (!p.available) {
      mediaEl.appendChild(
        el("div", {
          className: "card__sold",
          children: [el("span", { text: soldOut })],
        }),
      );
    }
    card.appendChild(mediaEl);
  }
  const body = el("div", { className: "card__body" });
  body.appendChild(el("h3", { text: p.name }));
  if (p.description) body.appendChild(el("p", { text: p.description }));
  if (!p.available && !img) {
    body.appendChild(el("span", { className: "badge badge--sold", text: soldOut }));
  }
  body.appendChild(priceBlock(prices));
  card.appendChild(body);
  bindOpen(card, p, onOpen);
  return card;
}

export function layoutForProduct(p: MenuProduct): PhotoLayout {
  if (p.type === "bebida") return "drink";
  if (p.type === "articulo") return "compact";
  return "full";
}

export function productHasImage(p: MenuProduct): boolean {
  return Boolean(p.image?.thumb || p.image?.large);
}

/** Lista si fotos globales off, o si este producto no tiene imagen en Admin. */
export function productShowsAsList(p: MenuProduct, menu: MenuResponse): boolean {
  return !menu.showImages || !productHasImage(p);
}

export function renderProductCard(
  p: MenuProduct,
  menu: MenuResponse,
  currency: string,
  layout: PhotoLayout,
  onOpen?: (product: MenuProduct) => void,
): HTMLElement {
  const prices = formatMenuPrice(p.priceMinor, menu, currency);
  const soldOut = menu.ui.soldOut ?? "Agotado";

  if (productShowsAsList(p, menu)) {
    const line = renderTextLine({
      name: p.name,
      description: p.description,
      prices,
      available: p.available,
      soldOut,
    });
    bindOpen(line, p, onOpen);
    return line;
  }

  return renderPhotoCard(p, menu, currency, layout, onOpen);
}

export function renderProductDetail(
  p: MenuProduct,
  menu: MenuResponse,
  currency: string,
  onClose: () => void,
): HTMLElement {
  const prices = formatMenuPrice(p.priceMinor, menu, currency);
  const backdrop = el("div", {
    className: "detail-backdrop",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": p.name },
  });
  const sheet = el("div", {
    className: `detail${menu.showImages && (p.image?.large || p.image?.thumb) ? "" : " detail--text"}`,
  });

  const closeBtn = el("button", {
    className: "detail__close",
    text: "×",
    attrs: { type: "button", "aria-label": "Cerrar" },
  });
  closeBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onClose();
  });

  const imgUrl = menu.showImages ? (p.image?.large ?? p.image?.thumb) : null;
  if (imgUrl) {
    const mediaEl = el("div", { className: "detail__media" });
    mediaEl.appendChild(el("img", { attrs: { src: imgUrl, alt: p.name } }));
    mediaEl.appendChild(closeBtn);
    sheet.appendChild(mediaEl);
  } else {
    const bar = el("div", { className: "detail__bar" });
    bar.appendChild(closeBtn);
    sheet.appendChild(bar);
  }

  const body = el("div", { className: "detail__body" });
  body.appendChild(el("h2", { text: p.name }));
  if (p.description) body.appendChild(el("p", { text: p.description }));
  if (!p.available) {
    body.appendChild(el("span", { className: "badge badge--sold", text: menu.ui.soldOut ?? "Agotado" }));
  }
  body.appendChild(priceBlock(prices));
  sheet.appendChild(body);

  backdrop.appendChild(sheet);
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) onClose();
  });
  return backdrop;
}

export function renderOfferCard(o: MenuOffer, menu: MenuResponse, currency: string): HTMLElement {
  const prices = formatMenuPrice(o.priceMinor, menu, currency);
  const soldOut = menu.ui.soldOut ?? "Agotado";
  const meta = o.items.length ? o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ") : null;
  const hasImage = Boolean(o.image?.thumb || o.image?.large);

  if (!menu.showImages || !hasImage) {
    const struck =
      o.showSavings && o.regularMinor != null && o.regularMinor > o.priceMinor
        ? formatMenuPrice(o.regularMinor, menu, currency).primary
        : null;
    const line = renderTextLine({
      name: o.name,
      description: o.description,
      prices,
      available: o.available,
      soldOut,
      meta,
      className: "menu-line--offer",
    });
    if (struck) {
      const priceEl = line.querySelector(".menu-line__price");
      if (priceEl) {
        priceEl.insertBefore(
          el("span", { className: "price--struck", text: struck }),
          priceEl.firstChild,
        );
      }
    }
    return line;
  }

  const card = el("article", { className: `card${o.available ? "" : " is-sold"}` });
  const img = o.image?.large ?? o.image?.thumb;
  if (img) {
    const mediaEl = el("div", { className: "card__media" });
    mediaEl.appendChild(el("img", { attrs: { src: img, alt: o.name, loading: "lazy" } }));
    if (!o.available) {
      mediaEl.appendChild(
        el("div", {
          className: "card__sold",
          children: [el("span", { text: soldOut })],
        }),
      );
    }
    card.appendChild(mediaEl);
  }
  const body = el("div", { className: "card__body" });
  body.appendChild(el("h3", { text: o.name }));
  if (o.description) body.appendChild(el("p", { text: o.description }));
  if (meta) body.appendChild(el("p", { text: meta }));
  const extras: Array<Node | null> = [];
  if (o.showSavings && o.regularMinor != null && o.regularMinor > o.priceMinor) {
    extras.push(
      el("span", {
        className: "price--struck",
        text: formatMenuPrice(o.regularMinor, menu, currency).primary,
      }),
    );
  }
  body.appendChild(priceBlock(prices, extras));
  card.appendChild(body);
  return card;
}

function appendProductsToRoot(
  root: HTMLElement,
  products: MenuProduct[],
  menu: MenuResponse,
  currency: string,
  onOpen?: (product: MenuProduct) => void,
): void {
  let listGroup: HTMLElement | null = null;
  const flushList = () => {
    listGroup = null;
  };

  for (const p of products) {
    if (productShowsAsList(p, menu)) {
      if (!listGroup) {
        listGroup = el("div", { className: "section__items--text" });
        root.appendChild(listGroup);
      }
      listGroup.appendChild(renderProductCard(p, menu, currency, layoutForProduct(p), onOpen));
    } else {
      flushList();
      root.appendChild(renderProductCard(p, menu, currency, layoutForProduct(p), onOpen));
    }
  }
}

export function formatSectionCount(
  availableCount: number,
  soldOutCount: number,
  ui: Record<string, string>,
): string {
  const soldWord = ui.soldOutCount ?? "agotados";
  if (soldOutCount > 0) return `${availableCount} · ${soldOutCount} ${soldWord}`;
  return String(availableCount);
}

/** Título (+ conteo opcional) y cuerpo; si collapsible, envuelve en <details>. */
export function attachSectionBody(
  section: HTMLElement,
  opts: {
    title: string;
    countLabel: string | null;
    collapsible: boolean;
    openDefault: boolean;
    body: HTMLElement;
  },
): void {
  const headChildren: HTMLElement[] = [el("h2", { text: opts.title })];
  if (opts.countLabel) {
    headChildren.push(el("span", { className: "section__count", text: opts.countLabel }));
  }
  if (opts.collapsible) {
    const details = el("details", { className: "section-fold" }) as HTMLDetailsElement;
    if (opts.openDefault) details.open = true;
    details.appendChild(
      el("summary", {
        className: "section__head section__head--fold",
        children: headChildren,
      }),
    );
    details.appendChild(opts.body);
    section.appendChild(details);
  } else {
    section.appendChild(el("div", { className: "section__head", children: headChildren }));
    section.appendChild(opts.body);
  }
}

export function renderCategorySection(
  cat: MenuCategory,
  menu: MenuResponse,
  currency: string,
  onOpen?: (product: MenuProduct) => void,
): HTMLElement {
  const available = cat.products.filter((p) => p.available);
  const soldOut = menu.showSoldOut ? cat.products.filter((p) => !p.available) : [];
  const visibleForLayout = [...available, ...soldOut];
  const allList =
    visibleForLayout.length > 0 && visibleForLayout.every((p) => productShowsAsList(p, menu));
  const section = el("section", {
    className: allList || !menu.showImages ? "section--text" : undefined,
    attrs: { id: `cat-${cat.id}` },
  });

  const root = el("div", { className: "section__items" });
  appendProductsToRoot(root, available, menu, currency, onOpen);

  if (soldOut.length > 0) {
    if (menu.soldOutCollapsed) {
      // Colapsados: bloque «Ver agotados (n)»
      const label = menu.ui.showSoldOut ?? "Ver agotados";
      const details = el("details", { className: "soldout-fold" });
      details.appendChild(
        el("summary", {
          className: "soldout-fold__summary",
          text: `${label} (${soldOut.length})`,
        }),
      );
      const foldBody = el("div", { className: "soldout-fold__body section__items" });
      appendProductsToRoot(foldBody, soldOut, menu, currency, onOpen);
      details.appendChild(foldBody);
      root.appendChild(details);
    } else {
      // Sin colapsar: agotados al final, con separación del último disponible
      const tail = el("div", { className: "soldout-tail section__items" });
      appendProductsToRoot(tail, soldOut, menu, currency, onOpen);
      root.appendChild(tail);
    }
  }

  attachSectionBody(section, {
    title: cat.name,
    countLabel: menu.showSectionCounts
      ? formatSectionCount(available.length, soldOut.length, menu.ui)
      : null,
    collapsible: menu.sectionsCollapsible,
    openDefault: menu.sectionsOpenDefault,
    body: root,
  });
  return section;
}
