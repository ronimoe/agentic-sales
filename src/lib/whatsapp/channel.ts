export async function sendViaEvolution(phone: string, text: string, env = process.env, fetcher: typeof fetch = fetch) {
  const res = await fetcher(`${env.EVOLUTION_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`, {
    method: "POST", headers: { "content-type": "application/json", apikey: env.EVOLUTION_API_KEY ?? "" },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!res.ok) throw new Error(`Evolution API ${res.status}`);
  const j = await res.json() as { key?: { id?: string } };
  return j.key?.id ?? null;
}

type EvolutionEvent = {
  event?: string;
  data?: { key?: { remoteJid?: string; fromMe?: boolean; id?: string }; pushName?: string; message?: { conversation?: string; extendedTextMessage?: { text?: string } } };
};

/** Extracts a customer's text message from an Evolution webhook. Groups, broadcasts, and own messages return null. */
export function parseEvolutionEvent(e: EvolutionEvent) {
  const event = (e.event ?? "").toLowerCase().replace("_", ".");
  const d = e.data;
  if (event !== "messages.upsert" || !d?.key?.remoteJid || d.key.fromMe) return null;
  if (!d.key.remoteJid.endsWith("@s.whatsapp.net")) return null;
  const text = d.message?.conversation ?? d.message?.extendedTextMessage?.text;
  if (!text) return null;
  return { phone: d.key.remoteJid.split("@")[0], name: d.pushName ?? "", text, externalId: d.key.id ?? null };
}
