/** Plantillas DOM de la Carta (textContent). Se implementará en F3. */

export function clear(node: ParentNode): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function text(tag: string, value: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value;
  return el;
}
