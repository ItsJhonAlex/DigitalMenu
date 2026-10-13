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

function media(url: string | null | undefined, alt: string): HTMLElement {
  const wrap = el("div", { className: "card__media" });
  if (url) {
    wrap.appendChild(el("img", { attrs: { src: url, alt, loading: "lazy" } }));
  }
  return wrap;
}

export function renderProductCard(
  p: MenuProduct,
  menu: MenuResponse,
  currency: string,
  compact: boolean,
  onOpen?: (product: MenuProduct) => void,
): HTMLElement {
  const prices = formatMenuPrice(p.priceMinor, menu, currency);
  const soldOut = menu.ui.soldOut ?? "Agotado";

  const bindOpen = (card: HTMLElement) => {
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.addEventListener("click", () => onOpen?.(p));
    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onOpen?.(p);
      }
    });
  };

  if (compact) {
    const card = el("article", {
      className: `row-card${p.available ? "" : " is-sold"}`,
    });
    const mediaEl = el("div", { className: "row-card__media" });
    if (p.image?.thumb) {
      mediaEl.appendChild(
        el("img", { attrs: { src: p.image.thumb, alt: p.name, loading: "lazy" } }),
      );
    }
    const body = el("div", { className: "row-card__body" });
    body.appendChild(el("h3", { text: p.name }));
    if (p.description) body.appendChild(el("p", { text: p.description }));
    const priceRow = el("div", { className: "card__price" });
    if (!p.available) {
      priceRow.appendChild(el("span", { className: "badge", text: soldOut }));
    }
    priceRow.appendChild(el("span", { className: "price", text: prices.primary }));
    if (prices.dual)
      priceRow.appendChild(el("span", { className: "price--dual", text: prices.dual }));
    body.appendChild(priceRow);
    card.append(mediaEl, body);
    bindOpen(card);
    return card;
  }

  const card = el("article", { className: `card${p.available ? "" : " is-sold"}` });
  const mediaEl = media(p.image?.large ?? p.image?.thumb, p.name);
  if (!p.available) {
    mediaEl.appendChild(
      el("div", {
        className: "card__sold",
        children: [el("span", { text: soldOut.toUpperCase() })],
      }),
    );
  }
  const body = el("div", { className: "card__body" });
  body.appendChild(el("h3", { text: p.name }));
  if (p.description) body.appendChild(el("p", { text: p.description }));
  const priceRow = el("div", { className: "card__price" });
  priceRow.appendChild(el("span", { className: "price", text: prices.primary }));
  if (prices.dual)
    priceRow.appendChild(el("span", { className: "price--dual", text: prices.dual }));
  body.appendChild(priceRow);
  card.append(mediaEl, body);
  bindOpen(card);
  return card;
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
  const sheet = el("div", { className: "detail" });
  const mediaEl = el("div", { className: "detail__media" });
  const imgUrl = p.image?.large ?? p.image?.thumb;
  if (imgUrl) {
    mediaEl.appendChild(el("img", { attrs: { src: imgUrl, alt: p.name } }));
  }
  const closeBtn = el("button", {
    className: "detail__close",
    text: "×",
    attrs: { type: "button", "aria-label": "Cerrar" },
  });
  closeBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onClose();
  });
  mediaEl.appendChild(closeBtn);

  const body = el("div", { className: "detail__body" });
  body.appendChild(el("h2", { text: p.name }));
  if (p.description) body.appendChild(el("p", { text: p.description }));
  if (!p.available) {
    body.appendChild(el("span", { className: "badge", text: menu.ui.soldOut ?? "Agotado" }));
  }
  const priceRow = el("div", { className: "card__price" });
  priceRow.appendChild(el("span", { className: "price", text: prices.primary }));
  if (prices.dual)
    priceRow.appendChild(el("span", { className: "price--dual", text: prices.dual }));
  body.appendChild(priceRow);

  sheet.append(mediaEl, body);
  backdrop.appendChild(sheet);
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) onClose();
  });
  return backdrop;
}

export function renderOfferCard(o: MenuOffer, menu: MenuResponse, currency: string): HTMLElement {
  const prices = formatMenuPrice(o.priceMinor, menu, currency);
  const card = el("article", { className: `card${o.available ? "" : " is-sold"}` });
  const mediaEl = media(o.image?.large ?? o.image?.thumb, o.name);
  if (!o.available) {
    mediaEl.appendChild(
      el("div", {
        className: "card__sold",
        children: [el("span", { text: (menu.ui.soldOut ?? "Agotado").toUpperCase() })],
      }),
    );
  }
  const body = el("div", { className: "card__body" });
  body.appendChild(el("h3", { text: o.name }));
  if (o.description) body.appendChild(el("p", { text: o.description }));
  if (o.items.length) {
    body.appendChild(
      el("p", {
        text: o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · "),
      }),
    );
  }
  const priceRow = el("div", { className: "card__price" });
  if (o.showSavings && o.regularMinor != null && o.regularMinor > o.priceMinor) {
    const struck = formatMenuPrice(o.regularMinor, menu, currency).primary;
    priceRow.appendChild(el("span", { className: "price--struck", text: struck }));
  }
  priceRow.appendChild(el("span", { className: "price", text: prices.primary }));
  if (prices.dual)
    priceRow.appendChild(el("span", { className: "price--dual", text: prices.dual }));
  body.appendChild(priceRow);
  card.append(mediaEl, body);
  return card;
}

export function renderCategorySection(
  cat: MenuCategory,
  menu: MenuResponse,
  currency: string,
  onOpen?: (product: MenuProduct) => void,
): HTMLElement {
  const section = el("section", { attrs: { id: `cat-${cat.id}` } });
  section.appendChild(
    el("div", {
      className: "section__head",
      children: [el("h2", { text: cat.name })],
    }),
  );
  const compact = cat.products.every((p) => p.type === "bebida" || p.type === "articulo");
  for (const p of cat.products) {
    section.appendChild(renderProductCard(p, menu, currency, compact, onOpen));
  }
  return section;
}
