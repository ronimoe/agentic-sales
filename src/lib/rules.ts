import { and, desc, eq, sql } from "drizzle-orm";
import { rulebooks, type Rule } from "@/db/schema";
import { logActivity } from "./log";
import type { Ctx } from "./types";

/** Protections enforced by code, with no off switch. */
export const LOCKED = {
  id: [
    ["Klaim dan BPOM", "Janji pasti, klaim pengobatan, dan produk tanpa data BPOM diblokir sebelum sampai ke kamu."],
    ["Tanpa tenaga kesehatan", "Iklan kosmetik tidak boleh memakai dokter atau tenaga kesehatan, sesuai BPOM."],
    ["Tanpa janji perubahan", "Before-after dan janji hasil dalam waktu tertentu diblokir untuk kosmetik dan makanan. Masih perlu dikonfirmasi dengan aturan Meta dan BPOM."],
    ["Testimoni asli", "Kutipan pelanggan harus ada di bukti produk. Orang buatan tidak boleh mengaku pelanggan."],
    ["Produk tidak diubah", "Foto, harga, dan merek dicetak oleh sistem, bukan digambar AI."],
    ["Aturan WhatsApp resmi", "Persetujuan pelanggan, jendela 24 jam, dan permintaan berhenti selalu dipatuhi."],
    ["Jawaban dari fakta", "AI WhatsApp hanya menjawab dari fakta terkonfirmasi. Jika tidak ada, bertanya ke tim."],
    ["Batas anggaran", "Agen tidak bisa melewati batas harian dan bulanan."],
    ["Persetujuan manusia", "Tidak ada iklan yang tayang tanpa persetujuanmu."],
  ],
  en: [
    ["Claims and BPOM", "Guaranteed results, medical claims, and products without BPOM data are blocked before reaching you."],
    ["No health professionals", "Cosmetic ads can't feature doctors or health workers, per BPOM."],
    ["No transformation promises", "Before-and-after and time-bound results are blocked for cosmetics and food. Still to be confirmed against Meta and BPOM rules."],
    ["Real testimonials", "Customer quotes must exist in the product's proof. AI people can't pose as customers."],
    ["Product stays unchanged", "Photo, price, and brand are stamped by the system, not drawn by AI."],
    ["Official WhatsApp rules", "Customer consent, the 24-hour window, and stop requests are always respected."],
    ["Answers from facts", "The WhatsApp AI only answers from confirmed facts. Otherwise it asks your team."],
    ["Budget caps", "Agents can't pass daily and monthly limits."],
    ["Human approval", "No ad goes live without your approval."],
  ],
};

/** Rules with a real effect today, no matter whether Claude is connected. */
export const ENFORCED = new Set(["stop_no_stock", "show_price"]);

export async function newVersion(ctx: Ctx, kind: "ads" | "whatsapp", change: (r: { rules: Rule[]; tone: string }) => { rules: Rule[]; tone: string }, note: string) {
  const [cur] = await ctx.db.select().from(rulebooks).where(and(eq(rulebooks.workspaceId, ctx.workspaceId), eq(rulebooks.kind, kind), eq(rulebooks.active, true))).orderBy(desc(rulebooks.version)).limit(1);
  const next = change({ rules: cur?.rules ?? [], tone: cur?.tone ?? "" });
  const [v] = await ctx.db.select({ v: sql<number>`coalesce(max(${rulebooks.version}),0)::int` }).from(rulebooks).where(and(eq(rulebooks.workspaceId, ctx.workspaceId), eq(rulebooks.kind, kind)));
  await ctx.db.update(rulebooks).set({ active: false }).where(and(eq(rulebooks.workspaceId, ctx.workspaceId), eq(rulebooks.kind, kind)));
  await ctx.db.insert(rulebooks).values({ workspaceId: ctx.workspaceId, kind, version: v.v + 1, rules: next.rules, tone: next.tone, createdBy: ctx.actor });
  await logActivity(ctx, ctx.actor, `Mengubah aturan ${kind === "ads" ? "iklan" : "WhatsApp"}, versi ${v.v + 1}`, note, "/rules");
}

export async function rollback(ctx: Ctx, kind: "ads" | "whatsapp") {
  const rows = await ctx.db.select().from(rulebooks).where(and(eq(rulebooks.workspaceId, ctx.workspaceId), eq(rulebooks.kind, kind))).orderBy(desc(rulebooks.version));
  const active = rows.find((r) => r.active);
  const prev = active && rows.find((r) => r.version === active.version - 1);
  if (!prev) throw new Error("Belum ada versi sebelumnya");
  await newVersion(ctx, kind, () => ({ rules: prev.rules, tone: prev.tone }), `Kembali ke isi versi ${prev.version}`);
}
