import { networkInterfaces } from "node:os";

export type NetCandidate = {
  interface: string;
  address: string;
  mac: string;
  recommended: boolean;
};

const SKIP = /vEthernet|VirtualBox|VMware|Hyper-V|Loopback/i;

export function listLanCandidates(): NetCandidate[] {
  const ifaces = networkInterfaces();
  const out: NetCandidate[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (!list || SKIP.test(name)) continue;
    for (const info of list) {
      if (info.family !== "IPv4" && (info.family as unknown) !== 4) continue;
      if (info.internal) continue;
      if (info.address.startsWith("169.254.")) continue;
      const recommended =
        info.address.startsWith("192.168.") ||
        info.address.startsWith("10.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(info.address);
      out.push({
        interface: name,
        address: info.address,
        mac: info.mac.replace(/:/g, "-"),
        recommended,
      });
    }
  }
  out.sort((a, b) => Number(b.recommended) - Number(a.recommended));
  return out;
}
