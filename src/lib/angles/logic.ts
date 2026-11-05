import type { GoalKey } from "@/db/schema";

const STOP = new Set("yang dan di ke dari untuk dengan ini itu tidak nggak lagi saat bisa buat kamu kak".split(" "));
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));

/** Word overlap only. Catching near-duplicates by meaning needs Claude. */
export function similarity(a: string, b: string) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / (x.size + y.size - shared);
}
export const angleText = (a: { title: string; promise: string }) => `${a.title} ${a.promise}`;
export function findDuplicate<T extends { title: string; promise: string }>(a: { title: string; promise: string }, others: T[], threshold = 0.5): T | null {
  return others.find((o) => similarity(angleText(a), angleText(o)) >= threshold) ?? null;
}

/** Same format and budget for every angle in a goal, so results can be compared. */
export const TEST_GOALS: { goal: GoalKey; destination: "none" | "whatsapp" | "shopify"; format: "image" | "video" }[] = [
  { goal: "eyeball", destination: "none", format: "video" },
  { goal: "whatsapp_chat", destination: "whatsapp", format: "image" },
  { goal: "cold_sell", destination: "shopify", format: "image" },
];
export const PER_ANGLE_GOAL_IDR = 100000;
export const MAX_TESTING = 4;

/** How many angles the remaining daily budget can test properly. */
export const angleCapacity = (roomIdr: number) => Math.max(0, Math.min(MAX_TESTING, Math.floor(roomIdr / (PER_ANGLE_GOAL_IDR * TEST_GOALS.length))));

export type Cell = { angleId: string; goal: GoalKey; spend: number; reach: number; qualified: number; sales: number };
export type CellResult = Cell & { results: number; cost: number | null; best: boolean };

const MIN_SPEND = 50000; const MIN_RESULTS = 2; const MARGIN = 0.8;

/** Compares angles only within one goal. A goal has a best angle only with enough data and a clear lead. */
export function compareCells(cells: Cell[]): CellResult[] {
  const scored = cells.map((c) => {
    const eyeball = c.goal === "eyeball";
    const results = eyeball ? c.reach : c.goal === "form" ? c.qualified : c.sales;
    const cost = results > 0 ? (eyeball ? (c.spend / results) * 1000 : c.spend / results) : null;
    return { ...c, results, cost, best: false };
  });
  for (const goal of new Set(cells.map((c) => c.goal))) {
    const valid = scored.filter((c) => c.goal === goal && c.spend >= MIN_SPEND && c.cost !== null && (goal === "eyeball" || c.results >= MIN_RESULTS)).sort((a, b) => a.cost! - b.cost!);
    const tested = scored.filter((c) => c.goal === goal && c.spend >= MIN_SPEND);
    if (!valid.length || tested.length < 2) continue;
    if (valid.length === 1 || valid[0].cost! <= valid[1].cost! * MARGIN) valid[0].best = true;
  }
  return scored;
}
