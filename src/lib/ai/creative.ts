import { z } from "zod";
import type { GoalKey } from "@/db/schema";
import { aiEnabled, structured } from "./client";

export const CreativeDraft = z.object({
  concept: z.string(), hook: z.string(), primaryText: z.string(), headline: z.string(), cta: z.string(),
  whatsappOpener: z.string().nullable(), formQuestions: z.array(z.string()).nullable(), script: z.string().nullable(),
});
export type CreativeDraft = z.infer<typeof CreativeDraft>;

const ANGLE_TYPES = ["problem", "desire", "moment", "proof", "objection", "value", "identity"] as const;
export const AngleDraft = z.object({ type: z.enum(ANGLE_TYPES), title: z.string(), audience: z.string(), pain: z.string(), promise: z.string(), proof: z.string(), hook: z.string() });
export type AngleDraft = z.infer<typeof AngleDraft>;
const AngleSet = z.object({ rationale: z.string(), angles: z.array(AngleDraft) });

export type PlanInput = {
  name: string; description: string; priceIdr: number; costIdr: number; approvedClaims: string[]; proof: string[];
  rules: string[]; tone: string; goals: { key: GoalKey; name: string; briefFormat: string }[];
  alwaysSay: string[]; neverSay: string[]; facts: string[]; objections: string[]; voiceExample: string;
};

type Seed = Omit<AngleDraft, "proof">;
const DEMO: Record<string, Seed[]> = {
  bottle: [
    { type: "problem", title: "Kusam setelah seharian di jalan", audience: "Perempuan 20-35 tahun, kerja di luar ruangan", pain: "Wajah kusam saat pulang kerja", promise: "Membantu kulit tampak lebih cerah", hook: "Pulang kerja, wajah nggak kusam lagi" },
    { type: "moment", title: "Rutinitas 1 menit sebelum tidur", audience: "Ibu muda yang sibuk", pain: "Tidak sempat skincare berlapis", promise: "Satu langkah setiap malam", hook: "Skincare 1 menit buat yang sibuk" },
    { type: "objection", title: "Takut salah pilih serum", audience: "Orang yang ragu mencoba produk baru", pain: "Takut produknya palsu", promise: "Terdaftar BPOM dan bisa COD", hook: "Takut palsu? Cek nomor BPOM-nya" },
    { type: "proof", title: "Cerita dari pembeli", audience: "Pembeli yang membandingkan ulasan", pain: "Bingung membedakan serum", promise: "Lihat ulasan pembeli lain", hook: "Ragu coba serum? Baca ini dulu" },
    { type: "desire", title: "Riasan tipis tetap segar", audience: "Karyawan yang jarang dandan", pain: "Malas pakai riasan tebal", promise: "Melembapkan kulit untuk riasan tipis", hook: "Dandan tipis, wajah tetap segar" },
    { type: "value", title: "Satu botol untuk pemakaian lama", audience: "Mahasiswa dengan uang saku pas", pain: "Skincare terasa mahal", promise: "Cukup 2 tetes setiap pakai", hook: "Cukup 2 tetes setiap malam" },
    { type: "identity", title: "Untuk yang baru mulai skincare", audience: "Pemula skincare", pain: "Bingung mulai dari mana", promise: "Langkah sederhana untuk pemula", hook: "Baru mulai skincare? Dari sini aja" },
  ],
  blender: [
    { type: "moment", title: "Sarapan sebelum berangkat", audience: "Pekerja kantoran yang berangkat pagi", pain: "Tidak sempat sarapan", promise: "Jus siap sebelum berangkat", hook: "Telat terus? Sarapan cukup 5 menit" },
    { type: "desire", title: "Bawa ke mana saja", audience: "Anak kos dan pelanggan gym", pain: "Blender biasa besar dan repot", promise: "Isi daya USB, muat di tas", hook: "Blender yang muat di tas kerja" },
    { type: "value", title: "Hemat jajan minuman", audience: "Keluarga muda", pain: "Jus di luar makin mahal", promise: "Bikin sendiri di rumah", hook: "Stop jajan jus Rp25 ribu tiap hari" },
    { type: "proof", title: "Sudah dipakai ribuan orang", audience: "Pembeli yang butuh bukti", pain: "Takut barang mudah rusak", promise: "Lihat jumlah pembelinya", hook: "Kenapa ribuan orang pilih blender ini?" },
    { type: "problem", title: "Malas cuci blender besar", audience: "Anak kos", pain: "Mencuci blender besar merepotkan", promise: "Cuci cepat tanpa bongkar", hook: "Malas cuci blender? Yang ini gampang" },
    { type: "identity", title: "Teman program sehat", audience: "Orang yang mulai hidup sehat", pain: "Sulit konsisten minum jus", promise: "Bikin jus jadi kebiasaan harian", hook: "Mulai hidup sehat dari segelas jus" },
    { type: "objection", title: "Tenaganya cukup?", audience: "Pembeli yang ragu pada blender kecil", pain: "Takut tidak kuat untuk buah", promise: "Cukup untuk buah sehari-hari", hook: "Kecil gini kuat? Lihat dulu" },
  ],
  shoe: [
    { type: "problem", title: "Kaki pegal saat pulang", audience: "Pegawai toko dan kantor", pain: "Kaki pegal setelah berdiri lama", promise: "Sol empuk untuk seharian", hook: "Kaki nggak pegal sampai jam pulang" },
    { type: "desire", title: "Rapi tapi rasanya sneaker", audience: "Karyawan baru", pain: "Sepatu formal biasanya keras", promise: "Tampilan kerja, rasa sneaker", hook: "Kelihatan formal, rasanya sneaker" },
    { type: "value", title: "Kuat untuk dipakai tiap hari", audience: "Pekerja lapangan", pain: "Sepatu cepat rusak", promise: "Jahitan kuat untuk pemakaian harian", hook: "Dipakai tiap hari, tetap kuat" },
    { type: "objection", title: "Takut salah ukuran", audience: "Pembeli online yang ragu", pain: "Ukuran online sering tidak pas", promise: "Bisa tukar ukuran", hook: "Takut salah ukuran? Bisa tukar" },
    { type: "moment", title: "Hari pertama kerja", audience: "Lulusan baru", pain: "Bingung pilih sepatu kerja", promise: "Siap dipakai dari hari pertama", hook: "Sepatu aman buat hari pertama kerja" },
    { type: "identity", title: "Untuk yang banyak berdiri", audience: "Kasir dan pramuniaga", pain: "Berdiri sepanjang shift", promise: "Dibuat untuk yang berdiri lama", hook: "Buat kamu yang berdiri seharian" },
    { type: "proof", title: "Pilihan rekan kerja", audience: "Karyawan yang percaya rekomendasi", pain: "Sulit menilai dari foto", promise: "Lihat bukti dari pembeli", hook: "Kenapa banyak pegawai pilih ini?" },
  ],
};

