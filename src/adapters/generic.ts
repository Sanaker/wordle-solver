import type { SiteAdapter, Board, BoardRow, TileState } from './types.js';

/**
 * Generic adapter for arbitrary 5-letter Wordle clones.
 *
 * Strategy:
 *  - The user picks the board container via a "pick" overlay (handled in content script).
 *    We persist the selector + a state-class color mapping per origin in chrome.storage.local.
 *  - To read tiles we look for 5 consecutive child elements per row that carry a single letter.
 *  - State is inferred from background color (closest of green / yellow / gray) or
 *    optional state-class hints.
 */

interface GenericConfig {
  rootSelector: string;
}

const STORAGE_KEY = 'genericAdapterConfig';

export class GenericAdapter implements SiteAdapter {
  id = 'generic';
  private config: GenericConfig | null = null;

  async load(): Promise<void> {
    const origin = location.origin;
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const all = (data[STORAGE_KEY] || {}) as Record<string, GenericConfig>;
    this.config = all[origin] || null;
  }

  async save(rootSelector: string): Promise<void> {
    const origin = location.origin;
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const all = (data[STORAGE_KEY] || {}) as Record<string, GenericConfig>;
    all[origin] = { rootSelector };
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
    this.config = all[origin];
  }

  detect(): boolean {
    return !!this.config && !!document.querySelector(this.config.rootSelector);
  }

  readBoard(): Board {
    if (!this.config) return { rows: [] };
    const root = document.querySelector(this.config.rootSelector) as HTMLElement | null;
    if (!root) return { rows: [] };

    // Find candidate rows: direct or nested children that contain exactly 5 single-character descendants.
    const rowCandidates = collectRows(root);
    const rows: BoardRow[] = rowCandidates.map((tiles) => readRow(tiles));
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

function collectRows(root: HTMLElement): HTMLElement[][] {
  // Heuristic: walk the tree, find elements whose children produce groups of 5 leaf-ish tiles.
  // Simpler heuristic: find leaf tile candidates first (single letter or empty 1-letter elements),
  // then group them by their parent.
  const tiles = Array.from(
    root.querySelectorAll('*')
  ).filter((el) => {
    const text = (el.textContent || '').trim();
    if (text.length > 1) return false;
    // Must be a leaf (no element children with text > 0).
    for (const child of Array.from(el.children)) {
      if ((child.textContent || '').trim().length > 0 && child.children.length > 0) return false;
    }
    return el.children.length <= 1;
  }) as HTMLElement[];

  const byParent = new Map<HTMLElement, HTMLElement[]>();
  for (const t of tiles) {
    const p = t.parentElement;
    if (!p) continue;
    let arr = byParent.get(p);
    if (!arr) {
      arr = [];
      byParent.set(p, arr);
    }
    arr.push(t);
  }

  const rows: HTMLElement[][] = [];
  for (const arr of byParent.values()) {
    if (arr.length === 5) rows.push(arr);
  }
  // Order by their row's vertical position.
  rows.sort((a, b) => a[0].getBoundingClientRect().top - b[0].getBoundingClientRect().top);
  return rows;
}

function readRow(tiles: HTMLElement[]): BoardRow {
  const letters: string[] = [];
  const states: TileState[] = [];
  for (const t of tiles) {
    const text = (t.textContent || '').trim().toLowerCase();
    letters.push(text.length === 1 ? text : '');
    states.push(inferState(t, text.length === 1));
  }
  return { letters, states };
}

function inferState(el: HTMLElement, hasLetter: boolean): TileState {
  // Class-name heuristic
  const cls = (el.className && typeof el.className === 'string' ? el.className : '').toLowerCase();
  const ariaState = (el.getAttribute('data-state') || el.getAttribute('aria-label') || '').toLowerCase();
  const text = `${cls} ${ariaState}`;
  if (/correct|green/.test(text)) return 'correct';
  if (/present|yellow|partial|elsewhere/.test(text)) return 'present';
  if (/absent|wrong|miss|gray|grey/.test(text)) return 'absent';

  if (!hasLetter) return 'empty';

  // Color heuristic
  const bg = getComputedStyle(el).backgroundColor;
  const rgb = parseRgb(bg);
  if (!rgb) return 'empty';
  const [r, g, b] = rgb;
  // Approximate Wordle palette: green ≈ (106,170,100), yellow ≈ (201,180,88), gray ≈ (120,124,126).
  if (g > r + 20 && g > b + 20) return 'correct';
  if (r > 150 && g > 130 && b < 130) return 'present';
  if (Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && r < 180 && r > 60) return 'absent';
  return hasLetter ? 'empty' : 'empty';
}

function parseRgb(s: string): [number, number, number] | null {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
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
  const target: EventTarget = (document.activeElement as Element) || document;
  target.dispatchEvent(new KeyboardEvent('keydown', init));
  target.dispatchEvent(new KeyboardEvent('keyup', init));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
