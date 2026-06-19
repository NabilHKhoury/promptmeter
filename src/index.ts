import { readFileSync } from "node:fs";
import { Command } from "commander";

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
    // Milestone 1.1: this is a STUB. No estimation, no exec, no network.
    console.log("PromptMeter analysis (stub — estimation not yet wired):");
    console.log(`  Task:  ${task}`);
    if (opts.model) {
      console.log(`  Model: ${opts.model}`);
    }
    console.log(
      "  Note: cost/token estimates and the real `claude` hand-off arrive in Milestones 1.3-1.5.",
    );
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
