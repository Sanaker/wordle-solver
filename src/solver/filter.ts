import { scorePattern, ALL_GREEN, NUM_PATTERNS } from './pattern.js';

/**
 * Filter a candidate answer pool down to those consistent with `guess` having produced `pattern`.
 */
export function filterPool(pool: readonly string[], guess: string, pattern: number): string[] {
  const out: string[] = [];
  for (const w of pool) {
    if (scorePattern(guess, w) === pattern) out.push(w);
  }
  return out;
}

/**
 * Compute the histogram of pattern outcomes when `guess` is played against every answer in `pool`.
 * Returns a Uint32Array of length 243.
 */
export function patternHistogram(guess: string, pool: readonly string[]): Uint32Array {
  const hist = new Uint32Array(NUM_PATTERNS);
  for (let i = 0; i < pool.length; i++) {
    hist[scorePattern(guess, pool[i])]++;
  }
  return hist;
}

export { ALL_GREEN, NUM_PATTERNS };
