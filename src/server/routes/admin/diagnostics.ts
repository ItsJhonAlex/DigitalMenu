import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AppContext } from "../../app";
import { appliedVersions } from "../../db/migrate";
import { createAdminRouter } from "./base";

export function diagnosticsAdmin(ctx: AppContext) {
  const app = createAdminRouter(ctx);

  app.get("/api/admin/diagnostics", (c) => {
    const mem = process.memoryUsage();
    const dbPath = join(ctx.runtime.dataDir, "menu.db");
    const imagesDir = join(ctx.runtime.dataDir, "images");
    let imagesBytes = 0;
    if (existsSync(imagesDir)) {
      for (const f of readdirSync(imagesDir)) {
        imagesBytes += statSync(join(imagesDir, f)).size;
      }
    }
    const logsDir = join(ctx.runtime.dataDir, "logs");
    let logTail: string[] = [];
    if (existsSync(logsDir)) {
      const logs = readdirSync(logsDir)
        .filter((f) => f.endsWith(".log"))
        .sort();
      const last = logs[logs.length - 1];
      if (last) {
        const text = readFileSync(join(logsDir, last), "utf8");
        logTail = text.trim().split(/\r?\n/).slice(-20);
      }
    }
    const versions = appliedVersions(ctx.db);

    return c.json({
      version: ctx.runtime.version,
      bunVersion: Bun.version,
      dataDir: ctx.runtime.dataDir,
      port: ctx.runtime.config.port,
      uptimeSec: Math.floor((Date.now() - ctx.startedAt) / 1000),
      memory: {
        rssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
      dbBytes: existsSync(dbPath) ? statSync(dbPath).size : 0,
      imagesBytes,
      schemaVersion: versions[versions.length - 1] ?? 0,
      logTail,
    });
  });

  return app;
}
