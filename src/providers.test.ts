import { describe, it, expect } from "vitest";
import type { TokenEstimate } from "./tokenizer.js";
import {
  loadProviders,
  parseProviders,
  crossProviderComparison,
  type Provider,
} from "./providers.js";

const tok = (low: number, high: number): TokenEstimate => ({
  low,
  high,
  estimate: Math.round((low + high) / 2),
  isApproximate: true,
});

describe("loadProviders", () => {
  it("loads the seeded providers, each carrying a disclaimer note", () => {
    const ps = loadProviders();
    expect(ps.length).toBeGreaterThanOrEqual(1);
    for (const p of ps) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.note).toMatch(/cannot run inside Claude Code/i);
      expect(p.input_per_mtok).toBeGreaterThanOrEqual(0);
      expect(p.output_per_mtok).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("parseProviders (validation)", () => {
  const ok = { name: "X", input_per_mtok: 1, output_per_mtok: 2, note: "n" };

  it("accepts a valid array", () => {
    expect(parseProviders([ok])).toEqual([ok]);
  });

  it("throws descriptively on malformed entries", () => {
    expect(() => parseProviders({})).toThrow(/array/);
    expect(() => parseProviders([{ ...ok, name: "" }])).toThrow(/name/);
    expect(() => parseProviders([{ ...ok, note: "" }])).toThrow(/note/);
    expect(() => parseProviders([{ ...ok, input_per_mtok: -1 }])).toThrow(
      /input_per_mtok/,
    );
    expect(() => parseProviders([{ ...ok, output_per_mtok: NaN }])).toThrow(
      /output_per_mtok/,
    );
  });
});

describe("crossProviderComparison", () => {
  it("computes total cost per provider and passes the note through", () => {
    const providers: Provider[] = [
      { name: "X", input_per_mtok: 2, output_per_mtok: 10, note: "info-only" },
    ];
    const rows = crossProviderComparison(
      tok(1000, 2000),
      tok(100, 300),
      providers,
    );
    expect(rows).toEqual([
      {
        name: "X",
        totalCost: {
          low: 1000 * 2e-6 + 100 * 10e-6,
          high: 2000 * 2e-6 + 300 * 10e-6,
        },
        note: "info-only",
      },
    ]);
    expect(rows[0].totalCost.low).toBeLessThanOrEqual(rows[0].totalCost.high);
  });

  it("returns one row per provider, in order", () => {
    const providers: Provider[] = [
      { name: "A", input_per_mtok: 1, output_per_mtok: 1, note: "n" },
      { name: "B", input_per_mtok: 1, output_per_mtok: 1, note: "n" },
    ];
    expect(
      crossProviderComparison(tok(0, 0), tok(0, 0), providers).map(
        (r) => r.name,
      ),
    ).toEqual(["A", "B"]);
  });
});
