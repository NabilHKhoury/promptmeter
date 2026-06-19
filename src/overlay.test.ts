import { describe, it, expect } from "vitest";
import {
  shouldShowOverlay,
  resolveAction,
  setModelArg,
  DEFAULT_ACTION,
  type InteractiveEnv,
} from "./overlay.js";

const interactive: InteractiveEnv = {
  stdinTTY: true,
  stdoutTTY: true,
  env: {},
};

describe("shouldShowOverlay", () => {
  it("shows only when fully interactive", () => {
    expect(shouldShowOverlay(interactive)).toBe(true);
  });

  it("hides on any non-interactive signal", () => {
    expect(shouldShowOverlay({ ...interactive, dryRun: true })).toBe(false);
    expect(shouldShowOverlay({ ...interactive, yes: true })).toBe(false);
    expect(shouldShowOverlay({ ...interactive, stdinTTY: false })).toBe(false);
    expect(shouldShowOverlay({ ...interactive, stdoutTTY: false })).toBe(false);
    expect(
      shouldShowOverlay({ ...interactive, env: { PROMPTMETER_NO_TUI: "1" } }),
    ).toBe(false);
    expect(shouldShowOverlay({ ...interactive, env: { CI: "true" } })).toBe(
      false,
    );
  });

  it("treats falsy env values as not-set (truthy rule)", () => {
    expect(shouldShowOverlay({ ...interactive, env: { CI: "" } })).toBe(true);
    expect(shouldShowOverlay({ ...interactive, env: { CI: "0" } })).toBe(true);
    expect(shouldShowOverlay({ ...interactive, env: { CI: "false" } })).toBe(
      true,
    );
  });

  it("default action is proceed (never cancel by default)", () => {
    expect(DEFAULT_ACTION).toBe("proceed");
  });
});

describe("resolveAction", () => {
  it("proceed → run with the current model", () => {
    expect(resolveAction("proceed", undefined, "sonnet")).toEqual({
      run: true,
      model: "sonnet",
    });
  });
  it("cancel → no run", () => {
    expect(resolveAction("cancel", undefined, "sonnet")).toEqual({
      run: false,
      model: "sonnet",
    });
  });
  it("switch with a chosen model → run that model", () => {
    expect(resolveAction("switch", "haiku", "sonnet")).toEqual({
      run: true,
      model: "haiku",
    });
  });
  it("switch without a chosen model → run the current model", () => {
    expect(resolveAction("switch", undefined, "sonnet")).toEqual({
      run: true,
      model: "sonnet",
    });
  });
});

describe("setModelArg", () => {
  it("appends --model when none present", () => {
    expect(setModelArg(["hi"], "x")).toEqual(["hi", "--model", "x"]);
  });
  it("replaces --model / -m / --model= forms", () => {
    expect(setModelArg(["--model", "old", "hi"], "x")).toEqual([
      "hi",
      "--model",
      "x",
    ]);
    expect(setModelArg(["-m", "old", "hi"], "x")).toEqual([
      "hi",
      "--model",
      "x",
    ]);
    expect(setModelArg(["--model=old", "hi"], "x")).toEqual([
      "hi",
      "--model",
      "x",
    ]);
  });
  it("strips ALL existing model flags and a trailing valueless --model", () => {
    expect(setModelArg(["--model", "a", "--model", "b", "hi"], "x")).toEqual([
      "hi",
      "--model",
      "x",
    ]);
    expect(setModelArg(["hi", "--model"], "x")).toEqual(["hi", "--model", "x"]);
  });
  it("yields exactly one --model in the output", () => {
    const out = setModelArg(["--model", "a", "x", "-m", "b"], "z");
    expect(out.filter((a) => a === "--model").length).toBe(1);
    expect(out).toEqual(["x", "--model", "z"]);
  });
});
