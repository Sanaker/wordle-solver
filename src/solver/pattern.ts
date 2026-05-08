/**
 * Wordle feedback pattern computation.
 *
 * Each tile state is encoded as 0=absent (gray), 1=present (yellow), 2=correct (green).
 * The 5-tile pattern is packed as a base-3 integer in [0, 242] (3^5 - 1 = 242).
 * Position 0 is the most-significant trit (i.e. p[0]*81 + p[1]*27 + p[2]*9 + p[3]*3 + p[4]).
 */

export const WORD_LEN = 5;
export const NUM_PATTERNS = 243; // 3^5
export const ALL_GREEN = 242;     // 2*81 + 2*27 + 2*9 + 2*3 + 2

/**
 * Compute the Wordle feedback pattern for guessing `guess` against the hidden answer `answer`.
 * Both must be lowercase 5-letter strings. Handles duplicate letters per Wordle rules:
 *   - Greens are assigned first.
 *   - Each remaining answer letter can match at most one yellow.
 */
export function scorePattern(guess: string, answer: string): number {
  const used = [false, false, false, false, false];
  const states = [0, 0, 0, 0, 0];

  // First pass: greens
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess.charCodeAt(i) === answer.charCodeAt(i)) {
      states[i] = 2;
      used[i] = true;
    }
  }
  // Second pass: yellows
  for (let i = 0; i < WORD_LEN; i++) {
    if (states[i] === 2) continue;
    const gc = guess.charCodeAt(i);
    for (let j = 0; j < WORD_LEN; j++) {
      if (!used[j] && answer.charCodeAt(j) === gc) {
        states[i] = 1;
        used[j] = true;
        break;
      }
    }
  }

  return states[0] * 81 + states[1] * 27 + states[2] * 9 + states[3] * 3 + states[4];
}

/** Decode a packed pattern integer back to an array of 5 trits (position 0 first). */
export function decodePattern(p: number): [number, number, number, number, number] {
  return [
    Math.floor(p / 81) % 3,
    Math.floor(p / 27) % 3,
    Math.floor(p / 9) % 3,
    Math.floor(p / 3) % 3,
    p % 3
  ];
}

/** Encode an array of 5 trits to a packed pattern integer. */
export function encodePattern(states: ArrayLike<number>): number {
  return states[0] * 81 + states[1] * 27 + states[2] * 9 + states[3] * 3 + states[4];
}
