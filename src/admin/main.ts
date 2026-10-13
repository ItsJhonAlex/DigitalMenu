/** Admin SPA (hash router). Stub F0/F1. */

async function ping(): Promise<void> {
  const status = document.getElementById("status");
  try {
    const res = await fetch("/api/admin/ping");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { version: string; dataDir: string };
    if (status) {
      status.textContent = `OK · v${data.version} · datos: ${data.dataDir}`;
    }
  } catch (err) {
    if (status) {
      status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

void ping();
