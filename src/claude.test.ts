import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveClaudePath,
  buildClaudeArgs,
  runClaude,
  exitCodeFor,
} from "./claude.js";

const CLAUDE_NAME = process.platform === "win32" ? "claude.exe" : "claude";

describe("buildClaudeArgs", () => {
  it("puts the task first, then --model <id>", () => {
    expect(buildClaudeArgs("fix bug", "claude-opus-4-8")).toEqual([
      "fix bug",
      "--model",
      "claude-opus-4-8",
    ]);
  });

  it("passes a shell-metachar task as a single argv element (no split/escape)", () => {
    const evil = "a; rm -rf b $(whoami) `id` && echo x | cat";
    const args = buildClaudeArgs(evil, "claude-haiku-4-5");
    expect(args[0]).toBe(evil);
    expect(args).toEqual([evil, "--model", "claude-haiku-4-5"]);
  });
});

describe("resolveClaudePath", () => {
  it("returns the PROMPTMETER_CLAUDE_BIN override when it is a file", () => {
    // process.execPath (node) is guaranteed to be an existing file.
    expect(
      resolveClaudePath({ PROMPTMETER_CLAUDE_BIN: process.execPath }),
    ).toBe(process.execPath);
  });

  it("returns null when the override does not exist", () => {
    expect(
      resolveClaudePath({ PROMPTMETER_CLAUDE_BIN: "/no/such/claude-bin-xyz" }),
    ).toBeNull();
  });

  it("returns null when the override is a directory", () => {
    expect(resolveClaudePath({ PROMPTMETER_CLAUDE_BIN: tmpdir() })).toBeNull();
  });

  it("returns null with no override and an empty PATH", () => {
    expect(resolveClaudePath({ PATH: "" })).toBeNull();
    expect(resolveClaudePath({})).toBeNull();
  });

  it("finds claude on PATH (full-path resolution)", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-claude-"));
    const bin = join(dir, CLAUDE_NAME);
    writeFileSync(bin, "");
    expect(resolveClaudePath({ PATH: dir })).toBe(bin);
  });
});

describe("exitCodeFor (exit-code pass-through)", () => {
  it("passes through a numeric status", () => {
    expect(exitCodeFor({ status: 0, signal: null })).toBe(0);
    expect(exitCodeFor({ status: 7, signal: null })).toBe(7);
    expect(exitCodeFor({ status: 130, signal: null })).toBe(130);
  });

  it("maps a signal kill to 1", () => {
    expect(exitCodeFor({ status: null, signal: "SIGTERM" })).toBe(1);
  });

  it("maps a null status (no signal) to 1", () => {
    expect(exitCodeFor({ status: null, signal: null })).toBe(1);
  });
});

describe("runClaude", () => {
  const existingBinEnv = { PROMPTMETER_CLAUDE_BIN: process.execPath };

  it("spawns the resolved bin with [task, --model, id] and shell:false, propagating status", () => {
    const calls: Array<{
      cmd: string;
      args: string[];
      opts: { stdio: "inherit"; shell: false };
    }> = [];
    const fakeSpawn = (
      cmd: string,
      args: string[],
      opts: { stdio: "inherit"; shell: false },
    ) => {
      calls.push({ cmd, args, opts });
      return { status: 7, signal: null };
    };
    const r = runClaude("do x", "claude-haiku-4-5", existingBinEnv, fakeSpawn);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe(process.execPath);
    expect(calls[0].args).toEqual(["do x", "--model", "claude-haiku-4-5"]);
    expect(calls[0].opts).toEqual({ stdio: "inherit", shell: false });
    expect(r.status).toBe(7);
    expect(r.notFound).toBeUndefined();
  });

  it("propagates a zero exit status", () => {
    const fakeSpawn = () => ({ status: 0, signal: null });
    expect(runClaude("x", "m", existingBinEnv, fakeSpawn).status).toBe(0);
  });

  it("surfaces signal and error unchanged", () => {
    const err = new Error("spawn failed");
    const fakeSpawn = () => ({
      status: null,
      signal: "SIGTERM" as NodeJS.Signals,
      error: err,
    });
    const r = runClaude("x", "m", existingBinEnv, fakeSpawn);
    expect(r.signal).toBe("SIGTERM");
    expect(r.error).toBe(err);
  });

  it("returns notFound and does NOT call spawn when claude is unresolvable", () => {
    let called = false;
    const fakeSpawn = () => {
      called = true;
      return { status: 0, signal: null };
    };
    const r = runClaude("x", "m", { PATH: "" }, fakeSpawn);
    expect(r.notFound).toBe(true);
    expect(called).toBe(false);
  });
});
