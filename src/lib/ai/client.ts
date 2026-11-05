import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/** The model comes from ANTHROPIC_MODEL, so it can change without a code edit. */
export function model() {
  const m = process.env.ANTHROPIC_MODEL?.trim();
  if (!m) throw new Error("Isi ANTHROPIC_MODEL di .env.local");
  return m;
}

const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
/** Declined requests retry on another model server-side. Only some models accept this option. */
export const fallbackParams = (m: string) => FALLBACK_MODELS.has(m) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const claude = () => new Anthropic();

export class AiRefusal extends Error {}

/** Structured call used for creative steps. Declined requests fall back server-side, then raise AiRefusal. */
export async function structured<S extends z.ZodType>(opts: { schema: S; system: string; user: string | unknown[]; effort: "low" | "medium" | "high" }): Promise<z.infer<S>> {
  const res = await claude().beta.messages.parse({
    model: model(),
    max_tokens: 16000,
    ...fallbackParams(model()),
    system: opts.system,
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    messages: [{ role: "user", content: opts.user }],
  } as never) as unknown as { stop_reason: string; parsed_output: z.infer<S> | null };
  if (res.stop_reason === "refusal" || res.parsed_output == null) throw new AiRefusal("The model declined this request");
  return res.parsed_output;
}
