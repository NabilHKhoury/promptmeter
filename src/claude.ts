import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { delimiter, join } from "node:path";

export interface ClaudeRun {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
  notFound?: boolean;
}

/** Injectable subset of `spawnSync` (for testing without a real spawn). */
type SpawnFn = (
  command: string,
  args: string[],
  options: { stdio: "inherit"; shell: false },
) => { status: number | null; signal: NodeJS.Signals | null; error?: Error };

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve a full path to the real `claude` binary:
 * 1. `PROMPTMETER_CLAUDE_BIN` override (must be an existing file).
 * 2. else walk `PATH` for `claude` + a safe executable extension.
 *
 * Windows uses `.exe`/`.com` only — spawning a `.cmd`/`.bat` full path with
 * `shell:false` throws EINVAL (post-CVE-2024-27980). Returns `null` if not found.
 */
export function resolveClaudePath(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const override = env.PROMPTMETER_CLAUDE_BIN;
  if (override) {
    return isFile(override) ? override : null;
  }
  const exts = process.platform === "win32" ? [".exe", ".com"] : [""];
  const dirs = (env.PATH ?? "").split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, `claude${ext}`);
      if (isFile(candidate)) return candidate;
    }
  }
  return null;
}

/** Build claude's argv: the task as the positional prompt, then `--model <id>`. */
export function buildClaudeArgs(task: string, modelId: string): string[] {
  return [task, "--model", modelId];
}

/**
 * Map a successful `runClaude` result to a process exit code (pass-through):
 * signal-killed → 1, else the child's status (null status → 1). `notFound`/`error`
 * are handled separately by the caller (clean message + exit 1).
 */
export function exitCodeFor(run: ClaudeRun): number {
  return run.signal ? 1 : (run.status ?? 1);
}

/**
 * Run the real `claude` with stdio inherited (interactive). Returns a result the
 * caller maps to a process exit. No shell: `task`/`modelId` are argv elements only,
 * so there is no command-injection surface. `spawn` is injectable for tests.
 */
export function runClaude(
  task: string,
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
  spawn: SpawnFn = spawnSync,
): ClaudeRun {
  const bin = resolveClaudePath(env);
  if (!bin) {
    return { status: null, signal: null, notFound: true };
  }
  const result = spawn(bin, buildClaudeArgs(task, modelId), {
    stdio: "inherit",
    shell: false,
  });
  return { status: result.status, signal: result.signal, error: result.error };
}
