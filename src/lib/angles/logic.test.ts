import { describe, expect, it } from "vitest";
import { angleCapacity, compareCells, findDuplicate, similarity } from "./logic";

const c = (angleId: string, spend: number, sales: number, goal: "cold_sell" | "eyeball" = "cold_sell", reach = 0) => ({ angleId, goal, spend, reach, qualified: 0, sales });

describe("compareCells", () => {
  it("picks a best angle only with a clear lead", () => {
    const r = compareCells([c("a", 100000, 5), c("b", 100000, 2)]);
    expect(r.find((x) => x.angleId === "a")!.best).toBe(true);
    expect(compareCells([c("a", 100000, 5), c("b", 100000, 5)]).some((x) => x.best)).toBe(false);
  });
  it("needs enough results and at least two tested angles", () => {
    expect(compareCells([c("a", 100000, 5)]).some((x) => x.best)).toBe(false);
    expect(compareCells([c("a", 100000, 1), c("b", 100000, 1)]).some((x) => x.best)).toBe(false);
    expect(compareCells([c("a", 10000, 5), c("b", 10000, 2)]).some((x) => x.best)).toBe(false);
  });
  it("compares only inside the same goal", () => {
    const r = compareCells([c("a", 100000, 5), c("b", 100000, 0, "eyeball", 50000)]);
    expect(r.some((x) => x.best)).toBe(false);
  });
  it("judges eyeball by cost per 1,000 people, not sales", () => {
    const r = compareCells([c("a", 100000, 0, "eyeball", 10000), c("b", 100000, 0, "eyeball", 4000)]);
    expect(r.find((x) => x.angleId === "a")).toMatchObject({ best: true, cost: 10000 });
  });
});

describe("duplicates and capacity", () => {
  it("flags near-duplicates by shared words", () => {
    const old = [{ title: "Kulit tampak lebih cerah", promise: "Membantu kulit tampak lebih cerah" }];
    expect(findDuplicate({ title: "Kulit lebih cerah", promise: "Membantu kulit tampak cerah" }, old)).toBeTruthy();
    expect(findDuplicate({ title: "Rutinitas 1 menit", promise: "Satu langkah setiap malam" }, old)).toBeNull();
    expect(similarity("", "abc")).toBe(0);
  });
  it("limits angles to what the budget can test", () => {
    expect(angleCapacity(250000)).toBe(0);
    expect(angleCapacity(600000)).toBe(2);
    expect(angleCapacity(99000000)).toBe(4);
  });
});
