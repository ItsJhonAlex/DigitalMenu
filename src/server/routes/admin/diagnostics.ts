import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AppContext } from "../../app";
import { appliedVersions } from "../../db/migrate";
import { BACKUP_FILE_RE } from "../../services/backup";
import { MENU_EVENTS_MAX_CLIENTS } from "../../services/menu-events";
import { evaluateIpChange, listLanCandidates } from "../../services/network";
import { createAdminRouter } from "./base";

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  let total = 0;
  for (const f of readdirSync(dir)) {
    try {
      const st = statSync(join(dir, f));
      if (st.isFile()) total += st.size;
    } catch {
      // ignore
    }
  }
  return total;
}

function latestBackup(backupsDir: string): {
  file: string;
  bytes: number;
  createdAt: string;
} | null {
  if (!existsSync(backupsDir)) return null;
  const items = readdirSync(backupsDir)
    .filter((f) => BACKUP_FILE_RE.test(f) || /\.(db|zip)$/i.test(f))
    .filter((f) => !f.startsWith("."))
    .map((file) => {
      const st = statSync(join(backupsDir, file));
      return { file, bytes: st.size, createdAt: st.mtime.toISOString(), mtime: st.mtimeMs };
    })
    .sort((a, b) => b.file.localeCompare(a.file) || b.mtime - a.mtime);
  const top = items[0];
  if (!top) return null;
  return { file: top.file, bytes: top.bytes, createdAt: top.createdAt };
}

function readLogLines(logsDir: string, maxLines: number): string[] {
  if (!existsSync(logsDir)) return [];
  const logs = readdirSync(logsDir)
    .filter((f) => f.endsWith(".log"))
    .sort();
  const last = logs[logs.length - 1];
  if (!last) return [];
  try {
    const text = readFileSync(join(logsDir, last), "utf8");
    return text.trim().split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  }
}

/** Avisos relevantes: WARN/ERROR o frases clave (IP, copia, SSE…). */
function pickLogAlerts(lines: string[], max = 30): string[] {
  const key =
    /\[(WARN|ERROR)\]|RF-37|IP del (equipo|POS)|copia|backup|SSE|EADDRINUSE|fall[oó]|error/i;
  const alerts = lines.filter((l) => key.test(l));
  return (alerts.length > 0 ? alerts : lines.filter((l) => /\[(WARN|ERROR)\]/.test(l))).slice(
    -max,
  );
}

export function diagnosticsAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);

  app.get("/api/admin/diagnostics", (c) => {
    const mem = process.memoryUsage();
    const dbPath = join(ctx.runtime.dataDir, "menu.db");
    const imagesDir = join(ctx.runtime.dataDir, "images");
    const backupsDir = join(ctx.runtime.dataDir, "backups");
    const logsDir = join(ctx.runtime.dataDir, "logs");
    const versions = appliedVersions(ctx.db);

    const candidates = listLanCandidates();
    const savedIp = ctx.repos.settings.getJson<string | null>("network.carta_ip", null);
    const evaled = evaluateIpChange({ savedIp, candidates });
    const port = ctx.runtime.config.port;
    const displayIp = savedIp ?? evaled.currentIp;
    const logTail = readLogLines(logsDir, 200);
    const lastBackup = latestBackup(backupsDir);
    const lastAutoAt = ctx.repos.settings.getJson<string | null>("backup.last_at", null);

    return c.json({
      version: ctx.runtime.version,
      bunVersion: Bun.version,
      dataDir: ctx.runtime.dataDir,
      port,
      uptimeSec: Math.floor((Date.now() - ctx.startedAt) / 1000),
      memory: {
        rssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
      menuEvents: {
        clients: ctx.menuEvents.clientCount(),
        maxClients: MENU_EVENTS_MAX_CLIENTS,
        lastRevision: ctx.menuEvents.lastRevision(),
      },
      network: {
        savedIp,
        currentIp: evaled.currentIp,
        ipChanged: evaled.ipChanged,
        cartaUrl: displayIp ? `http://${displayIp}:${port}/` : null,
        checkedAt: new Date().toISOString(),
      },
      lastBackup,
      lastAutoAt,
      dbBytes: existsSync(dbPath) ? statSync(dbPath).size : 0,
      imagesBytes: dirBytes(imagesDir),
      schemaVersion: versions[versions.length - 1] ?? 0,
      logTail,
      logAlerts: pickLogAlerts(logTail, 40),
      checkedAt: new Date().toISOString(),
    });
  });

  return app;
}
