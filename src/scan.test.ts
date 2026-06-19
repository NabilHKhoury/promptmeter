import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo, isInScope } from "./scan.js";

describe("isInScope", () => {
  it("accepts code files; rejects tests/decl/min/oversize/non-code", () => {
    expect(isInScope("src/a.ts", 100)).toBe(true);
    expect(isInScope("src/a.js", 100)).toBe(true);
    expect(isInScope("src/a.test.ts", 100)).toBe(false);
    expect(isInScope("src/a.spec.js", 100)).toBe(false);
    expect(isInScope("src/a.d.ts", 100)).toBe(false);
    expect(isInScope("src/a.min.js", 100)).toBe(false);
    expect(isInScope("README.md", 100)).toBe(false);
    expect(isInScope("src/big.ts", 300 * 1024)).toBe(false);
  });
});

describe("scanRepo (temp fixture)", () => {
  it("respects .gitignore, skips node_modules + tests, collects sizes + project", () => {
    const root = mkdtempSync(join(tmpdir(), "pm-scan-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ dependencies: { express: "1" } }),
    );
    writeFileSync(join(root, ".gitignore"), "ignored/\n");
    mkdirSync(join(root, "src"));
    const aContent = "const x = 1;\n";
    writeFileSync(join(root, "src", "a.ts"), aContent); // in scope
    writeFileSync(join(root, "src", "a.test.ts"), "test\n"); // excluded (test)
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "node_modules", "x.js"), "vendor\n"); // excluded
    mkdirSync(join(root, "ignored"));
    writeFileSync(join(root, "ignored", "secret.ts"), "SECRET\n"); // gitignored

    const r = scanRepo(root);
    expect(r.files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(r.fileCount).toBe(1);
    expect(r.totalBytes).toBe(aContent.length);
    expect(r.project.projectType).toBe("Node.js API service");
    expect(r.truncated).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });

  it("honors maxFiles (sets truncated)", () => {
    const root = mkdtempSync(join(tmpdir(), "pm-scan2-"));
    mkdirSync(join(root, "src"));
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(root, "src", `f${i}.ts`), "x\n");
    }
    const r = scanRepo(root, { maxFiles: 2 });
    expect(r.truncated).toBe(true);
    expect(r.fileCount).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });
});
