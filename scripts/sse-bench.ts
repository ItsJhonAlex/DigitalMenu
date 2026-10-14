/**
 * Mide clientes SSE y RSS del proceso servidor (o de este script si conecta remoto).
 *
 * Uso (servidor ya en marcha):
 *   bun scripts/sse-bench.ts --url http://127.0.0.1:8080 --clients 50
 *
 * Luego en Admin → diagnóstico: menuEvents.clients y memory.rssMB
 * (o GET /api/admin/diagnostics desde localhost).
 */
const args = Bun.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
}

const base = flag("url", "http://127.0.0.1:8080").replace(/\/$/, "");
const n = Math.max(1, Number(flag("clients", "50")) || 50);
const holdMs = Math.max(1000, Number(flag("holdMs", "15000")) || 15_000);

console.log(`SSE bench: ${n} clientes → ${base}/api/menu/events (${holdMs} ms)`);

const controllers: AbortController[] = [];
const started = Date.now();
let opened = 0;
let failed = 0;

for (let i = 0; i < n; i++) {
  const ac = new AbortController();
  controllers.push(ac);
  void fetch(`${base}/api/menu/events`, {
    headers: { Accept: "text/event-stream" },
    signal: ac.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        failed++;
        return;
      }
      opened++;
      const reader = res.body.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } catch {
        // abort esperado
      }
    })
    .catch(() => {
      failed++;
    });
}

await Bun.sleep(1500);
console.log(`Abiertas≈${opened} fallidas=${failed} tras 1.5s`);

try {
  const diag = await fetch(`${base}/api/admin/diagnostics`);
  if (diag.ok) {
    const body = (await diag.json()) as {
      memory?: { rssMB?: number; heapUsedMB?: number };
      menuEvents?: { clients?: number; maxClients?: number };
    };
    console.log("diagnostics:", JSON.stringify(body.menuEvents), JSON.stringify(body.memory));
  } else {
    console.log(`diagnostics HTTP ${diag.status} (¿solo localhost?)`);
  }
} catch (err) {
  console.log("diagnostics no disponible:", err instanceof Error ? err.message : err);
}

const mem = process.memoryUsage();
console.log(
  `bench RSS ${Math.round(mem.rss / 1024 / 1024)} MB (este proceso cliente; mirar diagnostics del servidor)`,
);

await Bun.sleep(holdMs);
for (const ac of controllers) ac.abort();
console.log(`Fin en ${Date.now() - started} ms`);
