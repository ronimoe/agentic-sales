import Link from "next/link";
import { and, asc, desc, eq } from "drizzle-orm";
import { campaigns, contacts, conversations, creatives, messages, products } from "@/db/schema";
import { customerSays, humanReply, setHandler } from "@/app/actions";
import { adapterStatus } from "@/lib/adapters";
import { getCtx } from "@/lib/ctx";
import { idr, timeWib } from "@/lib/format";
import { getT } from "@/lib/i18n";

export default async function Chats({ searchParams }: { searchParams: Promise<{ c?: string; try?: string }> }) {
  const sp = await searchParams;
  const [ctx, t] = await Promise.all([getCtx(), getT()]);
  const C = t.chats;
  const list = await ctx.db.select({ conv: conversations, contact: contacts, product: products.name, hook: creatives.hook }).from(conversations)
    .innerJoin(contacts, eq(conversations.contactId, contacts.id)).leftJoin(products, eq(conversations.productId, products.id)).leftJoin(creatives, eq(conversations.creativeId, creatives.id))
    .where(eq(conversations.workspaceId, ctx.workspaceId)).orderBy(desc(conversations.lastMessageAt));
  list.sort((a, b) => Number(b.conv.handler === "needs_human") - Number(a.conv.handler === "needs_human"));
  const cur = list.find((x) => x.conv.id === sp.c) ?? null;
  const msgs = cur ? await ctx.db.select().from(messages).where(and(eq(messages.conversationId, cur.conv.id), eq(messages.workspaceId, ctx.workspaceId))).orderBy(asc(messages.createdAt)) : [];
  const liveAds = await ctx.db.select({ ref: creatives.refCode, hook: creatives.hook }).from(creatives).innerJoin(campaigns, eq(creatives.campaignId, campaigns.id)).where(and(eq(creatives.workspaceId, ctx.workspaceId), eq(creatives.status, "live"), eq(campaigns.goal, "whatsapp_chat")));
  const sim = !adapterStatus().whatsapp;
  const handlerChip = (h: string) => h === "needs_human" ? <span className="chip chip-stop">{C.needsHuman}</span> : h === "human" ? <span className="chip">{C.human}</span> : <span className="chip chip-go">{C.ai}</span>;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h1 className="h1">{C.title}</h1>{sim && <Link href="/chats?try=1" className="btn"><span className="chip chip-wait">{t.sim}</span>{C.phone}</Link>}</div>
      {sp.try && <form action={customerSays} className="mb-6 rounded-2xl border-[1.5px] border-tinta bg-white p-4">
        <p className="hint mb-3">{C.phoneHint}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="lbl" htmlFor="ref">{C.phoneAd}</label><select id="ref" name="ref" className="field"><option value="">{C.noAd}</option>{liveAds.map((a) => <option key={a.ref} value={a.ref}>{a.hook}</option>)}</select></div>
          <div><label className="lbl" htmlFor="name">{C.phoneName}</label><input id="name" name="name" defaultValue="Budi" className="field" /></div>
          <div><label className="lbl" htmlFor="phone">{C.phoneNum}</label><input id="phone" name="phone" defaultValue="628120000" className="field" required /></div>
        </div>
        <div className="mt-3 flex gap-2"><input name="text" aria-label={C.phoneMsg} placeholder="Harganya berapa kak?" required className="field" /><button className="btn btn-main">{C.phoneSend}</button></div>
      </form>}
      <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
        <ul className={cur ? "hidden md:block" : ""}>
          {!list.length && <li className="py-3">{C.empty}</li>}
          {list.map(({ conv, contact, product }) => <li key={conv.id}><Link href={`/chats?c=${conv.id}`} aria-current={conv.id === cur?.conv.id} className={`block rowline px-2 py-2.5 ${conv.id === cur?.conv.id ? "bg-white" : "hover:bg-white/60"}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-bold">{contact.name || contact.phone}</span><time className="hint tabular">{timeWib(conv.lastMessageAt, t.locale)}</time></div>
            <p className="hint truncate">{product ?? C.noProduct}, {C.stage[conv.stage]}</p>
            <div className="mt-1">{handlerChip(conv.handler)}</div>
          </Link></li>)}
        </ul>
        {!cur ? <p className="hidden py-3 md:block hint">{C.pick}</p> : (
          <section className="flex min-h-[60vh] flex-col rounded-2xl bg-white p-4">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b-[1.5px] border-garis pb-3">
              <div><Link href="/chats" className="hint md:hidden">{C.title} / </Link><h2 className="text-[17px] font-bold">{cur.contact.name || cur.contact.phone}</h2>
                <p className="hint">{cur.conv.source === "ad_chat" ? `${C.fromAd}: ${cur.hook}` : C.organic}, {cur.contact.optInAt ? C.optIn : C.optNo}</p>{cur.conv.handoffReason && <p className="mt-1 text-sm text-[#9d1228]">{cur.conv.handoffReason}</p>}</div>
              <form action={setHandler.bind(null, cur.conv.id, cur.conv.handler === "ai" ? "human" : "ai")}><button className="btn">{cur.conv.handler === "ai" ? C.takeover : C.backToAi}</button></form>
            </header>
            <ol className="flex flex-1 flex-col gap-2">
              {msgs.map((m) => m.sender === "system" ? <li key={m.id} className="self-center rounded-lg bg-kunyit-soft px-3 py-1 text-center text-[13px]">{m.body}</li> : (
                <li key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 ${m.sender === "customer" ? "self-start bg-awan" : m.sender === "ai" ? "self-end bg-nila text-white" : "self-end bg-pandan text-white"}`}>
                  <p>{m.body}</p><p className={`mt-0.5 text-[11.5px] tabular ${m.sender === "customer" ? "text-abu" : "text-white/75"}`}>{m.sender === "ai" ? "AI, " : ""}{timeWib(m.createdAt, t.locale)}{m.estimatedCostIdr ? `, ${C.costNote} ${idr(m.estimatedCostIdr)}` : ""}</p>
                </li>
              ))}
            </ol>
            <form action={humanReply.bind(null, cur.conv.id)} className="mt-3 flex gap-2"><input name="text" required aria-label={C.reply} placeholder={C.reply} className="field" /><button className="btn btn-main">{C.send}</button></form>
            {sim && <form action={customerSays} className="mt-2 flex gap-2"><input type="hidden" name="phone" value={cur.contact.phone} /><input type="hidden" name="name" value={cur.contact.name} /><input name="text" required aria-label={C.phoneSend} placeholder={C.phoneSend} className="field border-dashed" /><button className="btn">{t.sim}</button></form>}
          </section>
        )}
      </div>
    </div>
  );
}
