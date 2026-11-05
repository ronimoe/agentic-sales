import { afterEach, describe, expect, it, vi } from "vitest";
import { fallbackParams, model } from "./client";

afterEach(() => vi.unstubAllEnvs());

describe("model", () => {
  it("reads the model from the environment", () => {
    vi.stubEnv("ANTHROPIC_MODEL", "claude-sonnet-5-5");
    expect(model()).toBe("claude-sonnet-5-5");
  });
  it("explains what to do when it's missing", () => {
    vi.stubEnv("ANTHROPIC_MODEL", "");
    expect(() => model()).toThrow(/ANTHROPIC_MODEL/);
  });
  it("only asks for fallbacks on models that accept them", () => {
    expect(fallbackParams("claude-opus-5-5")).toHaveProperty("fallbacks", "default");
    expect(fallbackParams("claude-haiku-5-5")).toEqual({});
  });
});
