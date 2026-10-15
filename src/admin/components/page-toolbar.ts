import { el } from "../dom";

/** Barra superior de lista: resumen a la izquierda, acciones a la derecha. */
export function pageToolbar(opts: {
  summary?: string | HTMLElement;
  actions?: Array<Node | null | undefined>;
}): HTMLElement {
  const left =
    typeof opts.summary === "string"
      ? el("p", { className: "muted", text: opts.summary })
      : (opts.summary ?? el("span"));
  const right = el("div", { className: "row", children: opts.actions ?? [] });
  return el("div", {
    className: "row row--between page-toolbar",
    children: [left, right],
  });
}
