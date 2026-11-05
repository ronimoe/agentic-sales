import { describe, expect, it } from "vitest";
import { failed, textChecks, type CheckProduct, type CopyInput } from "./checks";
import { limitsFor, suggestLimits } from "./limits";
import { fetchPublicText, isPublicIp, publicLookup } from "@/lib/safe-fetch";
import type { GoalRules } from "@/db/schema";

const copy: CopyInput = { hook: "Kulit tampak cerah", primaryText: "Serum malam.", headline: "Serum", cta: "Beli", whatsappOpener: null, formQuestions: null, script: null };
const p: CheckProduct = { category: "cosmetic", bpomNumber: "NA1", approvedClaims: ["cerah"], proof: ["“Enak dipakai tiap malam” kata Rina"], neverSay: [], alwaysSay: [], name: "Serum" };
const keys = (c: Partial<CopyInput>, q: CheckProduct = p, blocked: string[] = []) => failed(textChecks({ ...copy, ...c }, q, blocked, "cold_sell")).map((x) => x.key);

describe("textChecks", () => {
  it("passes clean copy", () => expect(keys({})).toEqual([]));
  it("checks every text a customer sees, including the script and call to action", () => {
    expect(keys({ script: "Dijamin cerah" })).toContain("claims");
    expect(keys({ cta: "Pasti cerah, beli" })).toContain("claims");
    expect(keys({ whatsappOpener: "Sembuh jerawat" })).toContain("claims");
  });
  it("blocks health professionals in cosmetic ads", () => expect(keys({ primaryText: "Direkomendasikan dokter kulit" })).toContain("health_pro"));
  it("blocks transformation promises for regulated products only", () => {
    expect(keys({ hook: "Hasil dalam 7 hari" })).toContain("transformation");
    expect(keys({ hook: "Sampai dalam 7 hari" }, { ...p, category: "general" })).not.toContain("transformation");
  });
  it("requires quotes to exist in proof", () => {
    expect(keys({ primaryText: "“Kulitku langsung berubah total”" })).toContain("testimonial");
    expect(keys({ primaryText: "“Enak dipakai tiap malam”" })).not.toContain("testimonial");
  });
  it("enforces banned words and never-say", () => {
    expect(keys({ hook: "Paling murah" }, p, ["paling murah"])).toContain("banned_words");
    expect(keys({ hook: "Promo besar" }, { ...p, neverSay: ["promo"] })).toContain("banned_words");
  });
  it("warns, without blocking, on numbers missing from proof", () => {
    const c = textChecks({ ...copy, hook: "Dipakai 5000 orang" }, p, [], "cold_sell");
    expect(c.find((x) => x.key === "numbers")?.status).toBe("warn");
  });
});

const base: GoalRules = { primaryMetric: "cost_per_sale", targetIdr: 1, pauseSpendWithoutResultIdr: 1, pauseOverTargetRatio: 1.6, maxFrequency: 4, scaleUnderTargetRatio: 0.8, scaleStepPct: 20 };
describe("limits", () => {
  it("suggests limits from margin, fees, and return loss", () => {
    const s = suggestLimits({ priceIdr: 100000, costIdr: 40000 }, "tokopedia");
    expect(s).toMatchObject({ fee: 8000, net: 52000, targetIdr: 26000, stopSpendIdr: 104000 });
    expect(suggestLimits({ priceIdr: 100000, costIdr: 40000 }, "whatsapp").net).toBe(57750);
  });
  it("prefers the product's own limits, and keeps eyeball on workspace defaults", () => {
    const prod = { priceIdr: 100000, costIdr: 40000, targetCostIdr: 9000, stopSpendIdr: null };
    expect(limitsFor("cold_sell", base, prod, "shopify").targetIdr).toBe(9000);
    expect(limitsFor("eyeball", base, prod, "none")).toBe(base);
  });
});

describe("isPublicIp", () => {
  it("rejects private and local addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "2001:db8::1", "2001:0:1::1", "fe80::1%en0", "nonsense"]) expect(isPublicIp(ip), ip).toBe(false);
    for (const ip of ["8.8.8.8", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicIp(ip), ip).toBe(true);
  });
});

describe("fetchPublicText", () => {
  it("refuses local targets and non-web links before connecting", async () => {
    await expect(fetchPublicText("http://127.0.0.1:3000/")).rejects.toThrow(/tidak bisa diakses/);
    await expect(fetchPublicText("http://[::ffff:7f00:1]/")).rejects.toThrow(/tidak bisa diakses/);
    await expect(fetchPublicText("file:///etc/passwd")).rejects.toThrow(/http/);
  });
  it("refuses at connect time when a name resolves to a private address", async () => {
    const err = await new Promise<Error | null>((res) => publicLookup("localhost", { all: true }, (e) => res(e)));
    expect(err?.message).toMatch(/tidak bisa diakses/);
  });
});
