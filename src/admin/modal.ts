import { clear, el } from "./dom";

export type ModalOptions = {
  title: string;
  wide?: boolean;
  body: HTMLElement;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  cancelLabel?: string;
  /** Si false, no se muestra el botón primario (solo cancelar / Esc). */
  showSave?: boolean;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(modal: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== "Tab") return;
  const nodes = [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (n) => n.offsetParent !== null || n === document.activeElement,
  );
  if (nodes.length === 0) return;
  const first = nodes[0]!;
  const last = nodes[nodes.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

export function openModal(opts: ModalOptions): { close: () => void } {
  const root = document.getElementById("modal-root");
  if (!root) throw new Error("modal-root missing");
  clear(root);

  const backdrop = el("div", { className: "modal-backdrop" });
  const modal = el("div", {
    className: opts.wide ? "modal modal--wide" : "modal",
    attrs: { role: "dialog", "aria-modal": "true" },
  });
  modal.appendChild(el("h2", { className: "modal__title", text: opts.title }));
  modal.appendChild(opts.body);

  const actions = el("div", { className: "modal__actions" });
  const cancel = el("button", {
    className: "btn btn--ghost",
    text: opts.cancelLabel ?? "Cancelar",
    attrs: { type: "button" },
  });
  actions.appendChild(cancel);

  let save: HTMLButtonElement | null = null;
  if (opts.showSave !== false) {
    save = el("button", {
      className: "btn btn--primary",
      text: opts.saveLabel ?? "Guardar",
      attrs: { type: "button" },
    }) as HTMLButtonElement;
    actions.appendChild(save);
  }
  modal.appendChild(actions);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  const previouslyFocused = document.activeElement as HTMLElement | null;

  const close = () => {
    window.removeEventListener("keydown", onKey);
    clear(root);
    previouslyFocused?.focus?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    trapFocus(modal, e);
  };
  window.addEventListener("keydown", onKey);

  cancel.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  if (save) {
    save.addEventListener("click", async () => {
      if (!opts.onSave) {
        close();
        return;
      }
      save!.setAttribute("disabled", "true");
      try {
        await opts.onSave();
        close();
      } catch {
        // El caller ya mostró toast; se deja el modal abierto
      } finally {
        save!.removeAttribute("disabled");
      }
    });
  }

  const firstFocus =
    modal.querySelector<HTMLElement>("input, textarea, select, button.btn--primary") ?? cancel;
  queueMicrotask(() => firstFocus.focus());

  return { close };
}

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

/** Confirmación con el modal del Admin (sustituye `window.confirm`). */
export function openConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.getElementById("modal-root");
    if (!root) {
      resolve(false);
      return;
    }
    clear(root);

    const backdrop = el("div", { className: "modal-backdrop" });
    const modal = el("div", {
      className: "modal",
      attrs: { role: "alertdialog", "aria-modal": "true" },
    });
    modal.appendChild(el("h2", { className: "modal__title", text: opts.title }));
    modal.appendChild(el("p", { text: opts.message }));

    const actions = el("div", { className: "modal__actions" });
    const cancel = el("button", {
      className: "btn btn--ghost",
      text: opts.cancelLabel ?? "Cancelar",
      attrs: { type: "button" },
    });
    const ok = el("button", {
      className: opts.danger ? "btn btn--danger" : "btn btn--primary",
      text: opts.confirmLabel ?? "Confirmar",
      attrs: { type: "button" },
    });
    actions.append(cancel, ok);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    root.appendChild(backdrop);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("keydown", onKey);
      clear(root);
      previouslyFocused?.focus?.();
      resolve(value);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
        return;
      }
      trapFocus(modal, e);
    };
    window.addEventListener("keydown", onKey);

    cancel.addEventListener("click", () => finish(false));
    ok.addEventListener("click", () => finish(true));
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) finish(false);
    });

    queueMicrotask(() => ok.focus());
  });
}
