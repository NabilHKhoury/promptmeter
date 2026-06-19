import type { Model } from "./models.js";
import type { TokenEstimate } from "./tokenizer.js";

export interface CostRange {
  low: number;
  high: number;
}

export interface CostEstimate {
  model: Model;
  inputTokens: TokenEstimate;
  outputTokens: TokenEstimate;
  inputCost: CostRange;
  outputCost: CostRange;
  totalCost: CostRange;
  currency: "USD";
  isApproximate: boolean;
}

/**
 * Output length is unknowable pre-run. This is a labeled prior: output tends to be
 * a fraction of the input (the README mockup implies ~0.13–0.23). The 0.10/0.175/0.25
 * ratios are a documented prior, not an exact figure. No minimum floor — tiny prompts
 * yield a near-zero output range, which is fine. Monotonic rounding keeps low ≤ high.
 */
export function estimateOutputTokens(input: TokenEstimate): TokenEstimate {
  const est = input.estimate;
  if (est === 0) {
    return { low: 0, high: 0, estimate: 0, isApproximate: true };
  }
  return {
    low: Math.round(est * 0.1),
    high: Math.round(est * 0.25),
    estimate: Math.round(est * 0.175),
    isApproximate: true,
  };
}

/** Cost (USD) range from token ranges × the model's per-MTok pricing. Pure. */
export function estimateCost(
  input: TokenEstimate,
  output: TokenEstimate,
  model: Model,
): CostEstimate {
  const inRate = model.input_per_mtok / 1_000_000;
  const outRate = model.output_per_mtok / 1_000_000;
  const inputCost: CostRange = {
    low: input.low * inRate,
    high: input.high * inRate,
  };
  const outputCost: CostRange = {
    low: output.low * outRate,
    high: output.high * outRate,
  };
  const totalCost: CostRange = {
    low: inputCost.low + outputCost.low,
    high: inputCost.high + outputCost.high,
  };
  return {
    model,
    inputTokens: input,
    outputTokens: output,
    inputCost,
    outputCost,
    totalCost,
    currency: "USD",
    isApproximate: true,
  };
}

/**
 * Format a USD amount: "$"-prefixed, ≥2 decimals, trailing zeros trimmed beyond that
 * (`$0.11`, `$0.0058`, `$2.50`, `$0.00`). Only ever called with finite, non-negative
 * costs; defensively coerce non-finite/negative input to 0 (no `$NaN`/`$-1` junk).
 */
export function formatUsd(n: number): string {
  const safe = Number.isFinite(n) && n >= 0 ? n : 0;
  let s = safe.toFixed(4); // always has a decimal point
  s = s.replace(/0+$/, ""); // strip trailing zeros
  const [intPart, frac = ""] = s.split(".");
  s = `${intPart}.${frac.padEnd(2, "0")}`; // ensure ≥2 decimals
  return `$${s}`;
}

const DASH = "–"; // en-dash

/** Render the labeled plain-text pre-run report (no TUI). */
export function formatEstimate(c: CostEstimate): string {
  return [
    "PromptMeter — pre-run estimate (approximate)",
    `  Model:         ${c.model.display_name} (${c.model.id})`,
    `  Input tokens:  ~${c.inputTokens.low} ${DASH} ${c.inputTokens.high}`,
    `  Output tokens: ~${c.outputTokens.low} ${DASH} ${c.outputTokens.high}  (rough prior)`,
    `  Cost (${c.currency}):    ~${formatUsd(c.totalCost.low)} ${DASH} ${formatUsd(c.totalCost.high)}`,
    "  Estimates only — actual usage is decided by Claude Code at runtime.",
  ].join("\n");
}
