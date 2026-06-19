import { describe, it, expect } from "vitest";
import { loadModels } from "./models.js";
import {
  estimateOutputTokens,
  estimateCost,
  formatUsd,
  formatEstimate,
} from "./estimate.js";
import type { TokenEstimate } from "./tokenizer.js";

const input: TokenEstimate = {
  low: 5800,
  high: 8200,
  estimate: 7000,
  isApproximate: true,
};

describe("estimateOutputTokens", () => {
  it("returns zeros when the input estimate is 0", () => {
    expect(
      estimateOutputTokens({
        low: 0,
        high: 0,
        estimate: 0,
        isApproximate: true,
      }),
    ).toEqual({ low: 0, high: 0, estimate: 0, isApproximate: true });
  });

  it("applies the ratio prior for est=7000", () => {
    expect(estimateOutputTokens(input)).toEqual({
      low: 700,
      high: 1750,
      estimate: 1225,
      isApproximate: true,
    });
  });

  it("keeps low <= estimate <= high across sizes", () => {
    for (const est of [1, 2, 3, 10, 100, 7000, 50000]) {
      const o = estimateOutputTokens({
        low: est,
        high: est,
        estimate: est,
        isApproximate: true,
      });
      expect(o.low).toBeLessThanOrEqual(o.estimate);
      expect(o.estimate).toBeLessThanOrEqual(o.high);
      expect(o.isApproximate).toBe(true);
    }
  });
});

describe("estimateCost across all three Claude models", () => {
  const models = loadModels();
  const output = estimateOutputTokens(input); // { low: 700, high: 1750, ... }

  for (const id of [
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
  ]) {
    it(`computes correct cost ranges for ${id}`, () => {
      const model = models.find((m) => m.id === id);
      expect(model).toBeDefined();
      const c = estimateCost(input, output, model!);
      const inR = model!.input_per_mtok / 1_000_000;
      const outR = model!.output_per_mtok / 1_000_000;

      expect(c.inputCost.low).toBeCloseTo(5800 * inR, 10);
      expect(c.inputCost.high).toBeCloseTo(8200 * inR, 10);
      expect(c.outputCost.low).toBeCloseTo(700 * outR, 10);
      expect(c.outputCost.high).toBeCloseTo(1750 * outR, 10);
      expect(c.totalCost.low).toBeCloseTo(5800 * inR + 700 * outR, 10);
      expect(c.totalCost.high).toBeCloseTo(8200 * inR + 1750 * outR, 10);

      expect(c.totalCost.low).toBeLessThanOrEqual(c.totalCost.high);
      expect(c.currency).toBe("USD");
      expect(c.isApproximate).toBe(true);
    });
  }
});

describe("formatUsd", () => {
  it("formats representative cost values", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.11)).toBe("$0.11");
    expect(formatUsd(0.0058)).toBe("$0.0058");
    expect(formatUsd(2.5)).toBe("$2.50");
    expect(formatUsd(0.03)).toBe("$0.03");
  });

  it("guards non-finite / negative input to $0.00", () => {
    expect(formatUsd(-1)).toBe("$0.00");
    expect(formatUsd(NaN)).toBe("$0.00");
    expect(formatUsd(Infinity)).toBe("$0.00");
  });
});

describe("formatEstimate", () => {
  it("includes the model id, token/cost lines, and an approximate label", () => {
    const models = loadModels();
    const model = models.find((m) => m.id === "claude-sonnet-4-6");
    const s = formatEstimate(
      estimateCost(input, estimateOutputTokens(input), model!),
    );
    expect(s).toContain("claude-sonnet-4-6");
    expect(s).toContain("Input tokens:");
    expect(s).toContain("Output tokens:");
    expect(s).toContain("Cost (USD):");
    expect(s).toContain("approximate");
  });
});
