import { describe, expect, test } from "bun:test";
import {
  type NetCandidate,
  createIpWatcher,
  evaluateIpChange,
} from "../src/server/services/network";

function cand(address: string, recommended = true): NetCandidate {
  return { interface: "Wi-Fi", address, mac: "00-11-22-33-44-55", recommended };
}

describe("evaluateIpChange (RF-37)", () => {
  test("sin IP guardada → no hay cambio", () => {
    const r = evaluateIpChange({
      savedIp: null,
      candidates: [cand("192.168.1.73")],
    });
    expect(r.ipChanged).toBe(false);
    expect(r.currentIp).toBe("192.168.1.73");
  });

  test("IP guardada presente → sin aviso", () => {
    const r = evaluateIpChange({
      savedIp: "192.168.1.50",
      candidates: [cand("192.168.1.50"), cand("10.0.0.2", false)],
    });
    expect(r.ipChanged).toBe(false);
    expect(r.currentIp).toBe("192.168.1.50");
  });

  test("IP guardada ausente → cambio con previous/current", () => {
    const r = evaluateIpChange({
      savedIp: "192.168.1.50",
      candidates: [cand("192.168.1.73")],
    });
    expect(r.ipChanged).toBe(true);
    expect(r.previousIp).toBe("192.168.1.50");
    expect(r.currentIp).toBe("192.168.1.73");
  });

  test("sin candidatos y con IP guardada → cambio", () => {
    const r = evaluateIpChange({ savedIp: "192.168.1.50", candidates: [] });
    expect(r.ipChanged).toBe(true);
    expect(r.currentIp).toBeNull();
  });
});

describe("createIpWatcher", () => {
  test("persiste flag, registra solo en la primera detección", () => {
    const logs: Array<{ level: string; msg: string }> = [];
    const savedIp: string | null = "192.168.1.50";
    let flag = false;
    let candidates = [cand("192.168.1.73")];

    const watcher = createIpWatcher({
      getSavedIp: () => savedIp,
      getFlag: () => flag,
      setFlag: (v) => {
        flag = v;
      },
      listCandidates: () => candidates,
      intervalMs: 60_000,
      log: (level, msg) => logs.push({ level, msg }),
    });

    const first = watcher.check();
    expect(first.newlyChanged).toBe(true);
    expect(first.ipChanged).toBe(true);
    expect(flag).toBe(true);
    expect(logs.some((l) => l.level === "warn" && /RF-37/.test(l.msg))).toBe(true);

    const warnCount = logs.filter((l) => l.level === "warn").length;
    const second = watcher.check();
    expect(second.newlyChanged).toBe(false);
    expect(logs.filter((l) => l.level === "warn").length).toBe(warnCount);

    // Vuelve la IP guardada → limpia aviso
    candidates = [cand("192.168.1.50")];
    const third = watcher.check();
    expect(third.ipChanged).toBe(false);
    expect(flag).toBe(false);
    expect(logs.some((l) => l.level === "info" && /presente/.test(l.msg))).toBe(true);
  });

  test("PUT-equivalente: aceptar nueva IP limpia el flujo", () => {
    let savedIp: string | null = "192.168.1.50";
    let flag = true;
    const watcher = createIpWatcher({
      getSavedIp: () => savedIp,
      getFlag: () => flag,
      setFlag: (v) => {
        flag = v;
      },
      listCandidates: () => [cand("192.168.1.73")],
    });
    // Admin elige la nueva IP
    savedIp = "192.168.1.73";
    flag = false;
    const r = watcher.check();
    expect(r.ipChanged).toBe(false);
    expect(flag).toBe(false);
  });
});
