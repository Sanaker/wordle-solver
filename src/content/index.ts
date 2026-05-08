import { pickAdapter, NytAdapter, WordlyAdapter, GenericAdapter } from '../adapters/index.js';
import type { SiteAdapter } from '../adapters/types.js';
import type {
  AnyRequest,
  ReadBoardResponse,
  TypeGuessResponse,
  PickBoardResponse
} from '../messages.js';

/**
 * Content script: bridges the page DOM to the popup/background.
 *
 * The popup sends `content:readBoard`, `content:type`, and `content:pickBoard` messages.
 * We instantiate adapters on demand and persist generic-adapter selections per origin.
 */

// Guard against re-injection: executeScript adds a new listener each time it runs.
// All injections from this extension share the same isolated world, so this flag persists.
if ((globalThis as typeof globalThis & { __wordleSolverLoaded?: boolean }).__wordleSolverLoaded) {
  // Already running — do nothing.
  throw new Error('wordle-solver already loaded');
}
(globalThis as typeof globalThis & { __wordleSolverLoaded?: boolean }).__wordleSolverLoaded = true;


let cachedAdapter: SiteAdapter | null = null;

async function getAdapter(force = false): Promise<SiteAdapter> {
  if (cachedAdapter && !force) return cachedAdapter;
  cachedAdapter = await pickAdapter();
  return cachedAdapter;
}

chrome.runtime.onMessage.addListener((msg: AnyRequest, _sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'content:readBoard') {
        const a = await getAdapter(true);
        const board = a.detect() ? a.readBoard() : { rows: [] };
        const r: ReadBoardResponse = {
          type: 'content:board',
          adapterId: a.detect() ? a.id : null,
          board
        };
        sendResponse(r);
      } else if (msg.type === 'content:type') {
        const a = await getAdapter();
        if (!a.detect()) throw new Error('No adapter detected for this page.');
        await a.typeGuess(msg.word);
        if (msg.submit) {
          await sleep(80);
          await a.submit();
        }
        const r: TypeGuessResponse = { type: 'content:type:ok' };
        sendResponse(r);
      } else if (msg.type === 'content:pickBoard') {
        const sel = await pickBoardOverlay();
        if (sel) {
          const g = new GenericAdapter();
          await g.save(sel);
          cachedAdapter = g;
        }
        const r: PickBoardResponse = { type: 'content:pickBoard:ok', rootSelector: sel };
        sendResponse(r);
      }
    } catch (e) {
      sendResponse({ type: 'error', message: String((e as Error).message || e) });
    }
  })();
  return true;
});

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Show a full-page overlay; the next click selects the board container.
 * Returns a CSS selector for the chosen element, or null if cancelled (Escape).
 */
function pickBoardOverlay(): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.15);
      cursor:crosshair;
    `;
    const banner = document.createElement('div');
    banner.textContent = 'Wordle Solver: click the puzzle board (Esc to cancel)';
    banner.style.cssText = `
      position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483647;
      background:#111;color:#fff;padding:8px 14px;border-radius:6px;font:14px system-ui;
      pointer-events:none;
    `;
    const highlight = document.createElement('div');
    highlight.style.cssText = `
      position:fixed;z-index:2147483647;border:2px solid #6aaa64;background:rgba(106,170,100,0.15);
      pointer-events:none;transition:all 60ms ease;
    `;
    document.body.append(overlay, banner, highlight);

    let lastEl: Element | null = null;
    const onMove = (e: MouseEvent) => {
      overlay.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = '';
      if (!el || el === lastEl) return;
      lastEl = el;
      const r = el.getBoundingClientRect();
      highlight.style.left = `${r.left}px`;
      highlight.style.top = `${r.top}px`;
      highlight.style.width = `${r.width}px`;
      highlight.style.height = `${r.height}px`;
    };
    const cleanup = () => {
      overlay.remove();
      banner.remove();
      highlight.remove();
      window.removeEventListener('keydown', onKey, true);
    };
    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      overlay.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY) as Element | null;
      cleanup();
      resolve(el ? cssPath(el) : null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    };
    overlay.addEventListener('mousemove', onMove);
    overlay.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
  });
}

/**
 * Build a stable-ish CSS selector for an element using id/class/nth-of-type chain.
 */
function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && parts.length < 6) {
    let part = node.tagName.toLowerCase();
    if ((node as HTMLElement).id) {
      part += `#${cssEscape((node as HTMLElement).id)}`;
      parts.unshift(part);
      break;
    }
    const cls = (node.getAttribute('class') || '')
      .split(/\s+/)
      .filter((c) => c && !/^\d/.test(c))
      .slice(0, 2)
      .map(cssEscape);
    if (cls.length) part += `.${cls.join('.')}`;
    const parent: Element | null = node.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c: Element) => c.tagName === node!.tagName);
      if (same.length > 1) {
        const idx = same.indexOf(node) + 1;
        part += `:nth-of-type(${idx})`;
      }
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(' > ');
}

function cssEscape(s: string): string {
  return s.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

// Suppress "NytAdapter / WordlyAdapter is unused" if tree-shaking complains.
void NytAdapter;
void WordlyAdapter;
