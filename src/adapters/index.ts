import type { SiteAdapter } from './types.js';
import { NytAdapter } from './nyt.js';
import { WordlyAdapter } from './wordly.js';
import { GenericAdapter } from './generic.js';

export async function pickAdapter(): Promise<SiteAdapter> {
  const nyt = new NytAdapter();
  if (nyt.detect()) return nyt;

  const wordly = new WordlyAdapter();
  if (wordly.detect()) return wordly;

  const generic = new GenericAdapter();
  await generic.load();
  return generic;
}

export { NytAdapter, WordlyAdapter, GenericAdapter };
export type { SiteAdapter };
