import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource/bagel-fat-one";
import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import "./globals.css";

export const metadata: Metadata = { title: "Laris", description: "Tim sales AI untuk iklan Meta dan WhatsApp" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = (await cookies()).get("lang")?.value === "en" ? "en" : "id";
  return (
    <html lang={lang}>
      <body><Shell>{children}</Shell></body>
    </html>
  );
}
