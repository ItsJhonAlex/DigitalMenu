/** Atajos globales del Admin: Ctrl+S, Esc, /. */

type ShortcutHandlers = {
  save?: () => void | Promise<void>;
  escape?: () => boolean;
};

let handlers: ShortcutHandlers = {};

export function setShortcutHandlers(next: ShortcutHandlers): void {
  handlers = next;
}

export function clearShortcutHandlers(): void {
  handlers = {};
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return t.isContentEditable;
}

export function installShortcuts(): void {
  window.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "s") {
      if (!handlers.save) return;
      e.preventDefault();
      void handlers.save();
      return;
    }
    if (e.key === "Escape") {
      if (handlers.escape?.()) {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "/" && !mod && !e.altKey && !isTypingTarget(e.target)) {
      const search = document.querySelector<HTMLElement>("[data-search]");
      if (search) {
        e.preventDefault();
        search.focus();
      }
    }
  });
}
