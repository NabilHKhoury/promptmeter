// Pure decision logic for the interactive overlay (Phase 4). No TTY/IO/Ink here,
// so it is fully unit-testable. The Ink shell (src/tui.tsx) and `run`/`intercept`
// wiring consume these.

export type OverlayAction = "proceed" | "switch" | "cancel";

/** Non-TTY default: ALWAYS proceed — never block a script/CI with a Cancel. */
export const DEFAULT_ACTION: OverlayAction = "proceed";

export interface InteractiveEnv {
  stdinTTY: boolean;
  stdoutTTY: boolean;
  env: NodeJS.ProcessEnv;
  dryRun?: boolean;
  yes?: boolean;
}

/** Truthy env value: defined and not "", "0", or "false" (case-insensitive). */
function truthy(v: string | undefined): boolean {
  return (
    v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false"
  );
}

/**
 * Show the interactive overlay ONLY when genuinely interactive. This is the
 * primary safety guard — `useInput` CRASHES on a non-TTY, so any false positive
 * would break the hand-off. Both stdin AND stdout must be TTYs, and no opt-out
 * flag/env may be set.
 */
export function shouldShowOverlay(e: InteractiveEnv): boolean {
  if (e.dryRun) return false;
  if (e.yes) return false;
  if (!e.stdinTTY || !e.stdoutTTY) return false;
  if (truthy(e.env.PROMPTMETER_NO_TUI)) return false;
  if (truthy(e.env.CI)) return false;
  return true;
}

export interface ActionOutcome {
  run: boolean;
  model: string;
}

/** Map an overlay action to an outcome: cancel → no run; switch → chosen model. */
export function resolveAction(
  action: OverlayAction,
  chosenModel: string | undefined,
  currentModel: string,
): ActionOutcome {
  if (action === "cancel") return { run: false, model: currentModel };
  if (action === "switch" && chosenModel) {
    return { run: true, model: chosenModel };
  }
  return { run: true, model: currentModel };
}

/**
 * Rewrite an original `claude` argv to use `model`: drop any existing
 * `--model`/`-m` (+ its value) and `--model=…` (and a dangling valueless
 * `--model`), then append exactly one `--model <model>`. argv-only (no shell).
 */
export function setModelArg(args: string[], model: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--model" || a === "-m") {
      i++; // skip its value (if any; a trailing valueless flag just ends the loop)
      continue;
    }
    if (a.startsWith("--model=")) continue;
    out.push(a);
  }
  out.push("--model", model);
  return out;
}
