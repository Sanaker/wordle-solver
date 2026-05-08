import type { SiteAdapter, Board, BoardRow, TileState } from './types.js';

/**
 * Adapter for wordly.org (and wordly.org/N-letter-words-wordle).
 *
 * DOM structure (from wordly.js bundle):
 *   <div class="Row">                        ← one guess row
 *     <div class="Row-letter">A</div>        ← empty / being typed
 *     <div class="Row-letter letter-correct">S</div>
 *     <div class="Row-letter letter-elsewhere">L</div>
 *     <div class="Row-letter letter-absent">E</div>
 *     ...
 *   </div>
 *
 * Keyboard: `onKey` is wired via React, but document-level keydown works too.
 */
export class WordlyAdapter implements SiteAdapter {
  id = 'wordly';

  detect(): boolean {
    return /wordly\.org/.test(location.hostname);
  }

  readBoard(): Board {
    const rowEls = Array.from(document.querySelectorAll('.Row')) as HTMLElement[];
    const rows: BoardRow[] = rowEls.map((rowEl) => {
      const tileEls = Array.from(rowEl.querySelectorAll('.Row-letter')) as HTMLElement[];
      const letters: string[] = [];
      const states: TileState[] = [];
      for (const t of tileEls) {
        const letter = (t.textContent || '').trim().toLowerCase();
        letters.push(letter.length === 1 ? letter : '');
        states.push(inferWordlyState(t));
      }
      return { letters, states };
    });
    return { rows };
  }

  async typeGuess(word: string): Promise<void> {
    for (const ch of word.toLowerCase()) {
      dispatchKey(ch);
      await sleep(40);
    }
  }

  async submit(): Promise<void> {
    dispatchKey('Enter');
  }
}

function inferWordlyState(el: HTMLElement): TileState {
  const cls = el.className;
  if (cls.includes('letter-correct')) return 'correct';
  if (cls.includes('letter-elsewhere')) return 'present';
  if (cls.includes('letter-absent')) return 'absent';
  return 'empty';
}

function dispatchKey(key: string): void {
  const isEnter = key === 'Enter';
  const init: KeyboardEventInit = {
    key: isEnter ? 'Enter' : key,
    code: isEnter ? 'Enter' : `Key${key.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
    composed: true
  };
  document.dispatchEvent(new KeyboardEvent('keydown', init));
  document.dispatchEvent(new KeyboardEvent('keyup', init));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
