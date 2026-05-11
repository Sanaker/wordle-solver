import type {
  SuggestRequest,
  SuggestResponse,
  TypeGuessRequest,
  TypeGuessResponse,
  AnyResponse
} from '../messages.js';
import type { Board } from '../adapters/types.js';

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const siteEl            = $<HTMLSpanElement>('site');
const statusEl          = $<HTMLDivElement>('status');
const suggestionsEl     = $<HTMLOListElement>('suggestions');
const remainingCountEl  = $<HTMLSpanElement>('remainingCount');
const remainingSampleEl = $<HTMLDivElement>('remainingSample');
const autoModeEl        = $<HTMLInputElement>('autoMode');
const hardModeEl        = $<HTMLInputElement>('hardMode');
const openerInputEl     = $<HTMLInputElement>('openerInput');
const miniBoardEl       = $<HTMLDivElement>('miniBoard');
const statsBodyEl       = $<HTMLDivElement>('statsBody');
const quordleInfoEl     = $<HTMLDivElement>('quordleInfo');

// ── State ─────────────────────────────────────────────────────────────────────
let lastSuggestions: SuggestResponse['suggestions'] = [];
let lastBoard: Board | null = null;
let lastBoards: Board[] | undefined;
let isQuordle = false;
let gameTracked = false;

// ── Storage helpers ───────────────────────────────────────────────────────────
interface SiteStats {
  distribution: [number, number, number, number, number, number];
  losses: number;
  currentStreak: number;
  maxStreak: number;
}

function defaultStats(): SiteStats {
  return { distribution: [0,0,0,0,0,0], losses: 0, currentStreak: 0, maxStreak: 0 };
}

async function getStats(origin: string): Promise<SiteStats> {
  const key = `stats:${origin}`;
  const data = await chrome.storage.sync.get(key);
  return (data[key] as SiteStats) ?? defaultStats();
}

async function saveStats(origin: string, stats: SiteStats): Promise<void> {
  await chrome.storage.sync.set({ [`stats:${origin}`]: stats });
}

// ── Chrome helpers ────────────────────────────────────────────────────────────
async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab.');
  return tab.id;
}

async function activeTabOrigin(): Promise<string> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ? new URL(tab.url).origin : 'unknown';
}

async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
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

// ── UI helpers ────────────────────────────────────────────────────────────────
function setStatus(text: string, isError = false): void {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
}

function renderMiniBoard(board: Board): void {
  miniBoardEl.innerHTML = '';
  const rows = board.rows.filter((r) => r.letters.some((l) => l.length === 1));
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'mini-row';
    for (let i = 0; i < 5; i++) {
      const cell = document.createElement('div');
      cell.className = `mini-cell mini-cell--${row.states[i] ?? 'empty'}`;
      cell.textContent = (row.letters[i] ?? '').toUpperCase();
      rowEl.appendChild(cell);
    }
    miniBoardEl.appendChild(rowEl);
  }
}

function renderQuordleInfo(boardRemaining: number[] | undefined): void {
  if (!boardRemaining || !isQuordle) {
    quordleInfoEl.style.display = 'none';
    return;
  }
  quordleInfoEl.style.display = 'flex';
  quordleInfoEl.innerHTML = boardRemaining
    .map((n, i) =>
      `<span class="qboard-badge${n === 0 ? ' solved' : ''}" title="Board ${i + 1}">${n === 0 ? '✓' : n}</span>`
    )
    .join('');
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
  renderQuordleInfo(res.boardRemaining);

  if (res.solved || res.allSolved) {
    setStatus('Solved!');
  } else if (res.invalidRows && res.invalidRows.length > 0) {
    setStatus(`Warning: row(s) ${res.invalidRows.map((i) => i + 1).join(', ')} looked inconsistent and were skipped.`);
  } else if (isQuordle && res.boardRemaining) {
    const unsolved = res.boardRemaining.filter(Boolean).length;
    setStatus(`Quordle — ${unsolved} board${unsolved === 1 ? '' : 's'} remaining`);
  } else {
    setStatus(`Top guess: ${res.suggestions[0]?.word ?? '—'}`);
  }
}

