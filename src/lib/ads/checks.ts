import { execFile } from "node:child_process";
import fs from "node:fs";
import { promisify } from "node:util";
import sharp from "sharp";
import type { CreativeCheck, GoalKey } from "@/db/schema";
import { checkCompliance } from "./compliance";

const run = promisify(execFile);

export type CopyInput = { hook: string; primaryText: string; headline: string; cta: string; whatsappOpener: string | null; formQuestions: string[] | null; script: string | null };
export type CheckProduct = { category: string; bpomNumber: string | null; approvedClaims: string[]; proof: string[]; neverSay: string[]; alwaysSay: string[]; name: string };

/** Every text a customer can see or hear. */
export const customerTexts = (c: CopyInput) => [c.hook, c.primaryText, c.headline, c.cta, c.whatsappOpener ?? "", ...(c.formQuestions ?? []), c.script ?? ""].filter(Boolean);

const HEALTH_PRO = /\b(dokter|dr\.|apoteker|bidan|perawat|dermatolog\w*|tenaga (medis|kesehatan))\b/i;
const TRANSFORMATION = /(sebelum\s*(dan|&|\/)\s*sesudah|before\s*(and|&|\/)?\s*after|hasil\s+(instan|dalam)|dalam\s+\d+\s+(hari|minggu))/i;
const QUOTE = /[“"]([^”"]{8,})[”"]/g;

export function textChecks(c: CopyInput, p: CheckProduct, blocked: string[], goal: GoalKey): CreativeCheck[] {
  const all = customerTexts(c); const joined = all.join("\n"); const lower = joined.toLowerCase();
  const out: CreativeCheck[] = [];
  const comp = checkCompliance(all, p);
  out.push({ key: "claims", label: "Klaim dan BPOM", status: comp.passed ? "pass" : "fail", detail: comp.issues.join(", ") || undefined });

  const words = [...blocked, ...p.neverSay].filter((w) => lower.includes(w.toLowerCase()));
  out.push({ key: "banned_words", label: "Kata yang dilarang", status: words.length ? "fail" : "pass", detail: words.join(", ") || undefined });

  if (p.category === "cosmetic") {
    const m = joined.match(HEALTH_PRO);
    out.push({ key: "health_pro", label: "Tanpa tenaga kesehatan", status: m ? "fail" : "pass", detail: m ? `BPOM melarang tenaga kesehatan dalam iklan kosmetik: "${m[0]}"` : undefined });
  }
  if (p.category !== "general") {
    const m = joined.match(TRANSFORMATION);
    out.push({ key: "transformation", label: "Tanpa janji perubahan", status: m ? "fail" : "pass", detail: m ? `Diblokir sampai aturan Meta dan BPOM dikonfirmasi: "${m[0]}"` : undefined });
  }
  const quotes = [...joined.matchAll(QUOTE)].map((m) => m[1]);
  const fake = quotes.filter((q) => !p.proof.some((x) => x.toLowerCase().includes(q.toLowerCase())));
  if (quotes.length || /\b(kata pelanggan|testimoni)\b/i.test(joined)) {
    out.push({ key: "testimonial", label: "Testimoni sesuai bukti", status: fake.length || !quotes.length ? "fail" : "pass", detail: fake.length ? `Tidak ada di bukti: "${fake[0]}"` : !quotes.length ? "Menyebut testimoni tanpa kutipan dari bukti" : undefined });
  }
  const known = [p.name, ...p.proof, ...p.approvedClaims].join(" ");
  const nums = [...joined.matchAll(/\b\d[\d.,]*\b/g)].map((m) => m[0]).filter((n) => !known.includes(n));
  if (nums.length) out.push({ key: "numbers", label: "Angka perlu dicek", status: "warn", detail: `Tidak ditemukan di bukti: ${[...new Set(nums)].join(", ")}` });
  const missing = p.alwaysSay.filter((w) => !lower.includes(w.toLowerCase()));
  if (missing.length) out.push({ key: "always_say", label: "Yang harus disebut", status: "warn", detail: `Belum menyebut: ${missing.join(", ")}` });

  const recipe: string[] = [];
  if (c.hook.length > 45) recipe.push(`Hook ${c.hook.length} karakter, sarannya maksimal 45`);
  if (!c.cta.trim()) recipe.push("Belum ada ajakan");
  if (goal === "eyeball" && /\b(rp|harga|diskon|promo)\b/i.test(c.hook)) recipe.push("Iklan dikenal orang sebaiknya tidak berjualan keras");
  out.push({ key: "recipe", label: "Sesuai format tujuan", status: recipe.length ? "warn" : "pass", detail: recipe.join(", ") || undefined });
  return out;
}

export const failed = (c: CreativeCheck[]) => c.filter((x) => x.status === "fail");

const near = (a: number, b: number, tol: number) => Math.abs(a - b) / b <= tol;

/** Measures the real output file against Meta's published sizes. */
export async function fileChecks(file: string, format: "image" | "video", maxSeconds: number): Promise<CreativeCheck[]> {
  const size = fs.statSync(file).size;
  if (format === "image") {
    const m = await sharp(file).metadata();
    const ok = near((m.width ?? 0) / (m.height ?? 1), 4 / 5, 0.03) && (m.width ?? 0) >= 1080 && size <= 30e6;
    return [{ key: "format", label: "Ukuran gambar 4:5", status: ok ? "pass" : "fail", detail: `${m.width}x${m.height}` }];
  }
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name:format=duration", "-of", "json", file]);
    const j = JSON.parse(stdout) as { streams: { width: number; height: number; codec_name: string }[]; format: { duration: string } };
    const s = j.streams[0]; const dur = Number(j.format.duration);
    const ok = near(s.width / s.height, 9 / 16, 0.01) && s.codec_name === "h264" && dur <= maxSeconds && size <= 250e6;
    return [{ key: "format", label: "Video 9:16", status: ok ? "pass" : "fail", detail: `${s.width}x${s.height}, ${dur.toFixed(1)} detik` }];
  } catch {
    return [{ key: "format", label: "Video 9:16", status: "not_run", detail: "ffprobe tidak tersedia" }];
  }
}
