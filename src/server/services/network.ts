import { networkInterfaces } from "node:os";

export type NetCandidate = {
  interface: string;
  address: string;
  mac: string;
  recommended: boolean;
};

export type IpChangeEval = {
  ipChanged: boolean;
  currentIp: string | null;
  previousIp?: string;
};

export type IpWatchCheck = IpChangeEval & {
  savedIp: string | null;
  candidates: NetCandidate[];
  checkedAt: string;
  /** true si acabamos de pasar a ipChanged (evento nuevo para el log) */
  newlyChanged: boolean;
};

const SKIP = /vEthernet|VirtualBox|VMware|Hyper-V|Loopback/i;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** IPv4 de red local (RFC1918): 10/8, 172.16–31/12, 192.168/16. Sin loopback ni link-local. */
export function isPrivateLanIpv4(ip: string): boolean {
  const m = IPV4_RE.exec(ip.trim());
  if (!m) return false;
  const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function listLanCandidates(): NetCandidate[] {
  const ifaces = networkInterfaces();
  const out: NetCandidate[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (!list || SKIP.test(name)) continue;
    for (const info of list) {
      if (info.family !== "IPv4" && (info.family as unknown) !== 4) continue;
      if (info.internal) continue;
      if (info.address.startsWith("169.254.")) continue;
      const recommended =
        info.address.startsWith("192.168.") ||
        info.address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(info.address);
      out.push({
        interface: name,
        address: info.address,
        mac: info.mac.replace(/:/g, "-"),
        recommended,
      });
    }
  }
  out.sort((a, b) => Number(b.recommended) - Number(a.recommended));
  return out;
}

export function pickRecommendedIp(candidates: NetCandidate[]): string | null {
  return candidates.find((x) => x.recommended)?.address ?? candidates[0]?.address ?? null;
}

/**
 * RF-37: si `savedIp` ya no está en ninguna interfaz → cambio detectado.
 * `currentIp` es la recomendada entre las presentes (o null).
 */
export function evaluateIpChange(opts: {
  savedIp: string | null;
  candidates: NetCandidate[];
}): IpChangeEval {
  const recommended = pickRecommendedIp(opts.candidates);
  if (!opts.savedIp) {
    return { ipChanged: false, currentIp: recommended };
  }
  const stillPresent = opts.candidates.some((c) => c.address === opts.savedIp);
  if (stillPresent) {
    return { ipChanged: false, currentIp: opts.savedIp };
  }
  return {
    ipChanged: true,
    previousIp: opts.savedIp,
    currentIp: recommended,
  };
}

export type IpWatcherOpts = {
  getSavedIp: () => string | null;
  getFlag: () => boolean;
  setFlag: (changed: boolean) => void;
  listCandidates?: () => NetCandidate[];
  intervalMs?: number;
  log?: (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;
};

/** Vigilancia al arrancar y cada 60 s (RF-37). */
export function createIpWatcher(opts: IpWatcherOpts) {
  const list = opts.listCandidates ?? listLanCandidates;
  const intervalMs = opts.intervalMs ?? 60_000;
  const log = opts.log ?? (() => undefined);

  function check(): IpWatchCheck {
    const candidates = list();
    const savedIp = opts.getSavedIp();
    const evaled = evaluateIpChange({ savedIp, candidates });
    const wasFlagged = opts.getFlag();
    let newlyChanged = false;

    if (evaled.ipChanged) {
      if (!wasFlagged) {
        opts.setFlag(true);
        newlyChanged = true;
        log("warn", "La IP del equipo cambió (RF-37); los QR impresos pueden fallar", {
          previousIp: evaled.previousIp,
          currentIp: evaled.currentIp,
        });
      }
    } else if (wasFlagged) {
      // La IP guardada volvió a aparecer (p. ej. reserva DHCP aplicada)
      opts.setFlag(false);
      log("info", "IP guardada de nuevo presente; se quita el aviso de cambio", { savedIp });
    }

    return {
      ...evaled,
      savedIp,
      candidates,
      checkedAt: new Date().toISOString(),
      newlyChanged,
    };
  }

  function start(): { stop: () => void; check: typeof check } {
    check();
    const timer = setInterval(() => {
      try {
        check();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log("error", "Error en vigilancia de IP", { msg });
      }
    }, intervalMs);
    if (typeof timer === "object" && timer && "unref" in timer) {
      (timer as NodeJS.Timeout).unref();
    }
    log("info", "Vigilancia de IP activa (RF-37)", { intervalMs });
    return {
      stop: () => clearInterval(timer),
      check,
    };
  }

  return { check, start };
}
