import { z } from "zod";
import type { GoalKey } from "@/db/schema";
import { aiEnabled, structured } from "./client";

const CreativeDraft = z.object({
  angleIndex: z.number().int(), concept: z.string(), format: z.enum(["image", "video"]),
  hook: z.string(), primaryText: z.string(), headline: z.string(), cta: z.string(),
  whatsappOpener: z.string().nullable(), formQuestions: z.array(z.string()).nullable(), script: z.string().nullable(),
});
export type CreativeDraft = z.infer<typeof CreativeDraft>;
export const PlanDraft = z.object({
  rationale: z.string(),
  angles: z.array(z.object({ title: z.string(), audience: z.string(), pain: z.string(), promise: z.string(), proof: z.string() })),
  campaigns: z.array(z.object({
    goal: z.enum(["eyeball", "cold_sell", "form", "whatsapp_chat", "retargeting"]),
    destination: z.enum(["whatsapp", "website", "shopify", "tokopedia", "shopee", "tiktok_shop", "form", "none"]),
    dailyBudgetIdr: z.number().int(), creatives: z.array(CreativeDraft),
  })),
});
export type PlanDraft = z.infer<typeof PlanDraft>;

export type PlanInput = {
  name: string; description: string; priceIdr: number; costIdr: number; approvedClaims: string[]; proof: string[];
  rules: string[]; tone: string; goals: { key: GoalKey; name: string; briefFormat: string }[];
  alwaysSay: string[]; neverSay: string[]; facts: string[]; objections: string[]; voiceExample: string;
};

const DEMO: Record<string, { title: string; audience: string; pain: string; promise: string; hook: string }[]> = {
  bottle: [
    { title: "Kulit tampak lebih cerah", audience: "Perempuan 20-35 tahun, kerja di luar ruangan", pain: "Kulit kusam setelah seharian di jalan", promise: "Membantu kulit tampak lebih cerah", hook: "Pulang kerja, wajah nggak kusam lagi" },
    { title: "Rutinitas 1 menit", audience: "Ibu muda yang sibuk", pain: "Tidak sempat skincare berlapis", promise: "Satu langkah setiap malam", hook: "Skincare 1 menit buat yang sibuk" },
    { title: "Bukti dari pembeli", audience: "Orang yang ragu mencoba produk baru", pain: "Takut salah pilih serum", promise: "Lihat cerita pembeli lain", hook: "Ragu coba serum? Baca ini dulu" },
  ],
  blender: [
    { title: "Sarapan 5 menit", audience: "Pekerja kantoran yang berangkat pagi", pain: "Tidak sempat sarapan", promise: "Jus siap sebelum berangkat", hook: "Telat terus? Sarapan cukup 5 menit" },
    { title: "Bawa ke mana saja", audience: "Anak kos dan pelanggan gym", pain: "Blender biasa besar dan repot", promise: "Isi daya USB, muat di tas", hook: "Blender yang muat di tas kerja" },
    { title: "Hemat jajan", audience: "Keluarga muda", pain: "Jus di luar makin mahal", promise: "Bikin sendiri di rumah", hook: "Stop jajan jus Rp25 ribu tiap hari" },
  ],
  shoe: [
    { title: "Nyaman 8 jam", audience: "Pegawai toko dan kantor", pain: "Kaki pegal saat pulang kerja", promise: "Sol empuk untuk seharian", hook: "Kaki nggak pegal sampai jam pulang" },
    { title: "Rapi tapi empuk", audience: "Karyawan baru", pain: "Sepatu formal biasanya keras", promise: "Tampilan kerja, rasa sneaker", hook: "Kelihatan formal, rasanya sneaker" },
    { title: "Awet untuk tiap hari", audience: "Pekerja lapangan", pain: "Sepatu cepat rusak", promise: "Jahitan kuat untuk dipakai harian", hook: "Dipakai tiap hari, tetap kuat" },
  ],
};

