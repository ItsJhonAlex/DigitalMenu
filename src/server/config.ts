import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type AppConfig = {
  port: number;
  host: string;
  edgePath: string | null;
  logLevel: "debug" | "info" | "warn" | "error";
  backup: { keepDaily: number; hour: number };
};

export type RuntimeOptions = {
  dataDir: string;
  config: AppConfig;
  configPath: string;
  dev: boolean;
  openAdmin: boolean;
  version: string;
};

const DEFAULT_CONFIG: AppConfig = {
  port: 8080,
  host: "0.0.0.0",
  edgePath: null,
  logLevel: "info",
  backup: { keepDaily: 14, hour: 4 },
};

const PRODUCTION_DATA = "C:\\MenuDigital\\data";

export function parseArgs(argv: string[] = Bun.argv): {
  dataDir?: string;
  port?: number;
  dev: boolean;
  openAdmin: boolean;
} {
  let dataDir: string | undefined;
  let port: number | undefined;
  let dev = false;
  let openAdmin = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dev") dev = true;
    else if (a === "--open-admin") openAdmin = true;
    else if (a === "--data" && argv[i + 1]) {
      dataDir = argv[++i];
    } else if (a === "--port" && argv[i + 1]) {
      port = Number(argv[++i]);
    }
  }

  return { dataDir, port, dev, openAdmin };
}

export function resolveDataDir(cliData?: string): string {
  if (cliData) return resolve(cliData);
  if (process.env.MENUDIGITAL_DATA) return resolve(process.env.MENUDIGITAL_DATA);
  return resolve(PRODUCTION_DATA);
}

export function ensureDataLayout(dataDir: string): void {
  for (const sub of ["", "images", "backups", "logs"]) {
    const path = sub ? join(dataDir, sub) : dataDir;
    if (!existsSync(path)) mkdirSync(path, { recursive: true });
  }
}

function readConfigFile(path: string): Partial<AppConfig> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Partial<AppConfig>;
  } catch {
    return {};
  }
}

function writeConfigFile(path: string, config: AppConfig): void {
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function loadRuntime(argv: string[] = Bun.argv): RuntimeOptions {
  const args = parseArgs(argv);
  const dataDir = resolveDataDir(args.dataDir);
  ensureDataLayout(dataDir);

  const configPath = join(dataDir, "config.json");
  const fileCfg = readConfigFile(configPath);
  const config: AppConfig = {
    ...DEFAULT_CONFIG,
    ...fileCfg,
    backup: { ...DEFAULT_CONFIG.backup, ...fileCfg.backup },
  };

  if (typeof args.port === "number" && Number.isFinite(args.port) && args.port > 0) {
    config.port = args.port;
  }

  if (!existsSync(configPath)) {
    writeConfigFile(configPath, config);
  }

  const version =
    typeof process.env.APP_VERSION === "string" && process.env.APP_VERSION.length > 0
      ? process.env.APP_VERSION
      : "0.1.0";

  return {
    dataDir,
    config,
    configPath,
    dev: args.dev,
    openAdmin: args.openAdmin,
    version,
  };
}
