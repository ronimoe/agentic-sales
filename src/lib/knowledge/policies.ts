import type { KnowledgeTopic } from "@/db/schema";

export const POLICY_TOPICS: [KnowledgeTopic, string][] = [
  ["shipping", "Bisa kirim ke mana, berapa lama, ongkirnya berapa?"],
  ["cod", "Bisa COD?"],
  ["payment", "Bayarnya bisa lewat apa?"],
  ["returns", "Kalau tidak cocok atau rusak, bisa retur?"],
  ["warranty", "Ada garansi?"],
];

export const KNOWLEDGE_TOPICS: KnowledgeTopic[] = ["how_to", "not_for", "safety", "material", "spec", "care", "results", "authenticity", "value", "compare", "promo", "faq", "shipping", "cod", "returns", "payment", "warranty"];
