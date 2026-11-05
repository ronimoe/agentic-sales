import type { OrderStatus } from "@/db/schema";

export type CsvRow = { externalId: string; product: string; quantity: number; amountIdr: number; feesIdr: number; status: OrderStatus; refCode: string | null; customer: string };

const STATUS: Record<string, OrderStatus> = {
  selesai: "delivered", completed: "delivered", delivered: "delivered", terkirim: "delivered",
  dikirim: "shipped", shipped: "shipped", "sedang dikirim": "shipped",
  dibayar: "paid", paid: "paid", dikemas: "paid", "perlu dikirim": "paid",
  batal: "cancelled", dibatalkan: "cancelled", cancelled: "cancelled", canceled: "cancelled",
  retur: "returned", dikembalikan: "returned", returned: "returned", "pengembalian": "returned",
};

function splitLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if ((ch === "," || ch === ";") && !q) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const money = (s: string | undefined) => Number((s ?? "0").replace(/[^\d]/g, "")) || 0;
const ALIASES: Record<string, string[]> = {
  id: ["order_id", "no. pesanan", "no pesanan", "order id", "nomor pesanan", "nomor invoice", "invoice"],
  product: ["product", "produk", "nama produk", "product name"],
  qty: ["qty", "jumlah", "quantity"],
  amount: ["amount", "total", "total pembayaran", "total harga", "harga"],
  fees: ["fees", "biaya", "biaya admin", "fee"],
  status: ["status", "status pesanan", "order status"],
  ref: ["ref_code", "kode", "voucher"],
  customer: ["customer", "pembeli", "nama pembeli", "buyer"],
};

/** Parses a marketplace export. Rows that can't be read are returned as errors, never guessed. */
export function parseOrdersCsv(csv: string): { rows: CsvRow[]; errors: string[] } {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ["File kosong atau tanpa baris pesanan"] };
  const head = splitLine(lines[0]).map((h) => h.toLowerCase());
  const col = (k: string) => head.findIndex((h) => ALIASES[k].includes(h));
  const [iId, iProduct, iAmount, iStatus] = [col("id"), col("product"), col("amount"), col("status")];
  const missing = ([["nomor pesanan", iId], ["produk", iProduct], ["total", iAmount], ["status", iStatus]] as const).filter(([, i]) => i < 0).map(([n]) => n);
  if (missing.length) return { rows: [], errors: [`Kolom tidak ditemukan: ${missing.join(", ")}`] };
  const [iQty, iFees, iRef, iCust] = [col("qty"), col("fees"), col("ref"), col("customer")];
  const rows: CsvRow[] = []; const errors: string[] = [];
  lines.slice(1).forEach((l, n) => {
    const c = splitLine(l);
    const status = STATUS[(c[iStatus] ?? "").toLowerCase()];
    if (!c[iId] || !status) { errors.push(`Baris ${n + 2}: status "${c[iStatus] ?? ""}" tidak dikenal`); return; }
    rows.push({
      externalId: c[iId], product: c[iProduct] ?? "", quantity: iQty >= 0 ? Number(c[iQty]) || 1 : 1,
      amountIdr: money(c[iAmount]), feesIdr: iFees >= 0 ? money(c[iFees]) : 0, status,
      refCode: iRef >= 0 && c[iRef] ? c[iRef] : null, customer: iCust >= 0 ? c[iCust] ?? "" : "",
    });
  });
  return { rows, errors };
}

export const profitOf = (o: { status: OrderStatus; amountIdr: number; costIdr: number; feesIdr: number }) =>
  o.status === "delivered" ? o.amountIdr - o.costIdr - o.feesIdr : 0;
