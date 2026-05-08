import type {
  SuggestRequest,
  SuggestResponse,
  TypeGuessRequest,
  AnyResponse
} from '../messages.js';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const siteEl = $<HTMLSpanElement>('site');
const statusEl = $<HTMLDivElement>('status');
const suggestionsEl = $<HTMLOListElement>('suggestions');
const remainingCountEl = $<HTMLSpanElement>('remainingCount');
const remainingSampleEl = $<HTMLDivElement>('remainingSample');
const autoModeEl = $<HTMLInputElement>('autoMode');

let lastSuggestions: SuggestResponse['suggestions'] = [];

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');
  return tab.id;
}

async function ensureContentScript(tabId: number): Promise<void> {
  // The content script isn't auto-injected (manifest has no content_scripts);
  // we inject on demand so the extension can run on any site.
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (e) {
    throw new Error(`Cannot run on this page: ${(e as Error).message}`);
  }
}

async function sendToTab(msg: unknown): Promise<AnyResponse> {
  const tabId = await activeTabId();
  await ensureContentScript(tabId);
  return (await chrome.tabs.sendMessage(tabId, msg)) as AnyResponse;
}

async function sendToBackground(msg: unknown): Promise<AnyResponse> {
  return (await chrome.runtime.sendMessage(msg)) as AnyResponse;
}

function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function renderSuggestions(res: SuggestResponse): void {
  lastSuggestions = res.suggestions;
  suggestionsEl.innerHTML = '';
  for (const s of res.suggestions) {
    const li = document.createElement('li');
    const left = document.createElement('span');
    if (s.isCandidate) {
      const dot = document.createElement('span');
      dot.className = 'candidate-dot';
      dot.title = 'Could be the answer';
      left.appendChild(dot);
    }
    const word = document.createElement('span');
    word.className = 'word';
    word.textContent = s.word;
    left.appendChild(word);
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = s.entropy > 0 ? `${s.entropy.toFixed(2)} bits` : '';
    li.appendChild(left);
    li.appendChild(meta);
    suggestionsEl.appendChild(li);
  }
  remainingCountEl.textContent = String(res.remaining);
  remainingSampleEl.textContent = res.remainingSample.join(' ');
  if (res.solved) {
    setStatus('Solved!');
  } else if (res.invalidRows && res.invalidRows.length > 0) {
    setStatus(`Warning: row(s) ${res.invalidRows.map((i) => i + 1).join(', ')} look inconsistent and were skipped.`);
  } else {
    setStatus(`Top guess: ${res.suggestions[0]?.word ?? '—'}`);
  }
}

async function readAndSuggest(): Promise<void> {
  setStatus('Reading board…');
  const board = await sendToTab({ type: 'content:readBoard' });
  if (board.type !== 'content:board') {
    setStatus(board.type === 'error' ? board.message : 'Failed to read board.', true);
    return;
  }
  siteEl.textContent = board.adapterId || 'no adapter';
  if (!board.adapterId) {
    setStatus('No adapter detected. Click "Pick board" to set one up.', true);
    return;
  }
  const req: SuggestRequest = { type: 'suggest', board: board.board, topN: 8 };
  const res = await sendToBackground(req);
  if (res.type !== 'suggest:ok') {
    setStatus(res.type === 'error' ? res.message : 'Solver error.', true);
    return;
  }
  renderSuggestions(res);
}

async function typeTopGuess(): Promise<void> {
  const top = lastSuggestions[0];
  if (!top) {
    setStatus('No suggestion to type. Click "Read board" first.', true);
    return;
  }
  const req: TypeGuessRequest = {
    type: 'content:type',
    word: top.word,
    submit: autoModeEl.checked
  };
  setStatus(`Typing ${top.word.toUpperCase()}…`);
  const res = await sendToTab(req);
  if (res.type === 'error') {
    setStatus(res.message, true);
    return;
  }
  setStatus(autoModeEl.checked ? 'Submitted. Wait for the row to settle, then click "Read board".' : 'Typed. Press Enter when ready.');
}

async function pickBoard(): Promise<void> {
  setStatus('Open the page tab; click your board.');
  const res = await sendToTab({ type: 'content:pickBoard' });
  if (res.type !== 'content:pickBoard:ok') {
    setStatus(res.type === 'error' ? res.message : 'Pick failed.', true);
    return;
  }
  if (!res.rootSelector) {
    setStatus('Cancelled.');
    return;
  }
  setStatus(`Saved selector. Click "Read board".`);
}

async function reset(): Promise<void> {
  lastSuggestions = [];
  suggestionsEl.innerHTML = '';
  remainingCountEl.textContent = '0';
  remainingSampleEl.textContent = '';
  setStatus('Reset. Click "Read board" to begin.');
}

function wire(): void {
  $<HTMLButtonElement>('read').addEventListener('click', () => run(readAndSuggest));
  $<HTMLButtonElement>('type').addEventListener('click', () => run(typeTopGuess));
  $<HTMLButtonElement>('pick').addEventListener('click', () => run(pickBoard));
  $<HTMLButtonElement>('reset').addEventListener('click', () => run(reset));

  chrome.storage.sync.get(['autoMode']).then((v) => {
    autoModeEl.checked = !!v.autoMode;
  });
  autoModeEl.addEventListener('change', () => {
    chrome.storage.sync.set({ autoMode: autoModeEl.checked });
  });
}

function run(fn: () => Promise<void>): void {
  fn().catch((e) => setStatus(String((e as Error).message || e), true));
}

wire();
