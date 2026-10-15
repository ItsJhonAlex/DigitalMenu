import { el } from "../dom";

export type SettingToggleOpts = {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void | Promise<void>;
};

/** Interruptor con etiqueta; revierte el checked si `onChange` lanza. */
export function settingToggle(opts: SettingToggleOpts): {
  root: HTMLElement;
  input: HTMLInputElement;
  setChecked: (v: boolean) => void;
  setDisabled: (v: boolean) => void;
} {
  const input = el("input", {
    className: "toggle",
    attrs: { type: "checkbox" },
  }) as HTMLInputElement;
  input.checked = opts.checked;
  if (opts.disabled) input.disabled = true;

  input.addEventListener("change", () => {
    const next = input.checked;
    void (async () => {
      try {
        await opts.onChange(next);
      } catch {
        input.checked = !next;
      }
    })();
  });

  const root = el("label", {
    className: "row",
    children: [input, el("span", { text: opts.label })],
  });

  return {
    root,
    input,
    setChecked: (v) => {
      input.checked = v;
    },
    setDisabled: (v) => {
      input.disabled = v;
    },
  };
}
