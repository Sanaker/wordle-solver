import { loadAnswers, loadAllowed } from '../solver/wordlists.js';
import { rankGuesses } from '../solver/entropy.js';
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
      // Inconsistent row (likely from a clone with mis-detected colors). Skip it.
      invalidRows.push(req.board.rows.indexOf(row));
      continue;
    }
    pool = next;
  }

  const solved = committed.some((r) => r.states.every((s) => s === 'correct'));

  // Use precomputed opener when no committed rows.
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

  // Choose guess pool: when many candidates remain, use the full allowed list for max entropy;
  // when few remain, candidate-only is faster and usually optimal.
  const guessPool: readonly string[] = pool.length <= 2 ? pool : allowed;
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