function demoPlan(p: PlanInput, shape: string): PlanDraft {
  const set = DEMO[shape] ?? [
    { title: `${p.name} untuk sehari-hari`, audience: "Pembeli online", pain: "Sulit menemukan produk yang pas", promise: p.description || "Solusi praktis", hook: `Kenalan dengan ${p.name}` },
    { title: "Cerita pembeli", audience: "Pembeli yang masih ragu", pain: "Takut salah beli", promise: "Lihat pengalaman pembeli lain", hook: `Kenapa orang pilih ${p.name}?` },
    { title: "Harga masuk akal", audience: "Pembeli yang membandingkan harga", pain: "Produk serupa terasa mahal", promise: "Harga jelas tanpa biaya tersembunyi", hook: `${p.name}, harganya masuk akal` },
  ];
  const proof = p.proof[0] ?? "";
  const body = (i: number) => `${set[i].pain}? ${set[i].promise}. ${proof}`.trim();
  const drafts = (i: number, format: "image" | "video", cta: string, extra: Partial<PlanDraft["campaigns"][0]["creatives"][0]> = {}) => ({
    angleIndex: i, concept: set[i].title, format, hook: set[i].hook, primaryText: body(i), headline: set[i].promise, cta,
    whatsappOpener: null, formQuestions: null, script: format === "video" ? `${set[i].hook}. ${set[i].promise}.` : null, ...extra,
  });
  return {
    rationale: `Mulai dari pesan paling jelas, ukur lewat chat dan penjualan, lalu bangun audiens untuk ditawarkan ulang. Margin ${Math.round(((p.priceIdr - p.costIdr) / Math.max(p.priceIdr, 1)) * 100)}% masih cukup untuk menguji beberapa sudut pandang.`,
    angles: set.map((s) => ({ title: s.title, audience: s.audience, pain: s.pain, promise: s.promise, proof })),
    campaigns: [
      { goal: "eyeball", destination: "none", dailyBudgetIdr: 75000, creatives: [drafts(0, "video", "Lihat selengkapnya")] },
      { goal: "whatsapp_chat", destination: "whatsapp", dailyBudgetIdr: 150000, creatives: [
        drafts(0, "image", "Chat di WhatsApp", { whatsappOpener: `Halo Kak, saya mau tanya ${p.name}` }),
        drafts(1, "image", "Chat di WhatsApp", { whatsappOpener: `Halo Kak, ${p.name} masih ada?` }) ] },
      { goal: "cold_sell", destination: "shopify", dailyBudgetIdr: 150000, creatives: [drafts(1, "image", "Beli sekarang")] },
      { goal: "form", destination: "form", dailyBudgetIdr: 100000, creatives: [
        drafts(2, "image", "Isi formulir", { formQuestions: ["Nama", "Nomor WhatsApp", "Kota", "Saya setuju dihubungi lewat WhatsApp"] }) ] },
      { goal: "retargeting", destination: "tokopedia", dailyBudgetIdr: 75000, creatives: [drafts(2, "image", "Beli di Tokopedia")] },
    ],
  };
}

const SYSTEM = `Kamu tim kreatif iklan Meta untuk pasar Indonesia. Tulis semua teks dalam Bahasa Indonesia sehari-hari.
Buat 3 sudut pandang yang benar-benar berbeda, bukan variasi kecil. Hook maksimal 45 karakter.
Gunakan hanya klaim yang disetujui dan bukti yang diberikan. Jangan janjikan hasil pasti, jangan klaim pengobatan.
Setiap kampanye punya satu tujuan dan iklannya harus sesuai format tujuan itu.
Field whatsappOpener hanya untuk whatsapp_chat. Field formQuestions hanya untuk form dan wajib memuat persetujuan dihubungi lewat WhatsApp. Field script berisi kata-kata video dan hanya untuk format video.
Dilarang: tenaga kesehatan dalam iklan kosmetik, janji perubahan atau before-after, testimoni selain kutipan dari bukti, orang buatan yang mengaku pelanggan asli.
Pakai fakta produk dan keberatan pelanggan sebagai bahan sudut pandang.`;

export async function draftPlan(p: PlanInput, shape: string): Promise<PlanDraft> {
  if (!aiEnabled()) return demoPlan(p, shape);
  return structured({
    schema: PlanDraft, effort: "high", system: SYSTEM,
    user: JSON.stringify({ produk: p, tujuanTersedia: p.goals, tujuan: "Usulkan rencana kampanye untuk produk ini." }),
  });
}

/** Retries copy that failed a check. Only runs with Claude, because rewriting a template changes nothing. */
export async function rewriteCopy(d: CreativeDraft, issues: string[], p: PlanInput): Promise<CreativeDraft> {
  return structured({ schema: CreativeDraft, effort: "medium", system: SYSTEM, user: JSON.stringify({ tugas: "Perbaiki iklan ini agar lolos pemeriksaan. Pertahankan sudut pandangnya.", iklan: d, masalah: issues, produk: p }) });
}
