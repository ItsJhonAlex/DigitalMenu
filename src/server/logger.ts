import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type Logger = {
  debug: (msg: string, extra?: unknown) => void;
  info: (msg: string, extra?: unknown) => void;
  warn: (msg: string, extra?: unknown) => void;
  error: (msg: string, extra?: unknown) => void;
  flush: () => void;
  close: () => void;
};

export function createLogger(opts: {
  logsDir: string;
  level: LogLevel;
  keepDays?: number;
}): Logger {
  const keepDays = opts.keepDays ?? 30;
  if (!existsSync(opts.logsDir)) mkdirSync(opts.logsDir, { recursive: true });

  let buffer = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const minLevel = LEVEL_ORDER[opts.level];

  const dayStamp = () => new Date().toISOString().slice(0, 10);
  const fileFor = (day: string) => join(opts.logsDir, `menudigital-${day}.log`);

  const flush = () => {
    if (!buffer) return;
    const chunk = buffer;
    buffer = "";
    try {
      appendFileSync(fileFor(dayStamp()), chunk, "utf8");
    } catch {
      // Evitar bucles si el disco falla
    }
  };

  const scheduleFlush = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, 2000);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  };

  const write = (level: LogLevel, msg: string, extra?: unknown) => {
    if (LEVEL_ORDER[level] < minLevel) return;
    const line =
      extra === undefined
        ? `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}\n`
        : `${new Date().toISOString()} [${level.toUpperCase()}] ${msg} ${safeJson(extra)}\n`;
    buffer += line;
    if (level === "error") flush();
    else scheduleFlush();
    if (level === "error" || level === "warn") {
      console.error(line.trimEnd());
    } else {
      console.log(line.trimEnd());
    }
  };

  rotateOldLogs(opts.logsDir, keepDays);

  return {
    debug: (m, e) => write("debug", m, e),
    info: (m, e) => write("info", m, e),
    warn: (m, e) => write("warn", m, e),
    error: (m, e) => write("error", m, e),
    flush,
    close: () => {
      if (timer) clearTimeout(timer);
      flush();
    },
  };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function rotateOldLogs(logsDir: string, keepDays: number): void {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  try {
    for (const name of readdirSync(logsDir)) {
      const m = /^menudigital-(\d{4}-\d{2}-\d{2})\.log$/.exec(name);
      if (!m?.[1]) continue;
      const t = Date.parse(`${m[1]}T00:00:00Z`);
      if (Number.isFinite(t) && t < cutoff) {
        unlinkSync(join(logsDir, name));
      }
    }
  } catch {
    // ignore
  }
}
