import { describe, it, expect } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveConfig,
  addBlock,
  removeBlock,
  shimFile,
  pathPrependLine,
  install,
  uninstall,
  readConfig,
  isInstalled,
  detectPromptAndModel,
  MARK_BEGIN,
  MARK_END,
  type InterceptConfig,
} from "./install.js";
import { resolveClaudePath } from "./claude.js";

const BODY = 'export PATH="/shim:$PATH"';

describe("addBlock / removeBlock", () => {
  it("round-trips byte-for-byte for block-free inputs", () => {
    const inputs = [
      "",
      "export A=1",
      "export A=1\n",
      "export A=1\n\n",
      "# comment\nexport A=1",
    ];
    for (const text of inputs) {
      expect(removeBlock(addBlock(text, BODY))).toBe(text);
    }
  });

  it("replaces an existing block (round-trip equals the block-stripped text)", () => {
    const text = `prefix\n${MARK_BEGIN}\nold body\n${MARK_END}\nsuffix\n`;
    expect(removeBlock(addBlock(text, BODY))).toBe(removeBlock(text));
  });

  it("addBlock is idempotent (no duplicate block)", () => {
    const t = "export A=1\n";
    expect(addBlock(addBlock(t, BODY), BODY)).toBe(addBlock(t, BODY));
  });

  it("addBlock has exactly one BEGIN/END with the body between them", () => {
    const out = addBlock("x", BODY);
    expect(out.split(MARK_BEGIN).length - 1).toBe(1);
    expect(out.split(MARK_END).length - 1).toBe(1);
    expect(out.indexOf(BODY)).toBeGreaterThan(out.indexOf(MARK_BEGIN));
    expect(out.indexOf(BODY)).toBeLessThan(out.indexOf(MARK_END));
  });

  it("removeBlock on text without a block returns it unchanged", () => {
    expect(removeBlock("nothing here\n")).toBe("nothing here\n");
    expect(removeBlock("")).toBe("");
  });
});

describe("resolveConfig", () => {
  it("honors PROMPTMETER_HOME / PROMPTMETER_PROFILE overrides", () => {
    const cfg = resolveConfig(
      { PROMPTMETER_HOME: "/h", PROMPTMETER_PROFILE: "/p" },
      "linux",
      "/d/index.js",
      "/usr/bin/node",
    );
    expect(cfg.home).toBe("/h");
    expect(cfg.profilePath).toBe("/p");
    expect(cfg.shimDir).toBe(join("/h", "bin"));
    expect(cfg.configPath).toBe(join("/h", "config.json"));
    expect(cfg.distEntry).toBe("/d/index.js");
    expect(cfg.nodePath).toBe("/usr/bin/node");
  });

  it("defaults home to ~/.promptmeter", () => {
    const cfg = resolveConfig({}, "linux", "d", "n");
    expect(cfg.home).toBe(join(homedir(), ".promptmeter"));
  });
});

describe("shimFile / pathPrependLine", () => {
  const win = resolveConfig(
    { PROMPTMETER_HOME: "C:/h" },
    "win32",
    "C:/d/index.js",
    "C:/node.exe",
  );
  const posix = resolveConfig(
    { PROMPTMETER_HOME: "/h" },
    "linux",
    "/d/index.js",
    "/usr/bin/node",
  );

  it("Windows shim is claude.cmd invoking node + dist intercept", () => {
    const s = shimFile(win);
    expect(s.path.endsWith("claude.cmd")).toBe(true);
    expect(s.content).toContain("intercept -- %*");
    expect(s.content).toContain("C:/node.exe");
    expect(s.content).toContain("C:/d/index.js");
  });

  it("POSIX shim is claude invoking exec node + dist intercept", () => {
    const s = shimFile(posix);
    expect(s.path.endsWith("claude")).toBe(true);
    expect(s.content).toContain("exec ");
    expect(s.content).toContain('intercept -- "$@"');
  });

  it("pathPrependLine prepends shimDir per platform", () => {
    expect(pathPrependLine(win)).toContain(win.shimDir);
    expect(pathPrependLine(win)).toContain("$env:PATH");
    expect(pathPrependLine(posix)).toContain('export PATH="');
    expect(pathPrependLine(posix)).toContain(posix.shimDir);
  });
});

