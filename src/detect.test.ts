import { describe, it, expect } from "vitest";
import { detectTaskType, detectProject } from "./detect.js";

describe("detectTaskType", () => {
  it("classifies by keyword (debug > refactor > explain > generate)", () => {
    expect(detectTaskType("refactor the auth module").type).toBe("refactor");
    expect(detectTaskType("fix the failing test").type).toBe("debug");
    expect(detectTaskType("explain how X works").type).toBe("explain");
    expect(detectTaskType("add a new endpoint").type).toBe("generate");
    expect(detectTaskType("hello there").type).toBe("general");
  });

  it("returns the matched keyword as basis (undefined for general)", () => {
    expect(detectTaskType("please refactor this").basis).toBe("refactor");
    expect(detectTaskType("hi").basis).toBeUndefined();
  });
});

describe("detectProject", () => {
  it("Next.js app (TypeScript)", () => {
    const p = detectProject(
      { dependencies: { next: "1" } },
      new Set(["tsconfig.json"]),
    );
    expect(p.projectType).toBe("Next.js app");
    expect(p.framework).toBe("Next.js");
    expect(p.language).toBe("TypeScript");
    expect(p.basis).toContain("next");
  });

  it("next + express collision → Next.js app (precedence)", () => {
    expect(
      detectProject({ dependencies: { next: "1", express: "1" } }, new Set())
        .projectType,
    ).toBe("Next.js app");
  });

  it("Express → Node.js API service", () => {
    const p = detectProject({ dependencies: { express: "1" } }, new Set());
    expect(p.projectType).toBe("Node.js API service");
    expect(p.framework).toBe("Express");
    expect(p.language).toBe("JavaScript");
  });

  it("CLI via bin or commander", () => {
    expect(detectProject({ bin: { x: "y" } }, new Set()).projectType).toBe(
      "Node.js CLI",
    );
    expect(
      detectProject({ dependencies: { commander: "1" } }, new Set())
        .projectType,
    ).toBe("Node.js CLI");
  });

  it("React app (no next)", () => {
    expect(
      detectProject({ dependencies: { react: "1" } }, new Set()).projectType,
    ).toBe("React app");
  });

  it("generic Node.js project", () => {
    expect(
      detectProject({ dependencies: { lodash: "1" } }, new Set()).projectType,
    ).toBe("Node.js project");
  });

  it("non-Node via marker files", () => {
    expect(detectProject(null, new Set(["go.mod"])).projectType).toBe(
      "Go module",
    );
    expect(detectProject(null, new Set(["Cargo.toml"])).language).toBe("Rust");
    expect(detectProject(null, new Set(["pyproject.toml"])).language).toBe(
      "Python",
    );
  });

  it("unknown when no signals", () => {
    expect(detectProject(null, new Set()).projectType).toBe("Unknown project");
  });
});
