import { readFileSync } from "node:fs";

/** A configured model entry (pricing is a labeled estimate). */
export interface Model {
  id: string;
  display_name: string;
  input_per_mtok: number; // USD per 1M input tokens (estimate)
  output_per_mtok: number; // USD per 1M output tokens (estimate)
  context_window: number; // tokens
  fit_notes: string; // qualitative — no invented accuracy %
  provider: string; // defaults to "anthropic"
}

// Resolved at module load. After bundling this lives in a flat `dist/` file, so
// "../data/models.json" resolves to the repo-root data file. Runtime read (not a
// JSON import) keeps the data external and editable without a rebuild.
const DATA_URL = new URL("../data/models.json", import.meta.url);

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

function isPositiveInteger(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

/**
 * Load and validate the configured models from `data/models.json`.
 * Throws a descriptive Error on a missing/invalid file or any malformed entry.
 */
export function loadModels(): Model[] {
  let text: string;
  try {
    text = readFileSync(DATA_URL, "utf8");
  } catch (err) {
    throw new Error(
      `Could not read data/models.json: ${(err as Error).message}`,
    );
  }

  // readFileSync(..., "utf8") does not strip a UTF-8 BOM.
  text = text.replace(/^﻿/, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `data/models.json is not valid JSON: ${(err as Error).message}`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "data/models.json must be a non-empty object of model entries",
    );
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error(
      "data/models.json must be a non-empty object of model entries",
    );
  }

  return entries.map(([id, rawEntry]) => {
    if (
      rawEntry === null ||
      typeof rawEntry !== "object" ||
      Array.isArray(rawEntry)
    ) {
      throw new Error(`Invalid model "${id}": entry must be an object`);
    }
    const e = rawEntry as Record<string, unknown>;

    if (!isNonEmptyString(e.display_name)) {
      throw new Error(
        `Invalid model "${id}": display_name must be a non-empty string`,
      );
    }
    if (!isNonNegativeNumber(e.input_per_mtok)) {
      throw new Error(
        `Invalid model "${id}": input_per_mtok must be a number >= 0`,
      );
    }
    if (!isNonNegativeNumber(e.output_per_mtok)) {
      throw new Error(
        `Invalid model "${id}": output_per_mtok must be a number >= 0`,
      );
    }
    if (!isPositiveInteger(e.context_window)) {
      throw new Error(
        `Invalid model "${id}": context_window must be a positive integer`,
      );
    }
    if (!isNonEmptyString(e.fit_notes)) {
      throw new Error(
        `Invalid model "${id}": fit_notes must be a non-empty string`,
      );
    }
    if (e.provider !== undefined && !isNonEmptyString(e.provider)) {
      throw new Error(
        `Invalid model "${id}": provider, if present, must be a non-empty string`,
      );
    }

    return {
      id,
      display_name: e.display_name,
      input_per_mtok: e.input_per_mtok,
      output_per_mtok: e.output_per_mtok,
      context_window: e.context_window,
      fit_notes: e.fit_notes,
      provider: isNonEmptyString(e.provider) ? e.provider : "anthropic",
    };
  });
}
