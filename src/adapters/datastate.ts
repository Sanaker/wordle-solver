import type { SiteAdapter, Board, BoardRow, TileState } from './types.js';

/**
 * Adapter for NYT-style Wordle clones that use [data-state] on tiles.
 *
 * Covers: ordlig.no, wordle.direkte.no, and any clone derived from the NYT open-source code.
 * These sites render tiles with data-state ∈ {empty, tbd, absent, present, correct}.
 * Input is handled via document-level keydown events.
 */
export class DataStateAdapter implements SiteAdapter {
  id = 'datastate';

  detect(): boolean {
    // Must NOT be nytimes.com (handled by NytAdapter) or wordly.org (handled by WordlyAdapter).
    if (/(^|\.)nytimes\.com$/.test(location.hostname)) return false;
    if (/wordly\.org/.test(location.hostname)) return false;
    if (/merriam-webster\.com/.test(location.hostname)) return false;
    // Must have [data-state] tiles.
    return !!document.querySelector('[data-state]');
  }

  readBoard(): Board {
    // NYT-clone structure: rows identified by [aria-label^="Row"] or data-state tiles grouped
    // by their shared parent row element.
    let rowEls = Array.from(
      document.querySelectorAll('[aria-label^="Row"], [aria-label^="Rad"]')
    ) as HTMLElement[];

    // Fallback: group tiles by parent.
    if (rowEls.length === 0) {
      const tiles = Array.from(document.querySelectorAll('[data-state]')) as HTMLElement[];
      const byParent = new Map<HTMLElement, HTMLElement[]>();
      for (const t of tiles) {
        const p = t.parentElement;
        if (!p) continue;
        const arr = byParent.get(p) ?? [];
        arr.push(t);
        byParent.set(p, arr);
      }
      for (const [parent, children] of byParent) {
        if (children.length === 5) rowEls.push(parent);
      }
      rowEls.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    }

    const rows: BoardRow[] = rowEls.map((rowEl) => {
      const tileEls = Array.from(rowEl.querySelectorAll('[data-state]')) as HTMLElement[];
      const letters: string[] = [];
      const states: TileState[] = [];
      for (let i = 0; i < 5; i++) {
        const t = tileEls[i];
        if (!t) { letters.push(''); states.push('empty'); continue; }
        const ds = (t.getAttribute('data-state') || '').toLowerCase();
        letters.push((t.textContent || '').trim().toLowerCase().slice(0, 1));
        states.push(mapDataState(ds));
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

  wordNotFound(): boolean {
    // Many NYT clones add [class*="invalid"] or a shake animation to the active row.
    const invalid = document.querySelector(
      '[data-state="tbd"][class*="invalid"], [class*="shake"], [class*="invalid"]'
    );
    return !!invalid;
  }
}

function mapDataState(s: string): TileState {
  switch (s) {
    case 'correct': return 'correct';
    case 'present': return 'present';
    case 'absent':  return 'absent';
    case 'tbd':
    case 'empty':
    default:        return 'empty';
  }
}

function dispatchKey(key: string): void {
  const isEnter = key === 'Enter';
  const init: KeyboardEventInit = {
    key: isEnter ? 'Enter' : key,
    code: isEnter ? 'Enter' : `Key${key.toUpperCase()}`,
    bubbles: true, cancelable: true, composed: true
  };
  document.dispatchEvent(new KeyboardEvent('keydown', init));
  document.dispatchEvent(new KeyboardEvent('keyup', init));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
