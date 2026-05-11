import { loadAnswers, loadAllowed } from '../solver/wordlists.js';
import { rankGuesses } from '../solver/entropy.js';
import { expectedEntropy } from '../solver/entropy.js';
import { scorePattern, encodePattern } from '../solver/pattern.js';
import { DEFAULT_OPENER } from '../solver/precomputed.js';
import type { Board, BoardRow, TileState } from '../adapters/types.js';
import type {
  AnyRequest,
  SuggestRequest,
  SuggestResponse,
  ResetResponse
} from '../messages.js';

/**
 * Background service worker.
 *
 * Hosts the solver. The content script reads the board (via popup request) and the popup
 * forwards the board here for a `suggest` call. We compute the candidate pool from scratch
 * each time by replaying every committed (non-empty, fully-stated) row through the filter.
 * This keeps state stateless, so popup close/reopen is fine.
 */

chrome.runtime.onMessage.addListener((msg: AnyRequest, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'suggest') {
        sendResponse(await handleSuggest(msg));
      } else if (msg.type === 'reset') {
        const r: ResetResponse = { type: 'reset:ok' };
        sendResponse(r);
      }
    } catch (e) {
      sendResponse({ type: 'error', message: String((e as Error).message || e) });
    }
  })();
  return true; // async
});

async function handleSuggest(req: SuggestRequest): Promise<SuggestResponse> {
  const answers = await loadAnswers();
  const allowed = await loadAllowed();

  // Multi-board mode (Quordle)
  if (req.boards && req.boards.length > 1) {
    return handleQuordleSuggest(req, answers, allowed);
  }

  const committed = req.board.rows.filter(isCommittedRow);
  const opener = (req.opener || DEFAULT_OPENER).toLowerCase();

  // Filter answer pool by committed rows.
  let pool: string[] = answers.slice();
  const invalidRows: number[] = [];

  for (let i = 0; i < committed.length; i++) {
    const row = committed[i];
    const guess = row.letters.join('');
    const pattern = encodePattern(row.states.map(stateToTrit));
    const next = pool.filter((w) => scorePattern(guess, w) === pattern);
    if (next.length === 0) {
      invalidRows.push(req.board.rows.indexOf(row));
      continue;
    }
    pool = next;
  }

  const solved = committed.some((r) => r.states.every((s) => s === 'correct'));

  if (committed.length === 0 && !solved) {
    return {
      type: 'suggest:ok',
      suggestions: [{ word: opener, entropy: 0, isCandidate: answers.includes(opener) }],
      remaining: pool.length,
      remainingSample: pool.slice(0, 20),
      solved: false,
      invalidRows
    };
  }

  if (solved || pool.length <= 1) {
    return {
      type: 'suggest:ok',
      suggestions: pool.slice(0, 1).map((w) => ({ word: w, entropy: 0, isCandidate: true })),
      remaining: pool.length,
      remainingSample: pool.slice(0, 20),
      solved: solved || pool.length === 1,
      invalidRows
    };
  }

  // Hard mode: filter guess pool to only words satisfying revealed constraints.
  let guessPool: readonly string[] = pool.length <= 2 ? pool : allowed;
  if (req.hardMode) {
    guessPool = applyHardModeFilter(guessPool, committed);
  }
  if (guessPool.length === 0) guessPool = pool; // fallback if constraints over-constrain

  const top = rankGuesses(guessPool, pool, req.topN ?? 10);

  return {
    type: 'suggest:ok',
    suggestions: top.map((s) => ({ word: s.word, entropy: s.entropy, isCandidate: s.isCandidate })),
    remaining: pool.length,
    remainingSample: pool.slice(0, 20),
    solved: false,
    invalidRows
  };
}