// All file-op tests run entirely inside a temp home + temp profile (the isolation
// seam). The real shell profile, real PATH, and real ~/.promptmeter are never touched.
function tempCfg(): InterceptConfig {
  const home = mkdtempSync(join(tmpdir(), "pm-home-"));
  return resolveConfig(
    { PROMPTMETER_HOME: home, PROMPTMETER_PROFILE: join(home, "profile.ps1") },
    process.platform,
    "/d/index.js",
    process.execPath,
  );
}

describe("install / uninstall (temp-isolated)", () => {
  const FAKE_CLAUDE = { PROMPTMETER_CLAUDE_BIN: process.execPath };

  it("writes shim + config + a single profile block", () => {
    const cfg = tempCfg();
    const res = install(cfg, FAKE_CLAUDE);
    expect(res.realClaude).toBe(process.execPath);
    expect(existsSync(shimFile(cfg).path)).toBe(true);
    expect(readConfig(cfg)?.realClaude).toBe(process.execPath);
    const prof = readFileSync(cfg.profilePath, "utf8");
    expect(prof.split(MARK_BEGIN).length - 1).toBe(1);
    expect(prof).toContain(cfg.shimDir);
    expect(isInstalled(cfg)).toBe(true);
    rmSync(cfg.home, { recursive: true, force: true });
  });

  it("is idempotent and uninstall restores the profile byte-for-byte", () => {
    const cfg = tempCfg();
    const original = "# my profile\nSet-Alias ll ls\n";
    writeFileSync(cfg.profilePath, original);
    install(cfg, FAKE_CLAUDE);
    install(cfg, FAKE_CLAUDE); // twice → still one block
    expect(
      readFileSync(cfg.profilePath, "utf8").split(MARK_BEGIN).length - 1,
    ).toBe(1);
    uninstall(cfg);
    expect(readFileSync(cfg.profilePath, "utf8")).toBe(original); // byte-for-byte
    expect(existsSync(cfg.shimDir)).toBe(false);
    expect(existsSync(cfg.configPath)).toBe(false);
    expect(isInstalled(cfg)).toBe(false);
    rmSync(cfg.home, { recursive: true, force: true });
  });

  it("aborts (throws, writes nothing) when claude is not found", () => {
    const cfg = tempCfg();
    expect(() => install(cfg, { PATH: "" })).toThrow(/Claude Code not found/);
    expect(existsSync(cfg.shimDir)).toBe(false);
    expect(existsSync(cfg.configPath)).toBe(false);
    expect(existsSync(cfg.profilePath)).toBe(false);
    rmSync(cfg.home, { recursive: true, force: true });
  });
});

describe("detectPromptAndModel", () => {
  const DEF = "claude-sonnet-4-6";

  it("takes the first non-flag as the prompt and defaults the model", () => {
    expect(detectPromptAndModel(["fix the bug"], DEF)).toEqual({
      prompt: "fix the bug",
      model: DEF,
    });
  });

  it("does NOT treat the --model value as the prompt (review W1)", () => {
    expect(
      detectPromptAndModel(["--model", "claude-opus-4-8", "do it"], DEF),
    ).toEqual({
      prompt: "do it",
      model: "claude-opus-4-8",
    });
    expect(
      detectPromptAndModel(["-m", "claude-haiku-4-5", "do it"], DEF),
    ).toEqual({
      prompt: "do it",
      model: "claude-haiku-4-5",
    });
    expect(
      detectPromptAndModel(["--model=claude-opus-4-8", "do it"], DEF),
    ).toEqual({
      prompt: "do it",
      model: "claude-opus-4-8",
    });
  });

  it("skips other flags and returns no prompt when there is none", () => {
    expect(detectPromptAndModel(["--verbose", "-x"], DEF)).toEqual({
      prompt: undefined,
      model: DEF,
    });
  });
});

describe("resolveClaudePath excludeDir", () => {
  it("does not resolve a claude located only in the excluded dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "pm-shim-"));
    const name = process.platform === "win32" ? "claude.exe" : "claude";
    writeFileSync(join(dir, name), "");
    expect(resolveClaudePath({ PATH: dir })).toBe(join(dir, name));
    expect(resolveClaudePath({ PATH: dir }, dir)).toBeNull();
    rmSync(dir, { recursive: true, force: true });
  });
});
