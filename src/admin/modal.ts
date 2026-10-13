import { clear, el } from "./dom";

export type ModalOptions = {
  title: string;
  wide?: boolean;
  body: HTMLElement;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  cancelLabel?: string;
};

export function openModal(opts: ModalOptions): { close: () => void } {
  const root = document.getElementById("modal-root");
  if (!root) throw new Error("modal-root missing");
  clear(root);

  const backdrop = el("div", { className: "modal-backdrop" });
  const modal = el("div", { className: opts.wide ? "modal modal--wide" : "modal" });
  modal.appendChild(el("h2", { className: "modal__title", text: opts.title }));
  modal.appendChild(opts.body);

  const actions = el("div", { className: "modal__actions" });
  const cancel = el("button", {
    className: "btn btn--ghost",
    text: opts.cancelLabel ?? "Cancelar",
    attrs: { type: "button" },
  });
  const save = el("button", {
    className: "btn btn--primary",
    text: opts.saveLabel ?? "Guardar",
    attrs: { type: "button" },
  });
  actions.append(cancel, save);
  modal.appendChild(actions);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  const close = () => clear(root);

  cancel.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      window.removeEventListener("keydown", onKey);
    }
  };
  window.addEventListener("keydown", onKey);

  save.addEventListener("click", async () => {
    if (!opts.onSave) {
      close();
      return;
    }
    save.setAttribute("disabled", "true");
    try {
      await opts.onSave();
      close();
    } catch {
      // El caller ya mostró toast; se deja el modal abierto
    } finally {
      save.removeAttribute("disabled");
    }
  });

  return { close };
}
