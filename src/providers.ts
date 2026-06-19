import { readFileSync } from "node:fs";
import { formatUsd, type CostRange } from "./estimate.js";
import type { TokenEstimate } from "./tokenizer.js";

/**
 * A non-Claude reference model for the **informational-only** cross-provider
 * comparison. Pricing is a labeled estimate. PromptMeter never switches to these —
 * they cannot run inside Claude Code (`note` carries that disclaimer).
 */
export interface Provider {
  name: string;
  input_per_mtok: number; // USD per 1M input tokens (estimate)
  output_per_mtok: number; // USD per 1M output tokens (estimate)
  note: string; // disclaimer — informational only / cannot run in Claude Code
}

const DATA_URL = new URL("../data/providers.json", import.meta.url);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Load + validate the cross-provider reference models from `data/providers.json`.
 * Throws a descriptive Error on a missing/invalid file or any malformed entry.
 * Informational only — never fed to the Claude recommendation.
 */
/** Validate parsed JSON into typed Providers (throws descriptively). Injectable seam. */
export function parseProviders(parsed: unknown): Provider[] {
  if (!Array.isArray(parsed)) {
    throw new Error("providers data must be a JSON array");
  }
  return parsed.map((entry, i) => {
    const e = entry as Record<string, unknown>;
    if (!isNonEmptyString(e.name)) {
      throw new Error(`providers[${i}]: "name" must be a non-empty string`);
    }
    if (!isNonEmptyString(e.note)) {
      throw new Error(
        `providers[${i}] (${e.name}): "note" must be a non-empty string`,
      );
    }
    if (!isNonNegativeNumber(e.input_per_mtok)) {
      throw new Error(
        `providers[${i}] (${e.name}): "input_per_mtok" must be a non-negative number`,
      );
    }
    if (!isNonNegativeNumber(e.output_per_mtok)) {
      throw new Error(
        `providers[${i}] (${e.name}): "output_per_mtok" must be a non-negative number`,
      );
    }
    return {
      name: e.name,
      input_per_mtok: e.input_per_mtok,
      output_per_mtok: e.output_per_mtok,
      note: e.note,
    };
  });
}

export function loadProviders(): Provider[] {
  let text: string;
  try {
    text = readFileSync(DATA_URL, "utf8");
  } catch (err) {
    throw new Error(
      `could not read data/providers.json: ${(err as Error).message}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `data/providers.json is not valid JSON: ${(err as Error).message}`,
    );
  }
  return parseProviders(parsed);
}

export interface ProviderCost {
  name: string;
  totalCost: CostRange;
  note: string;
}

/**
 * Informational cross-provider cost comparison (same token estimate × each
 * provider's estimated pricing). The disclaimer `note` travels with each row.
 * Pure; never used by the Claude recommendation.
 */
export function crossProviderComparison(
  input: TokenEstimate,
  output: TokenEstimate,
  providers: Provider[] = loadProviders(),
): ProviderCost[] {
  return providers.map((p) => {
    const inRate = p.input_per_mtok / 1_000_000;
    const outRate = p.output_per_mtok / 1_000_000;
    return {
      name: p.name,
      totalCost: {
        low: input.low * inRate + output.low * outRate,
        high: input.high * inRate + output.high * outRate,
      },
      note: p.note,
    };
  });
}

/**
 * Render the informational-only cross-provider block. These figures are estimates
 * and **cannot run inside Claude Code** — never a switch action.
 */
export function formatCrossProvider(rows: ProviderCost[]): string {
  const lines = [
    "Cross-provider (informational only — cannot run inside Claude Code; estimates):",
  ];
  for (const r of rows) {
    lines.push(
      `  ${r.name.padEnd(22)} ~${formatUsd(r.totalCost.low)} – ${formatUsd(r.totalCost.high)}`,
    );
  }
  return lines.join("\n");
}
