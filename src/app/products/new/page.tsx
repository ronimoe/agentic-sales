import { saveProduct } from "@/app/actions";
import { getT } from "@/lib/i18n";

const F = ({ n, l, ph, hint, area, req }: { n: string; l: string; ph?: string; hint?: string; area?: boolean; req?: boolean }) => (
    <div><label className="lbl" htmlFor={n}>{l}</label>{area ? <textarea id={n} name={n} rows={3} placeholder={ph} className="field" /> : <input id={n} name={n} placeholder={ph} required={req} className="field" />}{hint && <p className="hint mt-1">{hint}</p>}</div>
);

export default async function NewProduct() {
  const t = (await getT()).products;
  return (
    <div className="max-w-2xl">
      <h1 className="h1 mb-6">{t.add}</h1>
      <form action={saveProduct} className="space-y-4">
        <F n="name" l={t.name} ph="Serum Niacinamide Glow" req />
        <F n="description" l={t.desc} area />
        <F n="sourceUrl" l={t.url} ph="https://" />
        <div className="grid gap-4 sm:grid-cols-3"><F n="price" l={t.price} ph="99000" req /><F n="cost" l={t.cost} ph="32000" req /><F n="stock" l={t.stock} ph="100" /></div>
        <div><label className="lbl" htmlFor="category">{t.category}</label><select id="category" name="category" className="field"><option value="general">{t.catGeneral}</option><option value="cosmetic">{t.catCos}</option><option value="food">{t.catFood}</option></select></div>
        <div className="grid gap-4 sm:grid-cols-2"><F n="bpom" l={t.bpom} /><F n="halal" l={t.halal} /></div>
        <F n="claims" l={t.claims} hint={t.claimsHint} area />
        <F n="proof" l={t.proof} hint={t.proofHint} area />
        <button className="btn btn-main">{t.save}</button>
      </form>
    </div>
  );
}
