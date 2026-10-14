import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  adminAppUrl,
  resolveEdgePath,
  resolveShortcutTargetExe,
} from "../src/server/services/edge";

describe("edge (RF-03)", () => {
  test("adminAppUrl usa localhost y /admin", () => {
    expect(adminAppUrl(8080)).toBe("http://localhost:8080/admin");
    expect(adminAppUrl(8099)).toBe("http://localhost:8099/admin");
  });

  test("resolveEdgePath encuentra msedge si está instalado", () => {
    const edge = resolveEdgePath(null);
    if (process.platform === "win32") {
      // En el POS / máquinas de desarrollo con Edge
      if (edge) {
        expect(existsSync(edge)).toBe(true);
        expect(edge.toLowerCase().endsWith("msedge.exe")).toBe(true);
      }
    } else {
      expect(edge).toBeNull();
    }
  });

  test("resolveEdgePath respeta ruta configurada válida", () => {
    const found = resolveEdgePath(null);
    if (!found) return;
    expect(resolveEdgePath(found)).toBe(found);
  });

  test("resolveEdgePath ignora ruta inexistente y cae al default", () => {
    const fallback = resolveEdgePath("C:\\no-existe\\msedge.exe");
    expect(fallback).toBe(resolveEdgePath(null));
  });

  test("resolveShortcutTargetExe en bun puede ser null o MenuDigital instalado", () => {
    const target = resolveShortcutTargetExe();
    if (target) {
      expect(existsSync(target)).toBe(true);
      expect(target.toLowerCase().endsWith(".exe")).toBe(true);
    }
  });
});
