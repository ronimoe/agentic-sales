import { describe, expect, it } from "vitest";
import { resolveSession } from "./session";

const ws = [{ id: "a" }, { id: "b" }];
const of = (w: { id: string }) => [{ id: `${w.id}-owner` }, { id: `${w.id}-sales` }];

describe("resolveSession", () => {
  it("lets cookies switch only on the local sample database", () => {
    expect(resolveSession(ws, of, { ws: "b", member: "b-sales" }, false)).toMatchObject({ workspace: { id: "b" }, member: { id: "b-sales" } });
  });
  it("ignores cookies and hides other businesses on a real database", () => {
    const s = resolveSession(ws, of, { ws: "b", member: "b-sales" }, true);
    expect(s).toMatchObject({ workspace: { id: "a" }, member: { id: "a-owner" } });
    expect(s.visibleWorkspaces).toEqual([{ id: "a" }]);
  });
});
