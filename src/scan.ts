import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep, extname } from "node:path";
import ignore from "ignore";
import { detectProject, type ProjectInfo } from "./detect.js";

const CODE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".c",
  ".cc",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".swift",
  ".kt",
  ".scala",
  ".sh",
]);

const MAX_FILE_BYTES = 256 * 1024;
const MARKER_FILES = [
  "tsconfig.json",
  "go.mod",
  "Cargo.toml",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "pom.xml",
  "build.gradle",
];

export interface ScanFile {
  path: string;
  size: number;
}

export interface ScanResult {
  root: string;
  files: ScanFile[];
  totalBytes: number;
  fileCount: number;
  truncated: boolean;
  project: ProjectInfo;
}

/** Render the "Detected context" block (labeled — the codebase load is a prior). */
export function formatContext(
  project: ProjectInfo,
  fileCount: number,
  taskType?: string,
  truncated?: boolean,
): string {
  const fw = project.framework ? ` (${project.framework})` : "";
  const lines = [
    "Detected context:",
    `  Project: ${project.projectType}${fw} [${project.language}]`,
    `  Files in scope: ${fileCount} ${fileCount === 1 ? "file" : "files"}${truncated ? " (capped)" : ""}`,
  ];
  if (taskType) lines.push(`  Task: ${taskType}`);
  return lines.join("\n");
}

/** A code file that's a plausible "in scope" source (not a test/decl/min/huge file). */
export function isInScope(rel: string, size: number): boolean {
  if (size > MAX_FILE_BYTES) return false;
  const lower = rel.toLowerCase();
  if (
    lower.endsWith(".d.ts") ||
    lower.endsWith(".min.js") ||
    lower.endsWith(".min.css")
  ) {
    return false;
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(lower)) return false;
  return CODE_EXT.has(extname(lower));
}

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

/**
 * `.gitignore`-aware repo scan. Walks `dir`, skipping `.git`/`node_modules` and
 * anything ignored, collecting in-scope source files with their byte sizes (NO
 * file-content reads). Bounds the walk at `maxFiles` (default 5000) so a huge
 * repo can't stall callers. Reads only `package.json` + marker existence for
 * detection. Paths are POSIX-relative and sorted (deterministic).
 */
export function scanRepo(
  dir: string = process.cwd(),
  opts: { maxFiles?: number } = {},
): ScanResult {
  const maxFiles = opts.maxFiles ?? 5000;
  const ig = ignore();
  try {
    ig.add(readFileSync(join(dir, ".gitignore"), "utf8"));
  } catch {
    // no .gitignore at the root — fine.
  }

  const files: ScanFile[] = [];
  let truncated = false;

  const walk = (abs: string): void => {
    if (truncated) return;
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip
    }
    for (const e of entries) {
      if (truncated) return;
      const full = join(abs, e.name);
      const rel = toPosix(relative(dir, full));
      // Never follow symlinks: on Windows `isDirectory()` is true for directory
      // junctions, so this guards against symlink cycles / duplicated counts.
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        if (e.name === ".git" || e.name === "node_modules") continue;
        if (ig.ignores(rel + "/")) continue; // trailing slash prunes `dir/` rules
        walk(full);
      } else if (e.isFile()) {
        if (ig.ignores(rel)) continue;
        let size: number;
        try {
          size = statSync(full).size;
        } catch {
          continue;
        }
        if (isInScope(rel, size)) {
          files.push({ path: rel, size });
          if (files.length >= maxFiles) {
            truncated = true;
            return;
          }
        }
      }
    }
  };
  walk(dir);

  files.sort((a, b) => a.path.localeCompare(b.path));
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  let pkg: Record<string, unknown> | null = null;
  try {
    pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    pkg = null;
  }
  const markers = new Set<string>();
  for (const m of MARKER_FILES) {
    try {
      if (statSync(join(dir, m)).isFile()) markers.add(m);
    } catch {
      // marker not present
    }
  }

  return {
    root: dir,
    files,
    totalBytes,
    fileCount: files.length,
    truncated,
    project: detectProject(pkg, markers),
  };
}
