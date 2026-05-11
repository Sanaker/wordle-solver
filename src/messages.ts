/**
 * Shared message protocol between popup, content script, and background service worker.
 */

import type { Board } from './adapters/types.js';

export interface SuggestRequest {
  type: 'suggest';
  board: Board;
  /** For multi-board games (e.g. Quordle). All boards including primary. */
  boards?: Board[];
  topN?: number;
  opener?: string;
  hardMode?: boolean;
  /** Detected word length from the board (defaults to 5). */
  wordLength?: number;
}

export interface ScoredSuggestion {
  word: string;
  entropy: number;
  isCandidate: boolean;
}

export interface SuggestResponse {
  type: 'suggest:ok';
  suggestions: ScoredSuggestion[];
  remaining: number;
  remainingSample: string[]; // up to 20 candidates for display
  solved: boolean;
  invalidRows?: number[];    // rows whose typed letters didn't match any candidate
  /** Per-board remaining counts (Quordle mode). */
  boardRemaining?: number[];
  /** True if all boards are solved (Quordle mode). */
  allSolved?: boolean;
  /** True when the board uses non-5-letter words (solver unsupported). */
  wordLengthUnsupported?: boolean;
}

export interface ResetRequest {
  type: 'reset';
}

export interface ResetResponse {
  type: 'reset:ok';
}

// Popup -> content
export interface ReadBoardRequest {
  type: 'content:readBoard';
}
export interface ReadBoardResponse {
  type: 'content:board';
  adapterId: string | null;
  board: Board;
  /** Multi-board games return all boards here. */
  boards?: Board[];
}

export interface TypeGuessRequest {
  type: 'content:type';
  word: string;
  submit: boolean;
  /** Wait for the submitted row to commit (animation detection). */
  waitForCommit?: boolean;
}
export interface TypeGuessResponse {
  type: 'content:type:ok';
  /** True if the typed word was rejected by the game ("not in word list"). */
  wordNotFound?: boolean;
}

export interface PickBoardRequest {
  type: 'content:pickBoard';
}
export interface PickBoardResponse {
  type: 'content:pickBoard:ok';
  rootSelector: string | null;
}

export interface UndoRequest {
  type: 'content:undo';
}
export interface UndoResponse {
  type: 'content:undo:ok';
}

export type AnyRequest =
  | SuggestRequest
  | ResetRequest
  | ReadBoardRequest
  | TypeGuessRequest
  | PickBoardRequest
  | UndoRequest;

export type AnyResponse =
  | SuggestResponse
  | ResetResponse
  | ReadBoardResponse
  | TypeGuessResponse
  | PickBoardResponse
  | UndoResponse
  | { type: 'error'; message: string };
