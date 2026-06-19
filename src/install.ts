import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { resolveClaudePath } from "./claude.js";

/** Resolved paths/identity for install/uninstall/intercept (all env-redirectable). */
export interface InterceptConfig {
  home: string;
  shimDir: string;
  configPath: string;
  profilePath: string;
  platform: NodeJS.Platform;
  distEntry: string;
  nodePath: string;
}

export const MARK_BEGIN = "# >>> promptmeter >>>";
export const MARK_END = "# <<< promptmeter <<<";

/** Resolve config, honoring PROMPTMETER_HOME / PROMPTMETER_PROFILE overrides (test/isolation seam). */
export function resolveConfig(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  distEntry: string,
  nodePath: string,
): InterceptConfig {
  const home = env.PROMPTMETER_HOME ?? join(homedir(), ".promptmeter");
  const shimDir = join(home, "bin");
  const configPath = join(home, "config.json");
  const profilePath =
    env.PROMPTMETER_PROFILE ??
    (platform === "win32"
      ? join(
          homedir(),
          "Documents",
          "PowerShell",
          "Microsoft.PowerShell_profile.ps1",
        )
      : join(homedir(), ".bashrc"));
  return {
    home,
    shimDir,
    configPath,
    profilePath,
    platform,
    distEntry,
    nodePath,
  };
}

/**
 * Remove the promptmeter marked block plus the single separator newline that
 * `addBlock` inserts, leaving the surrounding content byte-for-byte unchanged.
 * Returns `text` unchanged if no (well-formed) block is present.
 */
export function removeBlock(text: string): string {
  const begin = text.indexOf(MARK_BEGIN);
  if (begin === -1) return text;
  const endMark = text.indexOf(MARK_END, begin);
  if (endMark === -1) return text; // malformed; leave untouched
  const nl = text.indexOf("\n", endMark);
  const endCut = nl === -1 ? text.length : nl + 1;
  let startCut = begin;
  if (startCut > 0 && text[startCut - 1] === "\n") startCut -= 1; // exactly one separator
  return text.slice(0, startCut) + text.slice(endCut);
}

/**
 * Add (or replace) the promptmeter marked block. Inserts exactly one separator
 * newline and NEVER normalizes `text`'s trailing whitespace, so
 * `removeBlock(addBlock(text, body)) === text` (byte-for-byte). Idempotent.
 */
export function addBlock(text: string, body: string): string {
  const base = removeBlock(text);
  return `${base}\n${MARK_BEGIN}\n${body}\n${MARK_END}\n`;
}

export interface ShimFile {
  path: string;
  content: string;
  mode: number;
}

/** The `claude` shim launcher (run by the shell when the user types `claude`). */
export function shimFile(cfg: InterceptConfig): ShimFile {
  if (cfg.platform === "win32") {
    return {
      path: join(cfg.shimDir, "claude.cmd"),
      content: `@echo off\r\n"${cfg.nodePath}" "${cfg.distEntry}" intercept -- %*\r\n`,
      mode: 0o755,
    };
  }
  return {
    path: join(cfg.shimDir, "claude"),
    content: `#!/bin/sh\nexec "${cfg.nodePath}" "${cfg.distEntry}" intercept -- "$@"\n`,
    mode: 0o755,
  };
}

/** The PATH-prepend line written into the marked profile block. */
export function pathPrependLine(cfg: InterceptConfig): string {
  return cfg.platform === "win32"
    ? `$env:PATH = "${cfg.shimDir};$env:PATH"`
    : `export PATH="${cfg.shimDir}:$PATH"`;
}

/** Cached identity written to `<home>/config.json` at install time. */
export interface PromptmeterConfig {
  realClaude: string;
  distEntry: string;
  nodePath: string;
}

export interface InstallResult {
  profilePath: string;
  shimDir: string;
  realClaude: string;
}

/**
 * Install the `claude` shim + PATH-prepend block. Resolves the REAL claude FIRST
 * (excluding the shim dir, so no recursion) and aborts — writing nothing — if it
 * is not found (never shim a missing claude). All paths come from `cfg`, which is
 * env-redirectable, so tests run entirely in temp dirs.
 */
export function install(
  cfg: InterceptConfig,
  env: NodeJS.ProcessEnv = process.env,
): InstallResult {
  const real = resolveClaudePath(env, cfg.shimDir);
  if (!real) {
    throw new Error(
      "Claude Code not found on PATH; install it first (or set PROMPTMETER_CLAUDE_BIN)",
    );
  }
  mkdirSync(cfg.shimDir, { recursive: true });
  const shim = shimFile(cfg);
  writeFileSync(shim.path, shim.content);
  try {
    chmodSync(shim.path, shim.mode);
  } catch {
    // mode is best-effort (Windows ignores it); not fatal.
  }
  const data: PromptmeterConfig = {
    realClaude: real,
    distEntry: cfg.distEntry,
    nodePath: cfg.nodePath,
  };
  writeFileSync(cfg.configPath, `${JSON.stringify(data, null, 2)}\n`);
  const profile = existsSync(cfg.profilePath)
    ? readFileSync(cfg.profilePath, "utf8")
    : "";
  mkdirSync(dirname(cfg.profilePath), { recursive: true });
  writeFileSync(cfg.profilePath, addBlock(profile, pathPrependLine(cfg)));
  return {
    profilePath: cfg.profilePath,
    shimDir: cfg.shimDir,
    realClaude: real,
  };
}

/** Remove the shim, config, and the marked profile block (byte-for-byte restore). */
export function uninstall(cfg: InterceptConfig): void {
  if (existsSync(cfg.profilePath)) {
    writeFileSync(
      cfg.profilePath,
      removeBlock(readFileSync(cfg.profilePath, "utf8")),
    );
  }
  rmSync(cfg.shimDir, { recursive: true, force: true });
  rmSync(cfg.configPath, { force: true });
}

/** Read the cached `<home>/config.json`, or null if absent/unreadable. */
export function readConfig(cfg: InterceptConfig): PromptmeterConfig | null {
  try {
    return JSON.parse(
      readFileSync(cfg.configPath, "utf8"),
    ) as PromptmeterConfig;
  } catch {
    return null;
  }
}

/**
 * From the original `claude` args, find the prompt (for the estimate) and the
 * model. Skips `--model`/`-m` and its value (so a leading `--model X` does NOT
 * make `X` the prompt) and any other flag; the first remaining non-flag is the
 * prompt. Model = the `--model`/`-m`/`--model=` value, else `defaultModel`.
 */
export function detectPromptAndModel(
  args: string[],
  defaultModel: string,
): { prompt?: string; model: string } {
  let model = defaultModel;
  let prompt: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--model" || a === "-m") {
      if (i + 1 < args.length) {
        model = args[i + 1];
        i++;
      }
      continue;
    }
    if (a.startsWith("--model=")) {
      model = a.slice("--model=".length);
      continue;
    }
    if (a.startsWith("-")) continue; // some other flag
    if (prompt === undefined) prompt = a;
  }
  return { prompt, model };
}

/** True when the shim exists and the profile contains the marked block. */
export function isInstalled(cfg: InterceptConfig): boolean {
  return (
    existsSync(shimFile(cfg).path) &&
    existsSync(cfg.profilePath) &&
    readFileSync(cfg.profilePath, "utf8").includes(MARK_BEGIN)
  );
}
