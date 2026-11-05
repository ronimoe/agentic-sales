const BANNED = [
  { re: /\b100\s?%/i, why: "Klaim mutlak \"100%\"" },
  { re: /\b(pasti|dijamin|garansi sembuh)\b/i, why: "Janji hasil yang pasti" },
  { re: /\b(sembuh|menyembuhkan|mengobati|obat)\b/i, why: "Klaim pengobatan" },
  { re: /\bpermanen\b/i, why: "Klaim hasil permanen" },
  { re: /\b(terbaik|nomor satu|no\.?\s?1)\b/i, why: "Klaim superlatif tanpa bukti" },
  { re: /\b(tanpa efek samping|aman untuk semua)\b/i, why: "Klaim keamanan mutlak" },
];

export type ComplianceProduct = { category: string; bpomNumber: string | null; approvedClaims: string[] };

/** Runs apart from the writer, so copy never grades itself. */
export function checkCompliance(texts: string[], p: ComplianceProduct) {
  const joined = texts.join("\n");
  const issues = BANNED.filter((b) => b.re.test(joined)).map((b) => b.why);
  if (p.category !== "general") {
    if (!p.bpomNumber) issues.push("Nomor BPOM belum diisi");
    if (!p.approvedClaims.length) issues.push("Klaim yang disetujui BPOM belum diisi");
  }
  return { passed: issues.length === 0, issues };
}
