export type TileState = 'correct' | 'present' | 'absent' | 'empty';

export interface BoardRow {
  letters: string[];      // length 5; '' for empty
  states: TileState[];    // length 5
}

export interface Board {
  rows: BoardRow[];       // typically up to 6 rows
}

export interface SiteAdapter {
  /** Human-readable site identifier (e.g., "nyt", "generic"). */
  id: string;
  /** Whether this adapter recognizes the current document. */
  detect(): boolean;
  /** Read the current state of the board. */
  readBoard(): Board;
  /** Type a 5-letter guess into the board (does not submit). */
  typeGuess(word: string): Promise<void>;
  /** Submit the currently typed guess (Enter). */
  submit(): Promise<void>;
}
