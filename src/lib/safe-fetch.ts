import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";

function isPublicV4(ip: string) {
  const [a, b, c] = ip.split(".").map(Number);
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113)
  );
}

/** Expands an IPv6 address to eight 16-bit groups, including a trailing dotted IPv4 part. */
function hextets(ip: string): number[] | null {
  let s = ip;
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    if (!net.isIPv4(dotted[1])) return null;
    const [a, b, c, d] = dotted[1].split(".").map(Number);
    s = s.slice(0, -dotted[1].length) + ((a << 8) | b).toString(16) + ":" + ((c << 8) | d).toString(16);
  }
  const [head, tail] = s.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const fill = s.includes("::") ? 8 - left.length - right.length : 0;
  const all = [...left, ...Array(Math.max(fill, 0)).fill("0"), ...right].map((h) => parseInt(h, 16));
  return all.length === 8 && all.every((n) => Number.isInteger(n)) ? all : null;
}

/** Deny by default: IPv6 counts as public only inside global unicast, and embedded IPv4 forms are unwrapped or refused. */
export function isPublicIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPublicV4(ip);
  if (!net.isIPv6(ip) || ip.includes("%")) return false;
  const h = hextets(ip);
  if (!h) return false;
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) {
    return isPublicV4(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`);
  }
  if ((h[0] & 0xe000) !== 0x2000) return false;
  if (h[0] === 0x2002) return false;
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return false;
  return true;
}

/** Validates at connect time, on the address really used, so DNS can't change between check and connection. */
export const publicLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return (callback as (e: Error) => void)(err);
    const list = addrs as dns.LookupAddress[];
    if (!list.length || !list.every((a) => isPublicIp(a.address))) return (callback as (e: Error) => void)(new Error("Link ini tidak bisa diakses"));
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    (callback as (e: null, a: string, f: number) => void)(null, list[0].address, list[0].family);
  });
};

/** Fetches a page a user typed. Only public http(s) hosts, with redirects re-checked, a timeout, and a size cap. */
export async function fetchPublicText(url: string, maxBytes = 1_000_000, hops = 3): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Link harus http atau https");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  // IP literals skip DNS lookup, so they are checked here.
  if (net.isIP(host) && !isPublicIp(host)) throw new Error("Link ini tidak bisa diakses");
  const dispatcher = new Agent({ connect: { lookup: publicLookup } });
  try {
    const res = await undiciFetch(u, { redirect: "manual", signal: AbortSignal.timeout(10000), dispatcher });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next || hops <= 0) throw new Error("Link dialihkan terlalu banyak");
      return await fetchPublicText(new URL(next, u).toString(), maxBytes, hops - 1);
    }
    if (!res.ok || !res.body) throw new Error(`Halaman tidak bisa dibaca (${res.status})`);
    const reader = res.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); break; }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  } finally {
    await dispatcher.close().catch(() => {});
  }
}