async function handleQuordleSuggest(
  req: SuggestRequest,
  answers: readonly string[],
  allowed: readonly string[]
): Promise<SuggestResponse> {
  const boards = req.boards!;
  const opener = (req.opener || DEFAULT_OPENER).toLowerCase();

  // Filter each board's pool independently.
  const pools: string[][] = boards.map((board) => {
    let pool = answers.slice();
    for (const row of board.rows.filter(isCommittedRow)) {
      const guess = row.letters.join('');
      const pattern = encodePattern(row.states.map(stateToTrit));
      const next = pool.filter((w) => scorePattern(guess, w) === pattern);
      if (next.length > 0) pool = next;
    }
    return pool;
  });

  const boardSolved = boards.map((board) =>
    board.rows.some((r) => r.states.every((s) => s === 'correct') &&
      r.letters.every((l) => l.length === 1))
  );
  const allSolved = boardSolved.every(Boolean);
  const unsolvedPools = pools.filter((_, i) => !boardSolved[i]);

  const totalCommitted = boards.map((b) => b.rows.filter(isCommittedRow).length);
  const anyCommitted = totalCommitted.some((c) => c > 0);

  if (!anyCommitted) {
    return {
      type: 'suggest:ok',
      suggestions: [{ word: opener, entropy: 0, isCandidate: answers.includes(opener) }],
      remaining: unsolvedPools[0]?.length ?? 0,
      remainingSample: unsolvedPools[0]?.slice(0, 20) ?? [],
      solved: allSolved,
      allSolved,
      boardRemaining: pools.map((p, i) => boardSolved[i] ? 0 : p.length)
    };
  }

  if (allSolved || unsolvedPools.length === 0) {
    return {
      type: 'suggest:ok',
      suggestions: [],
      remaining: 0,
      remainingSample: [],
      solved: true,
      allSolved: true,
      boardRemaining: pools.map(() => 0)
    };
  }

  // For remaining unsolved boards, pick the guess that maximises combined entropy.
  const guessPool = allowed;
  const top = rankGuessesMultiPool(guessPool, unsolvedPools, req.topN ?? 10, answers);

  return {
    type: 'suggest:ok',
    suggestions: top,
    remaining: unsolvedPools[0]?.length ?? 0,
    remainingSample: unsolvedPools[0]?.slice(0, 20) ?? [],
    solved: false,
    allSolved: false,
    boardRemaining: pools.map((p, i) => boardSolved[i] ? 0 : p.length)
  };
}

/**
 * Hard mode: only allow guesses that use all revealed letters in correct positions / anywhere.
 */
function applyHardModeFilter(guessPool: readonly string[], committed: BoardRow[]): string[] {
  const greenAt: (string | null)[] = [null, null, null, null, null];
  const required = new Set<string>();

  for (const row of committed) {
    for (let i = 0; i < 5; i++) {
      if (row.states[i] === 'correct') greenAt[i] = row.letters[i];
      else if (row.states[i] === 'present') required.add(row.letters[i]);
    }
  }

  return (guessPool as string[]).filter((word) => {
    for (let i = 0; i < 5; i++) {
      if (greenAt[i] !== null && word[i] !== greenAt[i]) return false;
    }
    for (const letter of required) {
      if (!word.includes(letter)) return false;
    }
    return true;
  });
}

/**
 * Rank guesses by total expected entropy across multiple answer pools.
 */
function rankGuessesMultiPool(
  guessPool: readonly string[],
  pools: string[][],
  topN: number,
  answers: readonly string[]
): Array<{ word: string; entropy: number; isCandidate: boolean }> {
  const candidateSets = pools.map((p) => new Set(p));
  const scored = (guessPool as string[]).map((word) => {
    const entropy = pools.reduce((sum, pool) => sum + expectedEntropy(word, pool), 0);
    const isCandidate = candidateSets.some((s) => s.has(word));
    return { word, entropy, isCandidate };
  });

  scored.sort((a, b) => {
    if (b.entropy !== a.entropy) return b.entropy - a.entropy;
    if (a.isCandidate !== b.isCandidate) return a.isCandidate ? -1 : 1;
    return a.word.localeCompare(b.word);
  });

  return scored.slice(0, topN);
}

function isCommittedRow(row: BoardRow): boolean {
  if (row.letters.length !== 5) return false;
  if (row.letters.some((l) => !l || l.length !== 1)) return false;
  if (row.states.some((s) => s === 'empty')) return false;
  return true;
}

function stateToTrit(s: TileState): number {
  switch (s) {
    case 'correct':
      return 2;
    case 'present':
      return 1;
    default:
      return 0;
  }
}
