/**
 * Heuristic prompt-token estimator.
 *
 * There is no accurate *offline* tokenizer for Claude 4.x (Anthropic's only
 * first-party count is the network `count_tokens` API, which needs a key — out
 * of scope for an offline, secret-free pre-run overlay). So this is a deliberate
 * **estimate**, returned as a labeled range, never a single false-precision number.
 *
 * Basis: BPE token lengths span roughly 3.5–4.5 characters/token across English
 * prose and code. We bound the estimate with those two ratios (more chars/token
 * ⇒ fewer tokens ⇒ the low bound).
 *
 * Length is measured in Unicode **code points** (`[...text].length`), so emoji and
 * other astral characters count as 1. Note: a *decomposed* grapheme (e.g. "e" +
 * U+0301) counts as 2 here; that's acceptable for a labeled range and stays fully
 * deterministic — we intentionally do NOT `.normalize()`.
 */
export interface TokenEstimate {
  low: number;
  high: number;
  estimate: number;
  isApproximate: boolean;
}

export function estimateTokens(text: string): TokenEstimate {
  const cp = [...text].length;
  if (cp === 0) {
    return { low: 0, high: 0, estimate: 0, isApproximate: true };
  }
  const low = Math.floor(cp / 4.5);
  const high = Math.ceil(cp / 3.5);
  // Clamp is a defensive guard; for every cp >= 1, round(cp/4) already lands in
  // [low, high], so it never actually fires.
  const estimate = Math.min(high, Math.max(low, Math.round(cp / 4)));
  return { low, high, estimate, isApproximate: true };
}
