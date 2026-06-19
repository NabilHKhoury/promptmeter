import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  tokenRangeFromChars,
  combineTokenEstimates,
} from "./tokenizer.js";

describe("tokenRangeFromChars", () => {
  it("returns zeros for n <= 0", () => {
    expect(tokenRangeFromChars(0)).toEqual({
      low: 0,
      high: 0,
      estimate: 0,
      isApproximate: true,
    });
    expect(tokenRangeFromChars(-5)).toEqual({
      low: 0,
      high: 0,
      estimate: 0,
      isApproximate: true,
    });
  });

  it("matches the M1.3 400-char example and keeps the invariant", () => {
    expect(tokenRangeFromChars(400)).toEqual({
      low: 88,
      high: 115,
      estimate: 100,
      isApproximate: true,
    });
    for (let n = 1; n <= 300; n++) {
      const r = tokenRangeFromChars(n);
      expect(r.low).toBeLessThanOrEqual(r.estimate);
      expect(r.estimate).toBeLessThanOrEqual(r.high);
      expect(Number.isInteger(r.low)).toBe(true);
    }
  });
});

describe("combineTokenEstimates", () => {
  it("sums bound-wise and keeps low <= estimate <= high", () => {
    const a = tokenRangeFromChars(1000);
    const b = tokenRangeFromChars(2000);
    const c = combineTokenEstimates(a, b);
    expect(c.low).toBe(a.low + b.low);
    expect(c.high).toBe(a.high + b.high);
    expect(c.estimate).toBe(a.estimate + b.estimate);
    expect(c.low).toBeLessThanOrEqual(c.estimate);
    expect(c.estimate).toBeLessThanOrEqual(c.high);
    expect(c.isApproximate).toBe(true);
  });
});

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
