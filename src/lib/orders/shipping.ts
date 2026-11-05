export const PROVINCES = ["Aceh", "Sumatera Utara", "Sumatera Barat", "Riau", "Kepulauan Riau", "Jambi", "Sumatera Selatan", "Bangka Belitung", "Bengkulu", "Lampung", "DKI Jakarta", "Jawa Barat", "Banten", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur", "Bali", "Nusa Tenggara Barat", "Nusa Tenggara Timur", "Kalimantan Barat", "Kalimantan Tengah", "Kalimantan Selatan", "Kalimantan Timur", "Kalimantan Utara", "Sulawesi Utara", "Sulawesi Tengah", "Sulawesi Selatan", "Sulawesi Tenggara", "Gorontalo", "Sulawesi Barat", "Maluku", "Maluku Utara", "Papua", "Papua Barat", "Papua Selatan", "Papua Tengah", "Papua Pegunungan", "Papua Barat Daya"];
export const JAVA = ["DKI Jakarta", "Jawa Barat", "Banten", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur"];

const ALIASES: Record<string, string> = { jakarta: "DKI Jakarta", "dki": "DKI Jakarta", jabar: "Jawa Barat", jateng: "Jawa Tengah", jatim: "Jawa Timur", yogyakarta: "DI Yogyakarta", jogja: "DI Yogyakarta", yogya: "DI Yogyakarta", diy: "DI Yogyakarta" };

export function normalizeProvince(input: string): string | null {
  const v = input.trim().toLowerCase().replace(/^provinsi\s+/, "");
  return PROVINCES.find((p) => p.toLowerCase() === v) ?? ALIASES[v] ?? null;
}

export type Shipping = { recipient: string; address: string; city: string; province: string };

/** An order can't exist until it can actually ship. Returns what's missing, or the cleaned address. */
export function validateShipping(s: Partial<Shipping>): { ok: true; value: Shipping } | { ok: false; reason: string } {
  const missing: string[] = [];
  if ((s.recipient ?? "").trim().length < 2) missing.push("nama penerima");
  if ((s.address ?? "").trim().length < 10) missing.push("alamat lengkap");
  if ((s.city ?? "").trim().length < 3) missing.push("kota");
  const province = normalizeProvince(s.province ?? "");
  if (!province) missing.push("provinsi");
  if (missing.length || !province) return { ok: false, reason: `Tanyakan dulu: ${missing.join(", ")}` };
  return { ok: true, value: { recipient: s.recipient!.trim(), address: s.address!.trim(), city: s.city!.trim(), province } };
}

export const codAllowed = (areas: string[] | undefined, province: string) => !!areas?.includes(province);

/** Reads "Nama, alamat, kota, provinsi" for the scripted closer. Claude extracts these fields itself. */
export function parseAddressLine(text: string): Partial<Shipping> {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return {};
  return { recipient: parts[0], address: parts.slice(1, -2).join(", "), city: parts.at(-2), province: parts.at(-1) };
}
