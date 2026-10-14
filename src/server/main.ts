import { join } from "node:path";
import { createApp } from "./app";
import { loadRuntime } from "./config";
import { closeDatabase, openDatabase } from "./db";
import { migrate } from "./db/migrate";
import { createRepos } from "./db/repos";
import { createLogger } from "./logger";
import { createBackupService } from "./services/backup";
import { ensureAdminDesktopShortcut, openAdminInEdge, waitForHealth } from "./services/edge";
import { isAddressInUseError, portInUseDialog, showErrorMessageBox } from "./services/native";
import { createIpWatcher } from "./services/network";

const runtime = loadRuntime();
const log = createLogger({
  logsDir: join(runtime.dataDir, "logs"),
  level: runtime.config.logLevel,
});

const startedAt = Date.now();

const db = openDatabase(runtime.dataDir);
try {
  const result = migrate(db, {
    dataDir: runtime.dataDir,
    log: (msg) => log.info(msg),
  });
  if (result.applied.length > 0) {
    log.info("Migraciones aplicadas", { versions: result.applied });
  } else {
    log.info("Esquema al día", { versions: result.already });
  }
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  log.error("Fallo al migrar la base de datos; no se arranca el servidor", { msg });
  closeDatabase(db);
  log.close();
  process.exit(1);
}

const repos = createRepos(db);
/** Mismo objeto que createApp muta en rebindDatabase (RF-52). */
const ctx = { runtime, log, startedAt, db, repos };
const app = createApp(ctx);

async function alreadyRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(500),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { app?: string };
    return body.app === "DigitalMenu";
  } catch {
    return false;
  }
}

async function openAdminIfRequested(): Promise<void> {
  if (!runtime.openAdmin) return;
  const port = runtime.config.port;
  const ready = await waitForHealth(port);
  if (!ready) {
    log.warn("No se pudo abrir el Admin: /api/health no respondió a tiempo");
    return;
  }
  const opened = await openAdminInEdge({
    port,
    edgePath: runtime.config.edgePath,
  });
  if (opened.ok) {
    log.info("Admin abierto en Edge modo app", { url: opened.url, edge: opened.edge });
  } else {
    log.warn("No se pudo lanzar Edge", { reason: opened.reason });
  }
}

async function ensureDesktopShortcut(): Promise<void> {
  try {
    const result = await ensureAdminDesktopShortcut();
    if (result.created.length > 0) {
      log.info("Acceso directo Admin en escritorio", { paths: result.created });
    } else if (result.skipped) {
      log.info("Acceso directo Admin no creado", { reason: result.skipped });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn("No se pudo crear el acceso directo del Admin", { msg });
  }
}

async function main() {
  const { port, host } = runtime.config;

  if (await alreadyRunning(port)) {
    log.info(`Otra instancia activa en :${port}; no se arranca un segundo servidor`);
    closeDatabase(db);
    await ensureDesktopShortcut();
    await openAdminIfRequested();
    log.close();
    return;
  }

  try {
    Bun.serve({
      hostname: host,
      port,
      maxRequestBodySize: 3 * 1024 * 1024,
      fetch: (req, server) => app.fetch(req, { server }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    closeDatabase(db);
    if (isAddressInUseError(err)) {
      // RF-04: puerto ocupado por otro programa → log + MessageBox + exit ≠ 0
      const dialog = portInUseDialog({
        port,
        host,
        dataDir: runtime.dataDir,
        detail: msg,
      });
      log.error(`Puerto ${port} ocupado por otro programa (RF-04)`, {
        host,
        port,
        msg,
      });
      log.close();
      showErrorMessageBox(dialog.title, dialog.body);
      process.exit(1);
    }
    log.error(`No se pudo escuchar en ${host}:${port}`, { msg });
    log.close();
    process.exit(1);
  }

  const ms = Date.now() - startedAt;
  log.info(`Arrancado v${runtime.version} en ${ms}ms`, {
    port,
    host,
    dataDir: runtime.dataDir,
    dev: runtime.dev,
    restaurant: repos.settings.getJson("carta.restaurant_name", "—"),
    categories: repos.categories.list().length,
  });

  // RF-50: copia diaria al arrancar si > 24 h, y a la hora configurada
  const backups = createBackupService({
    dataDir: runtime.dataDir,
    getDb: () => ctx.db,
    keepDaily: runtime.config.backup.keepDaily,
    hour: runtime.config.backup.hour,
    getLastAutoAt: () => ctx.repos.settings.getJson<string | null>("backup.last_at", null),
    setLastAutoAt: (iso) => ctx.repos.settings.setJson("backup.last_at", iso),
    log: (level, msg, extra) => log[level](msg, extra),
  });
  try {
    backups.maybeCreateScheduled("startup");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("Fallo en copia diaria al arrancar", { msg });
  }
  backups.startDailyScheduler();

  // RF-37: comprobar IP al arrancar y cada 60 s
  createIpWatcher({
    getSavedIp: () => ctx.repos.settings.getJson<string | null>("network.carta_ip", null),
    getFlag: () => ctx.repos.settings.getJson<boolean>("network.ip_changed", false),
    setFlag: (changed) => ctx.repos.settings.setJson("network.ip_changed", changed),
    intervalMs: 60_000,
    log: (level, msg, extra) => log[level](msg, extra),
  }).start();

  await ensureDesktopShortcut();
  await openAdminIfRequested();
}

function shutdown(signal: string) {
  log.info(`Parada (${signal})`);
  try {
    closeDatabase(ctx.db);
  } catch {
    // ignore
  }
  log.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await main();
