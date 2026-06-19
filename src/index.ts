import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { loadModels } from "./models.js";
import {
  estimateTokens,
  tokenRangeFromChars,
  combineTokenEstimates,
} from "./tokenizer.js";
import {
  estimateOutputTokens,
  estimateCost,
  formatEstimate,
} from "./estimate.js";
import { detectTaskType } from "./detect.js";
import { scanRepo, formatContext } from "./scan.js";
import { formatRecommendation } from "./recommend.js";
import { crossProviderComparison, formatCrossProvider } from "./providers.js";
import {
  shouldShowOverlay,
  resolveAction,
  setModelArg,
  type OverlayAction,
} from "./overlay.js";
import { runOverlay } from "./tui.js";
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
  .option("--no-scan", "skip scanning the codebase for in-scope context")
  .option(
    "-y, --yes",
    "skip the interactive overlay; proceed with the hand-off",
  )
  .action(
    async (
      task: string,
      opts: {
        model?: string;
        dryRun?: boolean;
        scan?: boolean;
        yes?: boolean;
      },
    ) => {
      // Show the pre-run panel (or the interactive overlay), then hand off to the
      // real `claude`. No shell: `task`/`--model` reach claude as argv elements.
      const id = opts.model ?? DEFAULT_MODEL;
      const taskType = detectTaskType(task).type;
      try {
        const models = loadModels();
        const model = models.find((m) => m.id === id);
        if (!model) {
          fail(`unknown model "${id}" (see \`promptmeter models\`)`);
        }
        const promptTokens = estimateTokens(task);
        let input = promptTokens;
        let contextLine: string | undefined;
        if (opts.scan !== false) {
          // Codebase context (Phase 2): adds the in-scope token load to the
          // INPUT range. Best-effort — a scan failure must never block the run.
          try {
            const s = scanRepo(process.cwd());
            input = combineTokenEstimates(
              promptTokens,
              tokenRangeFromChars(s.totalBytes),
            );
            contextLine = formatContext(
              s.project,
              s.fileCount,
              taskType,
              s.truncated,
            );
          } catch {
            // scan is best-effort; fall back to prompt-only input.
          }
        }
        // Output prior is from the prompt (the codebase is read, not regenerated).
        const output = estimateOutputTokens(promptTokens);

        // Compose the pre-run panel (context + estimate + recommendation).
        const panelLines: string[] = [];
        if (contextLine) panelLines.push(contextLine);
        panelLines.push(formatEstimate(estimateCost(input, output, model)));
        try {
          panelLines.push(
            formatRecommendation(taskType, input, output, models),
          );
          panelLines.push(
            formatCrossProvider(crossProviderComparison(input, output)),
          );
        } catch {
          // recommendation/cross-provider are advisory; never block the run.
        }
        const panel = panelLines.join("\n");

        if (opts.dryRun) {
          console.log(panel);
          process.exit(0);
        }

        // Interactive overlay (Phase 4) on a TTY; else plain text + auto-proceed
        // (never hangs on non-TTY/CI/--yes).
        let action: OverlayAction = "proceed";
        let chosen: string | undefined;
        if (
          shouldShowOverlay({
            stdinTTY: !!process.stdin.isTTY,
            stdoutTTY: !!process.stdout.isTTY,
            env: process.env,
            dryRun: opts.dryRun,
            yes: opts.yes,
          })
        ) {
          const ov = await runOverlay(panel, models, model.id);
          action = ov.action;
          chosen = ov.model;
        } else {
          console.log(panel);
        }
        const outcome = resolveAction(action, chosen, model.id);
        if (!outcome.run) {
          console.log("Cancelled — claude was not run.");
          process.exit(0);
        }
        const r = runClaude(task, outcome.model);
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
    },
  );

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
  .command("scan")
  .argument("[dir]", "directory to scan (default: current directory)")
  .description(
    "Scan a repo: detected context + in-scope token range (estimate)",
  )
  .action((dir?: string) => {
    try {
      const s = scanRepo(dir ?? process.cwd());
      const range = tokenRangeFromChars(s.totalBytes);
      console.log(
        formatContext(s.project, s.fileCount, undefined, s.truncated),
      );
      console.log(
        `  In-scope tokens: ~${range.low} – ${range.high} (approximate prior, ${s.fileCount} ${s.fileCount === 1 ? "file" : "files"})`,
      );
    } catch (err) {
      fail((err as Error).message);
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
  .action(async (args: string[]) => {
    const conf = readConfig(cfg);
    const real =
      conf?.realClaude ?? resolveClaudePath(process.env, cfg.shimDir);
    if (!real) {
      fail(
        "could not find `claude` (run `promptmeter install` or set PROMPTMETER_CLAUDE_BIN)",
      );
    }
    let finalArgs = args;
    if (!bypassActive()) {
      try {
        const { prompt, model } = detectPromptAndModel(args, DEFAULT_MODEL);
        const models = loadModels();
        const m = models.find((x) => x.id === model);
        if (prompt && m) {
          const input = estimateTokens(prompt);
          const output = estimateOutputTokens(input);
          const panelLines = [formatEstimate(estimateCost(input, output, m))];
          try {
            panelLines.push(
              formatRecommendation(
                detectTaskType(prompt).type,
                input,
                output,
                models,
              ),
            );
            panelLines.push(
              formatCrossProvider(crossProviderComparison(input, output)),
            );
          } catch {
            // recommendation/cross-provider are advisory.
          }
          const panel = panelLines.join("\n");
          let action: OverlayAction = "proceed";
          let chosen: string | undefined;
          if (
            shouldShowOverlay({
              stdinTTY: !!process.stdin.isTTY,
              stdoutTTY: !!process.stdout.isTTY,
              env: process.env,
            })
          ) {
            const ov = await runOverlay(panel, models, m.id);
            action = ov.action;
            chosen = ov.model;
          } else {
            console.log(panel);
          }
          const outcome = resolveAction(action, chosen, m.id);
          if (!outcome.run) {
            console.log("Cancelled — claude was not run.");
            process.exit(0);
          }
          if (chosen) finalArgs = setModelArg(args, outcome.model);
        }
      } catch {
        // Never block the hand-off on an estimate/overlay failure — claude still runs.
      }
    }
    const r = runRealClaude(real, finalArgs);
    if (r.error) {
      fail(
        `failed to launch claude: ${(r.error as NodeJS.ErrnoException).code ?? r.error.message}`,
      );
    }
    process.exit(exitCodeFor(r));
  });

export async function main(argv: string[] = process.argv): Promise<void> {
  // commander prints help to stderr and exits 1 when parsed with no subcommand,
  // so handle the no-args case BEFORE parse() to satisfy the "help to stdout,
  // exit 0" contract.
  if (argv.slice(2).length === 0) {
    program.outputHelp();
    process.exit(0);
  }
  // parseAsync: the `run`/`intercept` actions are async (the Ink overlay).
  await program.parseAsync(argv);
}

void main();
