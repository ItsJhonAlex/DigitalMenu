/** Estado de cambios sin guardar entre vistas / fichas. */

let dirty = false;
let leaveHandler: (() => boolean | Promise<boolean>) | null = null;
let confirmLeaveFn: ((msg?: string) => Promise<boolean>) | null = null;

export function markDirty(): void {
  dirty = true;
}

export function clearDirty(): void {
  dirty = false;
}

export function isDirty(): boolean {
  return dirty;
}

/** Vista activa puede registrar lógica extra al salir (sin llamar a confirmLeave). */
export function setLeaveHandler(handler: (() => boolean | Promise<boolean>) | null): void {
  leaveHandler = handler;
}

export function setConfirmLeave(fn: (msg?: string) => Promise<boolean>): void {
  confirmLeaveFn = fn;
}

/** Pregunta al usuario si hay dirty (no usa leaveHandler → evita recursión). */
export async function confirmUnsaved(
  message = "Hay cambios sin guardar. ¿Salir de todas formas?",
): Promise<boolean> {
  if (!dirty) return true;
  if (confirmLeaveFn) return confirmLeaveFn(message);
  return true;
}

/**
 * Devuelve true si se puede abandonar la vista.
 * Si hay leaveHandler, lo delega; si no, usa dirty + modal.
 */
export async function confirmLeave(
  message = "Hay cambios sin guardar. ¿Salir de todas formas?",
): Promise<boolean> {
  if (leaveHandler) {
    return leaveHandler();
  }
  return confirmUnsaved(message);
}
