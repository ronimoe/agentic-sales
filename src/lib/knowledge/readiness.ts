import type { KnowledgeTopic } from "@/db/schema";

export type Standard = { id: string; question: string; topics?: KnowledgeTopic[]; field?: "price" | "stock" | "proof" | "bpom" | "halal" | "variants"; only?: "regulated" };

/** Questions customers commonly ask. Coverage says whether a confirmed answer exists, not how well the AI answers. */
export const STANDARD_QUESTIONS: Standard[] = [
  { id: "price", question: "Harganya berapa?", field: "price" },
  { id: "stock", question: "Stoknya masih ada?", field: "stock" },
  { id: "variants", question: "Ada varian atau ukuran apa saja?", field: "variants" },
  { id: "how_to", question: "Cara pakainya bagaimana?", topics: ["how_to"] },
  { id: "not_for", question: "Cocok untuk siapa, dan tidak cocok untuk siapa?", topics: ["not_for"] },
  { id: "material", question: "Bahan atau kandungannya apa?", topics: ["material"] },
  { id: "spec", question: "Ukuran, berat, atau spesifikasinya berapa?", topics: ["spec"] },
  { id: "care", question: "Cara simpan atau merawatnya bagaimana?", topics: ["care"] },
  { id: "results", question: "Berapa lama baru terasa manfaatnya?", topics: ["results"] },
  { id: "authenticity", question: "Barangnya asli?", topics: ["authenticity"] },
  { id: "proof", question: "Ada ulasan atau bukti dari pembeli?", field: "proof" },
  { id: "value", question: "Kenapa harganya segitu?", topics: ["value"] },
  { id: "compare", question: "Bedanya dengan produk lain apa?", topics: ["compare"] },
  { id: "promo", question: "Ada promo atau diskon?", topics: ["promo"] },
  { id: "shipping", question: "Bisa kirim ke mana, berapa lama, ongkirnya berapa?", topics: ["shipping"] },
  { id: "cod", question: "Bisa COD?", topics: ["cod"] },
  { id: "payment", question: "Bayarnya bisa lewat apa?", topics: ["payment"] },
  { id: "returns", question: "Kalau tidak cocok atau rusak, bisa retur?", topics: ["returns"] },
  { id: "warranty", question: "Ada garansi?", topics: ["warranty"] },
  { id: "bpom", question: "Sudah terdaftar BPOM?", field: "bpom", only: "regulated" },
  { id: "halal", question: "Sudah halal?", field: "halal", only: "regulated" },
  { id: "safety", question: "Aman untuk ibu hamil, menyusui, atau yang punya alergi?", topics: ["safety"], only: "regulated" },
];

export type CoverageProduct = { category: string; priceIdr: number; proof: string[]; bpomNumber: string | null; halalStatus: string | null };
export type CoverageFact = { topic: KnowledgeTopic; status: string; question: string; answer: string };

export function coverage(p: CoverageProduct, facts: CoverageFact[], variantCount: number) {
  const confirmed = facts.filter((f) => f.status === "confirmed" && f.answer.trim());
  const field = (f: Standard["field"]) => f === "price" ? p.priceIdr > 0 : f === "stock" ? true : f === "proof" ? p.proof.length > 0 : f === "bpom" ? !!p.bpomNumber : f === "halal" ? !!p.halalStatus : f === "variants" ? variantCount > 0 : false;
  const items = STANDARD_QUESTIONS.filter((q) => !q.only || p.category !== "general").map((q) => ({
    ...q, covered: q.field ? field(q.field) : confirmed.some((f) => q.topics!.includes(f.topic)),
  }));
  return { items, covered: items.filter((i) => i.covered).length, total: items.length };
}

const STOP = new Set("yang dan di ke dari untuk dengan ini itu apa apakah ada bisa kak ya nih dong sih kah saya aku mau tanya atau juga tidak nggak gak berapa bagaimana gimana kalau kalo sudah masih".split(" "));
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));

const TOPIC_WORDS: Partial<Record<KnowledgeTopic, string[]>> = {
  how_to: ["cara", "pakai", "pemakaian", "menggunakan"], not_for: ["cocok"], safety: ["hamil", "menyusui", "alergi", "aman", "sensitif", "anak", "bayi"], material: ["bahan", "kandungan", "komposisi"],
  spec: ["ukuran", "berat", "kapasitas", "dimensi", "spesifikasi"], care: ["simpan", "rawat", "cuci", "kadaluarsa"], results: ["lama", "hasil", "terasa"], authenticity: ["asli", "palsu", "original", "ori"],
  value: ["mahal", "kemahalan"], compare: ["beda", "bedanya", "dibanding"], promo: ["promo", "diskon", "potongan", "voucher"], shipping: ["kirim", "ongkir", "pengiriman", "sampai", "ekspedisi"],
  cod: ["cod"], payment: ["bayar", "pembayaran", "transfer", "qris"], returns: ["retur", "tukar", "kembali", "rusak", "refund"], warranty: ["garansi"],
};

/** Offline matcher for the scripted closer. Returns a confirmed fact only when the words clearly overlap. */
export function matchFact<F extends CoverageFact>(text: string, facts: F[]): F | null {
  const words = new Set(tokens(text));
  if (!words.size) return null;
  let best: { f: F; score: number } | null = null;
  for (const f of facts) {
    if (f.status !== "confirmed" || !f.answer.trim()) continue;
    const q = tokens(f.question);
    let score = q.filter((w) => words.has(w)).length;
    if ((TOPIC_WORDS[f.topic] ?? []).some((w) => words.has(w))) score += 2;
    if (score >= 2 && (!best || score > best.score)) best = { f, score };
  }
  return best?.f ?? null;
}
