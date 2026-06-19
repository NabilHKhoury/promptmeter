# PromptMeter

**A terminal-native LLM cost & model-intelligence layer for Claude Code.**

PromptMeter analyzes your prompt *and* your codebase in real time — **before execution** — and shows estimated cost, token usage, and the optimal Claude model + effort level for the task. It sits in your Claude Code workflow as a pre-run decision layer, not a post-hoc dashboard.

```
──────────────────────────────────────────────
  PromptMeter Analysis
──────────────────────────────────────────────
Detected context:
  • Codebase: Node.js API service (12 files in scope)
  • Task: refactor + error handling
  • Reasoning need: medium

Model: Claude Sonnet 4.6
Estimated usage (pre-run estimate):
  • Input tokens:  ~5,800 – 8,200
  • Output tokens: ~900 – 1,600
  • Cost range:    ~$0.11 – $0.18

Cheaper Claude option:
  → Haiku 4.5 · ~$0.03 – $0.05 · fit: good for refactor/boilerplate

[Proceed]   [Switch model]   [Cancel]
──────────────────────────────────────────────
```

---

## Why it's different

Most LLM cost tools either count tokens in a textbox or log spend *after* the fact (Helicone-style). PromptMeter is a **pre-run decision layer inserted into the execution flow**:

1. **Codebase-aware** — it scans the repo, detects the language/framework, and estimates the token load of the files likely in scope. Not just the prompt text.
2. **Intercepts before execution** — the analysis appears *before* the call runs, so you decide with cost in hand. (Contrast: dashboards that tell you what you already spent.)
3. **Workflow-native** — it lives in the Claude Code terminal flow, so it's part of daily usage rather than a separate site you have to remember to open.

Think *ESLint/Prettier, but for AI cost and model selection.*

---

## What it actually does (and the honest limits)

PromptMeter is built around what is **genuinely achievable** inside Claude Code — no magic claims.

- **Model switching is within the Claude family.** Claude Code runs Anthropic models only. PromptMeter recommends and one-click-switches among **Opus 4.8 / Sonnet 4.6 / Haiku 4.5** (plus effort level) by passing `--model` to `claude`. This is the cost lever most users never tune.
- **Cross-provider numbers are informational.** It can show "this *class* of task tends to be cheaper on Gemini Flash," but it **cannot** make Claude Code run Gemini or GPT. Those figures are clearly labeled as informational comparisons, never a switch action.
- **Pre-run token counts are estimates, shown as ranges.** Claude Code decides at runtime which files to read and how much to reason. PromptMeter gives a calibrated *prior* with a confidence band — never a false-precision single number.
- **Model "fit" is qualitative, with a documented basis.** No invented accuracy percentages. Fit is expressed in bands (e.g. *good fit / slight risk / not recommended*) tied to task type, with the reasoning shown — credibility is the product.

---

## Quick start

PromptMeter wires into your shell so a cost estimate appears **before every `claude` call** — without changing how you use Claude Code.

```bash
git clone https://github.com/NabilHKhoury/promptmeter.git
cd promptmeter
npm install      # installs dependencies and builds (via the prepare script)
npm run wire     # shims `claude` so the estimate runs first
```

Open a **new terminal** and use Claude Code exactly as before:

```bash
claude "refactor this API service and add error handling"
# → PromptMeter shows the estimate + recommended model, then runs the real claude
```

Check it's active anytime with `npm run wire:status`.

> **Requirements:** Node ≥ 18 and the `claude` CLI already on your PATH. PromptMeter **refuses to install if `claude` isn't found** — it never shims a missing binary.

### Optional: the `promptmeter` command

`npm run wire` is all you need for the always-on estimate. To also run estimates by hand (`promptmeter run`, `models`, `scan`), put the command on your PATH:

```bash
npm link             # adds the `promptmeter` command globally
promptmeter models
```

## Remove it anytime

Clean removal is a first-class feature — a tool that edits your shell is only worth installing if you can take it back out just as easily.

