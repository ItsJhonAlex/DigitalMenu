import { describe, expect, test } from "bun:test";
import { isAllowedAdminHost, isLoopbackIp } from "../src/server/middleware/localOnly";

describe("localOnly helpers", () => {
  test("loopback IPv4/IPv6", () => {
    expect(isLoopbackIp("127.0.0.1")).toBe(true);
    expect(isLoopbackIp("::1")).toBe(true);
    expect(isLoopbackIp("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackIp("192.168.1.10")).toBe(false);
  });

  test("Host permitido", () => {
    expect(isAllowedAdminHost("localhost:8080", 8080)).toBe(true);
    expect(isAllowedAdminHost("127.0.0.1:8080", 8080)).toBe(true);
    expect(isAllowedAdminHost("192.168.1.10:8080", 8080)).toBe(false);
  });
});
