import { describe, it, expect } from "vitest";
import { estimateTokens } from "./tokenizer.js";

describe("estimateTokens", () => {
  it("returns all zeros for an empty string", () => {
    expect(estimateTokens("")).toEqual({
      low: 0,
      high: 0,
      estimate: 0,
      isApproximate: true,
    });
  });

  it("matches the 400-char known example (stable range)", () => {
    expect(estimateTokens("x".repeat(400))).toEqual({
      low: 88,
      high: 115,
      estimate: 100,
      isApproximate: true,
    });
  });

  it("counts an emoji as one code point", () => {
    expect(estimateTokens("😀")).toEqual({
      low: 0,
      high: 1,
      estimate: 0,
      isApproximate: true,
    });
  });

  it('estimates "hello world" (cp=11) as ~2–4', () => {
    expect(estimateTokens("hello world")).toEqual({
      low: 2,
      high: 4,
      estimate: 3,
      isApproximate: true,
    });
  });

  it("keeps low <= estimate <= high (non-negative integers) for cp 0..50", () => {
    for (let cp = 0; cp <= 50; cp++) {
      const r = estimateTokens("a".repeat(cp));
      expect(Number.isInteger(r.low)).toBe(true);
      expect(Number.isInteger(r.high)).toBe(true);
      expect(Number.isInteger(r.estimate)).toBe(true);
      expect(r.low).toBeGreaterThanOrEqual(0);
      expect(r.low).toBeLessThanOrEqual(r.estimate);
      expect(r.estimate).toBeLessThanOrEqual(r.high);
      expect(r.isApproximate).toBe(true);
    }
  });

  it("is deterministic for the same input", () => {
    expect(estimateTokens("hello")).toEqual(estimateTokens("hello"));
  });
});
