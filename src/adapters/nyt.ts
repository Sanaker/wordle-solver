import type { SiteAdapter, Board, BoardRow, TileState } from './types.js';

/**
 * Adapter for the official NYT Wordle at nytimes.com/games/wordle.
 *
 * NYT renders each tile with `data-state` ∈ {empty, tbd, absent, present, correct} and
 * the letter as text content. Rows live under [aria-label="Row N"] inside the board container.
 * Input is processed by a top-level keydown listener on document, so dispatching
 * KeyboardEvent at document works for typing/submitting.
 */
export class NytAdapter implements SiteAdapter {
  id = 'nyt';

  detect(): boolean {
    if (!/(^|\.)nytimes\.com$/.test(location.hostname)) return false;
    return !!document.querySelector('[class*="Board-module"], [aria-label="Game Board"]') ||
      !!document.querySelector('[data-state]');
  }

  readBoard(): Board {
    // Rows: try aria-labelled rows first, then fallback to Row-module class.
    let rowEls = Array.from(
      document.querySelectorAll('[aria-label^="Row"]')
    ) as HTMLElement[];
    if (rowEls.length === 0) {
      rowEls = Array.from(
        document.querySelectorAll('[class*="Row-module"]')
      ) as HTMLElement[];
    }

    const rows: BoardRow[] = rowEls.map((rowEl) => {
      const tileEls = Array.from(
        rowEl.querySelectorAll('[data-state]')
      ) as HTMLElement[];
      const letters: string[] = [];
      const states: TileState[] = [];
      for (let i = 0; i < 5; i++) {
        const t = tileEls[i];
        if (!t) {
          letters.push('');
          states.push('empty');
          continue;
        }
        const ds = (t.getAttribute('data-state') || '').toLowerCase();
        const text = (t.textContent || '').trim().toLowerCase();
        letters.push(text);
        states.push(mapNytState(ds));
      }
      return { letters, states };
    });

    return { rows };
  }

  async typeGuess(word: string): Promise<void> {
    for (const ch of word.toLowerCase()) {
      dispatchKey(ch);
      await sleep(30);
    }
  }

  async submit(): Promise<void> {
    dispatchKey('Enter');
  }
}

function mapNytState(s: string): TileState {
  switch (s) {
    case 'correct':
      return 'correct';
    case 'present':
      return 'present';
    case 'absent':
      return 'absent';
    case 'tbd':
    case 'empty':
    default:
      return 'empty';
  }
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
