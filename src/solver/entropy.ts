import { scorePattern, NUM_PATTERNS, ALL_GREEN } from './pattern.js';

export interface ScoredGuess {
  word: string;
  entropy: number;       // expected information in bits
  isCandidate: boolean;  // whether this guess could itself be the answer
}

/**
 * Compute expected information (entropy in bits) for a single guess against a candidate pool.
 *
 * H = -Σ p_i log2 p_i where p_i is the probability of bucket i (uniform prior over `pool`).
 */
export function expectedEntropy(guess: string, pool: readonly string[]): number {
  if (pool.length === 0) return 0;
  const hist = new Uint32Array(NUM_PATTERNS);
  for (let i = 0; i < pool.length; i++) {
    hist[scorePattern(guess, pool[i])]++;
  }
  const N = pool.length;
  let h = 0;
  const invLn2 = 1 / Math.log(2);
  for (let i = 0; i < NUM_PATTERNS; i++) {
    const c = hist[i];
    if (c === 0) continue;
    const p = c / N;
    h -= p * Math.log(p) * invLn2;
  }
  return h;
}

/**
 * Rank candidate guesses by expected information.
 *
 * @param guessPool words allowed to be played
 * @param answerPool current set of plausible answers
 * @param topN number of top guesses to return
 */
export function rankGuesses(
  guessPool: readonly string[],
  answerPool: readonly string[],
  topN = 10
): ScoredGuess[] {
  // Endgame fast paths
  if (answerPool.length <= 2) {
    return answerPool.slice(0, topN).map((w, i) => ({
      word: w,
      entropy: i === 0 && answerPool.length === 1 ? 0 : 1,
      isCandidate: true
    }));
  }

  const candidateSet = new Set(answerPool);
  const N = answerPool.length;
  const invLn2 = 1 / Math.log(2);
  const hist = new Uint32Array(NUM_PATTERNS);

  // Min-heap-ish: keep best topN. Simpler: collect all then sort.
  const all: ScoredGuess[] = new Array(guessPool.length);

  for (let g = 0; g < guessPool.length; g++) {
    const guess = guessPool[g];
    hist.fill(0);
    for (let i = 0; i < N; i++) {
      hist[scorePattern(guess, answerPool[i])]++;
    }
    let h = 0;
    for (let i = 0; i < NUM_PATTERNS; i++) {
      const c = hist[i];
      if (c === 0) continue;
      const p = c / N;
      h -= p * Math.log(p) * invLn2;
    }
    all[g] = { word: guess, entropy: h, isCandidate: candidateSet.has(guess) };
  }

  // Sort: highest entropy first; tiebreak: prefer candidates (could be the answer).
  all.sort((a, b) => {
    if (b.entropy !== a.entropy) return b.entropy - a.entropy;
    if (a.isCandidate !== b.isCandidate) return a.isCandidate ? -1 : 1;
    return a.word < b.word ? -1 : 1;
  });

  return all.slice(0, topN);
}

export { ALL_GREEN };
