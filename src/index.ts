import { readFileSync } from "node:fs";
import { Command } from "commander";
import { loadModels } from "./models.js";
import { estimateTokens } from "./tokenizer.js";
import {
  estimateOutputTokens,
  estimateCost,
  formatEstimate,
} from "./estimate.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";

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
  .action((task: string, opts: { model?: string }) => {
    // M1.4: pre-run cost estimate (labeled ranges). The real `claude` hand-off is
    // M1.5. No exec, no network — only the local config is read.
    const id = opts.model ?? DEFAULT_MODEL;
    try {
      const model = loadModels().find((m) => m.id === id);
      if (!model) {
        fail(`unknown model "${id}" (see \`promptmeter models\`)`);
      }
      const input = estimateTokens(task);
      const output = estimateOutputTokens(input);
      console.log(formatEstimate(estimateCost(input, output, model)));
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
