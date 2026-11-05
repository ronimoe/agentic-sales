import { describe, expect, it } from "vitest";
import { evaluateAd, fitsDailyCap, scaledBudget, testableCampaigns } from "./rules";
import type { GoalRules } from "@/db/schema";

const base = { spendIdr: 0, impressions: 0, reach: 0, videoWatches: 0, frequency: 1, chats: 0, qualifiedLeads: 0, sales: 0 };
const sell: GoalRules = { primaryMetric: "cost_per_sale", targetIdr: 50000, pauseSpendWithoutResultIdr: 150000, pauseOverTargetRatio: 1.5, maxFrequency: 4, scaleUnderTargetRatio: 0.8, scaleStepPct: 20 };
const eye: GoalRules = { primaryMetric: "reach_cost", targetIdr: 15000, pauseSpendWithoutResultIdr: 50000, pauseOverTargetRatio: 1.5, minWatchRate: 0.15, maxFrequency: 3, scaleUnderTargetRatio: 0.7, scaleStepPct: 20 };

describe("evaluateAd", () => {
  it("never pauses eyeball ads for having no sales", () => {
    expect(evaluateAd("eyeball", eye, { ...base, spendIdr: 500000, impressions: 100000, reach: 80000, videoWatches: 30000 }).action).toBe("scale");
  });
  it("pauses eyeball ads nobody watches", () => {
    expect(evaluateAd("eyeball", eye, { ...base, spendIdr: 100000, impressions: 10000, reach: 9000, videoWatches: 500 }).action).toBe("pause");
  });
  it("pauses cold sell with spend and no sales", () => {
    expect(evaluateAd("cold_sell", sell, { ...base, spendIdr: 200000 }).action).toBe("pause");
  });
  it("keeps cold sell before enough spend", () => {
    expect(evaluateAd("cold_sell", sell, { ...base, spendIdr: 100000 }).action).toBe("keep");
  });
  it("scales cheap sales", () => {
    expect(evaluateAd("cold_sell", sell, { ...base, spendIdr: 100000, sales: 3 }).action).toBe("scale");
  });
  it("judges forms on qualified leads, not sales", () => {
    const form = { ...sell, primaryMetric: "cost_per_qualified_lead" as const };
    expect(evaluateAd("form", form, { ...base, spendIdr: 100000, qualifiedLeads: 3 }).action).toBe("scale");
  });
  it("pauses on high frequency for any goal", () => {
    expect(evaluateAd("retargeting", sell, { ...base, spendIdr: 100000, sales: 5, frequency: 6 }).action).toBe("pause");
  });
});

describe("budget caps", () => {
  it("never scales past the daily cap", () => {
    expect(scaledBudget(100000, 50, 980000, 1000000)).toBe(120000);
    expect(scaledBudget(100000, 20, 1000000, 1000000)).toBe(100000);
  });
  it("blocks launch over the cap", () => {
    expect(fitsDailyCap(900000, 200000, 1000000)).toBe(false);
    expect(fitsDailyCap(800000, 200000, 1000000)).toBe(true);
  });
  it("counts testable campaigns", () => {
    expect(testableCampaigns(500000, 100000)).toBe(5);
  });
});
