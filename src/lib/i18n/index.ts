import { cookies } from "next/headers";
import { en, id, type Lang, type Messages } from "./messages";

export async function getT(): Promise<Messages & { lang: Lang }> {
  const lang: Lang = (await cookies()).get("lang")?.value === "en" ? "en" : "id";
  return { ...(lang === "en" ? en : id), lang };
}