async function renderStats(): Promise<void> {
  const origin = await activeTabOrigin();
  const stats = await getStats(origin);
  const total = stats.distribution.reduce((a, b) => a + b, 0) + stats.losses;
  if (total === 0) {
    statsBodyEl.innerHTML = '<p class="no-stats">No games recorded yet.</p>';
    return;
  }
  const winRate = Math.round(((total - stats.losses) / total) * 100);
  const maxBar = Math.max(...stats.distribution, 1);
  const bars = stats.distribution
    .map((n, i) => {
      const pct = Math.round((n / maxBar) * 100);
      return `<div class="bar-row">
        <span class="bar-label">${i + 1}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%">${n > 0 ? n : ''}</div></div>
      </div>`;
    })
    .join('');
  statsBodyEl.innerHTML = `
    <div class="stats-summary">
      <div><div class="stat-val">${total}</div><div class="stat-key">Played</div></div>
      <div><div class="stat-val">${winRate}%</div><div class="stat-key">Win %</div></div>
      <div><div class="stat-val">${stats.currentStreak}</div><div class="stat-key">Streak</div></div>
      <div><div class="stat-val">${stats.maxStreak}</div><div class="stat-key">Best</div></div>
    </div>
    <h3 class="dist-title">Guess distribution</h3>
    ${bars}
  `;
}

async function recordResult(result: 'win' | 'loss', guessCount: number): Promise<void> {
  if (gameTracked) return;
  gameTracked = true;
  const origin = await activeTabOrigin();
  const stats = await getStats(origin);
  if (result === 'win') {
    const idx = Math.min(Math.max(guessCount - 1, 0), 5);
    stats.distribution[idx]++;
    stats.currentStreak++;
    if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
  } else {
    stats.losses++;
    stats.currentStreak = 0;
  }
  await saveStats(origin, stats);
}

// ── Core actions ──────────────────────────────────────────────────────────────
async function readAndSuggest(): Promise<void> {
  setStatus('Reading board…');
  const boardRes = await sendToTab({ type: 'content:readBoard' });
  if (boardRes.type !== 'content:board') {
    setStatus(boardRes.type === 'error' ? boardRes.message : 'Failed to read board.', true);
    return;
  }

  siteEl.textContent = boardRes.adapterId || 'no adapter';
  if (!boardRes.adapterId) {
    setStatus('No adapter detected. Click "Pick board" to set one up.', true);
    return;
  }

  lastBoard = boardRes.board;
  lastBoards = boardRes.boards;
  isQuordle = (lastBoards?.length ?? 0) > 1;
  gameTracked = false;

  renderMiniBoard(boardRes.board);

  const opener = openerInputEl.value.trim().toLowerCase() || undefined;
  const req: SuggestRequest = {
    type: 'suggest',
    board: boardRes.board,
    boards: lastBoards,
    topN: 8,
    opener,
    hardMode: hardModeEl.checked
  };
  const res = await sendToBackground(req);
  if (res.type !== 'suggest:ok') {
    setStatus(res.type === 'error' ? res.message : 'Solver error.', true);
    return;
  }

  renderSuggestions(res);

  // Auto-track stats.
  const committed = boardRes.board.rows.filter(
    (r) => r.letters.every((l) => l.length === 1) && r.states.every((s) => s !== 'empty')
  );
  if (res.solved || res.allSolved) {
    await recordResult('win', committed.length);
  } else if (!isQuordle && committed.length >= 6) {
    await recordResult('loss', 6);
  }
}

