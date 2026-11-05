import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const MODEL = "claude-opus-5-5";
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const claude = () => new Anthropic();

export class AiRefusal extends Error {}

/** Structured call used for creative steps. Declined requests fall back server-side, then raise AiRefusal. */
export async function structured<S extends z.ZodType>(opts: { schema: S; system: string; user: string; effort: "low" | "medium" | "high" }): Promise<z.infer<S>> {
  const res = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    messages: [{ role: "user", content: opts.user }],
  } as never) as unknown as { stop_reason: string; parsed_output: z.infer<S> | null };
  if (res.stop_reason === "refusal" || res.parsed_output == null) throw new AiRefusal("The model declined this request");
  return res.parsed_output;
}
