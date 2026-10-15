/**
 * Hub SSE para actualización en vivo de la carta (M1).
 * Emite la revisión del menú; latido cada 25 s; tope de conexiones.
 */

export const MENU_EVENTS_MAX_CLIENTS = 64;
export const MENU_EVENTS_HEARTBEAT_MS = 25_000;

export type MenuEventsClient = {
  id: number;
  send: (chunk: string) => void;
  close: () => void;
};

export type MenuEventsHub = {
  /** Suscribe un cliente. Si hay cupo → client; si no → null. */
  subscribe: (send: (chunk: string) => void) => MenuEventsClient | null;
  unsubscribe: (id: number) => void;
  publishRevision: (revision: number) => void;
  clientCount: () => number;
  lastRevision: () => number | null;
  stop: () => void;
};

function sseData(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function createMenuEventsHub(opts?: {
  maxClients?: number;
  heartbeatMs?: number;
  log?: (level: "info" | "warn" | "debug", msg: string, extra?: Record<string, unknown>) => void;
}): MenuEventsHub {
  const maxClients = opts?.maxClients ?? MENU_EVENTS_MAX_CLIENTS;
  const heartbeatMs = opts?.heartbeatMs ?? MENU_EVENTS_HEARTBEAT_MS;
  const log = opts?.log ?? (() => undefined);
  const clients = new Map<number, MenuEventsClient>();
  let nextId = 1;
  let lastRev: number | null = null;
  let stopped = false;

  const heartbeat = setInterval(() => {
    if (stopped || clients.size === 0) return;
    const dead: number[] = [];
    for (const [id, client] of clients) {
      try {
        client.send(":hb\n\n");
      } catch {
        dead.push(id);
      }
    }
    for (const id of dead) {
      clients.get(id)?.close();
      clients.delete(id);
    }
  }, heartbeatMs);
  if (typeof heartbeat === "object" && heartbeat && "unref" in heartbeat) {
    (heartbeat as NodeJS.Timeout).unref();
  }

  return {
    subscribe(send) {
      if (stopped) return null;
      if (clients.size >= maxClients) {
        log("warn", "SSE carta: límite de conexiones", { maxClients, clients: clients.size });
        return null;
      }
      const id = nextId++;
      const client: MenuEventsClient = {
        id,
        send,
        close: () => {
          clients.delete(id);
        },
      };
      clients.set(id, client);
      log("debug", "SSE carta: cliente conectado", { id, clients: clients.size });
      // Estado actual al conectar
      if (lastRev != null) {
        try {
          send(sseData("revision", { revision: lastRev }));
        } catch {
          clients.delete(id);
          return null;
        }
      }
      return client;
    },

    unsubscribe(id) {
      const c = clients.get(id);
      if (!c) return;
      clients.delete(id);
      log("debug", "SSE carta: cliente desconectado", { id, clients: clients.size });
    },

    publishRevision(revision) {
      if (lastRev === revision) return;
      lastRev = revision;
      if (clients.size === 0) return;
      const payload = sseData("revision", { revision });
      const dead: number[] = [];
      for (const [id, client] of clients) {
        try {
          client.send(payload);
        } catch {
          dead.push(id);
        }
      }
      for (const id of dead) {
        clients.get(id)?.close();
        clients.delete(id);
      }
      log("debug", "SSE carta: revisión publicada", { revision, clients: clients.size });
    },

    clientCount: () => clients.size,
    lastRevision: () => lastRev,

    stop() {
      stopped = true;
      clearInterval(heartbeat);
      for (const client of clients.values()) {
        try {
          client.close();
        } catch {
          // ignore
        }
      }
      clients.clear();
    },
  };
}

/** Construye la Response SSE (ReadableStream). */
export function menuEventsResponse(hub: MenuEventsHub, getRevision: () => number): Response {
  // Sembrar última revisión conocida
  hub.publishRevision(getRevision());

  const encoder = new TextEncoder();
  let client: MenuEventsClient | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        controller.enqueue(encoder.encode(chunk));
      };
      client = hub.subscribe(send);
      if (!client) {
        closed = true;
        controller.error(new Error("SSE_LIMIT"));
        return;
      }
      // Asegurar evento inicial aunque publishRevision no reenviara (mismo rev)
      send(sseData("revision", { revision: getRevision() }));
    },
    cancel() {
      closed = true;
      if (client) {
        hub.unsubscribe(client.id);
        client = null;
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
