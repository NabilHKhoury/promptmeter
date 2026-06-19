export type TaskType =
  | "refactor"
  | "debug"
  | "explain"
  | "generate"
  | "general";

export interface TaskDetection {
  type: TaskType;
  basis?: string;
}

// Ordered: first keyword match wins (debug → refactor → explain → generate).
const TASK_KEYWORDS: { type: TaskType; words: string[] }[] = [
  {
    type: "debug",
    words: [
      "fix",
      "bug",
      "error",
      "crash",
      "fail",
      "debug",
      "broken",
      "throw",
      "exception",
      "stack trace",
    ],
  },
  {
    type: "refactor",
    words: [
      "refactor",
      "clean up",
      "rename",
      "restructure",
      "simplify",
      "extract",
      "tidy",
    ],
  },
  {
    type: "explain",
    words: [
      "explain",
      "what ",
      "how ",
      "why ",
      "describe",
      "understand",
      "document",
      "summarize",
    ],
  },
  {
    type: "generate",
    words: [
      "add",
      "create",
      "implement",
      "write",
      "build",
      "generate",
      "new ",
      "scaffold",
    ],
  },
];

/** Heuristic task-type from the prompt (qualitative; `basis` = matched keyword). */
export function detectTaskType(prompt: string): TaskDetection {
  const p = prompt.toLowerCase();
  for (const group of TASK_KEYWORDS) {
    for (const w of group.words) {
      if (p.includes(w)) return { type: group.type, basis: w.trim() };
    }
  }
  return { type: "general" };
}

export interface ProjectInfo {
  language: string;
  framework?: string;
  projectType: string;
  basis: string[];
}

function hasDep(pkg: Record<string, unknown>, name: string): boolean {
  const dep = pkg.dependencies as Record<string, unknown> | undefined;
  const dev = pkg.devDependencies as Record<string, unknown> | undefined;
  return (!!dep && name in dep) || (!!dev && name in dev);
}

const API_FRAMEWORKS: Record<string, string> = {
  express: "Express",
  fastify: "Fastify",
  koa: "Koa",
  "@hapi/hapi": "Hapi",
};

/**
 * Heuristic project/framework detection from `package.json` + present marker
 * files. Qualitative with a `basis` (no invented accuracy %). First-match
 * precedence so multi-signal repos are deterministic.
 */
export function detectProject(
  pkg: Record<string, unknown> | null,
  markers: Set<string>,
): ProjectInfo {
  if (pkg) {
    const isTs = markers.has("tsconfig.json") || hasDep(pkg, "typescript");
    const language = isTs ? "TypeScript" : "JavaScript";
    const base = ["package.json"];
    if (isTs)
      base.push(markers.has("tsconfig.json") ? "tsconfig.json" : "typescript");

    if (hasDep(pkg, "next")) {
      return {
        language,
        framework: "Next.js",
        projectType: "Next.js app",
        basis: [...base, "next"],
      };
    }
    if (hasDep(pkg, "@nestjs/core")) {
      return {
        language,
        framework: "NestJS",
        projectType: "NestJS API service",
        basis: [...base, "@nestjs/core"],
      };
    }
    for (const dep of Object.keys(API_FRAMEWORKS)) {
      if (hasDep(pkg, dep)) {
        return {
          language,
          framework: API_FRAMEWORKS[dep],
          projectType: "Node.js API service",
          basis: [...base, dep],
        };
      }
    }
    if (hasDep(pkg, "react")) {
      return {
        language,
        framework: "React",
        projectType: "React app",
        basis: [...base, "react"],
      };
    }
    if (hasDep(pkg, "vue")) {
      return {
        language,
        framework: "Vue",
        projectType: "Vue app",
        basis: [...base, "vue"],
      };
    }
    if (hasDep(pkg, "svelte")) {
      return {
        language,
        framework: "Svelte",
        projectType: "Svelte app",
        basis: [...base, "svelte"],
      };
    }
    if (
      pkg.bin !== undefined ||
      hasDep(pkg, "commander") ||
      hasDep(pkg, "yargs")
    ) {
      const why =
        pkg.bin !== undefined
          ? "bin"
          : hasDep(pkg, "commander")
            ? "commander"
            : "yargs";
      return {
        language,
        framework: "CLI",
        projectType: "Node.js CLI",
        basis: [...base, why],
      };
    }
    return { language, projectType: "Node.js project", basis: base };
  }

  if (markers.has("go.mod")) {
    return { language: "Go", projectType: "Go module", basis: ["go.mod"] };
  }
  if (markers.has("Cargo.toml")) {
    return {
      language: "Rust",
      projectType: "Rust crate",
      basis: ["Cargo.toml"],
    };
  }
  if (
    markers.has("pyproject.toml") ||
    markers.has("requirements.txt") ||
    markers.has("setup.py")
  ) {
    const m = markers.has("pyproject.toml")
      ? "pyproject.toml"
      : markers.has("requirements.txt")
        ? "requirements.txt"
        : "setup.py";
    return { language: "Python", projectType: "Python project", basis: [m] };
  }
  if (markers.has("pom.xml") || markers.has("build.gradle")) {
    const m = markers.has("pom.xml") ? "pom.xml" : "build.gradle";
    return { language: "Java", projectType: "Java project", basis: [m] };
  }
  return { language: "Unknown", projectType: "Unknown project", basis: [] };
}
