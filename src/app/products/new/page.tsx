import { saveProduct } from "@/app/actions";
import { ProductForm } from "@/components/product-form";
import { getT } from "@/lib/i18n";

export default async function NewProduct() {
  const t = (await getT()).products;
  return <div className="max-w-2xl"><h1 className="h1 mb-6">{t.add}</h1><ProductForm t={t} action={saveProduct} /></div>;
}
