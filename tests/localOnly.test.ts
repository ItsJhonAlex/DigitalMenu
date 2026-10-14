import { describe, expect, test } from "bun:test";
import {
  isAllowedAdminHost,
  isAllowedAdminOrigin,
  isLoopbackIp,
  isWriteOriginAllowed,
} from "../src/server/middleware/localOnly";
import { isPrivateLanIpv4 } from "../src/server/services/network";

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

  test("Origin permitido", () => {
    expect(isAllowedAdminOrigin("http://localhost:8080", 8080)).toBe(true);
    expect(isAllowedAdminOrigin("http://127.0.0.1:8080", 8080)).toBe(true);
    expect(isAllowedAdminOrigin("http://evil.test", 8080)).toBe(false);
  });

  test("escritura sin Origin solo si Sec-Fetch-Site es same-origin", () => {
    expect(
      isWriteOriginAllowed({
        origin: undefined,
        secFetchSite: "same-origin",
        port: 8080,
      }),
    ).toBe(true);
    expect(
      isWriteOriginAllowed({
        origin: null,
        secFetchSite: "cross-site",
        port: 8080,
      }),
    ).toBe(false);
    expect(
      isWriteOriginAllowed({
        origin: undefined,
        secFetchSite: "same-site",
        port: 8080,
      }),
    ).toBe(false);
    expect(
      isWriteOriginAllowed({
        origin: undefined,
        secFetchSite: undefined,
        port: 8080,
      }),
    ).toBe(false);
    expect(
      isWriteOriginAllowed({
        origin: "http://localhost:8080",
        secFetchSite: "cross-site",
        port: 8080,
      }),
    ).toBe(true);
    expect(
      isWriteOriginAllowed({
        origin: "http://evil.test",
        secFetchSite: "same-origin",
        port: 8080,
      }),
    ).toBe(false);
  });
});

describe("isPrivateLanIpv4", () => {
  test("acepta rangos RFC1918", () => {
    expect(isPrivateLanIpv4("192.168.1.50")).toBe(true);
    expect(isPrivateLanIpv4("10.0.0.1")).toBe(true);
    expect(isPrivateLanIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateLanIpv4("172.31.255.255")).toBe(true);
  });

  test("rechaza públicas, loopback y link-local", () => {
    expect(isPrivateLanIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateLanIpv4("127.0.0.1")).toBe(false);
    expect(isPrivateLanIpv4("169.254.1.1")).toBe(false);
    expect(isPrivateLanIpv4("172.15.0.1")).toBe(false);
    expect(isPrivateLanIpv4("172.32.0.1")).toBe(false);
    expect(isPrivateLanIpv4("not-an-ip")).toBe(false);
    expect(isPrivateLanIpv4("192.168.1.256")).toBe(false);
  });
});
