import { el } from "../dom";

/** Contenedor de acciones destructivas (restaurar, borrar PIN, etc.). */
export function dangerZone(opts: {
  title?: string;
  hint?: string;
  children: Array<Node | null | undefined>;
}): HTMLElement {
  const kids: Array<Node | null | undefined> = [];
  if (opts.title) {
    kids.push(el("h3", { className: "danger-zone__title", text: opts.title }));
  }
  if (opts.hint) {
    kids.push(el("p", { className: "muted tiny", text: opts.hint }));
  }
  kids.push(...opts.children);
  return el("div", { className: "danger-zone stack", children: kids });
}
