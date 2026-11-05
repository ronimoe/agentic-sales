import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { creatives, goalTemplates, rulebooks } from "@/db/schema";
import { addBlockedWord, adoptReason, rollbackRules, saveGoal, setVoice, toggleRule } from "@/app/actions";
import { aiEnabled } from "@/lib/ai/client";
import { getCtx } from "@/lib/ctx";
import { getT } from "@/lib/i18n";
import { ENFORCED, LOCKED } from "@/lib/rules";
import { VOICES, type VoiceKey } from "@/lib/voice";

export default async function Rules() {
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const R = t.rules;
  const active = await ctx.db.select().from(rulebooks).where(and(eq(rulebooks.workspaceId, ctx.workspaceId), eq(rulebooks.active, true)));
  const goals = await ctx.db.select().from(goalTemplates).where(eq(goalTemplates.workspaceId, ctx.workspaceId));
  const reasons = await ctx.db.select({ reason: creatives.rejectReason, n: sql<number>`count(*)::int` }).from(creatives).where(and(eq(creatives.workspaceId, ctx.workspaceId), isNotNull(creatives.rejectReason))).groupBy(creatives.rejectReason).orderBy(desc(sql`count(*)`)).limit(6);
  const voice = ctx.workspace.settings.voice?.key;
  const ai = aiEnabled();
  const adopted = new Set(active.flatMap((b) => b.rules.map((r) => r.text)));
  return (
    <div className="space-y-12">
      <div><h1 className="h1">{R.title}</h1><p className="mt-2 max-w-2xl">{R.intro}</p></div>

      <section>
        <h2 className="h2">{R.voiceTitle}</h2><p className="hint mb-3">{R.voiceHint}</p>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(VOICES) as VoiceKey[]).map((k) => { const v = VOICES[k]; const on = voice === k; return (
            <form key={k} action={setVoice.bind(null, k)}>
              <button aria-pressed={on} className={`block h-full w-full cursor-pointer rounded-2xl border-2 bg-white p-4 text-left ${on ? "border-nila" : "border-garis hover:border-tinta"}`}>
                <span className="flex items-center justify-between font-bold">{v.name}{on && <span className="chip">{R.chosen}</span>}</span>
                <span className="hint mt-2 block">{R.adSample}</span><span className="block font-semibold">{v.ad}</span>
                <span className="hint mt-2 block">{R.chatSample}</span><span className="mt-1 block rounded-2xl bg-nila px-3 py-2 text-white">{v.chat}</span>
              </button>
            </form>
          ); })}
        </div>
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        {(["ads", "whatsapp"] as const).map((k) => { const b = active.find((x) => x.kind === k); return (
          <div key={k}>
            <div className="flex items-center justify-between gap-2"><h2 className="h2">{R[k]}</h2>{b && <span className="chip chip-mute">{R.version(b.version)}</span>}</div>
            <ul className="mt-2">{b?.rules.map((r) => { const on = r.enabled !== false; const real = ENFORCED.has(r.id) || !!r.block; return (
              <li key={r.id} className="rowline flex items-center justify-between gap-3 py-2.5">
                <div><p className={`font-semibold ${on ? "" : "text-abu line-through"}`}>{r.text}</p>{!real && !ai && <p className="hint">{R.needsClaude}</p>}</div>
                <form action={toggleRule.bind(null, k, r.id)}><button aria-pressed={on} className="btn min-h-8 px-3 text-[13px]">{on ? R.turnOff : R.turnOn}</button></form>
              </li>
            ); })}</ul>
            {b && b.version > 1 && <form action={rollbackRules.bind(null, k)} className="mt-2"><button className="hint cursor-pointer underline">{R.rollback}</button></form>}
          </div>
        ); })}
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="h2">{R.fromDecisions}</h2><p className="hint mb-2">{R.fromDecisionsHint}</p>
          {!reasons.length && <p className="rowline py-3 hint">{R.noDecisions}</p>}
          <ul>{reasons.map((x) => { const text = `Hindari: ${x.reason}`; return (
            <li key={x.reason} className="rowline flex items-center justify-between gap-3 py-2.5"><p><span className="font-semibold">{x.reason}</span> <span className="hint tabular">{R.times(x.n)}</span></p>
              {adopted.has(text) ? <span className="chip chip-go">{R.adopted}</span> : <form action={adoptReason.bind(null, x.reason!)}><button className="btn min-h-8 px-3 text-[13px]">{R.adopt}</button></form>}</li>
          ); })}</ul>
        </div>
        <div>
          <h2 className="h2">{R.blockedWord}</h2><p className="hint mb-2">{R.blockedWordHint}</p>
          <form action={addBlockedWord} className="flex gap-2"><input name="word" required aria-label={R.blockedWord} placeholder="paling ampuh" className="field" /><button className="btn btn-main">{R.block}</button></form>
        </div>
      </section>

      <section>
        <h2 className="h2">{R.locked}</h2><p className="hint mb-2">{R.lockedHint}</p>
        <ul className="grid gap-x-8 md:grid-cols-2">{LOCKED[t.lang].map(([a, b]) => <li key={a} className="rowline py-2.5"><p className="font-semibold">{a}</p><p className="hint">{b}</p></li>)}</ul>
      </section>

      <details>
        <summary className="cursor-pointer font-bold">{R.goals}</summary>
        <p className="hint mt-1">{R.goalsHint}</p>
        <ul className="mt-2">{goals.map((g) => <li key={g.id} className="rowline py-3">
          <form action={saveGoal.bind(null, g.id)} className="grid items-end gap-3 sm:grid-cols-[1.2fr_1fr_1fr_.7fr_auto]">
            <p className="font-bold">{t.goal[g.key]}</p>
            <div><label className="hint" htmlFor={`t-${g.id}`}>{R.target}</label><input id={`t-${g.id}`} name="target" defaultValue={g.rules.targetIdr} className="field tabular" /></div>
            <div><label className="hint" htmlFor={`p-${g.id}`}>{R.pauseAt}</label><input id={`p-${g.id}`} name="pauseAt" defaultValue={g.rules.pauseSpendWithoutResultIdr} className="field tabular" /></div>
            <div><label className="hint" htmlFor={`f-${g.id}`}>{R.freq}</label><input id={`f-${g.id}`} name="freq" defaultValue={g.rules.maxFrequency} className="field tabular" /></div>
            <button className="btn">{R.saveGoal}</button>
          </form>
        </li>)}</ul>
      </details>
    </div>
  );
}
