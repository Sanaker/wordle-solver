import type { SiteAdapter, Board, BoardRow, TileState } from './types.js';

/**
 * Adapter for Quordle (www.merriam-webster.com/games/quordle/).
 *
 * DOM structure (from quordle bundle):
 *   <div aria-label="Game Boards">
 *     <div id="game-board-row-1">  ← top row (gameY=0)
 *       <div>                      ← sub-board gameX=0 (top-left)
 *         <div class="flex w-full"> ← tile row
 *           <div class="quordle-box ..."><div class="quordle-box-content">A</div></div>
 *           × 5
 *         </div>
 *         × 9 (max guesses)
 *       </div>
 *       <div> sub-board gameX=1 (top-right) </div>
 *     </div>
 *     <div id="game-board-row-2">  ← bottom row (gameY=1)
 *       × 2 sub-boards
 *     </div>
 *   </div>
 *
 * Tile states (Tailwind CSS classes on .quordle-box):
 *   bg-box-correct  → correct (green)
 *   bg-box-diff     → present (yellow)
 *   others (bg-zinc-200, bg-zinc-100, etc.) → absent or empty
 * A tile with no letter and no state class is empty.
 * A tile with a letter but no state class is being typed (empty for solver purposes).
 */
export class QuordleAdapter implements SiteAdapter {
  id = 'quordle';

  detect(): boolean {
    return /merriam-webster\.com/.test(location.hostname) &&
      /quordle/.test(location.pathname);
  }

  readBoard(): Board {
    const boards = this.readBoards();
    // Return the first unsolved board as the primary; if all solved, return first.
    const unsolved = boards.find(b =>
      !b.rows.some(r => r.states.every(s => s === 'correct') && r.letters.every(l => l.length === 1))
    );
    return unsolved ?? boards[0] ?? { rows: [] };
  }

  readBoards(): Board[] {
    const boardRowEls = Array.from(
      document.querySelectorAll('[id^="game-board-row-"]')
    ) as HTMLElement[];

    const boards: Board[] = [];

    for (const boardRowEl of boardRowEls) {
      // Direct children of the board-row element that contain quordle-box tiles.
      const subBoardEls = Array.from(boardRowEl.children).filter(
        (el) => el.querySelectorAll('.quordle-box').length > 0
      ) as HTMLElement[];

      for (const subBoardEl of subBoardEls) {
        const tiles = Array.from(
          subBoardEl.querySelectorAll('.quordle-box')
        ) as HTMLElement[];

        const rows: BoardRow[] = [];
        for (let i = 0; i + 5 <= tiles.length; i += 5) {
          rows.push(readQuordleRow(tiles.slice(i, i + 5)));
        }
        boards.push({ rows });
      }
    }

    return boards.length > 0 ? boards : [{ rows: [] }];
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

function readQuordleRow(tiles: HTMLElement[]): BoardRow {
  const letters: string[] = [];
  const states: TileState[] = [];

  for (const tile of tiles) {
    const content = tile.querySelector('.quordle-box-content');
    const letter = ((content || tile).textContent || '').trim().toLowerCase();
    letters.push(letter.length === 1 ? letter : '');
    states.push(inferQuordleState(tile, letter.length === 1));
  }
  return { letters, states };
}

function inferQuordleState(el: HTMLElement, hasLetter: boolean): TileState {
  const cls = el.className || '';
  if (cls.includes('bg-box-correct')) return 'correct';
  if (cls.includes('bg-box-diff'))    return 'present';
  // Check child classes too
  for (const child of Array.from(el.children)) {
    const cc = (child as HTMLElement).className || '';
    if (cc.includes('bg-box-correct')) return 'correct';
    if (cc.includes('bg-box-diff'))    return 'present';
  }
  // Tile with a letter that has been scored but is gray (bg-zinc variants for none-past)
  if (hasLetter) {
    // If it has a "past" temporal style (bg-zinc-200 / bg-slate-200) it's absent
    if (/bg-zinc-[267]|bg-slate-[267]/.test(cls)) return 'absent';
  }
  return 'empty';
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
