/**
 * Bundled wordlist loading. Lists are shipped as JSON arrays under /assets/wordlists/.
 * Loaded lazily and cached.
 */

let answersCache: readonly string[] | null = null;
let allowedCache: readonly string[] | null = null;

async function loadJson(path: string): Promise<string[]> {
  const url = chrome.runtime.getURL(path);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as string[];
}

export async function loadAnswers(): Promise<readonly string[]> {
  if (!answersCache) {
    answersCache = Object.freeze(await loadJson('assets/wordlists/answers.json'));
  }
  return answersCache;
}

export async function loadAllowed(): Promise<readonly string[]> {
  if (!allowedCache) {
    const allowedExtra = await loadJson('assets/wordlists/allowed.json');
    const answers = await loadAnswers();
    // The allowed-guesses list is conventionally extra words; the full guess pool is allowed ∪ answers.
    const set = new Set<string>(answers);
    for (const w of allowedExtra) set.add(w);
    allowedCache = Object.freeze([...set].sort());
  }
  return allowedCache;
}
