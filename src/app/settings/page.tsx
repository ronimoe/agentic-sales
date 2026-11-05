import { and, eq, isNull } from "drizzle-orm";
import { saveBrand, savePolicies, saveBudget, saveSettings, setPref } from "@/app/actions";
import { knowledge } from "@/db/schema";
import { POLICY_TOPICS } from "@/lib/knowledge/policies";
import { adapterStatus } from "@/lib/adapters";
import { testableCampaigns } from "@/lib/ads/rules";
import { getLimit, usedThisMonth } from "@/lib/budget";
import { getCtx } from "@/lib/ctx";
import { idr } from "@/lib/format";
import { getT } from "@/lib/i18n";

export default async function Settings() {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const S = t.settings; const a = adapterStatus(); const s = ctx.workspace.settings;
  const daily = await getLimit(ctx, "ads_daily");
  const fields = [
    { k: "ads_daily", l: S.adsDaily, v: daily, u: null },
    { k: "ads_monthly", l: S.adsMonthly, v: await getLimit(ctx, "ads_monthly"), u: await usedThisMonth(ctx, "ads") },
    { k: "assets_monthly", l: S.assets, v: await getLimit(ctx, "assets_monthly"), u: await usedThisMonth(ctx, "assets") },
    { k: "ai_monthly", l: S.ai, v: await getLimit(ctx, "ai_monthly"), u: await usedThisMonth(ctx, "ai") },
    { k: "whatsapp_monthly", l: S.whatsapp, v: await getLimit(ctx, "whatsapp_monthly"), u: await usedThisMonth(ctx, "whatsapp") },
  ];
  const conn = [[S.connAi, a.ai], [S.connAds, a.ads], [S.connWa, a.whatsapp], [S.connShop, a.shopify], [S.connWeb, a.website]] as const;
  const policies = await ctx.db.select().from(knowledge).where(and(eq(knowledge.workspaceId, ctx.workspaceId), isNull(knowledge.productId)));
  return (
    <div className="space-y-10">
      <h1 className="h1">{S.title}</h1>
      <section className="max-w-3xl"><h2 className="h2">{S.budget}</h2><p className="hint mb-3">{S.budgetHint}</p>
        <form action={saveBudget} className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => <div key={f.k}><label className="lbl" htmlFor={f.k}>{f.l}</label><input id={f.k} name={f.k} defaultValue={f.v} inputMode="numeric" className="field tabular" /><p className="hint mt-1 tabular">{f.u !== null ? `${idr(f.u)} ${S.used}` : idr(f.v)}</p></div>)}
          <div className="sm:col-span-2"><p className="mb-3 rounded-xl bg-nila-soft px-4 py-2">{S.canTest(testableCampaigns(daily, 100000))}</p><button className="btn btn-main">{S.save}</button></div>
        </form>
      </section>
      <section className="max-w-3xl"><h2 className="h2">{S.brand}</h2><p className="hint mb-3">{S.brandHint}</p>
        <form action={saveBrand} className="grid items-end gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
          <div><label className="lbl" htmlFor="logo">{S.logo}</label><input id="logo" name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="field" /></div>
          <div><label className="lbl" htmlFor="primary">{S.primary}</label><input id="primary" name="primary" type="color" defaultValue={s.brand?.primary ?? "#1B2483"} className="field w-20 p-1" /></div>
          <div><label className="lbl" htmlFor="accent">{S.accent}</label><input id="accent" name="accent" type="color" defaultValue={s.brand?.accent ?? "#F5B90F"} className="field w-20 p-1" /></div>
          <button className="btn btn-main">{S.saveBrand}</button>
        </form>
      </section>
      <section className="max-w-3xl"><h2 className="h2">{S.policies}</h2><p className="hint mb-3">{S.policiesHint}</p>
        <form action={savePolicies} className="space-y-3">
          {POLICY_TOPICS.map(([topic, q]) => <div key={topic}><label className="lbl" htmlFor={`pol-${topic}`}>{q}</label><textarea id={`pol-${topic}`} name={topic} rows={2} defaultValue={policies.find((x) => x.topic === topic)?.answer} className="field" /></div>)}
          <button className="btn btn-main">{S.savePolicies}</button>
        </form>
      </section>
      <section className="max-w-3xl"><h2 className="h2">{S.conn}</h2><p className="hint mb-2">{S.connHint}</p>
        <ul>{conn.map(([l, on]) => <li key={l} className="rowline flex justify-between gap-3 py-2"><span className="font-semibold">{l}</span><span className={`chip ${on ? "chip-go" : "chip-wait"}`}>{on ? S.connected : S.notConn}</span></li>)}
          <li className="rowline flex justify-between gap-3 py-2"><span className="font-semibold">{S.connDb}</span><span className={`chip ${a.database ? "chip-go" : "chip-wait"}`}>{a.database ? S.connected : S.connDbLocal}</span></li></ul>
      </section>
      <section className="grid max-w-3xl gap-6 sm:grid-cols-3">
        <div><h2 className="h2 mb-2">{S.workspace}</h2><div className="flex flex-col gap-1.5">{ctx.allWorkspaces.map((w) => <form key={w.id} action={setPref.bind(null, "ws", w.id)}><button aria-pressed={w.id === ctx.workspaceId} className={`btn w-full ${w.id === ctx.workspaceId ? "btn-main" : ""}`}>{w.name}</button></form>)}</div></div>
        <div><h2 className="h2 mb-2">{S.member}</h2><div className="flex flex-col gap-1.5">{ctx.allMembers.map((m) => <form key={m.id} action={setPref.bind(null, "member", m.id)}><button aria-pressed={m.id === ctx.member.id} className={`btn w-full ${m.id === ctx.member.id ? "btn-main" : ""}`}>{m.name}, {S.roles[m.role]}</button></form>)}</div></div>
        <div><h2 className="h2 mb-2">{S.lang}</h2><div className="flex flex-col gap-1.5">{[["id", "Bahasa Indonesia"], ["en", "English"]].map(([k, l]) => <form key={k} action={setPref.bind(null, "lang", k)}><button aria-pressed={t.lang === k} className={`btn w-full ${t.lang === k ? "btn-main" : ""}`}>{l}</button></form>)}</div></div>
      </section>
      <section className="max-w-3xl"><h2 className="h2 mb-3">{S.waCost}</h2>
        <form action={saveSettings} className="grid gap-4 sm:grid-cols-2">
          <div><label className="lbl" htmlFor="marketing">{S.marketing}</label><input id="marketing" name="marketing" defaultValue={s.whatsappCost.marketingIdr} className="field tabular" /></div>
          <div><label className="lbl" htmlFor="service">{S.service}</label><input id="service" name="service" defaultValue={s.whatsappCost.serviceIdr} className="field tabular" /></div>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2"><div><label className="lbl" htmlFor="quietStart">{S.quiet}</label><input id="quietStart" name="quietStart" defaultValue={s.quietHours.startHour} className="field tabular" /></div><div><label className="lbl" htmlFor="quietEnd">&nbsp;</label><input id="quietEnd" name="quietEnd" defaultValue={s.quietHours.endHour} aria-label={S.quiet} className="field tabular" /></div></div>
          <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" name="aiLabel" defaultChecked={s.aiLabelAds} className="size-5" />{S.aiLabel}</label>
          <div><button className="btn btn-main">{S.saveOther}</button></div>
        </form>
      </section>
    </div>
  );
}
