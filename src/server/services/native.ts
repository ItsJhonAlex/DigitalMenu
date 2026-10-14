/**
 * Diálogos nativos de Windows (RF-04: puerto ocupado).
 */
import { FFIType, dlopen, ptr } from "bun:ffi";

export function isAddressInUseError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  if (code === "EADDRINUSE") return true;
  if (/EADDRINUSE/i.test(msg)) return true;
  if (/address already in use/i.test(msg)) return true;
  // Bun a veces envuelve el fallo de bind
  if (/Failed to start server/i.test(msg) && /in use|EADDRINUSE/i.test(msg)) return true;
  return false;
}

export function portInUseDialog(opts: {
  port: number;
  host: string;
  dataDir: string;
  detail?: string;
}): { title: string; body: string } {
  const title = "Menú Digital — Puerto ocupado";
  const cfgPath = `${opts.dataDir.replace(/\//g, "\\")}\\config.json`;
  const lines = [
    `El puerto ${opts.port} (${opts.host}) ya está en uso por otro programa.`,
    "No es una instancia de Menú Digital.",
    "",
    "Qué puede hacer:",
    "• Cerrar el programa que usa ese puerto, o",
    `• Cambiar "port" en ${cfgPath}`,
    "",
    "Luego vuelva a ejecutar Menú Digital.",
  ];
  if (opts.detail) {
    lines.push("", `Detalle técnico: ${opts.detail}`);
  }
  return { title, body: lines.join("\n") };
}

function utf16z(s: string): Buffer {
  return Buffer.from(`${s}\0`, "utf16le");
}

type MessageBoxW = (
  hwnd: number,
  text: ReturnType<typeof ptr>,
  caption: ReturnType<typeof ptr>,
  type: number,
) => number;

let messageBoxW: MessageBoxW | null | undefined;

function resolveMessageBoxW(): MessageBoxW | null {
  if (messageBoxW !== undefined) return messageBoxW;
  if (process.platform !== "win32") {
    messageBoxW = null;
    return null;
  }
  try {
    const lib = dlopen("user32.dll", {
      MessageBoxW: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.u32],
        returns: FFIType.i32,
      },
    });
    messageBoxW = lib.symbols.MessageBoxW as unknown as MessageBoxW;
  } catch {
    messageBoxW = null;
  }
  return messageBoxW;
}

/**
 * Muestra un MessageBox de error (bloqueante). En no-Windows escribe a stderr.
 * @returns true si se mostró el diálogo nativo
 */
export function showErrorMessageBox(title: string, message: string): boolean {
  const fn = resolveMessageBoxW();
  if (!fn) {
    console.error(`${title}\n${message}`);
    return false;
  }
  const MB_OK = 0x0000_0000;
  const MB_ICONERROR = 0x0000_0010;
  const MB_SETFOREGROUND = 0x0001_0000;
  const MB_TOPMOST = 0x0004_0000;
  const text = utf16z(message);
  const caption = utf16z(title);
  fn(0, ptr(text), ptr(caption), MB_OK | MB_ICONERROR | MB_SETFOREGROUND | MB_TOPMOST);
  return true;
}
