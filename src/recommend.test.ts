import { describe, it, expect } from "vitest";
import { loadModels } from "./models.js";
import type { TokenEstimate } from "./tokenizer.js";
import { effortFor, demandFor, modelFit, recommendModel } from "./recommend.js";

const models = loadModels();
const byId = (id: string) => {
  const m = models.find((x) => x.id === id);
  if (!m) throw new Error(`missing seed model ${id}`);
  return m;
};
const haiku = byId("claude-haiku-4-5");
const sonnet = byId("claude-sonnet-4-6");

const tok = (high: number): TokenEstimate => ({
  low: Math.floor(high * 0.8),
  high,
  estimate: Math.floor(high * 0.9),
  isApproximate: true,
});
const out = tok(100);
const small = tok(5000);

describe("effortFor", () => {
  it("maps each task type", () => {
    expect(effortFor("explain")).toBe("low");
    expect(effortFor("refactor")).toBe("low");
    expect(effortFor("generate")).toBe("medium");
    expect(effortFor("general")).toBe("medium");
    expect(effortFor("debug")).toBe("high");
  });
});

describe("demandFor", () => {
  it("base demand + large-context bump, clamped, with a >200K boundary", () => {
    expect(demandFor("refactor", 1000)).toBe(1);
    expect(demandFor("debug", 1000)).toBe(2);
    expect(demandFor("debug", 250000)).toBe(3);
    expect(demandFor("explain", 250000)).toBe(2);
    expect(demandFor("debug", 200000)).toBe(2); // not > 200000 → no escalation
    expect(demandFor("debug", 200001)).toBe(3); // escalates
  });
});

describe("modelFit", () => {
  it("requires capability >= demand AND window >= contextHigh", () => {
    expect(modelFit("debug", 1000, haiku).fits).toBe(false); // cap 1 < demand 2
    expect(modelFit("refactor", 1000, haiku).fits).toBe(true);
    expect(modelFit("refactor", 500000, haiku).fits).toBe(false); // window 200K < 500K
    expect(modelFit("refactor", 200000, haiku).fits).toBe(true); // window boundary (>=)
    expect(modelFit("debug", 1000, sonnet).fits).toBe(true);
  });
});

describe("recommendModel", () => {
  it("explain → Haiku (cheapest fitting), low effort, basis without %", () => {
    const r = recommendModel("explain", small, out, models);
    expect(r.model.id).toBe("claude-haiku-4-5");
    expect(r.effort).toBe("low");
    expect(r.fits).toBe(true);
    expect(r.basis).toMatch(/explain/);
    expect(r.basis).not.toMatch(/%/);
  });

  it("refactor → Haiku", () => {
    expect(recommendModel("refactor", small, out, models).model.id).toBe(
      "claude-haiku-4-5",
    );
  });

  it("debug (small context) → Sonnet (Haiku doesn't fit), high effort", () => {
    const r = recommendModel("debug", small, out, models);
    expect(r.model.id).toBe("claude-sonnet-4-6");
    expect(r.effort).toBe("high");
  });

  it("general → Sonnet", () => {
    expect(recommendModel("general", small, out, models).model.id).toBe(
      "claude-sonnet-4-6",
    );
  });

  it("debug with a large (>200K) context → Opus (the Opus lane)", () => {
    const big = tok(250000);
    expect(recommendModel("debug", big, out, models).model.id).toBe(
      "claude-opus-4-8",
    );
  });

  it("is reproducible (identical args → identical result)", () => {
    const a = recommendModel("debug", small, out, models);
    const b = recommendModel("debug", small, out, models);
    expect({ id: a.model.id, effort: a.effort, basis: a.basis }).toEqual({
      id: b.model.id,
      effort: b.effort,
      basis: b.basis,
    });
  });

  it("uses input.high for demand/fit (estimate differences don't change it)", () => {
    const i1: TokenEstimate = {
      low: 100,
      high: 5000,
      estimate: 1000,
      isApproximate: true,
    };
    const i2: TokenEstimate = {
      low: 100,
      high: 5000,
      estimate: 4900,
      isApproximate: true,
    };
    expect(recommendModel("debug", i1, out, models).model.id).toBe(
      recommendModel("debug", i2, out, models).model.id,
    );
  });

  it("throws on an empty models list", () => {
    expect(() => recommendModel("explain", small, out, [])).toThrow(
      /no models/,
    );
  });

  it("context exceeding all windows → widest-window model, fits:false", () => {
    const huge = tok(2_000_000);
    const r = recommendModel("debug", huge, out, models);
    expect(r.fits).toBe(false);
    expect(r.basis).toMatch(/exceeds context window/);
    expect(r.model.id).toBe("claude-opus-4-8"); // 1M window, tie-break → highest capability
  });
});
