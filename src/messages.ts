/**
 * Shared message protocol between popup, content script, and background service worker.
 */

import type { Board } from './adapters/types.js';

export interface SuggestRequest {
  type: 'suggest';
  board: Board;
  topN?: number;
  opener?: string;
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
}

export interface TypeGuessRequest {
  type: 'content:type';
  word: string;
  submit: boolean;
}
export interface TypeGuessResponse {
  type: 'content:type:ok';
}

export interface PickBoardRequest {
  type: 'content:pickBoard';
}
export interface PickBoardResponse {
  type: 'content:pickBoard:ok';
  rootSelector: string | null;
}

export type AnyRequest =
  | SuggestRequest
  | ResetRequest
  | ReadBoardRequest
  | TypeGuessRequest
  | PickBoardRequest;

export type AnyResponse =
  | SuggestResponse
  | ResetResponse
  | ReadBoardResponse
  | TypeGuessResponse
  | PickBoardResponse
  | { type: 'error'; message: string };
