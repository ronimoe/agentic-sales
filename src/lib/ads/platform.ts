export type LaunchInput = {
  campaignName: string; goal: string; destination: string; dailyBudgetIdr: number; existingCampaignId: string | null;
  headline: string; primaryText: string; cta: string; whatsappOpener: string | null; refCode: string; assetFile: string; format: "image" | "video"; landingUrl: string | null;
};
export type LaunchResult = { campaignExternalId: string; adExternalId: string; activated: boolean };
export type AdInsight = { day: string; spendIdr: number; impressions: number; reach: number; clicks: number; videoWatches: number; frequency: number };

export interface AdsPlatform {
  simulated: boolean;
  launch(i: LaunchInput): Promise<LaunchResult>;
  pause(adExternalId: string): Promise<void>;
  setBudget(externalAdSetOrCampaignId: string, dailyBudgetIdr: number): Promise<void>;
  insights(adExternalId: string, sinceDay: string): Promise<AdInsight[]>;
}

const simulated: AdsPlatform = {
  simulated: true,
  async launch(i) {
    return { campaignExternalId: i.existingCampaignId ?? `sim_c_${crypto.randomUUID().slice(0, 8)}`, adExternalId: `sim_a_${crypto.randomUUID().slice(0, 8)}`, activated: true };
  },
  async pause() {},
  async setBudget() {},
  async insights() { return []; },
};

const OBJECTIVE: Record<string, { objective: string; optimization: string }> = {
  eyeball: { objective: "OUTCOME_AWARENESS", optimization: "REACH" },
  whatsapp_chat: { objective: "OUTCOME_ENGAGEMENT", optimization: "CONVERSATIONS" },
  cold_sell: { objective: "OUTCOME_TRAFFIC", optimization: "LINK_CLICKS" },
  form: { objective: "OUTCOME_LEADS", optimization: "LEAD_GENERATION" },
  retargeting: { objective: "OUTCOME_TRAFFIC", optimization: "LINK_CLICKS" },
};

/** Real Meta adapter. Everything is created PAUSED unless META_ALLOW_ACTIVATE=true, so no spend starts by accident. */
export function metaPlatform(env = process.env, fetcher: typeof fetch = fetch): AdsPlatform {
  const version = env.META_API_VERSION || "v25.0";
  const account = `act_${(env.META_AD_ACCOUNT_ID ?? "").replace(/^act_/, "")}`;
  const call = async (p: string, params: Record<string, unknown>, method = "POST") => {
    const body = new URLSearchParams({ access_token: env.META_ACCESS_TOKEN ?? "" });
    for (const [k, v] of Object.entries(params)) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
    const url = `https://graph.facebook.com/${version}/${p}`;
    const res = await (method === "GET" ? fetcher(`${url}?${body}`) : fetcher(url, { method, body }));
    const json = await res.json() as { id?: string; hash?: string; images?: Record<string, { hash: string }>; data?: unknown[]; error?: { message: string } };
    if (!res.ok || json.error) throw new Error(`Meta: ${json.error?.message ?? res.status}`);
    return json;
  };
  const allow = env.META_ALLOW_ACTIVATE === "true";
  const status = allow ? "ACTIVE" : "PAUSED";
  return {
    simulated: false,
    async launch(i) {
      const map = OBJECTIVE[i.goal] ?? OBJECTIVE.cold_sell;
      const campaignId = i.existingCampaignId ?? (await call(`${account}/campaigns`, { name: i.campaignName, objective: map.objective, status, special_ad_categories: [] })).id!;
      const whatsapp = i.destination === "whatsapp";
      const adset = await call(`${account}/adsets`, {
        name: `${i.campaignName} ${i.refCode}`, campaign_id: campaignId, status, daily_budget: i.dailyBudgetIdr, billing_event: "IMPRESSIONS",
        optimization_goal: map.optimization, bid_strategy: "LOWEST_COST_WITHOUT_CAP", targeting: { geo_locations: { countries: ["ID"] } },
        ...(whatsapp ? { destination_type: "WHATSAPP", promoted_object: { page_id: env.META_PAGE_ID, whatsapp_phone_number: env.META_WHATSAPP_NUMBER } } : {}),
      });
      const fs = await import("node:fs");
      const bytes = fs.readFileSync(i.assetFile).toString("base64");
      const image = await call(`${account}/adimages`, { bytes });
      const hash = Object.values(image.images ?? {})[0]?.hash;
      const link = whatsapp ? "https://api.whatsapp.com/send" : i.landingUrl ?? "https://example.com";
      const creative = await call(`${account}/adcreatives`, {
        name: i.refCode,
        object_story_spec: {
          page_id: env.META_PAGE_ID,
          link_data: {
            image_hash: hash, link, message: i.primaryText, name: i.headline,
            ...(whatsapp ? { page_welcome_message: `${i.whatsappOpener ?? "Halo"} (${i.refCode})`, call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } } } : {}),
          },
        },
      });
      const ad = await call(`${account}/ads`, { name: i.refCode, adset_id: adset.id, creative: { creative_id: creative.id }, status });
      return { campaignExternalId: campaignId, adExternalId: ad.id!, activated: allow };
    },
    async pause(id) { await call(id, { status: "PAUSED" }); },
    async setBudget(id, amount) { await call(id, { daily_budget: amount }); },
    async insights(id, since) {
      const r = await call(`${id}/insights`, { fields: "spend,impressions,reach,clicks,frequency,video_thruplay_watched_actions", time_increment: 1, time_range: { since, until: new Date().toISOString().slice(0, 10) } }, "GET");
      return (r.data as { date_start: string; spend: string; impressions: string; reach: string; clicks?: string; frequency?: string; video_thruplay_watched_actions?: { value: string }[] }[]).map((d) => ({
        day: d.date_start, spendIdr: Math.round(Number(d.spend)), impressions: Number(d.impressions), reach: Number(d.reach), clicks: Number(d.clicks ?? 0),
        videoWatches: Number(d.video_thruplay_watched_actions?.[0]?.value ?? 0), frequency: Number(d.frequency ?? 1),
      }));
    },
  };
}

export const adsPlatform = (): AdsPlatform =>
  process.env.META_ACCESS_TOKEN && process.env.META_AD_ACCOUNT_ID && process.env.META_PAGE_ID ? metaPlatform() : simulated;
