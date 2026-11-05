import dns from "node:dns/promises";
import net from "node:net";

export function isPublicIp(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)));
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPublicIp(v.slice(7));
  return !(v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v) || v.startsWith("ff"));
}

/** Fetches a page a user typed. Only public http(s) hosts, with redirects re-checked, a timeout, and a size cap. */
export async function fetchPublicText(url: string, maxBytes = 1_000_000, hops = 3): Promise<string> {
  const u = new URL(url);
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Link harus http atau https");
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || !addrs.every((a) => isPublicIp(a.address))) throw new Error("Link ini tidak bisa diakses");
  const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(10000) });
  if (res.status >= 300 && res.status < 400) {
    const next = res.headers.get("location");
    if (!next || hops <= 0) throw new Error("Link dialihkan terlalu banyak");
    return fetchPublicText(new URL(next, u).toString(), maxBytes, hops - 1);
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
}
