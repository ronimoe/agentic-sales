import { describe, expect, it } from "vitest";
import { parseOrdersCsv, profitOf } from "./csv";

describe("parseOrdersCsv", () => {
  it("reads Indonesian headers and rupiah amounts", () => {
    const r = parseOrdersCsv('No. Pesanan;Nama Produk;Jumlah;Total Pembayaran;Status Pesanan\nA1;Serum;2;"Rp 198.000";Selesai');
    expect(r.errors).toEqual([]);
    expect(r.rows[0]).toMatchObject({ externalId: "A1", quantity: 2, amountIdr: 198000, status: "delivered" });
  });
  it("reports unknown status instead of guessing", () => {
    expect(parseOrdersCsv("order_id,product,amount,status\nA1,Serum,1000,aneh").errors).toHaveLength(1);
  });
  it("reports missing columns", () => {
    expect(parseOrdersCsv("order_id,product\nA1,Serum").errors[0]).toContain("total");
  });
});

describe("profitOf", () => {
  it("counts profit only once delivered", () => {
    const o = { amountIdr: 100, costIdr: 40, feesIdr: 10 };
    expect(profitOf({ ...o, status: "delivered" })).toBe(50);
    expect(profitOf({ ...o, status: "shipped" })).toBe(0);
    expect(profitOf({ ...o, status: "returned" })).toBe(0);
  });
});
