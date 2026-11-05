import { describe, expect, it } from "vitest";
import { codAllowed, JAVA, normalizeProvince, parseAddressLine, validateShipping } from "./shipping";

describe("shipping", () => {
  it("recognizes provinces and common short names", () => {
    expect(normalizeProvince("jatim")).toBe("Jawa Timur");
    expect(normalizeProvince("Provinsi Bali")).toBe("Bali");
    expect(normalizeProvince("Atlantis")).toBeNull();
  });
  it("says exactly what's missing", () => {
    const r = validateShipping({ recipient: "Dewi", address: "Jl", city: "", province: "x" });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.reason).toBe("Tanyakan dulu: alamat lengkap, kota, provinsi");
  });
  it("accepts a complete address", () => {
    expect(validateShipping({ recipient: "Dewi", address: "Jl. Mawar No. 5, RT 1", city: "Bandung", province: "jabar" })).toMatchObject({ ok: true, value: { province: "Jawa Barat" } });
  });
  it("allows COD only in configured areas", () => {
    expect(codAllowed(JAVA, "Jawa Barat")).toBe(true);
    expect(codAllowed(JAVA, "Papua")).toBe(false);
    expect(codAllowed(undefined, "Jawa Barat")).toBe(false);
    expect(codAllowed([], "Jawa Barat")).toBe(false);
  });
  it("parses a simple address line", () => {
    expect(parseAddressLine("Dewi, Jl. Mawar 5, RT 1, Bandung, Jawa Barat")).toEqual({ recipient: "Dewi", address: "Jl. Mawar 5, RT 1", city: "Bandung", province: "Jawa Barat" });
    expect(parseAddressLine("oke kak")).toEqual({});
  });
});
