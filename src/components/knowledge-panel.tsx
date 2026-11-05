import Link from "next/link";
import { eq } from "drizzle-orm";
import { addFact, confirmFact, deleteFact, draftFromSource, saveVariant, testReadiness } from "@/app/actions";
import { knowledge, variants, type KnowledgeTopic, type products } from "@/db/schema";
import { aiEnabled } from "@/lib/ai/client";
import { factsFor } from "@/lib/knowledge/service";
import { coverage } from "@/lib/knowledge/readiness";
import type { Messages } from "@/lib/i18n/messages";
import type { Ctx } from "@/lib/types";

export async function KnowledgePanel({ ctx, p, t }: { ctx: Ctx; p: typeof products.$inferSelect; t: Messages["products"] }) {
  const facts = await factsFor(ctx, p.id, false);
  const vs = await ctx.db.select().from(variants).where(eq(variants.productId, p.id));
  const cov = coverage(p, facts, vs.length);
  const gaps = cov.items.filter((i) => !i.covered);
  const drafts = facts.filter((f) => f.status === "draft");
  const confirmed = facts.filter((f) => f.status === "confirmed" && f.productId);
  const policies = facts.filter((f) => !f.productId);
  const ai = p.readiness;
  const pass = ai?.results.filter((r) => r.grounded).length ?? 0;
  const FACT = (f: typeof knowledge.$inferSelect, label: string) => (
    <li key={f.id} className="rowline py-3">
      <form action={confirmFact.bind(null, f.id)} className="space-y-2">
        <input name="question" aria-label={t.question} defaultValue={f.question} className="field font-semibold" />
        <textarea name="answer" aria-label={t.answer} rows={2} defaultValue={f.answer} className="field" />
        <div className="flex gap-2"><button className="btn btn-main">{label}</button><button formAction={deleteFact.bind(null, f.id)} className="btn">{t.remove}</button></div>
      </form>
    </li>
  );
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="h2">{t.knowledge}</h2>
          <p className="mt-1 text-[32px] leading-tight tabular" style={{ fontFamily: "var(--font-display)" }}>{t.ready(cov.covered, cov.total)}</p>
          <p className="hint max-w-xl">{t.coverageNote}</p>
          {ai && <p className="mt-1 font-semibold">{t.aiResult(pass, ai.results.length)}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/chats?try=1" className="btn">{t.tryChat}</Link>
          {aiEnabled() ? <form action={testReadiness.bind(null, p.id)}><button className="btn btn-main">{t.runAi}</button></form> : <span className="chip chip-wait self-center">{t.aiTestOff}</span>}
        </div>
      </div>

      {drafts.length > 0 && <div className="mt-6"><h3 className="font-bold">{t.drafts(drafts.length)}</h3><p className="hint">{t.draftsHint}</p><ul className="mt-2">{drafts.map((f) => FACT(f, t.confirm))}</ul></div>}

      {gaps.length > 0 && <div className="mt-6"><h3 className="font-bold">{t.gaps}</h3>
        <ul className="mt-2">{gaps.map((g) => {
          if (g.field === "variants") return <li key={g.id} className="rowline py-3"><p className="font-semibold">{g.question}</p><p className="hint">{t.gapVariants}</p></li>;
          if (g.field) return <li key={g.id} className="rowline flex items-center justify-between gap-3 py-3"><p className="font-semibold">{g.question}</p><Link href={`/products/${p.id}/edit`} className="btn">{t.edit}</Link></li>;
          return <li key={g.id} className="rowline py-3"><form action={addFact.bind(null, p.id, g.topics![0] as KnowledgeTopic, g.question)} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div><label className="font-semibold" htmlFor={`g-${g.id}`}>{g.question}</label><input id={`g-${g.id}`} name="answer" required placeholder={t.answerPh} className="field mt-1" /></div><button className="btn">{t.saveAnswer}</button></form></li>;
        })}</ul>
        {policies.length === 0 && <p className="hint mt-2">{t.policiesHint} <Link href="/settings" className="underline">{t.policiesLink}</Link></p>}
      </div>}

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div><h3 className="font-bold">{t.variantsTitle}</h3>
          <ul className="mt-2">{vs.map((v) => <li key={v.id} className="rowline flex justify-between gap-3 py-2"><span className="font-semibold">{v.name}</span><span className={`tabular ${v.stock === 0 ? "text-[#9d1228]" : ""}`}>{v.stock}</span></li>)}</ul>
          <form action={saveVariant.bind(null, p.id)} className="mt-2 flex gap-2"><input name="name" required aria-label={t.variantName} placeholder={t.variantName} className="field" /><input name="stock" aria-label={t.stock} placeholder={t.stock} inputMode="numeric" className="field w-24" /><button className="btn">{t.saveAnswer}</button></form>
        </div>
        <div><h3 className="font-bold">{t.draftFrom}</h3>
          {aiEnabled() ? <form action={draftFromSource.bind(null, p.id)} className="mt-2 space-y-2"><input name="url" aria-label={t.url} defaultValue={p.sourceUrl ?? ""} placeholder="https://" className="field" /><textarea name="text" rows={2} aria-label={t.paste} placeholder={t.paste} className="field" /><button className="btn">{t.doDraft}</button></form> : <p className="hint mt-2">{t.needClaude}</p>}
        </div>
      </div>

      {confirmed.length > 0 && <details className="mt-6"><summary className="cursor-pointer font-bold">{t.confirmedFacts(confirmed.length)}</summary><ul className="mt-2">{confirmed.map((f) => FACT(f, t.saveAnswer))}</ul></details>}
    </section>
  );
}
