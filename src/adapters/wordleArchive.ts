import type { SiteAdapter, Board, BoardRow, TileState } from './types.js';

/**
 * Adapter for archive.wordle.solutions — a popular Wordle archive that uses the same
 * NYT-style DOM with [data-state] tiles and keyboard-event input.
 *
 * Registered before the generic DataStateAdapter so the popup shows "wordle-archive"
 * rather than "datastate" for this specific site.
 */
export class WordleArchiveAdapter implements SiteAdapter {
  id = 'wordle-archive';

  detect(): boolean {
    return location.hostname === 'archive.wordle.solutions' ||
           location.hostname === 'www.archive.wordle.solutions';
  }

  readBoard(): Board {
    // Uses identical DOM to NYT: [aria-label^="Row"] rows with [data-state] tiles.
    let rowEls = Array.from(
      document.querySelectorAll('[aria-label^="Row"], [aria-label^="Rad"]')
    ) as HTMLElement[];

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
        states.push(mapState(ds));
      }
      return { letters, states };
    });

    return { rows };
  }

  async typeGuess(word: string): Promise<void> {
    for (const ch of word.toLowerCase()) {
      dispatch(ch);
      await sleep(30);
    }
  }

  async submit(): Promise<void> {
    dispatch('Enter');
  }

  wordNotFound(): boolean {
    return !!document.querySelector('[class*="shake"], [class*="invalid"]');
  }
}

function mapState(s: string): TileState {
  switch (s) {
    case 'correct': return 'correct';
    case 'present': return 'present';
    case 'absent':  return 'absent';
    default:        return 'empty';
  }
}

function dispatch(key: string): void {
  const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
  const ev = new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true });
  document.dispatchEvent(ev);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