async function typeTopGuess(suggestionIndex = 0): Promise<void> {
  const top = lastSuggestions[suggestionIndex];
  if (!top) {
    setStatus('No suggestion — click "Read board" first.', true);
    return;
  }
  const useSubmit = autoModeEl.checked;
  const req: TypeGuessRequest = {
    type: 'content:type',
    word: top.word,
    submit: useSubmit,
    waitForCommit: useSubmit
  };
  setStatus(`Typing ${top.word.toUpperCase()}…`);
  const res = await sendToTab(req);
  if (res.type === 'error') {
    setStatus(res.message, true);
    return;
  }

  const typeRes = res as TypeGuessResponse;
  if (typeRes.wordNotFound) {
    setStatus(`"${top.word.toUpperCase()}" not in word list — trying next…`);
    if (suggestionIndex + 1 < lastSuggestions.length) {
      await typeTopGuess(suggestionIndex + 1);
    } else {
      setStatus('All suggestions rejected. Try "Read board" again.', true);
    }
    return;
  }

  if (useSubmit) {
    // Animation done — auto-read updated board.
    await readAndSuggest();
  } else {
    setStatus('Typed. Press Enter when ready.');
  }
}

async function pickBoard(): Promise<void> {
  setStatus('Open the page tab; click your board.');
  const res = await sendToTab({ type: 'content:pickBoard' });
  if (res.type !== 'content:pickBoard:ok') {
    setStatus(res.type === 'error' ? res.message : 'Pick failed.', true);
    return;
  }
  if (!res.rootSelector) { setStatus('Cancelled.'); return; }
  setStatus('Saved selector. Click "Read board".');
}

async function reset(): Promise<void> {
  lastSuggestions = [];
  lastBoard = null;
  lastBoards = undefined;
  isQuordle = false;
  gameTracked = false;
  suggestionsEl.innerHTML = '';
  miniBoardEl.innerHTML = '';
  quordleInfoEl.style.display = 'none';
  remainingCountEl.textContent = '0';
  remainingSampleEl.textContent = '';
  setStatus('Reset. Click "Read board" to begin.');
}

// ── Wire ──────────────────────────────────────────────────────────────────────
function wire(): void {
  $<HTMLButtonElement>('read').addEventListener('click', () => run(readAndSuggest));
  $<HTMLButtonElement>('type').addEventListener('click', () => run(() => typeTopGuess(0)));
  $<HTMLButtonElement>('autoSolve').addEventListener('click', () => {
    autoModeEl.checked = true;
    chrome.storage.sync.set({ autoMode: true });
    run(readAndSuggest);
  });
  $<HTMLButtonElement>('pick').addEventListener('click', () => run(pickBoard));
  $<HTMLButtonElement>('reset').addEventListener('click', () => run(reset));

  $<HTMLButtonElement>('settingsToggle').addEventListener('click', () => {
    const panel = $<HTMLDivElement>('settingsPanel');
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    $<HTMLButtonElement>('settingsToggle').textContent = open ? 'Settings ▸' : 'Settings ▾';
  });

  $<HTMLButtonElement>('statsToggle').addEventListener('click', () => {
    const panel = $<HTMLDivElement>('statsPanel');
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    $<HTMLButtonElement>('statsToggle').textContent = open ? 'Stats ▸' : 'Stats ▾';
    if (!open) run(renderStats);
  });

  chrome.storage.sync.get(['autoMode', 'hardMode', 'opener']).then((v) => {
    autoModeEl.checked = !!v.autoMode;
    hardModeEl.checked = !!v.hardMode;
    openerInputEl.value = (v.opener as string) || '';
  });

  autoModeEl.addEventListener('change', () =>
    chrome.storage.sync.set({ autoMode: autoModeEl.checked }));
  hardModeEl.addEventListener('change', () =>
    chrome.storage.sync.set({ hardMode: hardModeEl.checked }));
  openerInputEl.addEventListener('change', () =>
    chrome.storage.sync.set({ opener: openerInputEl.value.trim().toLowerCase() }));
}

function run(fn: () => Promise<void>): void {
  fn().catch((e) => setStatus(String((e as Error).message || e), true));
}

wire();