function genericAngles(p: PlanInput): Seed[] {
  return [
    { type: "identity", title: `${p.name} untuk sehari-hari`, audience: "Pembeli online", pain: "Sulit menemukan produk yang pas", promise: p.description || "Solusi praktis", hook: `Kenalan dengan ${p.name}` },
    { type: "proof", title: "Cerita pembeli", audience: "Pembeli yang masih ragu", pain: "Takut salah beli", promise: "Lihat pengalaman pembeli lain", hook: `Kenapa orang pilih ${p.name}?` },
    { type: "value", title: "Harga masuk akal", audience: "Pembeli yang membandingkan harga", pain: "Produk serupa terasa mahal", promise: "Harga jelas tanpa biaya tersembunyi", hook: `${p.name}, harganya masuk akal` },
    { type: "objection", title: "Bisa bayar saat sampai", audience: "Pembeli yang belum percaya toko online", pain: "Takut barang tidak sampai", promise: "Tanya dulu lewat WhatsApp", hook: "Ragu beli online? Tanya dulu aja" },
    { type: "moment", title: "Saat paling dibutuhkan", audience: "Pembeli yang butuh cepat", pain: "Butuh sekarang, bukan nanti", promise: "Siap dikirim dari stok", hook: `Lagi butuh ${p.name}?` },
    { type: "problem", title: "Masalah yang sering muncul", audience: "Pembeli yang pernah kecewa", pain: "Produk lain mengecewakan", promise: "Coba pilihan yang berbeda", hook: "Capek gonta-ganti produk?" },
  ];
}

