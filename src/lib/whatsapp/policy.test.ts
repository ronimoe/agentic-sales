import { describe, expect, it } from "vitest";
import { evaluateSend, isOptOut } from "./policy";

const s = { whatsappCost: { marketingIdr: 650, utilityIdr: 300, serviceIdr: 357, freeServicePerMonth: 1000 }, quietHours: { startHour: 21, endHour: 8 }, aiLabelAds: false };
const noon = new Date("2026-11-06T05:00:00Z");
const h = (n: number) => new Date(noon.getTime() - n * 3600000);
const c = { optInAt: null, optOutAt: null, lastInboundAt: null, freeEntryUntil: null };

describe("evaluateSend", () => {
  it("blocks everything after opt-out", () => {
    expect(evaluateSend({ kind: "session" }, { ...c, optOutAt: h(1), lastInboundAt: h(1) }, s, noon, 0).allowed).toBe(false);
  });
  it("allows free-form replies only inside 24 hours", () => {
    expect(evaluateSend({ kind: "session" }, { ...c, lastInboundAt: h(23) }, s, noon, 0).allowed).toBe(true);
    expect(evaluateSend({ kind: "session" }, { ...c, lastInboundAt: h(25) }, s, noon, 0).allowed).toBe(false);
  });
  it("requires opt-in for marketing templates", () => {
    expect(evaluateSend({ kind: "template", category: "marketing" }, c, s, noon, 0).allowed).toBe(false);
    expect(evaluateSend({ kind: "template", category: "marketing" }, { ...c, optInAt: h(100) }, s, noon, 0)).toEqual({ allowed: true, costIdr: 650 });
  });
  it("respects quiet hours for marketing outreach", () => {
    expect(evaluateSend({ kind: "template", category: "marketing" }, { ...c, optInAt: h(100) }, s, new Date("2026-11-06T16:00:00Z"), 0).allowed).toBe(false);
  });
  it("charges service messages after the free tier", () => {
    expect(evaluateSend({ kind: "session" }, { ...c, lastInboundAt: h(1) }, s, noon, 1000)).toEqual({ allowed: true, costIdr: 357 });
    expect(evaluateSend({ kind: "session" }, { ...c, lastInboundAt: h(1) }, s, noon, 10)).toEqual({ allowed: true, costIdr: 0 });
  });
  it("makes messages free inside the ad entry window", () => {
    expect(evaluateSend({ kind: "session" }, { ...c, lastInboundAt: h(1), freeEntryUntil: h(-100) }, s, noon, 5000)).toEqual({ allowed: true, costIdr: 0 });
  });
  it("detects opt-out only as a whole message", () => {
    expect(isOptOut("STOP")).toBe(true);
    expect(isOptOut("jangan stop dulu kak")).toBe(false);
  });
});
