# CLAUDE.md — PromptMeter

PromptMeter is a **terminal-native LLM cost & model-intelligence layer for Claude Code**.
It analyzes a prompt (and, later, the codebase) *before* execution and shows an estimated
cost range and the recommended Claude model + effort, then hands off to `claude`.
See `ROADMAP.md` for milestones and `README.md` for the product vision.

## Stack
- **Runtime:** Node.js + TypeScript, **ESM** (`"type": "module"`, `NodeNext`).
- **Build:** `tsup` (esbuild) → bundled ESM at `dist/index.js`.
- **CLI args:** `commander`.
- **TUI (later, Phase 4):** Ink (React for the terminal).
- **Lint/format:** ESLint v9 flat config (`typescript-eslint`) + Prettier (`eslint-config-prettier` last).

## Commands
- `npm run build` — bundle `src/index.ts` → `dist/index.js` (tsup).
- `npm run dev` — tsup watch mode.
- `npm run start` — run the CLI (`node bin/promptmeter.js`).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — `eslint .`.
- `npm run format` / `npm run format:check` — Prettier write / check.
- **Invoke the CLI:** `node bin/promptmeter.js …` (e.g. `--help`, `--version`, `run "<task>" [--model <id>]`). On Windows this is the reliable invocation; `npm link` also creates a `promptmeter` shim.

## Layout
- `src/` — TypeScript source (entry `src/index.ts`).
- `bin/` — executable launcher `promptmeter.js` (shebang; dynamic-imports `../dist/index.js`).
- `data/` — static config. **`data/models.json` is the pricing source of truth** (currently a `{}` placeholder; the schema + the three Claude models are seeded in Milestone 1.2).
- `dist/` — build output (gitignored).

## Critical rules (credibility guardrails — see ROADMAP.md)
- **Claude-family switching only.** "Switch model" means Opus 4.8 / Sonnet 4.6 / Haiku 4.5 (+ effort) via `--model`. Cross-provider (Gemini/GPT) figures are **informational only**, clearly labeled, never a switch action.
- **Estimates are labeled ranges.** Pre-run token/cost numbers are calibrated priors with a confidence band — never a single false-precision number.
- **Model "fit" is qualitative** with a documented basis — no invented accuracy percentages.
- **Never break `claude`.** Interception (Phase 1.5) must leave the real `claude` reachable, be cleanly removable, and offer a bypass.
- **No secrets in code.** Never read or store API keys; PromptMeter shells out to `claude`, which owns auth.
- **Pricing lives in `data/models.json`** and is treated as estimates.

## License / contributing
AGPL-3.0-or-later (`LICENSE`). Contributors sign a lightweight CLA (`CLA.md`) before first merge; see `CONTRIBUTING.md`. The "PromptMeter" name/logo are not covered by the code license (`TRADEMARK.md`).
