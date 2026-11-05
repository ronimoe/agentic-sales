import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { adMetrics, campaigns, conversations, creatives, messages, objections, type OrderChannel } from "@/db/schema";
import { Bars, HBars } from "@/components/bars";
import { SimChip } from "@/components/sim-chip";
import { getCtx } from "@/lib/ctx";
import { dateWib, idr, idrShort, num, pct, dayKey } from "@/lib/format";
import { getT } from "@/lib/i18n";
import { profitOf } from "@/lib/orders/csv";
import { adScore, moneySummary, recentDays, scorecard } from "@/lib/queries";

const Stat = ({ k, v, sub }: { k: string; v: string; sub?: string }) => <div><dt className="hint">{k}</dt><dd className="text-[26px] font-extrabold leading-tight tabular">{v}</dd>{sub && <dd className="hint">{sub}</dd>}</div>;

export default async function Dashboard() {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const D = t.dash; const ws = ctx.workspaceId;
  const days = await recentDays(ctx, 14);
  const money = await moneySummary(ctx);
  const metricRows = days.length ? await ctx.db.select({ day: adMetrics.day, v: sql<string>`sum(${adMetrics.spendIdr})`, chats: sql<string>`sum(${adMetrics.chats})`, sim: sql<boolean>`bool_or(${adMetrics.simulated})` }).from(adMetrics).where(and(eq(adMetrics.workspaceId, ws), inArray(adMetrics.day, days))).groupBy(adMetrics.day) : [];
  const fmtDay = (d: string) => dateWib(new Date(`${d}T12:00:00+07:00`), t.locale);
  const spendData = days.map((d) => { const v = Number(metricRows.find((m) => m.day === d)?.v ?? 0); return { label: fmtDay(d), value: v, display: idr(v) }; });
  const delivered = money.orders.filter((o) => o.status === "delivered");
  const profitData = days.map((d) => { const v = delivered.filter((o) => dayKey(o.orderedAt) === d).reduce((s, o) => s + profitOf(o), 0); return { label: fmtDay(d), value: v, display: idr(v) }; });
  const totalSpend = (await ctx.db.select({ v: sql<string>`coalesce(sum(${adMetrics.spendIdr}),0)` }).from(adMetrics).where(eq(adMetrics.workspaceId, ws)))[0].v;
  const spendAll = Number(totalSpend);
  const chan = new Map<OrderChannel, number>();
  for (const o of delivered) chan.set(o.channel, (chan.get(o.channel) ?? 0) + profitOf(o));
  const attrNote = (c: OrderChannel) => c === "whatsapp" || c === "website" ? D.confirmed : c === "shopify" ? D.partial : D.estimated;
  const chanData = [...chan.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ label: t.channel[c], value: v, display: idr(v), note: attrNote(c) }));
  const returnRate = (money.delivered + money.returned) ? money.returned / (money.delivered + money.returned) : 0;

  const chatOrders = money.orders.filter((o) => o.channel === "whatsapp");
  const totalChats = metricRows.reduce((s, m) => s + Number(m.chats), 0) + (await ctx.db.select({ v: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.workspaceId, ws)))[0].v;
  const funnel = [
    { label: D.steps.chats, value: totalChats, display: num(totalChats) },
    { label: D.steps.orders, value: chatOrders.length, display: num(chatOrders.length) },
    { label: D.steps.delivered, value: chatOrders.filter((o) => o.status === "delivered").length, display: num(chatOrders.filter((o) => o.status === "delivered").length) },
  ];
  const convs = await ctx.db.select({ handler: conversations.handler }).from(conversations).where(eq(conversations.workspaceId, ws));
  const msgCounts = await ctx.db.select({ sender: messages.sender, v: sql<number>`count(*)::int`, cost: sql<string>`coalesce(sum(${messages.estimatedCostIdr}),0)` }).from(messages).where(eq(messages.workspaceId, ws)).groupBy(messages.sender);
  const ai = msgCounts.find((m) => m.sender === "ai")?.v ?? 0; const human = msgCounts.find((m) => m.sender === "human")?.v ?? 0;
  const waCost = msgCounts.reduce((s, m) => s + Number(m.cost), 0);
  const objs = await ctx.db.select().from(objections).where(eq(objections.workspaceId, ws)).orderBy(desc(objections.createdAt)).limit(5);

  const statuses = await ctx.db.select({ s: creatives.status, passed: sql<boolean>`(${creatives.compliance}->>'passed')::boolean`, v: sql<number>`count(*)::int` }).from(creatives).where(eq(creatives.workspaceId, ws)).groupBy(creatives.status, sql`(${creatives.compliance}->>'passed')::boolean`);
  const count = (f: (s: (typeof statuses)[0]) => boolean) => statuses.filter(f).reduce((a, s) => a + s.v, 0);
  const total = count(() => true); const rejected = count((s) => s.s === "rejected"); const reviewed = count((s) => s.s !== "in_review");

  const ads = await ctx.db.select({ id: creatives.id, goal: campaigns.goal }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(eq(creatives.workspaceId, ws));
  const score = await adScore(ctx, ads.map((a) => a.id));
  const goals = [...new Set(ads.map((a) => a.goal))].map((g) => {
    const s = { spend: 0, reach: 0, impressions: 0, watches: 0, chats: 0, qualified: 0, sales: 0 };
    for (const a of ads.filter((x) => x.goal === g)) { const e = score.get(a.id)!; (Object.keys(s) as (keyof typeof s)[]).forEach((k) => { s[k] += e[k]; }); }
    return { g, spend: s.spend, card: scorecard(g, s, t, idr, num, pct) };
  });
  const simulated = metricRows.some((m) => m.sim);

  return (
    <div className="space-y-12">
      <div className="flex items-center justify-between gap-3"><h1 className="h1">{D.title}</h1>{simulated && <SimChip label={t.sim} tip={t.simTip} />}</div>
      <section>
        <h2 className="h2 mb-3">{D.money}</h2>
        <dl className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat k={D.netProfit} v={idrShort(money.profit - spendAll)} />
          <Stat k={t.today.profit} v={idrShort(money.profit)} />
          <Stat k={D.costPerSale} v={money.delivered ? idr(spendAll / money.delivered) : "-"} />
          <Stat k={D.returnRate} v={pct(returnRate)} sub={`${money.returned} ${t.status.returned.toLowerCase()}`} />
        </dl>
        <div className="grid gap-8 md:grid-cols-2">
          <Bars title={D.spendDaily} data={spendData} color="#2B3AA8" tableLabel={D.table} dayLabel={D.day} />
          <Bars title={D.profitDaily} data={profitData} color="#0B7A55" tableLabel={D.table} dayLabel={D.day} />
        </div>
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div><h3 className="mb-2 font-semibold">{D.byChannel}</h3><HBars data={chanData} color="#0B7A55" /></div>
          <div><h3 className="mb-2 font-semibold">{D.byGoal}</h3>
            <ul>{goals.map((g) => <li key={g.g} className="rowline py-2"><p className="font-semibold">{t.goal[g.g]} <span className="hint font-normal tabular">{idr(g.spend)}</span></p><p className="hint tabular">{g.card.map(([k, v]) => `${k} ${v}`).join(", ")}</p></li>)}</ul>
          </div>
        </div>
      </section>
      <section>
        <h2 className="h2 mb-3">{D.follow}</h2>
        <dl className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
          <Stat k={D.replyAuto} v={pct(ai + human ? ai / (ai + human) : 0)} />
          <Stat k={D.handoffs} v={num(convs.filter((c) => c.handler !== "ai").length)} />
          <Stat k={D.waCost} v={idr(waCost)} />
        </dl>
        <div className="grid gap-8 md:grid-cols-2">
          <div><h3 className="mb-2 font-semibold">{D.funnel}</h3><HBars data={funnel} color="#2B3AA8" /></div>
          <div><h3 className="mb-2 font-semibold">{D.objections}</h3>{objs.length ? <ul>{objs.map((o) => <li key={o.id} className="rowline py-2">{o.text}</li>)}</ul> : <p className="hint">{D.noObjection}</p>}</div>
        </div>
      </section>
      <section>
        <h2 className="h2 mb-3">{D.agents}</h2>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Stat k={D.approval} v={pct(reviewed ? (reviewed - rejected) / reviewed : 0)} sub={`${reviewed - rejected} / ${reviewed}`} />
          <Stat k={D.rejected} v={num(rejected)} />
          <Stat k={D.compliance} v={pct(total ? count((s) => s.passed) / total : 0)} />
        </dl>
        <p className="hint mt-3">{D.learnLater}</p>
      </section>
    </div>
  );
}
