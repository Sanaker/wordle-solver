/**
 * Precomputed first-guess entropy is invariant given fixed wordlists.
 * SALET is the well-known optimal opener under the standard answer list.
 *
 * Override via popup settings (chrome.storage.sync key: opener).
 */
export const DEFAULT_OPENER = 'salet';

export const ALTERNATE_OPENERS: readonly string[] = [
  'salet',
  'tarse',
  'crane',
  'slate',
  'crate',
  'trace',
  'reast'
];
