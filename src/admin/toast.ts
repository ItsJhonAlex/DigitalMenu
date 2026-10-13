export function showToast(message: string, kind: "info" | "success" | "error" = "info"): void {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast toast--${kind === "info" ? "info" : kind}`;
  el.textContent = message;
  root.appendChild(el);
  window.setTimeout(() => {
    el.remove();
  }, 3200);
}
