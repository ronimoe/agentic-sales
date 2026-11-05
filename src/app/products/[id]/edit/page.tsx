import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { products, variants } from "@/db/schema";
import { updateProduct } from "@/app/actions";
import { ProductForm } from "@/components/product-form";
import { getCtx } from "@/lib/ctx";
import { getT } from "@/lib/i18n";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const [p] = await ctx.db.select().from(products).where(and(eq(products.id, id), eq(products.workspaceId, ctx.workspaceId)));
  if (!p) notFound();
  const vs = await ctx.db.select({ id: variants.id }).from(variants).where(eq(variants.productId, id));
  return <div className="max-w-2xl"><h1 className="h1 mb-6">{t.products.edit}</h1><ProductForm t={t.products} action={updateProduct.bind(null, id)} p={p} hasVariants={vs.length > 0} /></div>;
}
