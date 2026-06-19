# PromptMeter — Development Roadmap

PromptMeter is a **terminal-native LLM cost & model-intelligence layer for Claude Code**: it analyzes the prompt and codebase before execution and recommends the optimal Claude model + effort, showing a cost estimate up front.

This roadmap supersedes the earlier web-app plan (dropped). Phase 1 is broken into concrete milestones; later phases are higher-level and will be detailed as we approach them.

Status legend: ☐ not started · ◐ in progress · ☑ done

---

## Guiding constraints (the credibility guardrails)

These are non-negotiable because they're what keep the tool trustworthy and what stop it making impossible claims:

- **Claude-family switching only.** Claude Code runs Anthropic models. "Switch model" means Opus 4.8 / Sonnet 4.6 / Haiku 4.5 (+ effort) via `--model`. Cross-provider (Gemini/GPT) figures are **informational only**, clearly labeled, never a switch action.
- **Estimates are ranges, always labeled.** Pre-run token/cost numbers are calibrated priors with a confidence band — Claude Code decides actual reads/reasoning at runtime. Never present a single false-precision number.
- **Model "fit" is qualitative with a documented basis.** Bands (good fit / slight risk / not recommended) tied to task type. **No invented accuracy percentages.**
- **Never break `claude`.** Interception must always leave the real `claude` reachable, be cleanly removable, and offer a bypass.
- **Pricing lives in `data/models.json`** and is kept current; treat all outputs as estimates.

---

## Phase 1 — Core CLI + estimation

Goal: a runnable `promptmeter` CLI that captures a prompt, estimates a cost range from static Claude pricing, and hands off to `claude`. No codebase scan or TUI yet.

### Milestone 1.1 — CLI scaffold ☑
- ☑ Node.js + TypeScript project; `promptmeter` bin entry; build (tsc/tsup) + run
- ☑ Arg parsing (e.g. `promptmeter run "<task>" [--model …]`)
- ☑ Lint + format (ESLint + Prettier), npm scripts
- ☑ Directory structure (`src/`, `data/`, `bin/`)
- **Acceptance:** `promptmeter --help` works; `npm run build` passes; binary is invokable. — **met (18/18 acceptance checks; PR on `feature/milestone-1-1-scaffold`)**

### Milestone 1.2 — Model config layer
- ☐ `data/models.json` schema (id, display_name, input/output per-MTok, context_window, qualitative fit notes)
- ☐ Seed Claude models: Opus 4.8 ($5/$25, 1M), Sonnet 4.6 ($3/$15, 1M), Haiku 4.5 ($1/$5, 200K)
- ☐ Typed loader + validation (`src/models.ts`)
- **Acceptance:** models load as typed objects; adding an entry needs no code change.

### Milestone 1.3 — Token estimation
- ☐ `src/tokenizer.ts` — estimate prompt tokens (official tokenizer where available; heuristic fallback)
- ☐ Output an estimate **range** + `isApproximate` flag
- **Acceptance:** a known prompt yields a stable range; approximations are flagged.

### Milestone 1.4 — Cost estimation + plain output
- ☐ `src/estimate.ts` — input/output/total cost as a **range** from model pricing (pure, unit-tested)
- ☐ Plain-text pre-run report (no TUI): model, token range, cost range, all labeled as estimates
- **Acceptance:** unit tests cover representative prompts across all three Claude models.

### Milestone 1.5 — Hand-off to `claude`
- ☐ `promptmeter run "<task>"` execs the real `claude` with the chosen `--model`
- ☐ Pass-through of exit code, stdio; `--dry-run` to analyze without executing
- **Acceptance:** `promptmeter run` behaves like `claude` after the analysis step.

---

## Phase 1.5 — Interception (shadow `claude`)
- ☐ `promptmeter install` — add a cleanly-removable shell shim/alias so `claude "…"` routes through PromptMeter, then execs the real binary
- ☐ `promptmeter uninstall` — full removal; real `claude` always reachable
- ☐ Bypass flag / env var (e.g. `PROMPTMETER_OFF=1`) so a user can always skip the overlay
- ☐ Resolve and cache the real `claude` path; detect if Claude Code isn't installed
- **Acceptance:** after install, `claude "…"` shows the analysis then runs; after uninstall, `claude` is byte-for-byte the original behavior.

---

## Phase 2 — Codebase context engine
- ☐ Repo scan: glob + `.gitignore`-aware file discovery
- ☐ Detect language / framework / project type (heuristics first; AST/embeddings later)
- ☐ Detect task type from the prompt (refactor / debug / generate / explain)
- ☐ Estimate in-scope token load from likely-relevant files (feeds the input-token range)
- **Acceptance:** on a sample Node repo, scan reports framework + a defensible in-scope token range.

---

## Phase 3 — Model recommendation engine
- ☐ Compute cost range + qualitative fit per Claude model + effort level
- ☐ Recommend the cheapest Claude option that fits the detected task
- ☐ Cross-provider comparison block — **informational only**, labeled "cannot run inside Claude Code"
- ☐ Document the fit methodology (sources, task-type mapping) — no invented numbers
- **Acceptance:** recommendation is reproducible and its reasoning is shown to the user.

---

## Phase 4 — Interactive TUI overlay (Ink)
- ☐ Ink-based pre-run panel: detected context, estimated usage (range), alternatives, recommendation
- ☐ Actions: **[Proceed]** · **[Switch model]** (Claude family, passes `--model`/effort) · **[Cancel]**
- ☐ Non-TTY / CI fallback to plain text + a default action
- **Acceptance:** the overlay appears on intercepted `claude` calls and each action behaves correctly.

---

## Phase 5+ — DevTools layer (long-term)
- ☐ Per-repo cost budgets (config file)
- ☐ Team policy enforcement (allowed models, max cost)
- ☐ CI gating for expensive prompts
- ☐ Auto model routing within the Claude family
- ☐ (Maybe) thin web companion for shareable estimates / marketing

---

## Cross-cutting concerns
- **Trust > magic:** every estimate labeled, every "fit" justified, no impossible claims (see Guiding constraints).
- **Don't break the user's `claude`:** interception is reversible and bypassable; tested both ways.
- **Pure, tested core:** `tokenizer`/`estimate`/`models` stay pure and unit-tested.
- **No secrets in code:** never read or store API keys; PromptMeter shells out to `claude`, which owns auth.
- **Provider-neutral data model:** even though switching is Claude-only, the model config should make adding informational providers a config change.

---

## Immediate next steps
1. Plan & build Milestone 1.1 (CLI scaffold: Node + TS + bin + lint/format).
2. Lock the `data/models.json` schema and seed the three Claude models (Milestone 1.2).
3. Token + cost estimation as pure, tested modules (Milestones 1.3–1.4).
