import { join } from "node:path";
import { createApp } from "./app";
import { loadRuntime } from "./config";
import { closeDatabase, openDatabase } from "./db";
import { migrate } from "./db/migrate";
import { createRepos } from "./db/repos";
import { createLogger } from "./logger";

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

async function main() {
  const { port, host } = runtime.config;

  if (await alreadyRunning(port)) {
    log.info(`Otra instancia activa en :${port}; no se arranca un segundo servidor`);
    closeDatabase(db);
    if (runtime.openAdmin) {
      log.info("Flag --open-admin: Edge aún no implementado (F2)");
    }
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
    log.error(`No se pudo escuchar en ${host}:${port}`, { msg });
    closeDatabase(db);
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

  if (runtime.openAdmin) {
    log.info("Flag --open-admin: Edge aún no implementado (F2)");
  }
}

function shutdown(signal: string) {
  log.info(`Parada (${signal})`);
  closeDatabase(db);
  log.close();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

await main();
