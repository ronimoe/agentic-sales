import type { products } from "@/db/schema";
import type { Messages } from "@/lib/i18n/messages";

type P = typeof products.$inferSelect;

const F = ({ n, l, ph, hint, area, req, v }: { n: string; l: string; ph?: string; hint?: string; area?: boolean; req?: boolean; v?: string | number | null }) => (
  <div><label className="lbl" htmlFor={n}>{l}</label>{area ? <textarea id={n} name={n} rows={3} placeholder={ph} defaultValue={v ?? ""} className="field" /> : <input id={n} name={n} placeholder={ph} required={req} defaultValue={v ?? ""} className="field" />}{hint && <p className="hint mt-1">{hint}</p>}</div>
);

export function ProductForm({ t, action, p, hasVariants }: { t: Messages["products"]; action: (f: FormData) => Promise<void>; p?: P; hasVariants?: boolean }) {
  return (
    <form action={action} className="space-y-4">
      <F n="name" l={t.name} ph="Serum Niacinamide Glow" req v={p?.name} />
      <F n="description" l={t.desc} area v={p?.description} />
      <F n="sourceUrl" l={t.url} ph="https://" hint={t.urlHint} v={p?.sourceUrl} />
      <div className="grid gap-4 sm:grid-cols-3">
        <F n="price" l={t.price} ph="99000" req v={p?.priceIdr} />
        <F n="cost" l={t.cost} ph="32000" req v={p?.costIdr} />
        {hasVariants ? <div><p className="lbl">{t.stock}</p><p className="hint">{t.stockFromVariants}</p></div> : <F n="stock" l={t.stock} ph="100" v={p?.stock} />}
      </div>
      <div><label className="lbl" htmlFor="photo">{t.photo}</label><input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="field" /><p className="hint mt-1">{t.photoHint}</p></div>
      <div><label className="lbl" htmlFor="category">{t.category}</label><select id="category" name="category" defaultValue={p?.category ?? "general"} className="field"><option value="general">{t.catGeneral}</option><option value="cosmetic">{t.catCos}</option><option value="food">{t.catFood}</option></select></div>
      <div className="grid gap-4 sm:grid-cols-2"><F n="bpom" l={t.bpom} v={p?.bpomNumber} /><F n="halal" l={t.halal} v={p?.halalStatus} /></div>
      <F n="claims" l={t.claims} hint={t.claimsHint} area v={p?.approvedClaims.join("\n")} />
      <F n="proof" l={t.proof} hint={t.proofHint} area v={p?.proof.join("\n")} />
      <div className="grid gap-4 sm:grid-cols-2">
        <F n="alwaysSay" l={t.alwaysSay} hint={t.oneLine} area v={p?.alwaysSay.join("\n")} />
        <F n="neverSay" l={t.neverSay} hint={t.neverHint} area v={p?.neverSay.join("\n")} />
      </div>
      <details><summary className="cursor-pointer font-semibold">{t.ownLimits}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <F n="targetCost" l={t.targetCost} hint={t.emptyUsesSuggested} v={p?.targetCostIdr} />
          <F n="stopSpend" l={t.stopSpend} hint={t.emptyUsesSuggested} v={p?.stopSpendIdr} />
        </div>
      </details>
      <button className="btn btn-main">{t.save}</button>
    </form>
  );
}
