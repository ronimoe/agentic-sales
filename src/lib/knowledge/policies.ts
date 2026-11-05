import type { KnowledgeTopic } from "@/db/schema";

export const POLICY_TOPICS: [KnowledgeTopic, string][] = [
  ["shipping", "Bisa kirim ke mana, berapa lama, ongkirnya berapa?"],
  ["cod", "Bisa COD?"],
  ["payment", "Bayarnya bisa lewat apa?"],
  ["returns", "Kalau tidak cocok atau rusak, bisa retur?"],
  ["warranty", "Ada garansi?"],
];