```bash
npm run unwire   # removes the shim and restores your shell profile byte-for-byte
```

This undoes the single marked block PromptMeter added to your shell profile and deletes `~/.promptmeter`. Your real `claude` is cached at install time and stays reachable the entire time — interception can never strand it. To skip PromptMeter for a single call without uninstalling:

```bash
PROMPTMETER_OFF=1 claude "…"
```

> **Unwire before deleting the repo.** The shim points back at this folder, so removing the folder first would leave a dangling shim on your PATH. Run `npm run unwire`, *then* delete. (Hardening this so a deleted repo self-heals is tracked on the roadmap.)

## Architecture

```
 claude "refactor this API service…"
        │
        ▼
 ┌─ Layer 1: CLI interception ───────────────┐
 │  shim/shadow of `claude` → PromptMeter     │
 └───────────────┬───────────────────────────┘
                 ▼
 ┌─ Layer 2: Codebase context engine ────────┐
 │  scan repo · detect lang/framework/task    │
 │  estimate in-scope token load              │
 └───────────────┬───────────────────────────┘
                 ▼
 ┌─ Layer 3: Model intelligence ─────────────┐
 │  static config (pricing + qualitative fit) │
 │  → cost range · fit band · recommendation  │
 └───────────────┬───────────────────────────┘
                 ▼
 ┌─ Layer 4: Terminal UI overlay (Ink) ──────┐
 │  Proceed · Switch model · Cancel           │
 └───────────────┬───────────────────────────┘
                 ▼
        exec real `claude --model …`
```

---

## Tech stack

- **Runtime:** Node.js + TypeScript
- **TUI:** [Ink](https://github.com/vadimdemedes/ink) (React for the terminal)
- **Model config:** static JSON (`data/models.json`) — pricing + context window + qualitative fit, kept current
- **Codebase scan:** glob + `.gitignore`-aware heuristics (AST/embeddings are a later upgrade)
- **Interception:** an installable, cleanly-removable shell shim for `claude`, with a bypass flag

---

## Model configuration

Claude model data lives in `data/models.json` (source of truth):

```json
{
  "claude-opus-4-8":   { "display_name": "Claude Opus 4.8",   "input_per_mtok": 5, "output_per_mtok": 25, "context_window": 1000000 },
  "claude-sonnet-4-6": { "display_name": "Claude Sonnet 4.6", "input_per_mtok": 3, "output_per_mtok": 15, "context_window": 1000000 },
  "claude-haiku-4-5":  { "display_name": "Claude Haiku 4.5",  "input_per_mtok": 1, "output_per_mtok": 5,  "context_window": 200000 }
}
```

> Pricing changes; verify against Anthropic's pricing page before relying on figures. All outputs are estimates and labeled as such.

---

## Status

Early development. See [ROADMAP.md](./ROADMAP.md). In brief:

- **Phase 1 — Core CLI + estimation:** `promptmeter run "<task>"` captures the prompt, estimates a cost range from the static Claude pricing, and execs `claude`.
- **Phase 1.5 — Interception:** safely shim `claude` so the analysis appears on existing invocations (with clean uninstall + bypass).
- **Phase 2 — Codebase context engine:** repo scan, framework/task detection, in-scope token-load estimate.
- **Phase 3 — Recommendation engine:** cheapest Claude model + effort that fits; cross-provider info-only.
- **Phase 4 — Interactive TUI overlay (Ink):** Proceed / Switch model / Cancel.
- **Later:** per-repo cost budgets, team policy, CI gating for expensive prompts.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The lowest-friction contribution is keeping `data/models.json` accurate as Anthropic updates pricing or ships new models. Contributors sign a lightweight [CLA](./CLA.md) before their first merge.

---

## License

PromptMeter is licensed under the **GNU Affero General Public License v3.0** — see [LICENSE](./LICENSE). Dual-licensed: a commercial license can be offered separately (open-core model). The **"PromptMeter" name and logo are not covered by the code license** — see [TRADEMARK.md](./TRADEMARK.md).
