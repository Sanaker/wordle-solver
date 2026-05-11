import type { SiteAdapter } from './types.js';
import { NytAdapter } from './nyt.js';
import { WordlyAdapter } from './wordly.js';
import { DataStateAdapter } from './datastate.js';
import { QuordleAdapter } from './quordle.js';
import { GenericAdapter } from './generic.js';

export async function pickAdapter(): Promise<SiteAdapter> {
  const nyt = new NytAdapter();
  if (nyt.detect()) return nyt;

  const wordly = new WordlyAdapter();
  if (wordly.detect()) return wordly;

  const quordle = new QuordleAdapter();
  if (quordle.detect()) return quordle;

  const datastate = new DataStateAdapter();
  if (datastate.detect()) return datastate;

  const generic = new GenericAdapter();
  await generic.load();
  return generic;
}

export { NytAdapter, WordlyAdapter, DataStateAdapter, QuordleAdapter, GenericAdapter };
export type { SiteAdapter };
