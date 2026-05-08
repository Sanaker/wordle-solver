import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePattern, encodePattern, decodePattern, ALL_GREEN } from '../src/solver/pattern.ts';
import { rankGuesses } from '../src/solver/entropy.ts';
import { filterPool } from '../src/solver/filter.ts';

test('pattern: exact match is all green', () => {
  assert.equal(scorePattern('crane', 'crane'), ALL_GREEN);
});

test('pattern: all absent', () => {
  assert.equal(scorePattern('xyzwq', 'crane'), 0);
});

test('pattern: simple yellow', () => {
  // guess RAISE vs answer ARISE -> R yellow, A yellow, I green, S green, E green
  const p = scorePattern('raise', 'arise');
  assert.deepEqual(decodePattern(p), [1, 1, 2, 2, 2]);
});

test('pattern: duplicate-letter guess only one match in answer', () => {
  // guess ALLEY vs answer LATER:
  //  A: not at pos0, but L is. Letter L at pos2 of answer? answer = L A T E R
  //   pos0 A vs L -> not green; A appears in answer at pos1 -> yellow
  //   pos1 L vs A -> not green; L appears in answer at pos0 (not used by greens) -> yellow
  //   pos2 L vs T -> not green; only one L in answer, already used -> absent
  //   pos3 E vs E -> green
  //   pos4 Y vs R -> absent
  const p = scorePattern('alley', 'later');
  assert.deepEqual(decodePattern(p), [1, 1, 0, 2, 0]);
});

test('pattern: green takes precedence over yellow on duplicates', () => {
  // guess SPEED vs answer ERASE:
  //  S(0) vs E -> S not green; S appears at pos3 of answer? answer E R A S E -> yes pos3 -> yellow
  //  P(1) vs R -> absent
  //  E(2) vs A -> not green; E in answer (pos0 not used) -> yellow
  //  E(3) vs S -> not green; another E at pos4 -> yellow
  //  D(4) vs E -> absent
  const p = scorePattern('speed', 'erase');
  assert.deepEqual(decodePattern(p), [1, 0, 1, 1, 0]);
});

test('encode/decode roundtrip', () => {
  for (let p = 0; p < 243; p++) {
    assert.equal(encodePattern(decodePattern(p)), p);
  }
});

test('filterPool narrows correctly', () => {
  const pool = ['crane', 'crone', 'crate', 'plate'];
  const guess = 'crane';
  const target = 'crate';
  const pat = scorePattern(guess, target);
  const next = filterPool(pool, guess, pat);
  assert.ok(next.includes('crate'));
  assert.ok(!next.includes('crane'));
});

test('rankGuesses returns sensible top guess', () => {
  // Tiny pool; the top guess should narrow it.
  const answers = ['apple', 'amble', 'addle', 'angle', 'ankle'];
  const allowed = answers.concat(['crate', 'slate']);
  const top = rankGuesses(allowed, answers, 3);
  assert.ok(top.length > 0);
  assert.ok(top[0].entropy >= 0);
});

test('self-play: solver reaches answer in <=6 guesses for sample', async () => {
  // Use the bundled answer list; pick a few targets and run a self-play.
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const answersRaw = await fs.readFile(
    path.resolve('src/assets/wordlists/answers.json'),
    'utf8'
  );
  const allowedRaw = await fs.readFile(
    path.resolve('src/assets/wordlists/allowed.json'),
    'utf8'
  );
  const answers = JSON.parse(answersRaw) as string[];
  const allowedExtra = JSON.parse(allowedRaw) as string[];
  const allowedSet = new Set<string>([...answers, ...allowedExtra]);
  const allowed = [...allowedSet].sort();

  const sample = ['crane', 'mount', 'jazzy', 'igloo', 'pixel'].filter((w) => answers.includes(w));
  for (const target of sample) {
    let pool = answers.slice();
    let guess = 'salet';
    for (let turn = 1; turn <= 6; turn++) {
      const pat = scorePattern(guess, target);
      if (pat === ALL_GREEN) {
        break;
      }
      pool = filterPool(pool, guess, pat);
      assert.ok(pool.length > 0, `pool emptied for ${target}`);
      const top = rankGuesses(pool.length <= 2 ? pool : allowed, pool, 1);
      guess = top[0].word;
      assert.ok(turn < 6 || guess === target, `failed to solve ${target} in 6`);
    }
  }
});
