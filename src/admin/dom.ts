/** Helpers DOM (textContent, sin HTML crudo de datos). */

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
    for (const child of opts.children) {
      if (child) node.appendChild(child);
    }
  }
  return node;
}

export function clear(node: ParentNode): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function nameOf(i18n: Record<string, { name: string }> | undefined, lang = "es"): string {
  return i18n?.[lang]?.name || i18n?.es?.name || "—";
}

export function formatRateUpdated(iso: string | null | undefined): string {
  if (!iso) return "sin actualizar";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}
