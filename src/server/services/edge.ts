/**
 * Edge modo app + acceso directo del Admin (RF-03).
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function edgeCandidates(): string[] {
  const out: string[] = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    out.push(join(local, "Microsoft", "Edge", "Application", "msedge.exe"));
  }
  const pf = process.env.ProgramFiles;
  const pf86 = process.env["ProgramFiles(x86)"]; // clave con (x86)
  if (pf) out.push(join(pf, "Microsoft", "Edge", "Application", "msedge.exe"));
  if (pf86) out.push(join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"));
  return [...new Set(out)];
}

export const ADMIN_SHORTCUT_NAME = "Menú Digital — Admin.lnk";

export function resolveEdgePath(configured?: string | null): string | null {
  if (configured && existsSync(configured)) return configured;
  for (const p of edgeCandidates()) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function adminAppUrl(port: number): string {
  return `http://localhost:${port}/admin`;
}

/** Ruta del .exe para el acceso directo (null en dev si no hay MenuDigital.exe instalado). */
export function resolveShortcutTargetExe(): string | null {
  const exe = process.execPath;
  if (/[/\\]bun(\.exe)?$/i.test(exe)) {
    const prod = "C:\\MenuDigital\\MenuDigital.exe";
    return existsSync(prod) ? prod : null;
  }
  return existsSync(exe) ? exe : null;
}

export function listDesktopDirs(): string[] {
  const out: string[] = [];
  const user = process.env.USERPROFILE;
  const pub = process.env.PUBLIC;
  if (user) {
    out.push(join(user, "Desktop"));
    out.push(join(user, "Escritorio"));
  }
  if (pub) {
    out.push(join(pub, "Desktop"));
    out.push(join(pub, "Escritorio"));
  }
  return [...new Set(out)].filter((d) => existsSync(d));
}

function openDefaultBrowser(url: string): boolean {
  try {
    if (process.platform === "win32") {
      Bun.spawn(["cmd", "/c", "start", "", url], {
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
      }).unref();
      return true;
    }
    if (process.platform === "darwin") {
      Bun.spawn(["open", url], { stdio: ["ignore", "ignore", "ignore"] }).unref();
      return true;
    }
    Bun.spawn(["xdg-open", url], { stdio: ["ignore", "ignore", "ignore"] }).unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Abre el Admin en Edge --app. Si falla o no hay Edge → navegador predeterminado.
 * Nunca lanza: errores se capturan para no tumbar el servidor.
 */
export async function openAdminInEdge(opts: {
  port: number;
  edgePath?: string | null;
}): Promise<{ ok: true; edge: string; url: string } | { ok: false; reason: string }> {
  const url = adminAppUrl(opts.port);
  const edge = resolveEdgePath(opts.edgePath ?? null);

  if (edge) {
    try {
      Bun.spawn([edge, `--app=${url}`, "--window-size=1280,760"], {
        stdio: ["ignore", "ignore", "ignore"],
        windowsHide: true,
      }).unref();
      return { ok: true, edge, url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Continuar con fallback
      if (!openDefaultBrowser(url)) {
        return { ok: false, reason: `Edge falló (${msg}) y el navegador predeterminado también` };
      }
      return { ok: true, edge: "default-browser", url };
    }
  }

  if (openDefaultBrowser(url)) {
    return { ok: true, edge: "default-browser", url };
  }
  return { ok: false, reason: "msedge.exe no encontrado y no se pudo abrir el navegador" };
}

function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Crea/actualiza el acceso directo del Admin en escritorios disponibles.
 * Apunta a MenuDigital.exe --open-admin (RF-03).
 */
export async function ensureAdminDesktopShortcut(opts?: {
  targetExe?: string | null;
  arguments?: string;
}): Promise<{ created: string[]; skipped?: string }> {
  if (process.platform !== "win32") {
    return { created: [], skipped: "no-windows" };
  }
  const target = opts?.targetExe ?? resolveShortcutTargetExe();
  if (!target) {
    return { created: [], skipped: "sin-exe" };
  }
  const args = opts?.arguments ?? "--open-admin";
  const workDir = dirname(target);
  const desktops = listDesktopDirs();
  if (desktops.length === 0) {
    return { created: [], skipped: "sin-escritorio" };
  }

  const created: string[] = [];
  for (const desk of desktops) {
    const lnk = join(desk, ADMIN_SHORTCUT_NAME);
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$ws = New-Object -ComObject WScript.Shell`,
      `$s = $ws.CreateShortcut(${psQuote(lnk)})`,
      `$s.TargetPath = ${psQuote(target)}`,
      `$s.Arguments = ${psQuote(args)}`,
      `$s.WorkingDirectory = ${psQuote(workDir)}`,
      `$s.WindowStyle = 1`,
      `$s.Description = ${psQuote("Menú Digital — Admin (Avanzar In Time)")}`,
      `$s.IconLocation = ${psQuote(`${target},0`)}`,
      "$s.Save()",
    ].join("; ");

    try {
      const proc = Bun.spawn(
        [
          "powershell",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          script,
        ],
        { stdout: "ignore", stderr: "pipe", windowsHide: true },
      );
      const code = await proc.exited;
      if (code === 0 && existsSync(lnk)) {
        created.push(lnk);
      }
    } catch {
      // no tumbar el servidor por un acceso directo
    }
  }
  return { created };
}

/** Espera a que /api/health responda (tras Bun.serve o instancia ya activa). */
export async function waitForHealth(port: number, attempts = 50): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(400),
      });
      if (!res.ok) {
        await Bun.sleep(50);
        continue;
      }
      const body = (await res.json()) as { app?: string };
      if (body.app === "DigitalMenu") return true;
    } catch {
      // reintentar
    }
    await Bun.sleep(50);
  }
  return false;
}
