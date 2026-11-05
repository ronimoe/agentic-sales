import { describe, expect, it } from "vitest";
import { metaPlatform, realId, withRef } from "./platform";

const fake = () => {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(init?.body as URLSearchParams) });
    return new Response(JSON.stringify({ id: "1", images: { x: { hash: "h" } } }));
  }) as unknown as typeof fetch;
  return { calls, f };
};
const input = { campaignName: "c", goal: "whatsapp_chat", destination: "whatsapp", dailyBudgetIdr: 100000, existingCampaignId: null, existingAdSetId: null, adultOnly: true, headline: "h", primaryText: "p", cta: "c", whatsappOpener: "Halo", refCode: "LRS-ABCDE", assetFile: new URL(import.meta.url).pathname, format: "image" as const, landingUrl: null };
const env = { META_ACCESS_TOKEN: "t", META_AD_ACCOUNT_ID: "9", META_PAGE_ID: "p" } as unknown as NodeJS.ProcessEnv;

describe("metaPlatform", () => {
  it("creates everything paused by default", async () => {
    const { calls, f } = fake();
    const r = await metaPlatform(env, f).launch(input);
    expect(r.activated).toBe(false);
    for (const c of calls.filter((x) => /campaigns|adsets|\/ads$/.test(x.url))) expect(c.body.get("status")).toBe("PAUSED");
  });
  it("activates only with explicit permission", async () => {
    const { calls, f } = fake();
    const r = await metaPlatform({ ...env, META_ALLOW_ACTIVATE: "true" } as NodeJS.ProcessEnv, f).launch(input);
    expect(r.activated).toBe(true);
    expect(calls[0].body.get("status")).toBe("ACTIVE");
  });
  it("reuses one ad set, so budget isn't multiplied by ad count", async () => {
    const { calls, f } = fake();
    const r = await metaPlatform(env, f).launch(input);
    await metaPlatform(env, f).launch({ ...input, existingCampaignId: r.campaignExternalId, existingAdSetId: r.adSetExternalId });
    const adsets = calls.filter((c) => c.url.endsWith("/adsets"));
    expect(adsets).toHaveLength(1);
    expect(adsets[0].body.get("daily_budget")).toBe("100000");
  });
  it("targets adults only when required", async () => {
    const { calls, f } = fake();
    await metaPlatform(env, f).launch(input);
    expect(calls.find((c) => c.url.endsWith("/adsets"))!.body.get("targeting")).toContain('"age_min":18');
  });
  it("never sends sample ids to Meta, and refuses a link ad without a link", async () => {
    const { calls, f } = fake();
    await metaPlatform(env, f).launch({ ...input, existingCampaignId: "sim_c_1", existingAdSetId: "sim_s_1" });
    expect(calls.filter((c) => c.url.endsWith("/campaigns"))).toHaveLength(1);
    expect(realId("sim_a_1")).toBeNull();
    await expect(metaPlatform(env, f).launch({ ...input, destination: "shopify" })).rejects.toThrow(/link/);
  });
  it("adds the ref code to landing links", () => {
    expect(withRef("https://toko.id/p?a=1", "LRS-ABCDE")).toBe("https://toko.id/p?a=1&ref=LRS-ABCDE");
  });
  it("carries the ref code into the WhatsApp welcome message", async () => {
    const { calls, f } = fake();
    await metaPlatform(env, f).launch(input);
    expect(calls.find((c) => c.url.includes("adcreatives"))!.body.get("object_story_spec")).toContain("LRS-ABCDE");
  });
});
