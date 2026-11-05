import { hourWib } from "@/lib/format";
import type { WorkspaceSettings } from "@/db/schema";

export type SendRequest =
  | { kind: "session" }
  | { kind: "template"; category: "marketing" | "utility" };

export type ContactState = { optInAt: Date | null; optOutAt: Date | null; lastInboundAt: Date | null; freeEntryUntil: Date | null };
export type SendDecision = { allowed: true; costIdr: number } | { allowed: false; reason: string };

const DAY = 24 * 60 * 60 * 1000;

/**
 * Official WhatsApp rules, applied even on the Baileys prototype so results carry over to Cloud API.
 * Costs are estimates from workspace settings.
 */
export function evaluateSend(req: SendRequest, c: ContactState, s: WorkspaceSettings, now: Date, serviceSentThisMonth: number): SendDecision {
  if (c.optOutAt) return { allowed: false, reason: "Pelanggan sudah berhenti berlangganan" };
  const windowOpen = !!c.lastInboundAt && now.getTime() - c.lastInboundAt.getTime() < DAY;
  const freeEntry = !!c.freeEntryUntil && now < c.freeEntryUntil;

  if (req.kind === "session") {
    if (!windowOpen) return { allowed: false, reason: "Jendela 24 jam sudah tutup, hanya template yang boleh dikirim" };
    if (freeEntry) return { allowed: true, costIdr: 0 };
    return { allowed: true, costIdr: serviceSentThisMonth < s.whatsappCost.freeServicePerMonth ? 0 : s.whatsappCost.serviceIdr };
  }

  if (req.category === "marketing" && !c.optInAt) return { allowed: false, reason: "Belum ada persetujuan WhatsApp untuk pesan promosi" };
  if (req.category === "marketing" && !windowOpen) {
    const h = hourWib(now);
    const { startHour, endHour } = s.quietHours;
    if (h >= startHour || h < endHour) return { allowed: false, reason: `Jam tenang ${startHour}.00 sampai ${endHour}.00 WIB` };
  }
  if (freeEntry) return { allowed: true, costIdr: 0 };
  return { allowed: true, costIdr: req.category === "marketing" ? s.whatsappCost.marketingIdr : s.whatsappCost.utilityIdr };
}

export const REF_RE = /\bLRS-[A-Z0-9]{5}\b/;
export const isOptOut = (t: string) => /^\s*(stop|berhenti|unsubscribe)\s*[.!]*\s*$/i.test(t);
