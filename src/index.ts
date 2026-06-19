import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { loadModels } from "./models.js";
import { estimateTokens } from "./tokenizer.js";
import {
  estimateOutputTokens,
  estimateCost,
  formatEstimate,
} from "./estimate.js";
import {
  runClaude,
  runRealClaude,
  resolveClaudePath,
  exitCodeFor,
} from "./claude.js";
import {
  resolveConfig,
  install,
  uninstall,
  readConfig,
  isInstalled,
  detectPromptAndModel,
} from "./install.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

// Interception config (env-redirectable via PROMPTMETER_HOME / PROMPTMETER_PROFILE).
// distEntry self-resolves to this bundled dist/index.js.
const cfg = resolveConfig(
  process.env,
  process.platform,
  fileURLToPath(new URL("./index.js", import.meta.url)),
  process.execPath,
);

function bypassActive(): boolean {
  const off = process.env.PROMPTMETER_OFF;
  return (
    off !== undefined &&
    off !== "" &&
    off !== "0" &&
    off.toLowerCase() !== "false"
  );
}

/** Print a one-line `promptmeter: <msg>` to stderr and exit 1 (no stack trace). */
function fail(message: string): never {
  console.error(`promptmeter: ${message}`);
  process.exit(1);
}

// Read the real version from package.json (single source of truth). After
// bundling, this file lives at dist/index.js, so "../package.json" resolves to
// the repo-root package.json.
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

const program = new Command();

program
  .name("promptmeter")
  .description(
    "Terminal-native LLM cost & model-intelligence layer for Claude Code",
  )
  .version(pkg.version);

program
  .command("run")
  .argument("<task>", "the task/prompt to analyze")
  .description("Analyze a task and (later) hand off to claude")
  .option("-m, --model <model>", "Claude model to use (e.g. claude-opus-4-8)")
  .option("--dry-run", "analyze only; do not run claude")
  .action((task: string, opts: { model?: string; dryRun?: boolean }) => {
    // Print the pre-run estimate, then hand off to the real `claude` (M1.5).
    // No shell: `task`/`--model` reach claude as argv elements, never a shell string.
    const id = opts.model ?? DEFAULT_MODEL;
    try {
      const model = loadModels().find((m) => m.id === id);
      if (!model) {
        fail(`unknown model "${id}" (see \`promptmeter models\`)`);
      }
      const input = estimateTokens(task);
      const output = estimateOutputTokens(input);
      console.log(formatEstimate(estimateCost(input, output, model)));

      if (opts.dryRun) {
        process.exit(0);
      }
      const r = runClaude(task, model.id);
      if (r.notFound) {
        fail(
          "could not find `claude` on PATH (install Claude Code, or set PROMPTMETER_CLAUDE_BIN)",
        );
      }
      if (r.error) {
        fail(
          `failed to launch claude: ${(r.error as NodeJS.ErrnoException).code ?? r.error.message}`,
        );
      }
      process.exit(exitCodeFor(r));
    } catch (err) {
      fail((err as Error).message);
    }
  });

program
  .command("models")
  .description(
    "List the configured Claude models and their (estimated) pricing",
  )
  .action(() => {
    let models;
    try {
      models = loadModels();
    } catch (err) {
      fail((err as Error).message);
    }
    console.log(
      "Configured models (pricing is an estimate — verify against Anthropic):",
    );
    for (const m of models) {
      console.log(
        `  ${m.id}  ${m.display_name}  $${m.input_per_mtok}/$${m.output_per_mtok} per Mtok  ${m.context_window} ctx`,
      );
      console.log(`      fit: ${m.fit_notes}`);
    }
  });

program
  .command("install")
  .description(
    "Shadow `claude` so the estimate runs before each call (reversible)",
  )
  .action(() => {
    try {
      const r = install(cfg);
      console.log(`Installed claude interception. Edited ${r.profilePath}`);
      console.log(
        "  The PATH change applies to NEW shells. Skip once with PROMPTMETER_OFF=1; remove with `promptmeter uninstall`.",
      );
    } catch (err) {
      fail((err as Error).message);
    }
  });

program
  .command("uninstall")
  .description("Remove the `claude` interception shim (restores your shell)")
  .action(() => {
    uninstall(cfg);
    console.log(
      "Removed claude interception. Restart your shell to drop the PATH override.",
    );
  });

program
  .command("status")
  .description("Show whether `claude` interception is installed")
  .action(() => {
    const conf = readConfig(cfg);
    console.log(
      `Interception: ${isInstalled(cfg) ? "INSTALLED" : "not installed"}`,
    );
    console.log(`  Profile:     ${cfg.profilePath}`);
    console.log(`  Real claude: ${conf?.realClaude ?? "(not cached)"}`);
    console.log(
      `  Bypass:      PROMPTMETER_OFF=${process.env.PROMPTMETER_OFF ?? "(unset)"}`,
    );
  });

// Hidden: invoked by the installed shim as `intercept -- <original claude args>`.
program
  .command("intercept", { hidden: true })
  .allowUnknownOption()
  .argument("[args...]", "the original claude args")
  .action((args: string[]) => {
    const conf = readConfig(cfg);
    const real =
      conf?.realClaude ?? resolveClaudePath(process.env, cfg.shimDir);
    if (!real) {
      fail(
        "could not find `claude` (run `promptmeter install` or set PROMPTMETER_CLAUDE_BIN)",
      );
    }
    if (!bypassActive()) {
      const { prompt, model } = detectPromptAndModel(args, DEFAULT_MODEL);
      if (prompt) {
        try {
          const m = loadModels().find((x) => x.id === model);
          if (m) {
            const input = estimateTokens(prompt);
            console.log(
              formatEstimate(
                estimateCost(input, estimateOutputTokens(input), m),
              ),
            );
          }
        } catch {
          // Never block the hand-off on an estimate failure — claude still runs.
        }
      }
    }
    const r = runRealClaude(real, args);
    if (r.error) {
      fail(
        `failed to launch claude: ${(r.error as NodeJS.ErrnoException).code ?? r.error.message}`,
      );
    }
    process.exit(exitCodeFor(r));
  });

export function main(argv: string[] = process.argv): void {
  // commander prints help to stderr and exits 1 when parsed with no subcommand,
  // so handle the no-args case BEFORE parse() to satisfy the "help to stdout,
  // exit 0" contract.
  if (argv.slice(2).length === 0) {
    program.outputHelp();
    process.exit(0);
  }
  program.parse(argv);
}

main();
