import type { Model } from "./models.js";
import type { TokenEstimate } from "./tokenizer.js";
import type { TaskType } from "./detect.js";
import { estimateCost, formatUsd } from "./estimate.js";

export type Effort = "low" | "medium" | "high";

export interface Recommendation {
  model: Model;
  effort: Effort;
  basis: string;
  fits: boolean;
}

// Capability tiers (qualitative, documented in docs/recommendation-methodology.md —
// NOT an accuracy %). Unknown ids default to the mid tier (Sonnet-equivalent).
const CAPABILITY: Record<string, number> = {
  "claude-haiku-4-5": 1,
  "claude-sonnet-4-6": 2,
  "claude-opus-4-8": 3,
};

function capability(model: Model): number {
  return CAPABILITY[model.id] ?? 2;
}

const EFFORT: Record<TaskType, Effort> = {
  explain: "low",
  refactor: "low",
  generate: "medium",
  general: "medium",
  debug: "high",
};

/** Suggested reasoning effort for a task type (advisory). */
export function effortFor(taskType: TaskType): Effort {
  return EFFORT[taskType] ?? "medium";
}

const DEMAND: Record<TaskType, number> = {
  explain: 1,
  refactor: 1,
  generate: 1,
  general: 2,
  debug: 2,
};

const LARGE_CONTEXT = 200_000;

/** Task demand 1..3: base by task type, +1 for a large (>200K-token) context. */
export function demandFor(taskType: TaskType, contextHigh: number): number {
  const base = DEMAND[taskType] ?? 2;
  const bumped = contextHigh > LARGE_CONTEXT ? base + 1 : base;
  return Math.min(3, Math.max(1, bumped));
}

/** Qualitative fit: capability meets task demand AND the context fits the window. */
export function modelFit(
  taskType: TaskType,
  contextHigh: number,
  model: Model,
): { fits: boolean; note: string } {
  const demand = demandFor(taskType, contextHigh);
  const capable = capability(model) >= demand;
  const windowOk = model.context_window >= contextHigh;
  const fits = capable && windowOk;
  let note: string;
  if (!windowOk) note = "context exceeds this model's window";
  else if (!capable) note = `under-powered for ${taskType} tasks`;
  else note = `suitable for ${taskType} tasks`;
  return { fits, note };
}

/**
 * Recommend the cheapest Claude model that *fits* the task (suggestion only — the
 * caller never auto-switches the hand-off). `contextHigh = input.high` (the single
 * scalar for both demand/fit and the displayed per-model fit, so they agree and the
 * result is reproducible). Selection is a deterministic single-pass min over total
 * cost with an explicit tie-break — pure, no `Array.sort` float-stability surprises.
 */
export function recommendModel(
  taskType: TaskType,
  input: TokenEstimate,
  output: TokenEstimate,
  models: Model[],
): Recommendation {
  if (models.length === 0) {
    throw new Error("recommendModel: no models");
  }
  const contextHigh = input.high;
  const effort = effortFor(taskType);

  const fitting = models.filter((m) => modelFit(taskType, contextHigh, m).fits);

  if (fitting.length === 0) {
    // Nothing fits (context exceeds every window). Fall back to the widest window.
    const best = models.reduce((a, b) => {
      if (b.context_window !== a.context_window) {
        return b.context_window > a.context_window ? b : a;
      }
      if (capability(b) !== capability(a)) {
        return capability(b) > capability(a) ? b : a;
      }
      return a.id.localeCompare(b.id) <= 0 ? a : b;
    });
    return {
      model: best,
      effort,
      basis: `No model's context window fits this ~${contextHigh}-token context; showing the widest-window option (estimate only — exceeds context window).`,
      fits: false,
    };
  }

  const costHigh = (m: Model): number =>
    estimateCost(input, output, m).totalCost.high;

  const best = fitting.reduce((a, b) => {
    const ca = costHigh(a);
    const cb = costHigh(b);
    if (cb < ca) return b;
    if (cb > ca) return a;
    if (b.input_per_mtok !== a.input_per_mtok) {
      return b.input_per_mtok < a.input_per_mtok ? b : a;
    }
    return a.id.localeCompare(b.id) <= 0 ? a : b;
  });

  return {
    model: best,
    effort,
    basis: `Cheapest Claude model fitting ${taskType} tasks at a ~${contextHigh}-token context.`,
    fits: true,
  };
}

/**
 * Render the per-Claude-model comparison (cost range + qualitative fit) plus the
 * `Recommended:` line. Display-only; the caller never auto-switches the hand-off.
 */
export function formatRecommendation(
  taskType: TaskType,
  input: TokenEstimate,
  output: TokenEstimate,
  models: Model[],
): string {
  const contextHigh = input.high;
  const lines = ["Model comparison (Claude family):"];
  for (const m of models) {
    const c = estimateCost(input, output, m).totalCost;
    const fit = modelFit(taskType, contextHigh, m);
    lines.push(
      `  ${m.display_name.padEnd(18)} ~${formatUsd(c.low)} – ${formatUsd(c.high)}  fit: ${fit.note}${fit.fits ? "" : " (does not fit)"}`,
    );
  }
  const rec = recommendModel(taskType, input, output, models);
  lines.push(
    `Recommended: ${rec.model.display_name} + ${rec.effort} effort — ${rec.basis}`,
  );
  lines.push(
    `  (suggestion; run as-is or switch with --model ${rec.model.id})`,
  );
  return lines.join("\n");
}
