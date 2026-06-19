# PromptMeter — Recommendation Methodology

PromptMeter recommends the **cheapest Claude model that fits** a task, plus a suggested
effort level. The recommendation is a **labeled suggestion shown in `run`'s report** — it
does **not** change the model handed to `claude` (use `--model` to apply it). Fit is
**qualitative with a documented basis — there are no invented accuracy percentages.**

## Inputs
- **Task type** — from the prompt (`detectTaskType`): `refactor` · `debug` · `explain` · `generate` · `general`.
- **In-scope context size** — the high bound of the input-token estimate (prompt + `.gitignore`-aware codebase scan; `input.high`).
- **Model pricing + context windows** — `data/models.json` (labeled estimates).

## Capability tiers (qualitative)
Derived from each model's documented positioning (`fit_notes`), not a benchmark score:

| Model | Tier | Basis (`fit_notes`) |
|-------|------|---------------------|
| Claude Haiku 4.5 | 1 | Fast/cheapest; well-specified tasks, boilerplate/refactor |
| Claude Sonnet 4.6 | 2 | Balanced default for most coding tasks |
| Claude Opus 4.8 | 3 | Deepest reasoning; complex/ambiguous multi-file work |

Unknown model ids default to tier 2 (Sonnet-equivalent) — a safe conservative default.

## Task demand (1–3)
| Task type | Base demand |
|-----------|-------------|
| explain | 1 |
| refactor | 1 |
| generate | 1 |
| general | 2 |
| debug | 2 |

**+1** if the in-scope context is **large** (`> 200,000` tokens — ambiguous multi-file work), clamped to `[1, 3]`.

## Fit + recommendation
- A model **fits** iff `capability ≥ demand` **and** `context_window ≥ contextHigh`.
- Among fitting models, recommend the **lowest total cost** (the run's input/output estimate × the model's pricing). Deterministic tie-break: lower `input_per_mtok`, then `id` ascending → **reproducible** (identical inputs always give the identical recommendation).
- If no model's window fits the context, the widest-window model is shown, clearly flagged "estimate only — exceeds context window".
- Because Sonnet fits all task types up to 1M tokens and costs less than Opus, **Opus is recommended only when demand escalates to 3** (a `debug`/`general` task on a `>200K`-token context). This is intended — Opus's documented strength is large/ambiguous multi-file work.

## Effort (advisory)
| Task type | Suggested effort |
|-----------|------------------|
| explain | low |
| refactor | low |
| generate | medium |
| general | medium |
| debug | high |

## Cross-provider comparison
The "Cross-provider" block is **informational only** — those models **cannot run inside Claude Code**, are never recommended, and never trigger a switch. Their pricing (`data/providers.json`) is a labeled estimate (dated; verify with the provider).

## Reproducibility
The recommendation is a pure function of `(taskType, input, output, models)` with a deterministic tie-break — the same inputs always yield the same recommendation and reasoning string. All pricing (Claude and cross-provider) is an estimate; verify against the providers.