const SYSTEM = `Kamu tim kreatif iklan Meta untuk pasar Indonesia. Tulis semua teks dalam Bahasa Indonesia sehari-hari.
Hook maksimal 45 karakter. Gunakan hanya klaim yang disetujui dan bukti yang diberikan. Jangan janjikan hasil pasti, jangan klaim pengobatan.
Dilarang: tenaga kesehatan dalam iklan kosmetik, janji perubahan atau before-after, testimoni selain kutipan dari bukti, orang buatan yang mengaku pelanggan asli.`;

/** Different angle types, so ideas are genuinely different. Existing titles go to the model to avoid repeats. */
export async function draftAngles(p: PlanInput, shape: string, existing: string[]): Promise<{ rationale: string; angles: AngleDraft[] }> {
  if (aiEnabled()) {
    return structured({
      schema: AngleSet, effort: "high",
      system: `${SYSTEM}\nBuat 7 sudut pandang yang benar-benar berbeda, masing-masing dari tipe berbeda: problem, desire, moment, proof, objection, value, identity. Pakai fakta produk dan keberatan pelanggan sebagai bahan. Jangan mengulang sudut pandang yang sudah ada.`,
      user: JSON.stringify({ produk: p, sudahAda: existing }),
    });
  }
  const proof = p.proof[0] ?? "";
  return {
    rationale: `Margin ${Math.round(((p.priceIdr - p.costIdr) / Math.max(p.priceIdr, 1)) * 100)}% cukup untuk menguji beberapa sudut pandang dengan anggaran yang sama, lalu menaikkan yang menang.`,
    angles: (DEMO[shape] ?? genericAngles(p)).map((a) => ({ ...a, proof })),
  };
}

type AngleRow = { title: string; audience: string; pain: string; promise: string; proof: string; hook: string };
const CTA: Record<GoalKey, string> = { eyeball: "Lihat selengkapnya", whatsapp_chat: "Chat di WhatsApp", cold_sell: "Beli sekarang", form: "Isi formulir", retargeting: "Beli di Tokopedia" };

export function demoCreative(a: AngleRow, goal: GoalKey, format: "image" | "video", productName: string): CreativeDraft {
  const hook = a.hook || a.title;
  return {
    concept: a.title, hook, primaryText: `${a.pain}? ${a.promise}. ${a.proof}`.trim(), headline: a.promise, cta: CTA[goal],
    whatsappOpener: goal === "whatsapp_chat" ? `Halo Kak, saya mau tanya ${productName}` : null,
    formQuestions: goal === "form" ? ["Nama", "Nomor WhatsApp", "Kota", "Saya setuju dihubungi lewat WhatsApp"] : null,
    script: format === "video" ? `${hook}. ${a.promise}.` : null,
  };
}

export async function draftCreative(p: PlanInput, a: AngleRow, goal: GoalKey, format: "image" | "video"): Promise<CreativeDraft> {
  if (!aiEnabled()) return demoCreative(a, goal, format, p.name);
  return structured({
    schema: CreativeDraft, effort: "medium",
    system: `${SYSTEM}\nTulis satu iklan untuk sudut pandang dan tujuan ini, sesuai format tujuannya. whatsappOpener hanya untuk whatsapp_chat. formQuestions hanya untuk form dan wajib memuat persetujuan dihubungi lewat WhatsApp. script hanya untuk video.`,
    user: JSON.stringify({ produk: p, sudutPandang: a, tujuan: goal, format, formatTujuan: p.goals.find((g) => g.key === goal)?.briefFormat, contohGaya: p.voiceExample }),
  });
}

/** Retries copy that failed a check. Only runs with Claude, because rewriting a template changes nothing. */
export async function rewriteCopy(d: CreativeDraft, issues: string[], p: PlanInput): Promise<CreativeDraft> {
  return structured({ schema: CreativeDraft, effort: "medium", system: SYSTEM, user: JSON.stringify({ tugas: "Perbaiki iklan ini agar lolos pemeriksaan. Pertahankan sudut pandangnya.", iklan: d, masalah: issues, produk: p }) });
}
